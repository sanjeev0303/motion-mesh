#!/usr/bin/env bash

set -uo pipefail

FAILURES=0

function fail {
    echo "❌ $1"
    FAILURES=$((FAILURES + 1))
}

function pass {
    echo "✅ $1"
}

ENVIRONMENT=${1:-benchmark}

echo "=== Verifying AWS Infrastructure Wiring for $ENVIRONMENT ==="

cd infra/terraform/envs/$ENVIRONMENT

if ! AWS_REGION=$(terraform output -raw region); then fail "Terraform region output unavailable"; exit 1; fi
if ! BUCKET_ID=$(terraform output -raw bucket_id); then fail "Terraform bucket_id output unavailable"; exit 1; fi
if ! DIAG_REPO=$(terraform output -raw diagnostic_repository_url); then fail "Terraform diagnostic_repository_url unavailable"; exit 1; fi
if ! API_DOMAIN=$(terraform output -raw api_domain_name 2>/dev/null); then fail "Terraform api_domain_name output unavailable"; exit 1; fi
if ! ZONE_ID=$(terraform output -raw route53_zone_id 2>/dev/null); then fail "Terraform route53_zone_id output unavailable"; exit 1; fi
if ! WAF_EXPECTED=$(terraform output -raw web_acl_arn 2>/dev/null); then fail "Terraform web_acl_arn output unavailable"; exit 1; fi
if ! ACM_EXPECTED=$(terraform output -raw acm_certificate_arn 2>/dev/null); then fail "Terraform acm_certificate_arn output unavailable"; exit 1; fi
if ! CF_DOMAIN=$(terraform output -raw cloudfront_domain_name 2>/dev/null); then fail "Terraform cloudfront_domain_name output unavailable"; exit 1; fi
if ! MEDIA_DOMAIN=$(terraform output -raw media_domain_name 2>/dev/null); then fail "Terraform media_domain_name output unavailable"; exit 1; fi
if ! COOKIE_DOMAIN=$(terraform output -raw cookie_domain 2>/dev/null); then fail "Terraform cookie_domain output unavailable"; exit 1; fi

cd ../../../../

echo "[1/8] Checking ECR Repositories..."
aws ecr describe-repositories --repository-names motionmesh-api --region $AWS_REGION >/dev/null 2>&1 && pass "API Repo exists" || fail "API Repo missing"
aws ecr describe-repositories --repository-names motionmesh-worker --region $AWS_REGION >/dev/null 2>&1 && pass "Worker Repo exists" || fail "Worker Repo missing"

GIT_SHA=$(git rev-parse --short HEAD)
echo "[2/8] Checking Diagnostic Image Pinned Tag..."
DIAG_REPO_NAME=$(echo $DIAG_REPO | awk -F'/' '{print $2}')
if aws ecr describe-images --repository-name "$DIAG_REPO_NAME" --image-ids imageTag=diagnostic-$GIT_SHA --region $AWS_REGION >/dev/null 2>&1; then
    pass "Diagnostic Image diagnostic-$GIT_SHA exists in ECR"
else
    fail "Diagnostic Image diagnostic-$GIT_SHA missing in ECR!"
    exit 1
fi

echo "[3/8] Checking Secrets Manager..."
SECRETS="redis cloudfront-signing"
if [ "$ENVIRONMENT" == "production" ]; then
    SECRETS="redis cloudfront-signing clerk stripe"
fi

for secret in $SECRETS; do
    aws secretsmanager describe-secret --secret-id motionmesh/$ENVIRONMENT/$secret --region $AWS_REGION >/dev/null 2>&1 && pass "Secret motionmesh/$ENVIRONMENT/$secret exists" || fail "Secret motionmesh/$ENVIRONMENT/$secret missing"
done

cd infra/terraform/envs/$ENVIRONMENT
DB_SECRET_ARN=$(terraform output -raw aurora_master_secret_arn)
cd ../../../../
if [[ -n "$DB_SECRET_ARN" && "$DB_SECRET_ARN" != "None" ]]; then
    aws secretsmanager describe-secret --secret-id "$DB_SECRET_ARN" --region $AWS_REGION >/dev/null 2>&1 && pass "RDS managed secret exists: $DB_SECRET_ARN" || fail "RDS managed secret missing"
else
    fail "RDS managed secret missing in terraform output"
fi

echo "[4/8] Checking S3 Bucket Security & CloudFront OAC..."
PUBLIC_ACCESS=$(aws s3api get-public-access-block --bucket $BUCKET_ID --region $AWS_REGION --query 'PublicAccessBlockConfiguration' 2>/dev/null || echo "")
if [[ "$PUBLIC_ACCESS" == *'"BlockPublicAcls": true'* ]] && [[ "$PUBLIC_ACCESS" == *'"BlockPublicPolicy": true'* ]]; then
    pass "S3 Block Public Access is fully enabled"
