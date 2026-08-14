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

# Collect metrics
echo "Fetching results from instances..."
mkdir -p benchmark-results
TIMESTAMP=$(date +%s)
TOTAL_SUCCESSFUL=0
TOTAL_DURATION=0
TOTAL_DROPPED=0

for INSTANCE in $INSTANCE_IDS; do
    echo "Fetching output from $INSTANCE..."
    aws ssm get-command-invocation \
        --command-id $COMMAND_ID \
        --instance-id $INSTANCE \
        --query "StandardOutputContent" \
        --output text > benchmark-results/${TIMESTAMP}-${INSTANCE}.log
        
    # Naive bash extraction for demonstration (Assuming script prints standard logs)
    SUCCESS=$(grep "Successful requests" benchmark-results/${TIMESTAMP}-${INSTANCE}.log | awk '{print $3}' || echo "0")
    DURATION=$(grep "Duration" benchmark-results/${TIMESTAMP}-${INSTANCE}.log | awk '{print $2}' || echo "0")
    DROPPED=$(grep "Dropped" benchmark-results/${TIMESTAMP}-${INSTANCE}.log | awk '{print $3}' || echo "0")
    
    TOTAL_SUCCESSFUL=$(echo "$TOTAL_SUCCESSFUL + $SUCCESS" | bc)
    TOTAL_DURATION=$(echo "$TOTAL_DURATION + $DURATION" | bc)
    TOTAL_DROPPED=$(echo "$TOTAL_DROPPED + $DROPPED" | bc)
done

# We average the durations to find the concurrent test window
AVG_DURATION=$(echo "scale=2; $TOTAL_DURATION / $GENERATOR_COUNT" | bc)
AGGREGATE_RPS=$(echo "scale=2; $TOTAL_SUCCESSFUL / $AVG_DURATION" | bc)

echo "=== AGGREGATED BENCHMARK RESULT ==="
echo "Total Successful:  $TOTAL_SUCCESSFUL"
echo "Total Dropped:     $TOTAL_DROPPED"
echo "Average Duration:  ${AVG_DURATION}s"
echo "Aggregate RPS:     $AGGREGATE_RPS"

# Save final result for report generator
cat << EOF > benchmark-results/${TIMESTAMP}-summary.json
{
    "target_rps": $TARGET_RPS,
    "actual_rps": $AGGREGATE_RPS,
    "successful": $TOTAL_SUCCESSFUL,
    "dropped": $TOTAL_DROPPED,
    "duration": $AVG_DURATION
}
EOF

echo "Aggregation complete. Result saved to benchmark-results/${TIMESTAMP}-summary.json"
echo "===================================================================="
