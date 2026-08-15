#!/bin/bash
set -e

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mMotionMesh AWS Cost Estimation (aws-cost-check.sh)\e[0m"
echo -e "\e[32m====================================================================\e[0m"

START=$(date -u -d '1 days ago' '+%Y-%m-%d')
END=$(date -u '+%Y-%m-%d')

echo -e "\e[32mFetching estimated costs from $START to $END...\e[0m"
# Note: AWS Cost Explorer must be enabled in the account for this to work.
aws ce get-cost-and-usage \
    --time-period Start=$START,End=$END \
    --granularity DAILY \
    --metrics "UnblendedCost" \
    --query "ResultsByTime[*].[TimePeriod.Start, Total.UnblendedCost.Amount]" \
    --output table || echo "Cost Explorer API is not enabled on this account."

echo -e "\e[32mActive Resource Estimate (Benchmark Config):\e[0m"
echo -e "\e[32m- EKS Control Plane: ~$73/mo\e[0m"
echo -e "\e[32m- 3x c7i.xlarge (API): ~$374/mo\e[0m"
echo -e "\e[32m- 5x c7i.2xlarge (Workers): ~$1250/mo\e[0m"
echo -e "\e[32m- Aurora PostgreSQL (db.r6g.large): ~$200/mo\e[0m"
echo -e "\e[32m- NAT Gateways (x3): ~$100/mo\e[0m"
echo -e "\e[32m- ALB & Traffic: Variable\e[0m"
echo -e "\e[32m====================================================================\e[0m"
