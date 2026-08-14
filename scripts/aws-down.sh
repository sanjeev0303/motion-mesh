#!/bin/bash
set -euo pipefail

ENV="benchmark"
REGION="ap-south-1"
TF_DIR="infra/terraform/envs/${ENV}"
MODE=${1:-}

echo "===================================================================="
echo "MotionMesh AWS Teardown (aws-down.sh)"
echo "===================================================================="

# Try to configure kubeconfig. Safe to fail if EKS doesn't exist yet.
echo "Attempting to configure kubeconfig..."
if aws eks describe-cluster --name "motionmesh-${ENV}" --region "${REGION}" >/dev/null 2>&1; then
    aws eks update-kubeconfig --region "${REGION}" --name "motionmesh-${ENV}" 2>/dev/null || true
    KUBE_AVAILABLE=true
else
    echo "EKS cluster not found or not yet provisioned — skipping kubectl steps."
    KUBE_AVAILABLE=false
fi

if [ "${MODE}" = "stop" ]; then
    echo "Mode: STOP"
    echo "Scaling down EKS workloads to save compute costs..."
    if [ "${KUBE_AVAILABLE}" = "true" ]; then
        kubectl scale deployment api -n motionmesh --replicas=0 2>/dev/null || true
        kubectl scale deployment worker -n motionmesh --replicas=0 2>/dev/null || true
    fi

    echo "Stopping any EC2 Load Generators..."
    INSTANCE_IDS=$(aws ec2 describe-instances \
        --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running" \
        --query "Reservations[*].Instances[*].InstanceId" \
        --output text --region "${REGION}")
    if [ -n "${INSTANCE_IDS}" ]; then
        aws ec2 stop-instances --instance-ids ${INSTANCE_IDS} --region "${REGION}"
    else
        echo "No running load generators found."
    fi
    echo "Stop complete. Persistent data (RDS, Redis, S3, NATS PVs) is intact."
    exit 0

elif [ "${MODE}" = "destroy" ]; then
    echo "Mode: DESTROY"
    echo -n "Type 'DESTROY MOTIONMESH BENCHMARK' to confirm: "
    read -r CONFIRM
    if [ "${CONFIRM}" != "DESTROY MOTIONMESH BENCHMARK" ]; then
        echo "Aborted."
        exit 1
    fi

    # --- 1. Terminate Load Generators ---
    echo "1. Terminating Load Generators..."
    INSTANCE_IDS=$(aws ec2 describe-instances \
        --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running,stopped" \
        --query "Reservations[*].Instances[*].InstanceId" \
        --output text --region "${REGION}")
    if [ -n "${INSTANCE_IDS}" ]; then
        aws ec2 terminate-instances --instance-ids ${INSTANCE_IDS} --region "${REGION}"
        echo "Terminated: ${INSTANCE_IDS}"
    else
        echo "No load generators to terminate."
    fi

    # --- 2. Helm/kubectl cleanup (only if EKS exists) ---
    echo "2. Removing Kubernetes Resources..."
    if [ "${KUBE_AVAILABLE}" = "true" ]; then
        kubectl delete -f infra/k8s/ingress.yaml 2>/dev/null || true
        sleep 15  # wait for AWS LBC to remove the ALB
        helm uninstall aws-load-balancer-controller -n kube-system 2>/dev/null || true
        helm uninstall external-dns -n kube-system 2>/dev/null || true
        helm uninstall external-secrets -n kube-system 2>/dev/null || true
        helm uninstall prometheus -n monitoring 2>/dev/null || true
        echo "Kubernetes resources removed."
    else
        echo "Skipping kubectl/helm (cluster not reachable)."
    fi

    # --- 3. Release stale Terraform lock if present ---
    echo "3. Checking for stale Terraform state locks..."
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
        echo "Found stale lock: ${LOCK_ID} — releasing..."
        terraform force-unlock -force "${LOCK_ID}" || true
    else
        echo "No stale lock found."
    fi

    # --- 4. Empty S3 bucket ---
    echo -n "Delete S3 Benchmark Data? (Type 'DELETE BENCHMARK DATA' to confirm): "
    read -r S3_CONFIRM
    if [ "${S3_CONFIRM}" = "DELETE BENCHMARK DATA" ]; then
        # Try Terraform output first; fall back to AWS CLI tag discovery
        BUCKET=$(terraform output -raw s3_bucket_id 2>/dev/null || \
            aws s3api list-buckets \
                --query "Buckets[?contains(Name, 'motionmesh') && contains(Name, 'ap-south-1')].Name | [0]" \
                --output text 2>/dev/null || echo "")
        if [ -n "${BUCKET}" ] && [ "${BUCKET}" != "None" ]; then
            echo "Emptying bucket ${BUCKET}..."
            aws s3 rm "s3://${BUCKET}" --recursive --region "${REGION}" || true
        else
            echo "Could not locate S3 bucket — skipping."
        fi
    fi

    # --- 5. Prevent S3 Bucket Destruction ---
    echo "5. Removing S3 bucket from Terraform state to preserve it..."
    terraform state rm module.s3 2>/dev/null || true

    # --- 6. Terraform destroy ---
    echo "6. Running terraform destroy..."
    terraform destroy -auto-approve -lock-timeout=5m
    echo "===================================================================="
    echo "Destroy complete."
    echo "===================================================================="
    exit 0

else
    echo "Usage: ./scripts/aws-down.sh [stop|destroy]"
    exit 1
fi
