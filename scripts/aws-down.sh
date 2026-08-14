#!/bin/bash
set -e

ENV="benchmark"
TF_DIR="infra/terraform/envs/$ENV"
MODE=$1

echo "===================================================================="
echo "MotionMesh AWS Teardown (aws-down.sh)"
echo "===================================================================="

if [ "$MODE" = "stop" ]; then
    echo "Mode: STOP"
    echo "Scaling down EKS workloads to save compute costs..."
    kubectl scale deployment motionmesh-api -n motionmesh --replicas=0 || true
    kubectl scale deployment motionmesh-worker -n motionmesh --replicas=0 || true
    
    echo "Stopping any EC2 Load Generators..."
    INSTANCE_IDS=$(aws ec2 describe-instances --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running" --query "Reservations[*].Instances[*].InstanceId" --output text)
    if [ -n "$INSTANCE_IDS" ]; then
        aws ec2 stop-instances --instance-ids $INSTANCE_IDS
    else
        echo "No running load generators found."
    fi
    echo "Stop complete. Persistent data (RDS, Redis, S3, NATS PVs) is intact."
    exit 0

elif [ "$MODE" = "destroy" ]; then
    echo "Mode: DESTROY"
    echo -n "Type 'DESTROY MOTIONMESH BENCHMARK' to confirm: "
    read CONFIRM
    if [ "$CONFIRM" != "DESTROY MOTIONMESH BENCHMARK" ]; then
        echo "Aborted."
        exit 1
    fi

    echo "1. Stopping Load Generators..."
    INSTANCE_IDS=$(aws ec2 describe-instances --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running,stopped" --query "Reservations[*].Instances[*].InstanceId" --output text)
    if [ -n "$INSTANCE_IDS" ]; then
        aws ec2 terminate-instances --instance-ids $INSTANCE_IDS
    fi

    echo "2. Removing Kubernetes Resources..."
    # Helm uninstall controllers first so they clean up their cloud resources (like ALBs created by AWS LBC)
    kubectl delete -f infra/k8s/ingress.yaml || true
    sleep 10 # wait for LBC to delete ALB
    helm uninstall aws-load-balancer-controller -n kube-system || true
    helm uninstall external-dns -n kube-system || true
    helm uninstall external-secrets -n kube-system || true
    helm uninstall prometheus -n monitoring || true

    echo "3. Destroying Terraform Environment..."
    cd $TF_DIR
    
    echo -n "Delete S3 Benchmark Data? (Type 'DELETE BENCHMARK DATA' to confirm): "
    read S3_CONFIRM
    if [ "$S3_CONFIRM" = "DELETE BENCHMARK DATA" ]; then
        BUCKET=$(terraform output -raw s3_bucket_id)
        if [ -n "$BUCKET" ]; then
            echo "Emptying bucket $BUCKET..."
            aws s3 rm s3://$BUCKET --recursive || true
        fi
    fi

    terraform destroy
    echo "Destroy complete."
    exit 0
else
    echo "Usage: ./scripts/aws-down.sh [stop|destroy]"
    exit 1
fi
