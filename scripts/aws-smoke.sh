#!/bin/bash
set -e

echo "===================================================================="
echo "MotionMesh Smoke Test (aws-smoke.sh)"
echo "===================================================================="

API_URL="https://api.motionmesh.co.in/v1"
MEDIA_URL="https://media.motionmesh.co.in"

echo "1. Checking DNS Resolution & TLS..."
curl -sI $API_URL/health | head -n 1 | grep "200 OK" || (echo "API DNS/TLS failed" && exit 1)
echo "[OK] API DNS and TLS"

echo "2. Checking API Health..."
HEALTH_RESP=$(curl -s $API_URL/health)
echo $HEALTH_RESP | grep '"status":"ok"' || (echo "API is not healthy" && exit 1)
echo "[OK] API Health Check"

echo "3. Checking SDK Authentication Rejection..."
curl -sI $API_URL/videos | head -n 1 | grep "401 Unauthorized" || (echo "API did not reject unauthenticated request" && exit 1)
echo "[OK] Authentication Middleware"

echo "4. Checking S3 Direct Access (Should be Blocked)..."
TF_DIR="infra/terraform/envs/benchmark"
S3_BUCKET=$(cd $TF_DIR && terraform output -raw s3_bucket_id)
# Without signed AWS credentials, attempting to fetch an object from the S3 endpoint directly should fail 403.
curl -sI "https://$S3_BUCKET.s3.amazonaws.com/test.txt" | head -n 1 | grep "403 Forbidden" || (echo "S3 is publicly accessible! Danger!" && exit 1)
echo "[OK] S3 Direct Public Access Blocked"

echo "5. Kubernetes Workload Verification..."
kubectl get pods -n motionmesh -l app=motionmesh-api | grep "Running" || (echo "API Pods not running" && exit 1)
kubectl get pods -n motionmesh -l app=motionmesh-worker | grep "Running" || (echo "Worker Pods not running" && exit 1)
echo "[OK] K8s Workloads are Running"

echo "6. Database Connection Wiring..."
API_POD=$(kubectl get pod -n motionmesh -l app=motionmesh-api -o jsonpath="{.items[0].metadata.name}")
kubectl exec -it -n motionmesh $API_POD -- env | grep DATABASE_URL || (echo "DATABASE_URL not found in pod" && exit 1)
echo "[OK] Secrets Injected into Pods"

echo "===================================================================="
echo "Smoke Test Passed Successfully."
echo "===================================================================="
