#!/bin/bash
set -euo pipefail

ENV="benchmark"
REGION="ap-south-1"
TF_DIR="infra/terraform/envs/${ENV}"
MODE=${1:-}

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mMotionMesh AWS Teardown (aws-down.sh)\e[0m"
echo -e "\e[32m====================================================================\e[0m"

# Try to configure kubeconfig. Safe to fail if EKS doesn't exist yet.
echo -e "\e[32mAttempting to configure kubeconfig...\e[0m"
if aws eks describe-cluster --name "motionmesh-${ENV}" --region "${REGION}" >/dev/null 2>&1; then
    aws eks update-kubeconfig --region "${REGION}" --name "motionmesh-${ENV}" 2>/dev/null || true
    KUBE_AVAILABLE=true
else
    echo -e "\e[32mEKS cluster not found or not yet provisioned — skipping kubectl steps.\e[0m"
    KUBE_AVAILABLE=false
fi

if [ "${MODE}" = "stop" ]; then
    echo -e "\e[32mMode: STOP\e[0m"
    echo -e "\e[32mScaling down EKS workloads to save compute costs...\e[0m"
    if [ "${KUBE_AVAILABLE}" = "true" ]; then
        kubectl scale deployment api -n motionmesh --replicas=0 2>/dev/null || true
        kubectl scale deployment worker -n motionmesh --replicas=0 2>/dev/null || true
    fi

    echo -e "\e[32mStopping any EC2 Load Generators...\e[0m"
    INSTANCE_IDS=$(aws ec2 describe-instances \
        --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running" \
        --query "Reservations[*].Instances[*].InstanceId" \
        --output text --region "${REGION}")
    if [ -n "${INSTANCE_IDS}" ]; then
        aws ec2 stop-instances --instance-ids ${INSTANCE_IDS} --region "${REGION}"
    else
        echo -e "\e[32mNo running load generators found.\e[0m"
    fi
    echo -e "\e[32mStop complete. Persistent data (RDS, Redis, S3, NATS PVs) is intact.\e[0m"
    exit 0

elif [ "${MODE}" = "destroy" ]; then
    echo -e "\e[32mMode: DESTROY\e[0m"
    echo -ne "\e[32mType 'DESTROY MOTIONMESH BENCHMARK' to confirm: \e[0m"
    read -r CONFIRM
    if [ "${CONFIRM}" != "DESTROY MOTIONMESH BENCHMARK" ]; then
        echo -e "\e[32mAborted.\e[0m"
        exit 1
    fi

    # --- 1. Terminate Load Generators ---
    echo -e "\e[32m1. Terminating Load Generators...\e[0m"
    INSTANCE_IDS=$(aws ec2 describe-instances \
        --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running,stopped" \
        --query "Reservations[*].Instances[*].InstanceId" \
        --output text --region "${REGION}")
    if [ -n "${INSTANCE_IDS}" ]; then
        aws ec2 terminate-instances --instance-ids ${INSTANCE_IDS} --region "${REGION}"
        echo -e "\e[32mTerminated: ${INSTANCE_IDS}\e[0m"
    else
        echo -e "\e[32mNo load generators to terminate.\e[0m"
    fi

    # --- 2. Helm/kubectl cleanup (only if EKS exists) ---
    echo -e "\e[32m2. Removing Kubernetes Resources...\e[0m"
    if [ "${KUBE_AVAILABLE}" = "true" ]; then
        kubectl delete -f infra/k8s/ingress.yaml 2>/dev/null || true
        sleep 15  # wait for AWS LBC to remove the ALB
        helm uninstall aws-load-balancer-controller -n kube-system 2>/dev/null || true
        helm uninstall external-dns -n kube-system 2>/dev/null || true
        helm uninstall external-secrets -n external-secrets 2>/dev/null || true
        helm uninstall prometheus -n monitoring 2>/dev/null || true
        echo -e "\e[32mKubernetes resources removed.\e[0m"
    else
        echo -e "\e[32mSkipping kubectl/helm (cluster not reachable).\e[0m"
    fi

    # --- 3. Release stale Terraform lock if present ---
    echo -e "\e[32m3. Checking for stale Terraform state locks...\e[0m"
    cd "${TF_DIR}"
    terraform init -reconfigure >/dev/null 2>&1 || true
    LOCK_INFO=$(aws dynamodb scan \
        --table-name "motionmesh-terraform-state-lock-${ENV}" \
        --filter-expression "attribute_exists(#info)" \
        --expression-attribute-names '{"#info":"Info"}' \
        --query "Items[0].LockID.S" \
        --output text --region "${REGION}" 2>/dev/null || echo "None")
    if [ "${LOCK_INFO}" != "None" ] && [ -n "${LOCK_INFO}" ]; then
        LOCK_ID=$(echo "${LOCK_INFO}" | sed 's|.*/||')
        echo -e "\e[32mFound stale lock: ${LOCK_ID} — releasing...\e[0m"
        terraform force-unlock -force "${LOCK_ID}" || true
    else
        echo -e "\e[32mNo stale lock found.\e[0m"
    fi

    # --- 4. Empty S3 bucket ---
    echo -ne "\e[32mDelete S3 Benchmark Data? (Type 'DELETE BENCHMARK DATA' to confirm): \e[0m"
    read -r S3_CONFIRM
    if [ "${S3_CONFIRM}" = "DELETE BENCHMARK DATA" ]; then
        # Try Terraform output first; fall back to AWS CLI tag discovery
        BUCKET=$(terraform output -raw bucket_id 2>/dev/null || \
            aws s3api list-buckets \
                --query "Buckets[?contains(Name, 'motionmesh') && contains(Name, 'ap-south-1')].Name | [0]" \
                --output text 2>/dev/null || echo "")
        if [ -n "${BUCKET}" ] && [ "${BUCKET}" != "None" ]; then
            echo -e "\e[32mEmptying bucket ${BUCKET}...\e[0m"
            aws s3 rm "s3://${BUCKET}" --recursive --region "${REGION}" || true
        else
            echo -e "\e[32mCould not locate S3 bucket — skipping.\e[0m"
        fi
    fi

    # --- 5. Prevent S3 Bucket Destruction ---
    echo -e "\e[32m5. Removing S3 bucket from Terraform state to preserve it...\e[0m"
    terraform state rm module.s3 2>/dev/null || true

    # --- 6. Terraform destroy ---
    echo -e "\e[32m6. Running terraform destroy...\e[0m"
    terraform destroy -auto-approve -lock-timeout=5m
    echo -e "\e[32m====================================================================\e[0m"
    echo -e "\e[32mDestroy complete.\e[0m"
    echo -e "\e[32m====================================================================\e[0m"
    exit 0

else
    echo -e "\e[32mUsage: ./scripts/aws-down.sh [stop|destroy]\e[0m"
    exit 1
fi
