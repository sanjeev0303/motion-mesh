#!/bin/bash
set -e

ENV="benchmark"
REGION="ap-south-1"
TF_DIR="infra/terraform/envs/$ENV"

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mMotionMesh AWS Environment Status (aws-status.sh)\e[0m"
echo -e "\e[32m====================================================================\e[0m"

cd $TF_DIR
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
VPC_ID=$(terraform output -raw vpc_id || echo "Unknown")
EKS_CLUSTER=$(terraform output -raw cluster_name || echo "Unknown")
AURORA=$(terraform output -raw aurora_endpoint || echo "Unknown")
REDIS=$(terraform output -raw redis_endpoint || echo "Unknown")
S3=$(terraform output -raw bucket_id || echo "Unknown")
CLOUDFRONT=$(terraform output -raw cloudfront_domain_name || echo "Unknown")
WAF=$(terraform output -raw web_acl_arn || echo "Unknown")
ROUTE53=$(terraform output -raw api_domain_name || echo "Unknown")
cd ../../../..

ALB_DNS=$(kubectl get ingress -n motionmesh -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "Unknown")

echo -e "\e[32m- AWS Account:        $AWS_ACCOUNT_ID\e[0m"
echo -e "\e[32m- AWS Region:         $REGION\e[0m"
echo -e "\e[32m- VPC ID:             $VPC_ID\e[0m"
echo -e "\e[32m- EKS Cluster:        $EKS_CLUSTER\e[0m"
echo -e "\e[32m- Aurora Endpoint:    $AURORA\e[0m"
echo -e "\e[32m- Redis Endpoint:     $REDIS\e[0m"
echo -e "\e[32m- S3 Bucket:          $S3\e[0m"
echo -e "\e[32m- CloudFront Domain:  $CLOUDFRONT\e[0m"
echo -e "\e[32m- ALB DNS (Ingress):  $ALB_DNS\e[0m"
echo -e "\e[32m- WAF ARN:            $WAF\e[0m"
echo -e "\e[32m- Route53 Domain:     $ROUTE53\e[0m"
echo -e "\e[32m\e[0m"

echo -e "\e[32m--- EKS Node Groups ---\e[0m"
aws eks list-nodegroups --cluster-name "$EKS_CLUSTER" --region $REGION --query 'nodegroups' --output text || echo "Cannot fetch node groups"
echo -e "\e[32m\e[0m"

echo -e "\e[32m--- Kubernetes Nodes ---\e[0m"
kubectl get nodes || echo "Cannot reach cluster"
echo -e "\e[32m\e[0m"

echo -e "\e[32m--- Workloads (motionmesh namespace) ---\e[0m"
kubectl get deployments,statefulsets,pods -n motionmesh || echo "No workloads found"
echo -e "\e[32m\e[0m"

echo -e "\e[32m--- Controllers ---\e[0m"
echo -e "\e[32mLoad Balancer Controller:\e[0m"
kubectl get deployments -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller || echo "Missing LBC"
echo -e "\e[32mExternalDNS:\e[0m"
kubectl get deployments -n kube-system -l app.kubernetes.io/name=external-dns || echo "Missing ExternalDNS"
echo -e "\e[32mExternal Secrets Operator:\e[0m"
kubectl get deployments -n external-secrets -l app.kubernetes.io/name=external-secrets || echo "Missing ESO"
echo -e "\e[32mPrometheus Operator:\e[0m"
kubectl get deployments -n monitoring -l app=kube-prometheus-stack-operator || echo "Missing Prometheus"
echo -e "\e[32mMetrics Server:\e[0m"
kubectl get deployments -n kube-system -l app.kubernetes.io/name=metrics-server || echo "Missing Metrics Server"
echo -e "\e[32m\e[0m"

echo -e "\e[32m--- Load Generators ---\e[0m"
aws ec2 describe-instances --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running" --query "Reservations[*].Instances[*].[InstanceId, PublicIpAddress]" --output table || echo "No running generators."
echo -e "\e[32m====================================================================\e[0m"
