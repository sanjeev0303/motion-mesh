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
TF_NATS="nats://nats.motionmesh.svc.cluster.local:4222"
cd ../../../..

# ── Read env vars directly from Secret + ConfigMap (distroless has no printenv) ──
echo -e "\e[32mFetching Kubernetes Secret & ConfigMap values...\e[0m"

get_secret() {
    kubectl get secret motionmesh-secrets -n "$NAMESPACE" \
        -o jsonpath="{.data.$1}" 2>/dev/null | base64 -d 2>/dev/null || echo ""
}

get_configmap() {
    kubectl get configmap motionmesh-config -n "$NAMESPACE" \
        -o jsonpath="{.data.$1}" 2>/dev/null || echo ""
}

K8S_AURORA=$(get_secret DATABASE_URL)
K8S_REDIS=$(get_secret REDIS_URL)
K8S_S3=$(get_configmap STORAGE_BUCKET)
K8S_NATS=$(get_configmap QUEUE_URL)

FAIL=0

echo -e "\e[32mVerifying Database Wiring...\e[0m"
if [[ "$K8S_AURORA" == *"$TF_AURORA"* ]]; then
    echo -e "\e[32m[OK] DATABASE_URL matches Aurora Endpoint ($TF_AURORA)\e[0m"
else
    echo -e "\e[31m[ERROR] DATABASE_URL ($K8S_AURORA) does NOT match Aurora Endpoint ($TF_AURORA)!\e[0m"
    FAIL=1
fi

echo -e "\e[32mVerifying Redis Wiring...\e[0m"
if [[ "$K8S_REDIS" == *"$TF_REDIS"* ]]; then
    echo -e "\e[32m[OK] REDIS_URL matches ElastiCache Endpoint ($TF_REDIS)\e[0m"
else
    echo -e "\e[31m[ERROR] REDIS_URL ($K8S_REDIS) does NOT match ElastiCache Endpoint ($TF_REDIS)!\e[0m"
    FAIL=1
fi

echo -e "\e[32mVerifying S3 Wiring...\e[0m"
if [[ "$K8S_S3" == *"$TF_S3"* ]]; then
    echo -e "\e[32m[OK] STORAGE_BUCKET matches S3 Bucket ($TF_S3)\e[0m"
else
    echo -e "\e[31m[ERROR] STORAGE_BUCKET ($K8S_S3) does NOT match S3 Bucket ($TF_S3)!\e[0m"
    FAIL=1
fi

echo -e "\e[32mVerifying NATS Wiring...\e[0m"
if [[ "$K8S_NATS" == *"$TF_NATS"* ]]; then
    echo -e "\e[32m[OK] QUEUE_URL is correct ($TF_NATS)\e[0m"
else
    echo -e "\e[31m[ERROR] QUEUE_URL ($K8S_NATS) is incorrect (expected $TF_NATS)!\e[0m"
    FAIL=1
fi

if [ $FAIL -eq 1 ]; then
    echo -e "\e[31m====================================================================\e[0m"
    echo -e "\e[31mWiring Verification FAILED.\e[0m"
    echo -e "\e[31m====================================================================\e[0m"
    exit 1
else
    echo -e "\e[32m====================================================================\e[0m"
    echo -e "\e[32mWiring Verification PASSED.\e[0m"
    echo -e "\e[32m====================================================================\e[0m"
fi
