#!/bin/bash
set -euo pipefail

TARGET_RPS=$1

if [ -z "${TARGET_RPS}" ]; then
    echo -e "\e[32mUsage: ./scripts/aws-benchmark.sh <TARGET_RPS>\e[0m"
    echo -e "\e[32mExample: ./scripts/aws-benchmark.sh 16667\e[0m"
    exit 1
fi

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mMotionMesh Benchmark Orchestrator (aws-benchmark.sh)\e[0m"
echo -e "\e[32mTarget: ${TARGET_RPS} RPS\e[0m"
echo -e "\e[32m====================================================================\e[0m"

# Validate Environment & Dataset
echo -e "\e[32mValidating environment and dataset...\e[0m"
node tests/load/k6/validate-data.js || exit 1

# Bundle and upload to S3
BUNDLE_NAME="benchmark-bundle-$(date +%s).tar.gz"
echo -e "\e[32mCreating S3 benchmark bundle ${BUNDLE_NAME}...\e[0m"
tar -czf "${BUNDLE_NAME}" server/ tests/
aws s3 cp "${BUNDLE_NAME}" "s3://motionmesh-terraform-state-benchmark/${BUNDLE_NAME}"
rm "${BUNDLE_NAME}"

# Identify Load Generators
echo -e "\e[32mDiscovering Load Generators...\e[0m"
INSTANCE_IDS=$(aws ec2 describe-instances --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running" --query "Reservations[*].Instances[*].InstanceId" --output text)

if [ -z "${INSTANCE_IDS}" ]; then
    echo -e "\e[32mERROR: No running Load Generators found!\e[0m"
    exit 1
fi

# Convert string of IDs to array
read -r -a INSTANCE_ARRAY <<< "$INSTANCE_IDS"
GENERATOR_COUNT=${#INSTANCE_ARRAY[@]}

echo -e "\e[32mFound ${GENERATOR_COUNT} Load Generator(s): ${INSTANCE_IDS}\e[0m"

# Distribute load (Floor division + remainder distribution)
BASE_RPS=$(( TARGET_RPS / GENERATOR_COUNT ))
REMAINDER=$(( TARGET_RPS % GENERATOR_COUNT ))

echo -e "\e[32mDistributing load...\e[0m"
TEST_ID="test-$(date +%s)"
mkdir -p "benchmark-results/${TEST_ID}"

for i in "${!INSTANCE_ARRAY[@]}"; do
    INSTANCE="${INSTANCE_ARRAY[$i]}"
    RPS=$BASE_RPS
    if [ "$i" -lt "$REMAINDER" ]; then
        RPS=$(( RPS + 1 ))
    fi
    echo -e "\e[32mGenerator ${INSTANCE}: ${RPS} RPS\e[0m"

    # Send SSM command to install bundle, run, and cat result.json
    CMD="sudo mkdir -p /opt/motionmesh-benchmark && sudo chown ec2-user:ec2-user /opt/motionmesh-benchmark && cd /opt/motionmesh-benchmark && aws s3 cp s3://motionmesh-terraform-state-benchmark/${BUNDLE_NAME} . && tar -xzf ${BUNDLE_NAME} && cd server && npm install && INSTANCE_ID=${INSTANCE} RPS_TIERS=${RPS} DURATION_SEC=60 MAX_CONCURRENCY=10000 BENCHMARK_MODE=true node scripts/sdk_distributed_benchmark.js > /dev/null 2>&1 && cat scripts/result.json"
    
    CMD_ID=$(aws ssm send-command \
        --instance-ids "${INSTANCE}" \
        --document-name "AWS-RunShellScript" \
        --parameters '{"commands":["'"${CMD}"'"]}' \
        --query "Command.CommandId" \
        --output text)
        
    echo -e "\e[32mDispatched to ${INSTANCE} -> CommandID: ${CMD_ID}\e[0m"
    # Save the command ID mapped to the instance for tracking
    echo -e "\e[32m${CMD_ID}" > "benchmark-results/${TEST_ID}/.${INSTANCE}.cmd\e[0m"
done

echo -e "\e[32mWaiting for all instances to complete execution...\e[0m"

FAILED=0
for INSTANCE in "${INSTANCE_ARRAY[@]}"; do
    CMD_ID=$(cat "benchmark-results/${TEST_ID}/.${INSTANCE}.cmd")
    while true; do
        STATUS=$(aws ssm list-command-invocations --command-id "${CMD_ID}" --instance-id "${INSTANCE}" --query "CommandInvocations[0].Status" --output text)
        if [ "$STATUS" = "Success" ]; then
            echo -e "\e[32mInstance ${INSTANCE} completed successfully.\e[0m"
            aws ssm get-command-invocation --command-id "${CMD_ID}" --instance-id "${INSTANCE}" --query "StandardOutputContent" --output text > "benchmark-results/${TEST_ID}/${INSTANCE}-result.json"
            break
        elif [ "$STATUS" = "Failed" ] || [ "$STATUS" = "DeliveryTimedOut" ] || [ "$STATUS" = "ExecutionTimedOut" ]; then
            echo -e "\e[32mERROR: Instance ${INSTANCE} failed (${STATUS}).\e[0m"
            FAILED=1
            break
        fi
        sleep 5
    done
done

if [ "$FAILED" -eq 1 ]; then
    echo -e "\e[32mERROR: Benchmark failed due to instance failure.\e[0m"
    exit 1
fi

echo -e "\e[32mAll generators finished. Aggregating results...\e[0m"
node scripts/aggregate-results.js "benchmark-results/${TEST_ID}"

echo -e "\e[32mBenchmark completed: benchmark-results/${TEST_ID}\e[0m"