else
    fail "S3 Block Public Access is NOT fully enabled: $PUBLIC_ACCESS"
fi

CORS=$(aws s3api get-bucket-cors --bucket $BUCKET_ID --region $AWS_REGION 2>/dev/null || echo "None")
if [[ "$CORS" != "None" ]]; then
    pass "S3 CORS configuration is active"
else
    fail "S3 CORS configuration is missing"
fi

# Verify OAC Bucket Policy (P0-2)
DIST_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?DomainName=='$CF_DOMAIN'].Id" --output text 2>/dev/null || echo "")
if [[ -n "$DIST_ID" && "$DIST_ID" != "None" ]]; then
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    EXPECTED_ARN="arn:aws:cloudfront::${AWS_ACCOUNT_ID}:distribution/${DIST_ID}"
    BUCKET_POLICY=$(aws s3api get-bucket-policy --bucket $BUCKET_ID --query 'Policy' --output text 2>/dev/null || echo "")
    if [[ "$BUCKET_POLICY" == *"$EXPECTED_ARN"* ]]; then
        pass "S3 Bucket Policy matches CloudFront Distribution ARN"
    else
        fail "S3 Bucket Policy DOES NOT match expected CloudFront ARN: $EXPECTED_ARN"
    fi
else
    fail "CloudFront Distribution ID not found for $CF_DOMAIN"
fi

    # P0-1: S3 CloudFront OAC End-to-End Test
    echo "-> Uploading test file for OAC End-to-End verification..."
    TEST_CONTENT="OAC Verification $GIT_SHA"
    echo "$TEST_CONTENT" > /tmp/oac-test.txt
    aws s3 cp /tmp/oac-test.txt s3://$BUCKET_ID/$ENVIRONMENT/oac-test/$GIT_SHA.txt --region $AWS_REGION >/dev/null 2>&1
    if [ $? -eq 0 ]; then
        pass "Test file uploaded to S3"
        
        # Direct S3 GET MUST = 403 (or 400 depending on exact url format, but blocked)
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$BUCKET_ID.s3.$AWS_REGION.amazonaws.com/$ENVIRONMENT/oac-test/$GIT_SHA.txt")
        if [ "$HTTP_CODE" == "403" ] || [ "$HTTP_CODE" == "400" ]; then
            pass "Direct anonymous S3 GET blocked ($HTTP_CODE)"
        else
            fail "Direct anonymous S3 GET returned $HTTP_CODE (Expected 403/400)"
        fi
        
        CF_URL="https://$CF_DOMAIN/$ENVIRONMENT/oac-test/$GIT_SHA.txt"

        # CloudFront GET (No Cookie) MUST = 403
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$CF_URL")
        if [ "$HTTP_CODE" == "403" ]; then
            pass "CloudFront GET without cookie blocked (403)"
        else
            fail "CloudFront GET without cookie returned $HTTP_CODE (Expected 403)"
        fi

        # Generate Signed Cookies
        echo "-> Generating CloudFront Signed Cookies..."
        SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id motionmesh/$ENVIRONMENT/cloudfront-signing --region $AWS_REGION --query SecretString --output text 2>/dev/null)
        if [ -n "$SECRET_JSON" ]; then
            KEY_ID=$(echo "$SECRET_JSON" | jq -r .key_id)
            
            (
                umask 077
                PRIVATE_KEY_FILE=$(mktemp)
                trap 'rm -f "$PRIVATE_KEY_FILE"' EXIT
                echo "$SECRET_JSON" | jq -r .private_key > "$PRIVATE_KEY_FILE"

                RESOURCE="https://$CF_DOMAIN/$ENVIRONMENT/oac-test/*"
                EXPIRES=$(date -d '+1 hour' +%s)
                POLICY="{\"Statement\":[{\"Resource\":\"$RESOURCE\",\"Condition\":{\"DateLessThan\":{\"AWS:EpochTime\":$EXPIRES}}}]}"
                POLICY_ENCODED=$(echo -n "$POLICY" | base64 -w0 | tr '+=/' '-_~')
                SIGNATURE=$(echo -n "$POLICY" | openssl dgst -sha1 -sign "$PRIVATE_KEY_FILE" | base64 -w0 | tr '+=/' '-_~')

                COOKIE_HEADER="Cookie: CloudFront-Policy=$POLICY_ENCODED; CloudFront-Signature=$SIGNATURE; CloudFront-Key-Pair-Id=$KEY_ID"

                # Valid cookie = 200
                HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "$COOKIE_HEADER" "$CF_URL")
                if [ "$HTTP_CODE" == "200" ]; then
                    pass "CloudFront GET with valid signed cookie succeeded (200)"
                else
                    fail "CloudFront GET with valid signed cookie failed. Returned $HTTP_CODE (Expected 200)"
                fi

                # Invalid cookie = 403 (tamper with signature)
                INVALID_COOKIE_HEADER="Cookie: CloudFront-Policy=$POLICY_ENCODED; CloudFront-Signature=${SIGNATURE}INVALID; CloudFront-Key-Pair-Id=$KEY_ID"
                HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "$INVALID_COOKIE_HEADER" "$CF_URL")
                if [ "$HTTP_CODE" == "403" ]; then
                    pass "CloudFront GET with invalid signature blocked (403)"
                else
                    fail "CloudFront GET with invalid signature returned $HTTP_CODE (Expected 403)"
                fi

                # Expired cookie = 403
                EXPIRED_TIME=$(date -d '-1 hour' +%s)
                EXPIRED_POLICY="{\"Statement\":[{\"Resource\":\"$RESOURCE\",\"Condition\":{\"DateLessThan\":{\"AWS:EpochTime\":$EXPIRED_TIME}}}]}"
                EXPIRED_POLICY_ENCODED=$(echo -n "$EXPIRED_POLICY" | base64 -w0 | tr '+=/' '-_~')
                EXPIRED_SIGNATURE=$(echo -n "$EXPIRED_POLICY" | openssl dgst -sha1 -sign "$PRIVATE_KEY_FILE" | base64 -w0 | tr '+=/' '-_~')
                EXPIRED_COOKIE_HEADER="Cookie: CloudFront-Policy=$EXPIRED_POLICY_ENCODED; CloudFront-Signature=$EXPIRED_SIGNATURE; CloudFront-Key-Pair-Id=$KEY_ID"

                HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "$EXPIRED_COOKIE_HEADER" "$CF_URL")
                if [ "$HTTP_CODE" == "403" ]; then
                    pass "CloudFront GET with expired cookie blocked (403)"
                else
                    fail "CloudFront GET with expired cookie returned $HTTP_CODE (Expected 403)"
                fi
            )
        else
            fail "Failed to retrieve cloudfront-signing secret for cookie generation"
        fi

    else
        fail "Failed to upload test file to S3"
    fi


