#!/bin/bash
set -euo pipefail
export AWS_PAGER=""   # Disable AWS CLI pager so the script never blocks waiting for input

# MOTIONMESH E2E DEPLOYMENT SCRIPT

ENV="benchmark"
REGION="ap-south-1"
TF_DIR="infra/terraform/envs/$ENV"

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mStarting MotionMesh E2E Deployment (aws-up.sh)\e[0m"
echo -e "\e[32m====================================================================\e[0m"

# 1. Preflight
if ! command -v terraform &> /dev/null || ! command -v aws &> /dev/null || ! command -v kubectl &> /dev/null || ! command -v helm &> /dev/null || ! command -v envsubst &> /dev/null || ! command -v podman &> /dev/null || ! command -v node &> /dev/null; then
    echo -e "\e[31mERROR: terraform, aws, kubectl, helm, envsubst, podman, and node must be installed.\e[0m"
    exit 1
fi

GIT_SHA=$(git rev-parse --short HEAD)
echo -e "\e[32mDeploying Git SHA: $GIT_SHA\e[0m"

# 2. AWS Identity Check
echo -e "\e[32mChecking AWS Identity...\e[0m"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [ "$AWS_ACCOUNT_ID" != "718314448702" ] || [ "$REGION" != "ap-south-1" ]; then
    echo -e "\e[32mERROR: Identity mismatch. Expected Account 718314448702 and Region ap-south-1.\e[0m"
    exit 1
fi
echo -e "\e[32mAWS Account: $AWS_ACCOUNT_ID Region: $REGION\e[0m"

# 3, 4, 5, 6. Terraform
echo -e "\e[32mApplying Terraform...\e[0m"
cd "${TF_DIR}"
terraform init
terraform validate

# Pre-flight: if the S3 bucket already exists, import it before planning.
S3_BUCKET_NAME="motionmesh-assets-${ENV}-${REGION}"
if aws s3api head-bucket --bucket "${S3_BUCKET_NAME}" 2>/dev/null; then
    echo -e "\e[32mS3 bucket '${S3_BUCKET_NAME}' already exists — importing into Terraform state...\e[0m"
    terraform import 'module.s3.module.s3_bucket.aws_s3_bucket.this[0]' "${S3_BUCKET_NAME}" 2>/dev/null || true
fi

echo -e "\e[32mPlanning Terraform...\e[0m"
terraform plan -out=tfplan

echo -e "\e[32mApplying Terraform (15m Lock Timeout)...\e[0m"
if ! terraform apply -lock-timeout=15m -input=false -auto-approve tfplan; then
    echo -e "\e[32m====================================================================\e[0m"
    echo -e "\e[32mERROR: Terraform Apply Failed.\e[0m"
    echo -e "\e[32mIf this is a state lock issue, DO NOT bypass the lock automatically.\e[0m"
    echo -e "\e[32mPlease run: ./scripts/terraform-lock-status.sh ${ENV}\e[0m"
    echo -e "\e[32mTo investigate active locks.\e[0m"
    echo -e "\e[32m====================================================================\e[0m"
    exit 1
fi

# Fetch canonical outputs
TF_OUT=$(terraform output -json)
export LBC_ROLE_ARN=$(echo "$TF_OUT" | jq -r '.lbc_role_arn.value // empty')
export ESO_ROLE_ARN=$(echo "$TF_OUT" | jq -r '.external_secrets_iam_role_arn.value // empty')
export EDNS_ROLE_ARN=$(echo "$TF_OUT" | jq -r '.external_dns_role_arn.value // empty')
export API_REPO=$(echo "$TF_OUT" | jq -r '.api_repository_url.value // empty')
export WORKER_REPO=$(echo "$TF_OUT" | jq -r '.worker_repository_url.value // empty')
export MIGRATION_REPO=$(echo "$TF_OUT" | jq -r '.diagnostic_repository_url.value // empty')
export EKS_CLUSTER=$(echo "$TF_OUT" | jq -r '.cluster_name.value // empty')
export AURORA_ENDPOINT=$(echo "$TF_OUT" | jq -r '.aurora_endpoint.value // empty')
export REDIS_ENDPOINT=$(echo "$TF_OUT" | jq -r '.redis_endpoint.value // empty')
export S3_BUCKET_ID=$(echo "$TF_OUT" | jq -r '.bucket_id.value // empty')
export S3_BUCKET_REGION=$(echo "$TF_OUT" | jq -r '.bucket_region.value // empty')
export CLOUDFRONT_DISTRIBUTION_DOMAIN=$(echo "$TF_OUT" | jq -r '.cloudfront_domain_name.value // empty')
export MEDIA_DOMAIN=$(echo "$TF_OUT" | jq -r '.media_domain_name.value // empty')
export ACM_CERTIFICATE_ARN=$(echo "$TF_OUT" | jq -r '.acm_certificate_arn.value // empty')
export WAF_ARN=$(echo "$TF_OUT" | jq -r '.web_acl_arn.value // empty')
export ALB_SG_ID=$(echo "$TF_OUT" | jq -r '.alb_security_group_id.value // empty')
export API_DOMAIN=$(echo "$TF_OUT" | jq -r '.api_domain_name.value // empty')
export DB_SECRET_ARN=$(echo "$TF_OUT" | jq -r '.aurora_master_secret_arn.value // empty')
export REDIS_SECRET_ARN=$(echo "$TF_OUT" | jq -r '.redis_secret_arn.value // empty')
export CLOUDFRONT_SECRET_ARN=$(echo "$TF_OUT" | jq -r '.cloudfront_signing_secret_arn.value // empty')
cd ../../../..

# 7. Wait for EKS
echo -e "\e[32mUpdating kubeconfig...\e[0m"
aws eks update-kubeconfig --region "${REGION}" --name "${EKS_CLUSTER}"

echo -e "\e[32mWaiting for EKS Nodes to become ready...\e[0m"
kubectl wait --for=condition=Ready nodes --all --timeout=600s

# 7b. Ensure EBS CSI Driver addon (required for gp3 PVCs)
echo -e "\e[32mEnsuring EBS CSI Driver addon...\e[0m"
EBS_CSI_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/motionmesh-ebs-csi-benchmark"
# Create IAM role if it doesn't exist
if ! aws iam get-role --role-name motionmesh-ebs-csi-benchmark --region "$REGION" &>/dev/null; then
  OIDC_ID=$(aws eks describe-cluster --name "${EKS_CLUSTER}" --region "$REGION" --query "cluster.identity.oidc.issuer" --output text | sed 's|.*/||')
  cat > /tmp/ebs-csi-trust.json <<TRUST
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/oidc.eks.${REGION}.amazonaws.com/id/${OIDC_ID}" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": { "StringEquals": {
      "oidc.eks.${REGION}.amazonaws.com/id/${OIDC_ID}:aud": "sts.amazonaws.com",
      "oidc.eks.${REGION}.amazonaws.com/id/${OIDC_ID}:sub": "system:serviceaccount:kube-system:ebs-csi-controller-sa"
    }}
  }]
}
TRUST
  aws iam create-role --role-name motionmesh-ebs-csi-benchmark --assume-role-policy-document file:///tmp/ebs-csi-trust.json
  aws iam attach-role-policy --role-name motionmesh-ebs-csi-benchmark --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy
  echo -e "\e[32mCreated EBS CSI IAM role.\e[0m"
