#!/usr/bin/env bash

set -euo pipefail

ENVIRONMENT=${1:-benchmark}
echo "Deploying to AWS Environment: $ENVIRONMENT"

function fail {
    echo "❌ $1"
    echo "DEPLOYMENT FAILED"
    exit 1
}

cd infra/terraform/envs/$ENVIRONMENT

echo "1. terraform init"
terraform init -upgrade

echo "1a. terraform validate"
terraform validate

echo "1b. terraform plan"
terraform plan -out=tfplan

echo "2. terraform apply (Foundation)"
terraform apply -auto-approve tfplan

echo "3. get outputs"
if ! S3_BUCKET_ID=$(terraform output -raw bucket_id); then fail "bucket_id unavailable"; fi
if ! S3_BUCKET_REGION=$(terraform output -raw bucket_region); then fail "bucket_region unavailable"; fi
if ! CLOUDFRONT_DISTRIBUTION_DOMAIN=$(terraform output -raw cloudfront_domain_name); then fail "cloudfront_domain_name unavailable"; fi
if ! API_IMAGE_URI=$(terraform output -raw api_repository_url); then fail "api_repository_url unavailable"; fi
if ! WORKER_IMAGE_URI=$(terraform output -raw worker_repository_url); then fail "worker_repository_url unavailable"; fi
if ! DIAGNOSTIC_IMAGE_URI=$(terraform output -raw diagnostic_repository_url); then fail "diagnostic_repository_url unavailable"; fi
if ! AWS_REGION=$(terraform output -raw region); then fail "region unavailable"; fi
if ! WAF_ACL_ARN=$(terraform output -raw web_acl_arn); then fail "web_acl_arn unavailable"; fi
ACM_CERTIFICATE_ARN=$(terraform output -raw acm_certificate_arn 2>/dev/null || echo "MISSING")
if ! EKS_CLUSTER_NAME=$(terraform output -raw cluster_name); then fail "cluster_name unavailable"; fi
if ! VPC_ID=$(terraform output -raw vpc_id); then fail "vpc_id unavailable"; fi
if ! DB_SECRET_ARN=$(terraform output -raw aurora_master_secret_arn); then fail "aurora_master_secret_arn unavailable"; fi
if ! AURORA_ENDPOINT=$(terraform output -raw aurora_endpoint); then fail "aurora_endpoint unavailable"; fi
if ! ALB_SG_ID=$(terraform output -raw alb_security_group_id); then fail "alb_security_group_id unavailable"; fi
if ! LBC_ROLE_ARN=$(terraform output -raw lbc_role_arn); then fail "lbc_role_arn unavailable"; fi
if ! EXTERNAL_DNS_ROLE_ARN=$(terraform output -raw external_dns_role_arn); then fail "external_dns_role_arn unavailable"; fi

export S3_BUCKET_ID S3_BUCKET_REGION CLOUDFRONT_DISTRIBUTION_DOMAIN API_IMAGE_URI WORKER_IMAGE_URI DIAGNOSTIC_IMAGE_URI AWS_REGION WAF_ACL_ARN ACM_CERTIFICATE_ARN EKS_CLUSTER_NAME VPC_ID DB_SECRET_ARN AURORA_ENDPOINT ALB_SG_ID LBC_ROLE_ARN EXTERNAL_DNS_ROLE_ARN


export ENVIRONMENT=$ENVIRONMENT
export STRIPE_MODE="mock"
export AI_MODE="mock"
export BENCHMARK_MODE="true"
if [ "$ENVIRONMENT" == "production" ]; then
    export STRIPE_MODE="live"
    export AI_MODE="live"
    export BENCHMARK_MODE="false"
fi
if ! CLOUDFRONT_MEDIA_DOMAIN=$(terraform output -raw media_domain_name); then fail "media_domain_name unavailable"; fi
if ! COOKIE_DOMAIN=$(terraform output -raw cookie_domain); then fail "cookie_domain unavailable"; fi
if ! API_DOMAIN=$(terraform output -raw api_domain_name); then fail "api_domain_name unavailable"; fi
if ! ROUTE53_ZONE_ID=$(terraform output -raw route53_zone_id); then fail "route53_zone_id unavailable"; fi
if ! DNS_DOMAIN=$(terraform output -raw dns_domain_name); then fail "dns_domain_name unavailable"; fi

export ALLOWED_ORIGINS="https://app.${DNS_DOMAIN}"
export API_DOMAIN ROUTE53_ZONE_ID DNS_DOMAIN CLOUDFRONT_MEDIA_DOMAIN COOKIE_DOMAIN

export GIT_SHA=$(git rev-parse --short HEAD)

echo "4. configure kubeconfig"
aws eks update-kubeconfig --region $AWS_REGION --name $EKS_CLUSTER_NAME

echo "5. verify EKS"
kubectl get nodes

echo "5a. Verify EKS Pod Identity Agent Health"
kubectl rollout status daemonset/eks-pod-identity-agent -n kube-system --timeout=120s

