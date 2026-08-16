#!/bin/bash
set -euo pipefail

echo "Provisioning 4 Load Generator Instances..."

# Get latest Amazon Linux 2023 AMI
AMI_ID=$(aws ssm get-parameters --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64 --query 'Parameters[0].Value' --output text)

# Get the VPC and Subnet from Terraform state (or aws cli)
SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=*public*" --query "Subnets[0].SubnetId" --output text)

if [ -z "$SUBNET_ID" ] || [ "$SUBNET_ID" == "None" ]; then
    echo "Could not find a public subnet."
    exit 1
fi

# Create IAM Role and Instance Profile for SSM
aws iam create-role --role-name MotionMeshLoadGeneratorRole --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' || true
aws iam attach-role-policy --role-name MotionMeshLoadGeneratorRole --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore || true
aws iam attach-role-policy --role-name MotionMeshLoadGeneratorRole --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess || true
aws iam attach-role-policy --role-name MotionMeshLoadGeneratorRole --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy || true
aws iam create-instance-profile --instance-profile-name MotionMeshLoadGeneratorProfile || true
aws iam add-role-to-instance-profile --instance-profile-name MotionMeshLoadGeneratorProfile --role-name MotionMeshLoadGeneratorRole || true

echo "Waiting for IAM profile to propagate..."
sleep 10

aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type t3.micro \
    --count 1 \
    --subnet-id "$SUBNET_ID" \
    --associate-public-ip-address \
    --iam-instance-profile Name=MotionMeshLoadGeneratorProfile \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=MotionMesh-LoadGenerator},{Key=Role,Value=LoadGenerator}]' \
    --user-data "#!/bin/bash
yum install -y nodejs npm tar gzip"

echo "Instances provisioning. Wait a minute for them to initialize and register with SSM."
