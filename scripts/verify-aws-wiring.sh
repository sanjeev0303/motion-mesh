#!/bin/bash
set -e

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mVerify AWS Wiring (verify-aws-wiring.sh)\e[0m"
echo -e "\e[32m====================================================================\e[0m"

TF_DIR="infra/terraform/envs/benchmark"
NAMESPACE="motionmesh"

echo -e "\e[32mFetching Terraform Outputs...\e[0m"
cd $TF_DIR
TF_AURORA=$(terraform output -raw aurora_endpoint)
TF_REDIS=$(terraform output -raw redis_endpoint)
TF_S3=$(terraform output -raw bucket_id)
TF_REGION=$(terraform output -raw bucket_region || echo "ap-south-1")
TF_CF=$(terraform output -raw cloudfront_domain_name)
TF_NATS="nats://nats:4222"
cd ../../../..

echo -e "\e[32mFetching Kubernetes Pod Environment Variables...\e[0m"
API_POD=$(kubectl get pod -n $NAMESPACE -l app=api -o jsonpath="{.items[0].metadata.name}" || echo "")
if [ -z "$API_POD" ]; then
    echo -e "\e[32m[ERROR] API Pod not found!\e[0m"
    exit 1
fi

K8S_AURORA=$(kubectl exec -n $NAMESPACE $API_POD -- printenv DATABASE_URL || echo "")
K8S_REDIS=$(kubectl exec -n $NAMESPACE $API_POD -- printenv REDIS_URL || echo "")
K8S_S3=$(kubectl exec -n $NAMESPACE $API_POD -- printenv STORAGE_BUCKET || echo "")
K8S_NATS=$(kubectl exec -n $NAMESPACE $API_POD -- printenv NATS_URL || echo "")
K8S_CF=$(kubectl exec -n $NAMESPACE $API_POD -- printenv CLOUDFRONT_MEDIA_DOMAIN || echo "")

FAIL=0

echo -e "\e[32mVerifying Database Wiring...\e[0m"
if [[ "$K8S_AURORA" == *"$TF_AURORA"* ]]; then
    echo -e "\e[32m[OK] DATABASE_URL matches Aurora Endpoint ($TF_AURORA)\e[0m"
else
    echo -e "\e[32m[ERROR] DATABASE_URL ($K8S_AURORA) does NOT match Aurora Endpoint ($TF_AURORA)!\e[0m"
    FAIL=1
fi

echo -e "\e[32mVerifying Redis Wiring...\e[0m"
if [[ "$K8S_REDIS" == *"$TF_REDIS"* ]]; then
    echo -e "\e[32m[OK] REDIS_URL matches ElastiCache Endpoint ($TF_REDIS)\e[0m"
else
    echo -e "\e[32m[ERROR] REDIS_URL ($K8S_REDIS) does NOT match ElastiCache Endpoint ($TF_REDIS)!\e[0m"
    FAIL=1
fi

echo -e "\e[32mVerifying S3 Wiring...\e[0m"
if [[ "$K8S_S3" == *"$TF_S3"* ]]; then
    echo -e "\e[32m[OK] STORAGE_BUCKET matches S3 Bucket ($TF_S3)\e[0m"
else
    echo -e "\e[32m[ERROR] STORAGE_BUCKET ($K8S_S3) does NOT match S3 Bucket ($TF_S3)!\e[0m"
    FAIL=1
fi

echo -e "\e[32mVerifying NATS Wiring...\e[0m"
if [[ "$K8S_NATS" == *"$TF_NATS"* ]]; then
    echo -e "\e[32m[OK] NATS_URL is correct ($TF_NATS)\e[0m"
else
    echo -e "\e[32m[ERROR] NATS_URL ($K8S_NATS) is incorrect!\e[0m"
    FAIL=1
fi

if [ $FAIL -eq 1 ]; then
    echo -e "\e[32m====================================================================\e[0m"
    echo -e "\e[32mWiring Verification FAILED.\e[0m"
    echo -e "\e[32m====================================================================\e[0m"
    exit 1
else
    echo -e "\e[32m====================================================================\e[0m"
    echo -e "\e[32mWiring Verification PASSED.\e[0m"
    echo -e "\e[32m====================================================================\e[0m"
fi
