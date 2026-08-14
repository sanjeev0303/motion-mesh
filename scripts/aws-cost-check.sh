#!/bin/bash
set -e

echo "===================================================================="
echo "MotionMesh AWS Cost Estimation (aws-cost-check.sh)"
echo "===================================================================="

START=$(date -u -d '1 days ago' '+%Y-%m-%d')
END=$(date -u '+%Y-%m-%d')

echo "Fetching estimated costs from $START to $END..."
# Note: AWS Cost Explorer must be enabled in the account for this to work.
aws ce get-cost-and-usage \
    --time-period Start=$START,End=$END \
    --granularity DAILY \
    --metrics "UnblendedCost" \
    --query "ResultsByTime[*].[TimePeriod.Start, Total.UnblendedCost.Amount]" \
    --output table || echo "Cost Explorer API is not enabled on this account."

echo "Active Resource Estimate (Benchmark Config):"
echo "- EKS Control Plane: ~$73/mo"
echo "- 3x c7i.xlarge (API): ~$374/mo"
echo "- 5x c7i.2xlarge (Workers): ~$1250/mo"
echo "- Aurora PostgreSQL (db.r6g.large): ~$200/mo"
echo "- NAT Gateways (x3): ~$100/mo"
echo "- ALB & Traffic: Variable"
echo "===================================================================="
