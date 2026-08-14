#!/bin/bash
set -e

# MOTIONMESH E2E DEPLOYMENT SCRIPT

ENV="benchmark"
REGION="us-east-1"
TF_DIR="infra/terraform/envs/$ENV"

echo "===================================================================="
echo "Starting MotionMesh E2E Deployment (aws-up.sh)"
echo "===================================================================="

# 1. Preflight
if ! command -v terraform &> /dev/null || ! command -v aws &> /dev/null || ! command -v kubectl &> /dev/null || ! command -v helm &> /dev/null || ! command -v envsubst &> /dev/null; then
    echo "ERROR: terraform, aws, kubectl, helm, and envsubst must be installed."
    exit 1
fi

GIT_SHA=$(git rev-parse --short HEAD)
echo "Deploying Git SHA: $GIT_SHA"

# 2. AWS Identity Check
echo "Checking AWS Identity..."
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account: $AWS_ACCOUNT_ID Region: $REGION"

# 3, 4, 5, 6. Terraform
echo "Applying Terraform..."
cd $TF_DIR
terraform init
terraform validate
# We assume the user has configured backend and vars
terraform apply -auto-approve
cd ../../../..

# 7. Wait for EKS
echo "Updating kubeconfig..."
aws eks update-kubeconfig --region $REGION --name "motionmesh-$ENV"

echo "Waiting for EKS Nodes to become ready..."
kubectl wait --for=condition=Ready nodes --all --timeout=600s

# 8. Install Controllers via Helm
echo "Installing Kubernetes Controllers..."
helm repo add eks https://aws.github.io/eks-charts
helm repo add external-secrets https://charts.external-secrets.io
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Metrics Server
helm upgrade --install metrics-server metrics-server/metrics-server \
  --namespace kube-system \
  --set args={--kubelet-insecure-tls}

# AWS Load Balancer Controller
LBC_ROLE_ARN=$(cd $TF_DIR && terraform output -raw load_balancer_controller_iam_role_arn)
helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --set clusterName="motionmesh-$ENV" \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=$LBC_ROLE_ARN

# External Secrets Operator
ESO_ROLE_ARN=$(cd $TF_DIR && terraform output -raw external_secrets_iam_role_arn)
helm upgrade --install external-secrets external-secrets/external-secrets \
  --namespace kube-system \
  --set serviceAccount.create=true \
  --set serviceAccount.name=external-secrets \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=$ESO_ROLE_ARN

# ExternalDNS
EDNS_ROLE_ARN=$(cd $TF_DIR && terraform output -raw external_dns_iam_role_arn)
helm upgrade --install external-dns bitnami/external-dns \
  --namespace kube-system \
  --set provider=aws \
  --set aws.region=$REGION \
  --set serviceAccount.create=true \
  --set serviceAccount.name=external-dns \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=$EDNS_ROLE_ARN

# kube-prometheus-stack
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.enabled=false \
  --set alertmanager.enabled=false

# 9. Wait for controllers
echo "Waiting for controllers to be ready..."
kubectl wait --for=condition=available deployment/aws-load-balancer-controller -n kube-system --timeout=300s
kubectl wait --for=condition=available deployment/external-secrets -n kube-system --timeout=300s
kubectl wait --for=condition=available deployment/external-dns -n kube-system --timeout=300s

# 10. Deploy namespace
kubectl apply -f infra/k8s/namespace.yaml

# 11. Deploy secrets
kubectl apply -f infra/k8s/external-secrets.yaml
echo "Waiting for ExternalSecret to synchronize..."
sleep 10
kubectl wait --for=condition=Ready externalsecret/motionmesh-secrets -n motionmesh --timeout=60s

# 12, 13. Deploy NATS
echo "Deploying NATS..."
kubectl apply -f infra/k8s/nats.yaml
kubectl wait --for=condition=Ready pod -l app=nats -n motionmesh --timeout=300s