fi
# Install/update the addon with IRSA role
if aws eks describe-addon --cluster-name "${EKS_CLUSTER}" --addon-name aws-ebs-csi-driver --region "$REGION" &>/dev/null; then
  aws eks update-addon --cluster-name "${EKS_CLUSTER}" --addon-name aws-ebs-csi-driver \
    --service-account-role-arn "$EBS_CSI_ROLE_ARN" --resolve-conflicts OVERWRITE --region "$REGION" 2>/dev/null || true
else
  aws eks create-addon --cluster-name "${EKS_CLUSTER}" --addon-name aws-ebs-csi-driver \
    --service-account-role-arn "$EBS_CSI_ROLE_ARN" --resolve-conflicts OVERWRITE --region "$REGION"
fi
echo -e "\e[32mWaiting for EBS CSI Driver to become active...\e[0m"
aws eks wait addon-active --cluster-name "${EKS_CLUSTER}" --addon-name aws-ebs-csi-driver --region "$REGION"

# 8. Install Controllers via Helm
echo -e "\e[32mInstalling Kubernetes Controllers...\e[0m"
helm repo add eks https://aws.github.io/eks-charts 2>/dev/null || true
helm repo add external-secrets https://charts.external-secrets.io 2>/dev/null || true
helm repo add bitnami https://charts.bitnami.com/bitnami 2>/dev/null || true
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>/dev/null || true
helm repo update 2>/dev/null || true

