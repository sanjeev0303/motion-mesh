#!/bin/bash
set -euo pipefail

ENV=${2:-benchmark}
LOCK_ID=${1:-}

if [ -z "${LOCK_ID}" ]; then
    echo "Usage: ./scripts/terraform-force-unlock.sh <LOCK_ID> [ENVIRONMENT]"
    echo "Example: ./scripts/terraform-force-unlock.sh 4fbd392a-fb93... benchmark"
    exit 1
fi

echo "Fetching current lock status..."
./scripts/terraform-lock-status.sh "${ENV}"

echo ""
echo "===================================================================="
echo "DANGER: FORCING A TERRAFORM UNLOCK CAN CORRUPT YOUR STATE"
echo "If another process is currently running terraform apply, unlocking"
echo "the state will cause concurrent modifications and fatal corruption."
echo "===================================================================="
echo ""
echo "Are you absolutely sure you want to force unlock LockID: ${LOCK_ID}?"
echo "To proceed, type exactly: FORCE UNLOCK MOTIONMESH TERRAFORM"
echo -n "> "

read -r CONFIRMATION

if [ "${CONFIRMATION}" != "FORCE UNLOCK MOTIONMESH TERRAFORM" ]; then
    echo "Confirmation did not match. Aborting."
    exit 1
fi

echo "Proceeding with force-unlock for environment ${ENV}..."

cd "infra/terraform/envs/${ENV}"
terraform force-unlock -force "${LOCK_ID}"

echo "Unlock command executed."
