#!/bin/bash
set -e

ENV=${1:-benchmark}
TABLE="motionmesh-terraform-state-lock-${ENV}"
REGION="ap-south-1"

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mChecking Terraform Lock Status for Environment: ${ENV}\e[0m"
echo -e "\e[32mTable: ${TABLE}\e[0m"
echo -e "\e[32m====================================================================\e[0m"

LOCK_DATA=$(aws dynamodb scan \
  --table-name "${TABLE}" \
  --region "${REGION}" \
  --output json)

LOCK_COUNT=$(echo "$LOCK_DATA" | jq '.Count')

if [ "$LOCK_COUNT" -eq 0 ]; then
    echo -e "\e[32mSUCCESS: No active locks found.\e[0m"
    exit 0
fi

echo -e "\e[32mWARNING: State is currently LOCKED. Active Lock Info:\e[0m"
echo -e "\e[32m------------------------------------------------------------------\e[0m"

echo "$LOCK_DATA" | jq -r '.Items[] | .Info.S' | jq -r '
  "LockID:    " + .ID,
  "Who:       " + .Who,
  "Created:   " + .Created,
  "Operation: " + .Operation,
  "Path:      " + .Path
'
echo -e "\e[32m------------------------------------------------------------------\e[0m"
echo -e "\e[32mIf this lock is stale, you can unlock it using:\e[0m"
echo -e "\e[32m./scripts/terraform-force-unlock.sh <LOCK_ID>\e[0m"
echo -e "\e[32m====================================================================\e[0m"
