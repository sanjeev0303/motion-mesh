#!/bin/bash
set -e

LOCK_ID=$1
ENV=${2:-benchmark}
TF_DIR="infra/terraform/envs/${ENV}"

if [ -z "$LOCK_ID" ]; then
    echo -e "\e[32mUsage: $0 <LOCK_ID> [ENVIRONMENT]\e[0m"
    echo -e "\e[32mUse ./scripts/terraform-lock-status.sh to find the LOCK_ID.\e[0m"
    exit 1
fi

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mDANGER: You are about to FORCE UNLOCK Terraform State.\e[0m"
echo -e "\e[32mOnly do this if you are ABSOLUTELY SURE no other processes are running.\e[0m"
echo -e "\e[32mEnvironment: ${ENV}\e[0m"
echo -e "\e[32mLock ID: ${LOCK_ID}\e[0m"
echo -e "\e[32m====================================================================\e[0m"
echo -ne "\e[32mType 'FORCE UNLOCK MOTIONMESH TERRAFORM' to confirm: \e[0m"
read CONFIRM

if [ "$CONFIRM" != "FORCE UNLOCK MOTIONMESH TERRAFORM" ]; then
    echo -e "\e[32mAborting.\e[0m"
    exit 1
fi

echo -e "\e[32mForce unlocking state...\e[0m"
cd "${TF_DIR}"
terraform force-unlock -force "${LOCK_ID}"

echo -e "\e[32mUnlock completed.\e[0m"