echo "[5/8] Checking Kubernetes External Secrets..."
kubectl get secretstore aws-secretsmanager -n motionmesh >/dev/null 2>&1 && pass "SecretStore exists" || fail "SecretStore missing"
kubectl get externalsecret motionmesh-secrets -n motionmesh -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' | grep "True" >/dev/null && pass "ExternalSecret motionmesh-secrets is Synced" || fail "ExternalSecret motionmesh-secrets is NOT Synced"
kubectl get secret motionmesh-secrets -n motionmesh >/dev/null 2>&1 && pass "K8s Secret motionmesh-secrets was successfully created" || fail "K8s Secret motionmesh-secrets missing"

echo "[6/8] Checking Application SDK Identity Access..."
./scripts/test-pod-identity.sh $ENVIRONMENT || fail "Pod Identity Tests Failed"

echo "[7/8] Checking Active Connections (DB, Redis, NATS) via Infrastructure Tools..."
kubectl delete pod diag-infra-test -n motionmesh --ignore-not-found 2>/dev/null

kubectl run diag-infra-test --image=$DIAG_REPO:diagnostic-$GIT_SHA -n motionmesh \
  --overrides='{"spec": {"containers": [{"name": "diag-infra-test", "image": "'$DIAG_REPO':diagnostic-'$GIT_SHA'", "command": ["sleep", "300"], "envFrom": [{"secretRef": {"name": "motionmesh-secrets"}}]}]}}' \
  --restart=Never >/dev/null 2>&1

kubectl wait --for=condition=Ready pod/diag-infra-test -n motionmesh --timeout=60s >/dev/null 2>&1 || fail "diag-infra-test pod failed to start"

echo "-> Testing Postgres connection using injected DATABASE_URL..."
kubectl exec diag-infra-test -n motionmesh -- sh -c 'psql $DATABASE_URL -c "\q"' >/dev/null 2>&1 && pass "Postgres Connected" || fail "Postgres Connection Failed"

echo "-> Testing Redis connection using injected REDIS_URL..."
kubectl exec diag-infra-test -n motionmesh -- sh -c 'redis-cli -u $REDIS_URL PING' | grep PONG >/dev/null 2>&1 && pass "Redis Connected" || fail "Redis Connection Failed"

echo "-> Testing NATS Connection..."
kubectl exec diag-infra-test -n motionmesh -- sh -c 'nc -z nats.motionmesh.svc.cluster.local 4222' >/dev/null 2>&1 && pass "NATS Server Connected" || fail "NATS Connection Failed"

# Cleanup
kubectl delete pod diag-infra-test -n motionmesh --ignore-not-found 2>/dev/null || true