# 14. Run DB Migrations
echo "Running Database Migrations..."
kubectl apply -f infra/k8s/migrations-job.yaml
kubectl wait --for=condition=complete job/motionmesh-migrations -n motionmesh --timeout=300s

# 15-21. Build, Push & Deploy Workloads
echo "Fetching Terraform Outputs for Kubernetes Rendering..."
cd $TF_DIR
export EKS_CLUSTER=$(terraform output -raw cluster_name || echo "")
export API_REPO=$(terraform output -raw api_ecr_repository_url || echo "")
export WORKER_REPO=$(terraform output -raw worker_ecr_repository_url || echo "")
export AURORA_ENDPOINT=$(terraform output -raw aurora_endpoint || echo "")
export REDIS_ENDPOINT=$(terraform output -raw redis_endpoint || echo "")
export S3_BUCKET_ID=$(terraform output -raw s3_bucket_id || echo "")
export S3_BUCKET_REGION=$(terraform output -raw s3_bucket_region || echo "us-east-1")
export CLOUDFRONT_DISTRIBUTION_DOMAIN=$(terraform output -raw cloudfront_domain_name || echo "")
export CLOUDFRONT_MEDIA_DOMAIN=$(terraform output -raw cloudfront_media_domain || echo "")
export ACM_CERTIFICATE_ARN=$(terraform output -raw acm_certificate_arn || echo "")
export WAF_ACL_ARN=$(terraform output -raw waf_acl_arn || echo "")
export ALB_SG_ID=$(terraform output -raw alb_security_group_id || echo "")
export API_DOMAIN=$(terraform output -raw api_domain || echo "")
export DB_SECRET_ARN=$(terraform output -raw db_secret_arn || echo "")
export ENVIRONMENT=$ENV
export AWS_REGION=$REGION
export COOKIE_DOMAIN=".motionmesh.co.in"
export ALLOWED_ORIGINS="https://app.motionmesh.co.in"
export BENCHMARK_MODE="true"
export STRIPE_MODE="mock"
export AI_MODE="mock"
export API_IMAGE_URI="${API_REPO}:${GIT_SHA}"
export WORKER_IMAGE_URI="${WORKER_REPO}:${GIT_SHA}"
cd ../../../..

echo "Building and Pushing Docker Images..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

docker build -t $API_IMAGE_URI -f server/api.Dockerfile .
docker push $API_IMAGE_URI

docker build -t $WORKER_IMAGE_URI -f server/worker.Dockerfile .
docker push $WORKER_IMAGE_URI

echo "Rendering Kubernetes Manifests..."
rm -rf infra/rendered
mkdir -p infra/rendered

envsubst < infra/k8s/configmap.yaml > infra/rendered/configmap.yaml
envsubst < infra/k8s/api.yaml > infra/rendered/api.yaml
envsubst < infra/k8s/worker.yaml > infra/rendered/worker.yaml
envsubst < infra/k8s/ingress.yaml > infra/rendered/ingress.yaml

echo "Validating Placeholders..."
if grep -r '\${' infra/rendered/; then
    echo "ERROR: Unrendered placeholders found in manifests!"
    exit 1
fi
if grep -r -E 'localhost|127\.0\.0\.1|motionmesh\.com|motionmesh\.io' infra/rendered/; then
    echo "ERROR: Invalid domains found in rendered manifests!"
    exit 1
fi

echo "Deploying Configuration, API, and Workers..."
kubectl apply -f infra/rendered/configmap.yaml
kubectl apply -f infra/rendered/api.yaml
kubectl apply -f infra/rendered/worker.yaml
kubectl apply -f infra/rendered/ingress.yaml

# Wait for deployments
echo "Waiting for API and Workers to become ready..."
kubectl wait --for=condition=available deployment/api -n motionmesh --timeout=600s
kubectl wait --for=condition=available deployment/worker -n motionmesh --timeout=600s

echo "===================================================================="
echo "Deployment Complete! Please run ./scripts/aws-smoke.sh to verify."
echo "===================================================================="
