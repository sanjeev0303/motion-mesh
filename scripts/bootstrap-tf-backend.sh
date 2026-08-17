#!/bin/bash
set -e

REGION="ap-south-1"
BUCKET_NAME="motionmesh-terraform-state-benchmark-425456324653"
TABLE_NAME="motionmesh-terraform-state-lock-benchmark"

echo -e "\e[32mCreating S3 Bucket: $BUCKET_NAME...\e[0m"
aws s3api create-bucket \
    --bucket $BUCKET_NAME \
    --region $REGION \
    --create-bucket-configuration LocationConstraint=$REGION

echo -e "\e[32mEnabling S3 Bucket Versioning...\e[0m"
aws s3api put-bucket-versioning \
    --bucket $BUCKET_NAME \
    --versioning-configuration Status=Enabled

echo -e "\e[32mCreating DynamoDB Table: $TABLE_NAME...\e[0m"
aws dynamodb create-table \
    --table-name $TABLE_NAME \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region $REGION

echo -e "\e[32mWaiting for table to be active...\e[0m"
aws dynamodb wait table-exists --table-name $TABLE_NAME --region $REGION

echo -e "\e[32mBackend bootstrap complete!\e[0m"
