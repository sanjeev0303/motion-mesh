#!/bin/bash
set -euo pipefail

TARGET_RPS=$1

if [ -z "${TARGET_RPS}" ]; then
    echo "Usage: ./scripts/aws-benchmark.sh <TARGET_RPS>"
    echo "Example: ./scripts/aws-benchmark.sh 16667"
    exit 1
fi

echo "===================================================================="
echo "MotionMesh Benchmark Orchestrator (aws-benchmark.sh)"
echo "Target: ${TARGET_RPS} RPS"
echo "===================================================================="

# Validate Environment & Dataset
echo "Validating environment and dataset..."
node tests/load/k6/validate-data.js || exit 1

# Bundle and upload to S3
BUNDLE_NAME="benchmark-bundle-$(date +%s).tar.gz"
echo "Creating S3 benchmark bundle ${BUNDLE_NAME}..."
tar -czf "${BUNDLE_NAME}" server/ tests/
aws s3 cp "${BUNDLE_NAME}" "s3://motionmesh-terraform-state-benchmark/${BUNDLE_NAME}"
rm "${BUNDLE_NAME}"

# Identify Load Generators
echo "Discovering Load Generators..."
INSTANCE_IDS=$(aws ec2 describe-instances --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running" --query "Reservations[*].Instances[*].InstanceId" --output text)

if [ -z "${INSTANCE_IDS}" ]; then
    echo "ERROR: No running Load Generators found!"
    exit 1
fi

# Convert string of IDs to array
read -r -a INSTANCE_ARRAY <<< "$INSTANCE_IDS"
GENERATOR_COUNT=${#INSTANCE_ARRAY[@]}

echo "Found ${GENERATOR_COUNT} Load Generator(s): ${INSTANCE_IDS}"

# Distribute load (Floor division + remainder distribution)
BASE_RPS=$(( TARGET_RPS / GENERATOR_COUNT ))
REMAINDER=$(( TARGET_RPS % GENERATOR_COUNT ))

echo "Distributing load..."
TEST_ID="test-$(date +%s)"
mkdir -p "benchmark-results/${TEST_ID}"

for i in "${!INSTANCE_ARRAY[@]}"; do
    INSTANCE="${INSTANCE_ARRAY[$i]}"
    RPS=$BASE_RPS
    if [ "$i" -lt "$REMAINDER" ]; then
        RPS=$(( RPS + 1 ))
    fi
    echo "Generator ${INSTANCE}: ${RPS} RPS"

    # Send SSM command to install bundle, run, and cat result.json
    CMD="sudo mkdir -p /opt/motionmesh-benchmark && sudo chown ec2-user:ec2-user /opt/motionmesh-benchmark && cd /opt/motionmesh-benchmark && aws s3 cp s3://motionmesh-terraform-state-benchmark/${BUNDLE_NAME} . && tar -xzf ${BUNDLE_NAME} && cd server && npm install && INSTANCE_ID=${INSTANCE} RPS_TIERS=${RPS} DURATION_SEC=60 MAX_CONCURRENCY=10000 BENCHMARK_MODE=true node scripts/sdk_distributed_benchmark.js > /dev/null 2>&1 && cat scripts/result.json"
    
    CMD_ID=$(aws ssm send-command \
        --instance-ids "${INSTANCE}" \
        --document-name "AWS-RunShellScript" \
        --parameters '{"commands":["'"${CMD}"'"]}' \
        --query "Command.CommandId" \
        --output text)
        
    echo "Dispatched to ${INSTANCE} -> CommandID: ${CMD_ID}"
    # Save the command ID mapped to the instance for tracking
    echo "${CMD_ID}" > "benchmark-results/${TEST_ID}/.${INSTANCE}.cmd"
done

echo "Waiting for all instances to complete execution..."

FAILED=0
for INSTANCE in "${INSTANCE_ARRAY[@]}"; do
    CMD_ID=$(cat "benchmark-results/${TEST_ID}/.${INSTANCE}.cmd")
    while true; do
        STATUS=$(aws ssm list-command-invocations --command-id "${CMD_ID}" --instance-id "${INSTANCE}" --query "CommandInvocations[0].Status" --output text)
        if [ "$STATUS" = "Success" ]; then
            echo "Instance ${INSTANCE} completed successfully."
            aws ssm get-command-invocation --command-id "${CMD_ID}" --instance-id "${INSTANCE}" --query "StandardOutputContent" --output text > "benchmark-results/${TEST_ID}/${INSTANCE}-result.json"
            break
        elif [ "$STATUS" = "Failed" ] || [ "$STATUS" = "DeliveryTimedOut" ] || [ "$STATUS" = "ExecutionTimedOut" ]; then
            echo "ERROR: Instance ${INSTANCE} failed (${STATUS})."
            FAILED=1
            break
        fi
        sleep 5
    done
done

if [ "$FAILED" -eq 1 ]; then
    echo "ERROR: Benchmark failed due to instance failure."
    exit 1
fi

echo "All generators finished. Aggregating results..."
node scripts/aggregate-results.js "benchmark-results/${TEST_ID}"

echo "Benchmark completed: benchmark-results/${TEST_ID}"