# Metrics Server (use official kubernetes-sigs chart — Bitnami image is paywalled post-Aug 2025)
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/ 2>/dev/null || true

echo -e "\e[32mInstalling Metrics Server (with retry for GitHub rate limits)...\e[0m"
MAX_RETRIES=5
RETRY_COUNT=0
until helm repo update metrics-server 2>/dev/null || true; \
  helm upgrade --install metrics-server metrics-server/metrics-server \
  --namespace kube-system \
  --timeout 10m \
  --set apiService.create=true \
  --set args="{--kubelet-insecure-tls}" \
  --set resources.requests.cpu=100m \
  --set resources.requests.memory=200Mi \
  --set resources.limits.cpu=500m \
  --set resources.limits.memory=500Mi; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "\e[31mERROR: Failed to install Metrics Server after $MAX_RETRIES attempts.\e[0m"
        exit 1
    fi
    echo -e "\e[33mGitHub download/API timed out, retrying in 15 seconds... ($RETRY_COUNT/$MAX_RETRIES)\e[0m"
    sleep 15
done

# AWS Load Balancer Controller
echo -e "\e[32mInstalling AWS Load Balancer Controller (with retry)...\e[0m"
MAX_RETRIES=5
RETRY_COUNT=0
until helm repo update eks 2>/dev/null || true; \
  helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --namespace kube-system \
  --timeout 10m \
  --set clusterName="${EKS_CLUSTER}" \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=$LBC_ROLE_ARN; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "\e[31mERROR: Failed to install AWS Load Balancer Controller after $MAX_RETRIES attempts.\e[0m"
        exit 1
    fi
    echo -e "\e[33mAPI timed out, retrying in 15 seconds... ($RETRY_COUNT/$MAX_RETRIES)\e[0m"
    sleep 15
done

# External Secrets Operator (Must be in external-secrets namespace)
echo -e "\e[32mInstalling External Secrets (with retry for GitHub rate limits)...\e[0m"
MAX_RETRIES=5
RETRY_COUNT=0
until helm repo update external-secrets 2>/dev/null || true; \
  helm upgrade --install external-secrets external-secrets/external-secrets \
  --namespace external-secrets \
  --create-namespace \
  --timeout 10m \
  --set installCRDs=true \
  --set serviceAccount.create=true \
  --set serviceAccount.name=external-secrets \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=$ESO_ROLE_ARN; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "\e[31mERROR: Failed to install External Secrets after $MAX_RETRIES attempts.\e[0m"
        exit 1
    fi
    echo -e "\e[33mAPI timed out or stream error. Cleaning up partial release state and retrying in 30 seconds... ($RETRY_COUNT/$MAX_RETRIES)\e[0m"
    # Clean up potentially stuck pending-install/pending-upgrade helm releases to avoid conflicts on retry
    helm uninstall external-secrets -n external-secrets --ignore-not-found 2>/dev/null || true
    kubectl delete secret -n external-secrets -l name=external-secrets --ignore-not-found 2>/dev/null || true
    sleep 30