echo "[8/8] Checking Routing, ALB, WAF, ACM, and CDN..."
ALB_HOST=$(kubectl get ingress motionmesh-api-ingress -n motionmesh -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
if [[ -n "$ALB_HOST" ]]; then
    pass "ALB successfully provisioned by LBC: $ALB_HOST"
    
    ALB_ARN=$(aws elbv2 describe-load-balancers --region $AWS_REGION --query "LoadBalancers[?DNSName=='$ALB_HOST'].LoadBalancerArn" --output text 2>/dev/null || echo "")
    if [[ -n "$ALB_ARN" && "$ALB_ARN" != "None" ]]; then
        WAF_ASSOC=$(aws wafv2 get-web-acl-for-resource --resource-arn "$ALB_ARN" --region $AWS_REGION --query 'WebACL.ARN' --output text 2>/dev/null || echo "")
        if [[ "$WAF_ASSOC" == "$WAF_EXPECTED" ]]; then
            pass "ALB is protected by exact WAF ACL"
        else
            fail "ALB WAF ACL mismatch. Expected: $WAF_EXPECTED, Got: $WAF_ASSOC"
        fi

        if [[ -n "$ACM_EXPECTED" && "$ACM_EXPECTED" != "MISSING" && "$ACM_EXPECTED" != "None" ]]; then
            LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --region $AWS_REGION --query 'Listeners[?Protocol==`HTTPS`].ListenerArn' --output text 2>/dev/null || echo "")
            if [[ -n "$LISTENER_ARN" && "$LISTENER_ARN" != "None" ]]; then
                CERT_ARN=$(aws elbv2 describe-listener-certificates --listener-arn $LISTENER_ARN --region $AWS_REGION --query 'Certificates[0].CertificateArn' --output text 2>/dev/null || echo "")
                if [[ "$CERT_ARN" == "$ACM_EXPECTED" ]]; then
                    pass "ALB is using correct ACM Certificate"
                else
                    fail "ALB ACM Certificate mismatch. Expected: $ACM_EXPECTED, Got: $CERT_ARN"
                fi
            else
                fail "Could not find ALB HTTPS listener (Wait for LBC to provision it?)"
            fi
        else
            echo "⚠️  ACM Certificate ARN not provided in outputs, skipping validation"
        fi
    else
        fail "Could not find ALB ARN in AWS for hostname $ALB_HOST"
    fi
else
    fail "ALB not provisioned yet (check aws-load-balancer-controller logs)"
fi

if [[ -n "$API_DOMAIN" && "$API_DOMAIN" != "None" && -n "$ZONE_ID" && "$ZONE_ID" != "None" ]]; then
    RECORD=$(aws route53 list-resource-record-sets --hosted-zone-id $ZONE_ID --query "ResourceRecordSets[?Name=='$API_DOMAIN.'].Name" --output text 2>/dev/null || echo "")
    if [[ "$RECORD" == "$API_DOMAIN." ]]; then
        pass "DNS record for $API_DOMAIN exists in Route53"
        # P0-13: API DNS dig and curl
        echo "-> Verifying API DNS resolution and health..."
        if dig +short $API_DOMAIN | grep -q 'amazonaws.com'; then
            pass "dig $API_DOMAIN resolved to CNAME"
        else
            fail "dig $API_DOMAIN failed to resolve to expected CNAME"
        fi
        
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$API_DOMAIN/health")
        if [ "$HTTP_CODE" == "200" ]; then
            pass "curl https://$API_DOMAIN/health returned 200"
        else
            fail "curl https://$API_DOMAIN/health returned $HTTP_CODE"
        fi
        
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$API_DOMAIN/ready")
        if [ "$HTTP_CODE" == "200" ]; then
            pass "curl https://$API_DOMAIN/ready returned 200"
        else
            fail "curl https://$API_DOMAIN/ready returned $HTTP_CODE"
        fi
    else
        fail "DNS record for $API_DOMAIN missing in Route53"
    fi
fi

if [[ -n "$CF_DOMAIN" && "$CF_DOMAIN" != "None" ]]; then
    STATUS=$(aws cloudfront list-distributions --query "DistributionList.Items[?DomainName=='$CF_DOMAIN'].Status" --output text 2>/dev/null || echo "")
    if [[ "$STATUS" == "Deployed" || "$STATUS" == "InProgress" ]]; then
        pass "CloudFront distribution exists ($STATUS)"
    else
        fail "CloudFront distribution missing or unknown status: $STATUS"
    fi
fi

echo "======================================"
if [ $FAILURES -gt 0 ]; then
    echo "❌ AWS Wiring Verification FAILED with $FAILURES errors."
    exit 1
else
    echo "✅ AWS Wiring Verification Complete: All successful."
    exit 0
fi
