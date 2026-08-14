#!/bin/bash
set -e

ENV="benchmark"
REGION="us-east-1"
TF_DIR="infra/terraform/envs/$ENV"

echo "===================================================================="
echo "MotionMesh AWS Environment Status (aws-status.sh)"
echo "===================================================================="

cd $TF_DIR
VPC_ID=$(terraform output -raw vpc_id || echo "Unknown")
EKS_CLUSTER=$(terraform output -raw cluster_name || echo "Unknown")
AURORA=$(terraform output -raw aurora_endpoint || echo "Unknown")
REDIS=$(terraform output -raw redis_endpoint || echo "Unknown")
S3=$(terraform output -raw s3_bucket_id || echo "Unknown")
ALB_DNS=$(terraform output -raw alb_dns_name || echo "Unknown")
cd ../../../..

echo "- AWS Region:         $REGION"
echo "- VPC ID:             $VPC_ID"
echo "- EKS Cluster:        $EKS_CLUSTER"
echo "- Aurora Endpoint:    $AURORA"
echo "- Redis Endpoint:     $REDIS"
echo "- S3 Bucket:          $S3"
echo "- ALB DNS:            $ALB_DNS"
echo ""

echo "--- EKS Node Groups ---"
aws eks list-nodegroups --cluster-name "$EKS_CLUSTER" --region $REGION --query 'nodegroups' --output text || echo "Cannot fetch node groups"
echo ""

echo "--- Kubernetes Nodes ---"
kubectl get nodes || echo "Cannot reach cluster"
echo ""

echo "--- Workloads (motionmesh namespace) ---"
kubectl get deployments,statefulsets,pods -n motionmesh || echo "No workloads found"
echo ""

echo "--- Controllers (kube-system & monitoring) ---"
kubectl get deployments -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
kubectl get deployments -n kube-system -l app.kubernetes.io/name=external-dns
kubectl get deployments -n kube-system -l app.kubernetes.io/name=external-secrets
kubectl get deployments -n monitoring -l app=kube-prometheus-stack-operator
echo ""

echo "--- Load Generators ---"
aws ec2 describe-instances --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running" --query "Reservations[*].Instances[*].[InstanceId, PublicIpAddress]" --output table || echo "No running generators."
echo "===================================================================="
