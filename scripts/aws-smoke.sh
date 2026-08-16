#!/bin/bash
set -e

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mMotionMesh Smoke Test (aws-smoke.sh)\e[0m"
echo -e "\e[32m====================================================================\e[0m"

API_URL="https://api.motionmesh.co.in/v1"
MEDIA_URL="https://media.motionmesh.co.in"
TF_DIR="infra/terraform/envs/benchmark"

S3_BUCKET=$(cd $TF_DIR && terraform output -raw bucket_id)

echo -e "\e[32m1. Checking DNS Resolution & TLS...\e[0m"
# Gate: ensure ALB has an address before attempting DNS/TLS
ALB_ADDRESS=$(kubectl get ingress motionmesh-api-ingress -n motionmesh -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
if [ -z "$ALB_ADDRESS" ]; then
    echo -e "\e[31mALB not yet provisioned (no address on ingress). Check certificate status:\e[0m"
    aws acm describe-certificate \
        --certificate-arn "$(kubectl get ingress motionmesh-api-ingress -n motionmesh -o jsonpath='{.metadata.annotations.alb\.ingress\.kubernetes\.io/certificate-arn}')" \
        --region ap-south-1 \
        --query 'Certificate.{Status:Status,DomainName:DomainName}' --output table 2>/dev/null || true
    echo "ALB not ready — ACM certificate likely still PENDING_VALIDATION" && exit 1
fi
curl -s -i --max-time 10 https://api.motionmesh.co.in/health | head -n 1 | grep "200" || (echo "API DNS/TLS failed" && exit 1)
echo -e "\e[32m[OK] API DNS and TLS\e[0m"

echo -e "\e[32m2. Checking API Health...\e[0m"
HEALTH_RESP=$(curl -s https://api.motionmesh.co.in/health)
echo $HEALTH_RESP | grep '"status":"ok"' || (echo "API is not healthy" && exit 1)
echo -e "\e[32m[OK] API Health Check\e[0m"

echo -e "\e[32m3. Checking SDK Authentication Rejection...\e[0m"
curl -s -i $API_URL/videos | head -n 1 | grep "401" || (echo "API did not reject unauthenticated request" && exit 1)
echo -e "\e[32m[OK] Authentication Middleware\e[0m"

echo -e "\e[32m4. Checking S3 Direct Access (Should be Blocked)...\e[0m"
# Without signed AWS credentials, attempting to fetch an object from the S3 endpoint directly should fail 403.
curl -sI "https://$S3_BUCKET.s3.amazonaws.com/test.txt" | head -n 1 | grep "403 Forbidden" || (echo "S3 is publicly accessible! Danger!" && exit 1)
echo -e "\e[32m[OK] S3 Direct Public Access Blocked\e[0m"

echo -e "\e[32m5. Kubernetes Workload Verification...\e[0m"
kubectl get pods -n motionmesh -l app=api | grep "Running" || (echo "API Pods not running" && exit 1)
kubectl get pods -n motionmesh -l app=worker | grep "Running" || (echo "Worker Pods not running" && exit 1)
kubectl get pods -n motionmesh -l app=nats | grep "Running" || (echo "NATS Pods not running" && exit 1)
echo -e "\e[32m[OK] K8s Workloads are Running\e[0m"

echo -e "\e[32m6. Database Connection Wiring...\e[0m"
# Read directly from the secret (works on distroless containers)
kubectl get secret motionmesh-secrets -n motionmesh -o jsonpath='{.data.DATABASE_URL}' | base64 -d | grep -q 'postgres' \
    || (echo "DATABASE_URL not found in secret" && exit 1)
echo -e "\e[32m[OK] Secrets Injected (DATABASE_URL present)\e[0m"

echo -e "\e[32m7. Verifying NATS...\e[0m"
kubectl get secret motionmesh-secrets -n motionmesh -o jsonpath='{.data.QUEUE_URL}' | base64 -d | grep -q 'nats' \
    || kubectl get configmap motionmesh-config -n motionmesh -o jsonpath='{.data.QUEUE_URL}' 2>/dev/null | grep -q 'nats' \
    || (echo "NATS/QUEUE_URL not found in secret or configmap" && exit 1)
echo -e "\e[32m[OK] NATS configured\e[0m"

echo -e "\e[32m8. Verifying Controllers...\e[0m"
kubectl get deployments -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller | grep -E "1/1|2/2" || (echo "ALB Controller not ready" && exit 1)
kubectl get deployments -n kube-system -l app.kubernetes.io/name=external-dns | grep -E "1/1|2/2" || (echo "ExternalDNS not ready" && exit 1)
kubectl get deployments -n external-secrets -l app.kubernetes.io/name=external-secrets | grep -E "1/1|2/2" || (echo "External Secrets not ready" && exit 1)
echo -e "\e[32m[OK] Core Controllers Ready\e[0m"

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mSmoke Test Passed Successfully.\e[0m"
echo -e "\e[32m====================================================================\e[0m"