done

# ExternalDNS (use official k8s-sigs chart — Bitnami image is paywalled post-Aug 2025)
helm repo add k8s-sigs-external-dns https://kubernetes-sigs.github.io/external-dns/ 2>/dev/null || true

echo -e "\e[32mInstalling ExternalDNS (with retry for GitHub rate limits)...\e[0m"
MAX_RETRIES=5
RETRY_COUNT=0
until helm repo update k8s-sigs-external-dns 2>/dev/null || true; \
  helm upgrade --install external-dns k8s-sigs-external-dns/external-dns \
  --namespace kube-system \
  --timeout 10m \
  --set provider.name=aws \
  --set env[0].name=AWS_DEFAULT_REGION \
  --set env[0].value=$REGION \
  --set serviceAccount.create=true \
  --set serviceAccount.name=external-dns \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=$EDNS_ROLE_ARN; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "\e[31mERROR: Failed to install ExternalDNS after $MAX_RETRIES attempts.\e[0m"
        exit 1
    fi
    echo -e "\e[33mGitHub download/API timed out, retrying in 15 seconds... ($RETRY_COUNT/$MAX_RETRIES)\e[0m"
    sleep 15
done

# kube-prometheus-stack
echo -e "\e[32mInstalling Prometheus (with retry for GitHub rate limits)...\e[0m"
MAX_RETRIES=5
RETRY_COUNT=0
until helm repo update prometheus-community 2>/dev/null || true; \
  helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --timeout 10m \
  --set grafana.enabled=false \
  --set alertmanager.enabled=false; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "\e[31mERROR: Failed to install Prometheus after $MAX_RETRIES attempts.\e[0m"
        exit 1
    fi
    echo -e "\e[33mGitHub download/API timed out, retrying in 15 seconds... ($RETRY_COUNT/$MAX_RETRIES)\e[0m"
    sleep 15
done

# 9. Wait for controllers
echo -e "\e[32mWaiting for controllers to be ready...\e[0m"
kubectl wait --for=condition=available deployment/aws-load-balancer-controller -n kube-system --timeout=300s
kubectl wait --for=condition=available deployment/external-secrets -n external-secrets --timeout=300s
kubectl wait --for=condition=available deployment/external-dns -n kube-system --timeout=300s

# 10. Deploy namespace
kubectl apply -f infra/k8s/namespace.yaml

# 11. Deploy secrets (Needs rendering now to inject ARNs)
export ENVIRONMENT="${ENV}"
export AWS_REGION="${REGION}"
export COOKIE_DOMAIN=".motionmesh.co.in"
export ALLOWED_ORIGINS="https://app.motionmesh.co.in"
export BENCHMARK_MODE="true"
export STRIPE_MODE="mock"
export AI_MODE="mock"

mkdir -p infra/rendered
envsubst < infra/k8s/external-secrets.yaml > infra/rendered/external-secrets.yaml

echo -e "\e[32mWaiting for External Secrets CRDs to be established...\e[0m"
kubectl wait --for condition=established --timeout=120s crd/secretstores.external-secrets.io || true
kubectl wait --for condition=established --timeout=120s crd/externalsecrets.external-secrets.io || true
sleep 5 # API discovery cache padding

# Invalidate kubectl discovery cache to avoid "no matches for kind" errors due to stale client cache
rm -rf ~/.kube/cache

for i in {1..5}; do
    kubectl apply -f infra/rendered/external-secrets.yaml && break
    echo -e "\e[33mRetrying kubectl apply for external-secrets (Attempt $i/5)...\e[0m"
    sleep 5