cd ../../../../

echo "6. apply namespace"
kubectl apply -f infra/k8s/namespace.yaml

echo "7. cluster addons (Helm)"
helm repo add eks https://aws.github.io/eks-charts || true
helm repo add external-secrets https://charts.external-secrets.io || true
helm repo add bitnami https://charts.bitnami.com/bitnami || true
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/ || true
helm repo update

echo "7a. Install AWS Load Balancer Controller"
helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$EKS_CLUSTER_NAME \
  --set region=$AWS_REGION \
  --set vpcId=$VPC_ID \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=$LBC_ROLE_ARN \
  --wait

echo "7b. Install External Secrets Operator"
kubectl create namespace external-secrets --dry-run=client -o yaml | kubectl apply -f -
kubectl create sa external-secrets -n external-secrets --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install external-secrets external-secrets/external-secrets \
    -n external-secrets \
    --set serviceAccount.name=external-secrets \
    --set serviceAccount.create=false \
    --wait

echo "7c. Install ExternalDNS"
# Create the service account to match Pod Identity association
kubectl create sa external-dns -n kube-system --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install external-dns bitnami/external-dns \
  -n kube-system \
  --set provider=aws \
  --set aws.region=$AWS_REGION \
  --set aws.zoneType=public \
  --set txtOwnerId=$EKS_CLUSTER_NAME \
  --set domainFilters[0]=$DNS_DOMAIN \
  --set policy=upsert-only \
  --set serviceAccount.create=false \
  --set serviceAccount.name=external-dns \
  --wait

echo "7d. Install Metrics Server"
helm upgrade --install metrics-server metrics-server/metrics-server \
  -n kube-system \
  --set apiService.create=true \
  --wait

echo "8. Apply External Secrets Config"
envsubst < infra/k8s/external-secrets.yaml | kubectl apply -f -

if [ "$ENVIRONMENT" == "production" ]; then
    echo "8b. Apply Billing Secrets (Production only)"
    envsubst < infra/k8s/billing-secrets.yaml | kubectl apply -f -
fi

echo "9. wait for External Secrets"
kubectl wait --for=condition=Ready externalsecret/motionmesh-secrets -n motionmesh --timeout=120s

echo "10. ConfigMap"
envsubst < infra/k8s/configmap.yaml | kubectl apply -f -

echo "11. apply NATS"
kubectl apply -f infra/k8s/nats-cluster.yaml

echo "12. wait for NATS"
kubectl rollout status statefulset/nats -n motionmesh --timeout=120s

echo "13. push Git SHA images"
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $(echo $API_IMAGE_URI | cut -d'/' -f1)

# API
docker build -t motionmesh-api -f server/api/Dockerfile .
docker tag motionmesh-api $API_IMAGE_URI:$GIT_SHA
docker push $API_IMAGE_URI:$GIT_SHA

# Worker
docker build -t motionmesh-worker -f server/worker/Dockerfile .
docker tag motionmesh-worker $WORKER_IMAGE_URI:$GIT_SHA
docker push $WORKER_IMAGE_URI:$GIT_SHA

# Diagnostic
docker build -t motionmesh-diagnostic -f infra/docker/diagnostic/Dockerfile .
docker tag motionmesh-diagnostic $DIAGNOSTIC_IMAGE_URI:diagnostic-$GIT_SHA
docker push $DIAGNOSTIC_IMAGE_URI:diagnostic-$GIT_SHA

export MIGRATION_IMAGE_URI="$API_IMAGE_URI:$GIT_SHA"

echo "14. run migration"
kubectl delete job motionmesh-db-migration -n motionmesh --ignore-not-found
envsubst < infra/k8s/db-migration-job.yaml | kubectl apply -f -

echo "15. wait for migration SUCCESS"
kubectl wait --for=condition=complete job/motionmesh-db-migration -n motionmesh --timeout=300s

echo "16. deploy API"
export API_IMAGE_URI="$API_IMAGE_URI:$GIT_SHA"
envsubst < infra/k8s/api.yaml | kubectl apply -f -

echo "17. deploy Worker"
export WORKER_IMAGE_URI="$WORKER_IMAGE_URI:$GIT_SHA"
envsubst < infra/k8s/worker.yaml | kubectl apply -f -

echo "18. deploy Ingress"
envsubst < infra/k8s/ingress.yaml | kubectl apply -f -

echo "19. wait for readiness"
kubectl rollout status deployment/api -n motionmesh --timeout=300s
kubectl rollout status deployment/worker -n motionmesh --timeout=300s

echo "20. run smoke test"
if ! ./scripts/smoke-test-aws.sh $ENVIRONMENT; then
    fail "Smoke test failed"
fi

echo "21. run AWS wiring verification"
if ! ./scripts/verify-aws-wiring.sh $ENVIRONMENT; then
    fail "AWS Wiring Verification failed"
fi

echo "22. DEPLOYMENT READY"

