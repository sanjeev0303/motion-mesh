#!/bin/bash
set -e

echo "===================================================================="
echo "Verify AWS Wiring (verify-aws-wiring.sh)"
echo "===================================================================="

TF_DIR="infra/terraform/envs/benchmark"
NAMESPACE="motionmesh"

echo "Fetching Terraform Outputs..."
cd $TF_DIR
TF_AURORA=$(terraform output -raw aurora_endpoint)
TF_REDIS=$(terraform output -raw redis_endpoint)
TF_S3=$(terraform output -raw s3_bucket_id)
cd ../../../..

echo "Fetching Kubernetes Pod Environment Variables..."
API_POD=$(kubectl get pod -n $NAMESPACE -l app=motionmesh-api -o jsonpath="{.items[0].metadata.name}")
K8S_AURORA=$(kubectl exec -n $NAMESPACE $API_POD -- printenv DATABASE_URL)
K8S_REDIS=$(kubectl exec -n $NAMESPACE $API_POD -- printenv REDIS_URL)
K8S_S3=$(kubectl exec -n $NAMESPACE $API_POD -- printenv STORAGE_BUCKET)

FAIL=0

echo "Verifying Database Wiring..."
if [[ "$K8S_AURORA" == *"$TF_AURORA"* ]]; then
    echo "[OK] DATABASE_URL matches Aurora Endpoint ($TF_AURORA)"
else
    echo "[ERROR] DATABASE_URL ($K8S_AURORA) does NOT match Aurora Endpoint ($TF_AURORA)!"
    FAIL=1
fi

echo "Verifying Redis Wiring..."
if [[ "$K8S_REDIS" == *"$TF_REDIS"* ]]; then
    echo "[OK] REDIS_URL matches ElastiCache Endpoint ($TF_REDIS)"
else
    echo "[ERROR] REDIS_URL ($K8S_REDIS) does NOT match ElastiCache Endpoint ($TF_REDIS)!"
    FAIL=1
fi

echo "Verifying S3 Wiring..."
if [[ "$K8S_S3" == *"$TF_S3"* ]]; then
    echo "[OK] STORAGE_BUCKET matches S3 Bucket ($TF_S3)"
else
    echo "[ERROR] STORAGE_BUCKET ($K8S_S3) does NOT match S3 Bucket ($TF_S3)!"
    FAIL=1
fi

if [ $FAIL -eq 1 ]; then
    echo "===================================================================="
    echo "Wiring Verification FAILED."
    echo "===================================================================="
    exit 1
else
    echo "===================================================================="
    echo "Wiring Verification PASSED."
    echo "===================================================================="
fi
