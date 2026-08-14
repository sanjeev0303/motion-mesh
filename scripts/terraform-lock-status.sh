#!/bin/bash
set -euo pipefail

ENV=${1:-benchmark}
REGION="ap-south-1"
TABLE_NAME="motionmesh-terraform-state-lock-${ENV}"

echo "===================================================================="
echo "Checking Terraform Lock Status for Environment: ${ENV}"
echo "Table: ${TABLE_NAME}"
echo "===================================================================="

# Check if table exists first
if ! aws dynamodb describe-table --table-name "${TABLE_NAME}" --region "${REGION}" >/dev/null 2>&1; then
    echo "ERROR: DynamoDB lock table '${TABLE_NAME}' does not exist."
    exit 1
fi

# Query items
ITEMS=$(aws dynamodb scan --table-name "${TABLE_NAME}" --region "${REGION}" --output json)
COUNT=$(echo "${ITEMS}" | node -e "const stdin = require('fs').readFileSync('/dev/stdin'); console.log(JSON.parse(stdin).Count);")

if [ "${COUNT}" -eq 0 ]; then
    echo "State is currently UNLOCKED."
    exit 0
fi

echo "WARNING: State is currently LOCKED. Active Lock Info:"
echo "--------------------------------------------------------------------"

# Parse JSON robustly with Node.js
echo "${ITEMS}" | node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

data.Items.forEach(item => {
    const lockId = item.LockID.S;
    if (item.Info && item.Info.S) {
        const info = JSON.parse(item.Info.S);
        console.log('LockID:    ' + lockId);
        console.log('Who:       ' + (info.Who || 'Unknown'));
        console.log('Created:   ' + (info.Created || 'Unknown'));
        console.log('Operation: ' + (info.Operation || 'Unknown'));
        console.log('StatePath: ' + (info.Path || 'Unknown'));
        console.log('Version:   ' + (info.Version || 'Unknown'));
        console.log('--------------------------------------------------------------------');
    }
});
"
