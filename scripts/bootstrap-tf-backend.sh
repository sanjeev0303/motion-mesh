#!/bin/bash
set -e

REGION="ap-south-1"
BUCKET_NAME="motionmesh-terraform-state-benchmark"
TABLE_NAME="motionmesh-terraform-state-lock-benchmark"

echo "Creating S3 Bucket: $BUCKET_NAME..."
aws s3api create-bucket \
    --bucket $BUCKET_NAME \
    --region $REGION \
    --create-bucket-configuration LocationConstraint=$REGION

echo "Enabling S3 Bucket Versioning..."
aws s3api put-bucket-versioning \
    --bucket $BUCKET_NAME \
    --versioning-configuration Status=Enabled

echo "Creating DynamoDB Table: $TABLE_NAME..."
aws dynamodb create-table \
    --table-name $TABLE_NAME \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region $REGION

echo "Waiting for table to be active..."
aws dynamodb wait table-exists --table-name $TABLE_NAME --region $REGION

echo "Backend bootstrap complete!"
