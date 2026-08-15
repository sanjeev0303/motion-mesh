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
curl -sI $API_URL/health | head -n 1 | grep "200 OK" || (echo "API DNS/TLS failed" && exit 1)
echo -e "\e[32m[OK] API DNS and TLS\e[0m"

echo -e "\e[32m2. Checking API Health...\e[0m"
HEALTH_RESP=$(curl -s $API_URL/health)
echo $HEALTH_RESP | grep '"status":"ok"' || (echo "API is not healthy" && exit 1)
echo -e "\e[32m[OK] API Health Check\e[0m"

echo -e "\e[32m3. Checking SDK Authentication Rejection...\e[0m"
curl -sI $API_URL/videos | head -n 1 | grep "401 Unauthorized" || (echo "API did not reject unauthenticated request" && exit 1)
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
API_POD=$(kubectl get pod -n motionmesh -l app=api -o jsonpath="{.items[0].metadata.name}")
kubectl exec -n motionmesh $API_POD -- env | grep DATABASE_URL || (echo "DATABASE_URL not found in pod" && exit 1)
echo -e "\e[32m[OK] Secrets Injected into Pods\e[0m"

echo -e "\e[32m7. Verifying NATS...\e[0m"
kubectl exec -n motionmesh $API_POD -- env | grep NATS_URL || (echo "NATS_URL not found in pod" && exit 1)
echo -e "\e[32m[OK] NATS configured\e[0m"

echo -e "\e[32m8. Verifying Controllers...\e[0m"
kubectl get deployments -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller | grep "1/1" || (echo "ALB Controller not ready" && exit 1)
kubectl get deployments -n kube-system -l app.kubernetes.io/name=external-dns | grep "1/1" || (echo "ExternalDNS not ready" && exit 1)
kubectl get deployments -n external-secrets -l app.kubernetes.io/name=external-secrets | grep "1/1" || (echo "External Secrets not ready" && exit 1)
echo -e "\e[32m[OK] Core Controllers Ready\e[0m"

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mSmoke Test Passed Successfully.\e[0m"
echo -e "\e[32m====================================================================\e[0m"
