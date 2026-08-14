#!/bin/bash
set -e

TARGET_RPS=$1

if [ -z "$TARGET_RPS" ]; then
    echo "Usage: ./scripts/aws-benchmark.sh <TARGET_RPS>"
    echo "Example: ./scripts/aws-benchmark.sh 16667"
    exit 1
fi

echo "===================================================================="
echo "MotionMesh Benchmark Orchestrator (aws-benchmark.sh)"
echo "Target: $TARGET_RPS RPS"
echo "===================================================================="

# Validate Environment & Dataset
echo "Validating environment and dataset..."
node tests/load/k6/validate-data.js || exit 1

# Identify Load Generators
echo "Discovering Load Generators..."
INSTANCE_IDS=$(aws ec2 describe-instances --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running" --query "Reservations[*].Instances[*].InstanceId" --output text)

if [ -z "$INSTANCE_IDS" ]; then
    echo "ERROR: No running Load Generators found!"
    exit 1
fi

GENERATOR_COUNT=$(echo $INSTANCE_IDS | wc -w)
echo "Found $GENERATOR_COUNT Load Generator(s): $INSTANCE_IDS"

RPS_PER_GENERATOR=$(( TARGET_RPS / GENERATOR_COUNT ))
echo "Distributing load: $RPS_PER_GENERATOR RPS per generator"

echo "Dispatching workloads via AWS Systems Manager (SSM)..."
COMMAND_ID=$(aws ssm send-command \
    --instance-ids $INSTANCE_IDS \
    --document-name "AWS-RunShellScript" \
    --parameters '{"commands":["cd /home/ec2-user/motionmesh/server && RPS_TIERS='$RPS_PER_GENERATOR' DURATION_SEC=60 MAX_CONCURRENCY=10000 node scripts/sdk_distributed_benchmark.js"]}' \
    --query "Command.CommandId" \
    --output text)

echo "SSM Command ID: $COMMAND_ID"
echo "Waiting for completion..."

while true; do
    STATUS=$(aws ssm list-commands --command-id $COMMAND_ID --query "Commands[0].Status" --output text)
    if [ "$STATUS" = "Success" ]; then
        echo "Benchmark workload completed successfully across all generators."
        break
    elif [ "$STATUS" = "Failed" ] || [ "$STATUS" = "DeliveryTimedOut" ] || [ "$STATUS" = "ExecutionTimedOut" ]; then
        echo "ERROR: Benchmark workload failed ($STATUS). Check SSM logs."
        exit 1
    fi
    sleep 5
done

# TODO: Collect metrics and aggregate results
echo "Collecting metrics..."
# bash scripts/collect-metrics.sh $COMMAND_ID

echo "Aggregation complete."
echo "===================================================================="