done
echo -e "\e[32mWaiting for ExternalSecret to synchronize...\e[0m"
sleep 5
kubectl wait --for=condition=Ready secretstore/aws-secretsmanager -n motionmesh --timeout=60s
kubectl wait --for=condition=Ready externalsecret/motionmesh-secrets -n motionmesh --timeout=60s

# 12. Ensure gp3 StorageClass exists (required for NATS JetStream PVCs)
echo -e "\e[32mCreating gp3 StorageClass...\e[0m"
kubectl apply -f - <<'YAML'
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  fsType: ext4
  encrypted: "true"
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
YAML

# 13. Deploy NATS
echo -e "\e[32mDeploying NATS...\e[0m"
kubectl apply -f infra/k8s/nats.yaml
kubectl wait --for=condition=Ready pod -l app=nats -n motionmesh --timeout=300s

# Build Images
export API_IMAGE_URI="${API_REPO}:${GIT_SHA}"
export WORKER_IMAGE_URI="${WORKER_REPO}:${GIT_SHA}"
export MIGRATION_IMAGE_URI="${MIGRATION_REPO}:${GIT_SHA}"

echo -e "\e[32mBuilding and Pushing Docker Images...\e[0m"
aws ecr get-login-password --region "${REGION}" | podman login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

podman build -t "${API_IMAGE_URI}" -f server/api/Dockerfile server/
podman push "${API_IMAGE_URI}"

podman build -t "${WORKER_IMAGE_URI}" -f server/worker/Dockerfile server/
podman push "${WORKER_IMAGE_URI}"

podman build -t "${MIGRATION_IMAGE_URI}" -f server/migrations.Dockerfile .
podman push "${MIGRATION_IMAGE_URI}"

echo -e "\e[32mRendering Kubernetes Manifests...\e[0m"
envsubst < infra/k8s/configmap.yaml > infra/rendered/configmap.yaml
envsubst < infra/k8s/api.yaml > infra/rendered/api.yaml
envsubst < infra/k8s/worker.yaml > infra/rendered/worker.yaml
envsubst < infra/k8s/ingress.yaml > infra/rendered/ingress.yaml
envsubst '${MIGRATION_IMAGE_URI}' < infra/k8s/db-migration-job.yaml > infra/rendered/db-migration-job.yaml

echo -e "\e[32mValidating Placeholders...\e[0m"
if grep -r '\${' infra/rendered/; then
    echo -e "\e[32mERROR: Unrendered placeholders found in manifests!\e[0m"
    exit 1
fi
if grep -r -E 'localhost|127\.0\.0\.1|motionmesh\.com|motionmesh\.io' infra/rendered/; then
    echo -e "\e[32mERROR: Invalid domains found in rendered manifests!\e[0m"
    exit 1
fi

# 14. Deploy Configuration
echo -e "\e[32mDeploying Configuration...\e[0m"
kubectl apply -f infra/rendered/configmap.yaml

# 15. Run DB Migrations
echo -e "\e[32mRunning Database Migrations...\e[0m"
kubectl delete job motionmesh-db-migration -n motionmesh --ignore-not-found=true
kubectl apply -f infra/rendered/db-migration-job.yaml
kubectl wait --for=condition=complete job/motionmesh-db-migration -n motionmesh --timeout=300s

echo -e "\e[32mDeploying API and Workers...\e[0m"
kubectl apply -f infra/rendered/api.yaml
kubectl apply -f infra/rendered/worker.yaml
kubectl apply -f infra/rendered/ingress.yaml

# Wait for deployments
echo -e "\e[32mWaiting for API and Workers to become ready...\e[0m"
kubectl wait --for=condition=available deployment/api -n motionmesh --timeout=600s
kubectl wait --for=condition=available deployment/worker -n motionmesh --timeout=600s

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mMotionMesh E2E Deployment Complete\e[0m"
echo -e "\e[32mPlease run ./scripts/aws-status.sh and ./scripts/aws-smoke.sh to verify.\e[0m"
echo -e "\e[32m====================================================================\e[0m"
