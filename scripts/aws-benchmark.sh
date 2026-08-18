#!/bin/bash
set -euo pipefail

TARGET_RPS=${1:-}
DURATION=${2:-60}

if [ -z "${TARGET_RPS}" ]; then
    echo -e "\e[32mUsage: ./scripts/aws-benchmark.sh <TARGET_RPS> [DURATION_SEC]\e[0m"
    echo -e "\e[32mExample: ./scripts/aws-benchmark.sh 16667 120\e[0m"
    exit 1
fi

echo -e "\e[32m====================================================================\e[0m"
echo -e "\e[32mMotionMesh Benchmark Orchestrator (aws-benchmark.sh)\e[0m"
echo -e "\e[32mTarget: ${TARGET_RPS} RPS | Duration: ${DURATION}s\e[0m"
echo -e "\e[32m====================================================================\e[0m"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region 2>/dev/null || echo "ap-south-1")
if [ -z "$REGION" ]; then REGION="ap-south-1"; fi



REPORT_BUCKET="motionmesh-benchmark-reports-${ACCOUNT_ID}"
echo -e "\e[32mEnsuring persistent S3 bucket '${REPORT_BUCKET}' exists...\e[0m"
if ! aws s3api head-bucket --bucket "${REPORT_BUCKET}" >/dev/null 2>&1; then
    aws s3 mb "s3://${REPORT_BUCKET}" --region "${REGION}" >/dev/null 2>&1
    aws s3api put-public-access-block --bucket "${REPORT_BUCKET}" --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" >/dev/null 2>&1
    aws s3api put-bucket-policy --bucket "${REPORT_BUCKET}" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::${REPORT_BUCKET}/*\"}]}" >/dev/null 2>&1
fi

CW_URL="https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#container-insights:performance/EKS/Cluster/motionmesh-benchmark"
echo -e "\e[34m📊 CloudWatch Container Insights URL:\e[0m \e[4m${CW_URL}\e[0m"

# Validate Environment & Dataset
echo -e "\e[32mValidating environment and dataset...\e[0m"
export SKIP_DB_VALIDATION=true
npm install --prefix tests/load/k6 --silent
node tests/load/k6/validate-data.js || exit 1

# Bundle and upload to S3
BUNDLE_NAME="benchmark-bundle-$(date +%s).tar.gz"
echo -e "\e[32mCreating S3 benchmark bundle ${BUNDLE_NAME}...\e[0m"
tar -czf "${BUNDLE_NAME}" server/ tests/ sdk/ package.json
aws s3 cp "${BUNDLE_NAME}" "s3://motionmesh-terraform-state-benchmark-425456324653/${BUNDLE_NAME}"
rm "${BUNDLE_NAME}"

# Create CloudWatch Dashboard
echo -e "\e[32mCreating CloudWatch Dashboard 'MotionMesh-Benchmark-Dashboard'...\e[0m"
DASHBOARD_JSON=$(cat << 'EOF'
{
    "widgets": [
        {
            "type": "metric",
            "x": 0,
            "y": 0,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ { "expression": "SEARCH('{MotionMesh/Benchmark,InstanceId} MetricName=\"SuccessfulRequests\"', 'Maximum', 10)", "id": "e1" } ],
                    [ { "expression": "SEARCH('{MotionMesh/Benchmark,InstanceId} MetricName=\"FailedRequests\"', 'Maximum', 10)", "id": "e2" } ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "REGION_PLACEHOLDER",
                "title": "Requests (Success vs Failed)",
                "period": 10,
                "stat": "Maximum"
            }
        },
        {
            "type": "metric",
            "x": 12,
            "y": 0,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ { "expression": "SEARCH('{MotionMesh/Benchmark,InstanceId} MetricName=\"P50Latency\"', 'Maximum', 10)", "id": "e1" } ],
                    [ { "expression": "SEARCH('{MotionMesh/Benchmark,InstanceId} MetricName=\"P95Latency\"', 'Maximum', 10)", "id": "e2" } ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "REGION_PLACEHOLDER",
                "title": "Latency (P50 vs P95)",
                "period": 10,
                "stat": "Maximum"
            }
        },
        {
            "type": "metric",
            "x": 0,
            "y": 6,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ { "expression": "SEARCH('{MotionMesh/Benchmark,InstanceId} MetricName=\"InFlightRequests\"', 'Maximum', 10)", "id": "e1" } ]
                ],
                "view": "gauge",
                "region": "REGION_PLACEHOLDER",
                "title": "In-Flight Progress",
                "period": 10,
                "stat": "Maximum",
                "yAxis": {
                    "left": {
                        "min": 0,
                        "max": 20000
                    }
                }
            }
        },
        {
            "type": "metric",
            "x": 12,
            "y": 6,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ { "expression": "SEARCH('{AWS/RDS,DBInstanceIdentifier} MetricName=\"CPUUtilization\"', 'Average', 60)", "id": "e1" } ],
                    [ { "expression": "SEARCH('{AWS/RDS,DBInstanceIdentifier} MetricName=\"DatabaseConnections\"', 'Average', 60)", "id": "e2" } ],
                    [ { "expression": "SEARCH('{AWS/RDS,DBInstanceIdentifier} MetricName=\"FreeableMemory\"', 'Average', 60)", "id": "e3" } ]
                ],
                "view": "gauge",
                "region": "REGION_PLACEHOLDER",
                "title": "Aurora RDS Utilization",
                "period": 60,
                "stat": "Average",
                "yAxis": {
                    "left": {
                        "min": 0,
                        "max": 100
                    }
                }
            }
        },
        {
            "type": "metric",
            "x": 0,
            "y": 12,
            "width": 8,
            "height": 6,
            "properties": {
                "metrics": [
                    [ { "expression": "SEARCH('{AWS/EC2,InstanceId} MetricName=\"CPUUtilization\"', 'Average', 60)", "id": "e1" } ]
                ],
                "view": "gauge",
                "region": "REGION_PLACEHOLDER",
                "title": "EC2 Instances CPU %",
                "period": 60,
                "stat": "Average",
                "yAxis": {
                    "left": {
                        "min": 0,
                        "max": 100
                    }
                }
            }
        },
        {
            "type": "metric",
            "x": 8,
            "y": 12,
            "width": 8,
            "height": 6,
            "properties": {
                "metrics": [
                    [ { "expression": "SEARCH('{AWS/EC2,InstanceId} MetricName=\"NetworkIn\"', 'Average', 60)", "id": "e1" } ],
                    [ { "expression": "SEARCH('{AWS/EC2,InstanceId} MetricName=\"NetworkOut\"', 'Average', 60)", "id": "e2" } ]
                ],
                "view": "bar",
                "region": "REGION_PLACEHOLDER",
                "title": "EC2 Instances Network",
                "period": 60,
                "stat": "Average"
            }
        },
        {
            "type": "metric",
            "x": 16,
            "y": 12,
            "width": 8,
            "height": 6,
            "properties": {
                "metrics": [
                    [ { "expression": "SEARCH('{AWS/EBS,VolumeId} MetricName=\"VolumeReadBytes\"', 'Average', 60)", "id": "e1" } ],
                    [ { "expression": "SEARCH('{AWS/EBS,VolumeId} MetricName=\"VolumeWriteBytes\"', 'Average', 60)", "id": "e2" } ]
                ],
                "view": "bar",
                "region": "REGION_PLACEHOLDER",
                "title": "EC2 Storage (EBS I/O)",
                "period": 60,
                "stat": "Average"
            }
        },
        {
            "type": "metric",
            "x": 0,
            "y": 18,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ { "expression": "SEARCH('{AWS/ElastiCache,CacheClusterId} MetricName=\"EngineCPUUtilization\"', 'Maximum', 60)", "id": "e1" } ],
                    [ { "expression": "SEARCH('{AWS/ElastiCache,CacheClusterId} MetricName=\"DatabaseMemoryUsagePercentage\"', 'Maximum', 60)", "id": "e2" } ],
                    [ { "expression": "SEARCH('{AWS/ElastiCache,CacheClusterId} MetricName=\"NetworkBytesIn\"', 'Average', 60)", "id": "e3" } ]
                ],
                "view": "gauge",
                "region": "REGION_PLACEHOLDER",
                "title": "Redis (ElastiCache) Utilization",
                "period": 60,
                "stat": "Maximum",
                "yAxis": {
                    "left": {
                        "min": 0,
                        "max": 100
                    }
                }
            }
        },
        {
            "type": "metric",
            "x": 12,
            "y": 18,
            "width": 12,
            "height": 6,
            "properties": {
                "metrics": [
                    [ { "expression": "SEARCH('{ContainerInsights,ClusterName,Namespace,PodName} Namespace=\"motionmesh\" PodName=\"nats\" MetricName=\"pod_cpu_utilization\"', 'Average', 60)", "id": "e1" } ],
                    [ { "expression": "SEARCH('{ContainerInsights,ClusterName,Namespace,PodName} Namespace=\"motionmesh\" PodName=\"nats\" MetricName=\"pod_memory_utilization\"', 'Average', 60)", "id": "e2" } ],
                    [ { "expression": "SEARCH('{ContainerInsights,ClusterName,Namespace,PodName} Namespace=\"motionmesh\" PodName=\"nats\" MetricName=\"pod_network_rx_bytes\"', 'Average', 60)", "id": "e3" } ]
                ],
                "view": "gauge",
                "region": "REGION_PLACEHOLDER",
                "title": "NATS Pod Utilization",
                "period": 60,
                "stat": "Average",
                "yAxis": {
                    "left": {
                        "min": 0,
                        "max": 100
                    }
                }
            }
        }
    ]
}
EOF
)
DASHBOARD_JSON=${DASHBOARD_JSON//REGION_PLACEHOLDER/$REGION}
aws cloudwatch put-dashboard --dashboard-name "MotionMesh-Benchmark-Dashboard" --dashboard-body "${DASHBOARD_JSON}" >/dev/null 2>&1
DASHBOARD_URL="https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards/dashboard/MotionMesh-Benchmark-Dashboard"
echo -e "\e[34m📈 Benchmark Dashboard URL:\e[0m \e[4m${DASHBOARD_URL}\e[0m"


# Identify Load Generators
echo -e "\e[32mDiscovering Load Generators...\e[0m"

# Assuming each generator can handle 2500 RPS max comfortably
REQUIRED_GENERATORS=$(( (TARGET_RPS + 2499) / 2500 ))
if [ "${REQUIRED_GENERATORS}" -lt 2 ]; then REQUIRED_GENERATORS=2; fi

INSTANCE_IDS=$(aws ec2 describe-instances --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running" --query "Reservations[*].Instances[*].InstanceId" --output text)

GENERATOR_COUNT=0
if [ -n "${INSTANCE_IDS}" ] && [ "${INSTANCE_IDS}" != "None" ]; then
    INSTANCE_ARRAY=($INSTANCE_IDS)
    GENERATOR_COUNT=${#INSTANCE_ARRAY[@]}
fi

if [ "${GENERATOR_COUNT}" -lt "${REQUIRED_GENERATORS}" ]; then
    NEEDED=$(( REQUIRED_GENERATORS - GENERATOR_COUNT ))
    
    STOPPED_IDS=$(aws ec2 describe-instances --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=stopped" --query "Reservations[*].Instances[*].InstanceId" --output text)
    if [ -n "${STOPPED_IDS}" ] && [ "${STOPPED_IDS}" != "None" ]; then
        STOPPED_ARRAY=($STOPPED_IDS)
        TO_START=${#STOPPED_ARRAY[@]}
        if [ "$TO_START" -gt "$NEEDED" ]; then
            TO_START=$NEEDED
        fi
        START_LIST=("${STOPPED_ARRAY[@]:0:$TO_START}")
        
        echo -e "\e[32mStarting ${TO_START} stopped Load Generators...\e[0m"
        aws ec2 start-instances --instance-ids ${START_LIST[@]} >/dev/null
        echo -e "\e[32mWaiting 45s for stopped instances to boot...\e[0m"
        sleep 45
        
        # Refresh running count
        INSTANCE_IDS=$(aws ec2 describe-instances --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running" --query "Reservations[*].Instances[*].InstanceId" --output text)
        if [ -n "${INSTANCE_IDS}" ] && [ "${INSTANCE_IDS}" != "None" ]; then
            INSTANCE_ARRAY=($INSTANCE_IDS)
            GENERATOR_COUNT=${#INSTANCE_ARRAY[@]}
        fi
    fi
fi

if [ "${GENERATOR_COUNT}" -lt "${REQUIRED_GENERATORS}" ]; then
    NEEDED=$(( REQUIRED_GENERATORS - GENERATOR_COUNT ))
    echo -e "\e[32mTarget RPS (${TARGET_RPS}) requires ${REQUIRED_GENERATORS} generators, but only ${GENERATOR_COUNT} are running.\e[0m"
    ./scripts/aws-provision-generators.sh "${NEEDED}"
    echo -e "\e[32mWaiting 60s for new instances to initialize and register with SSM...\e[0m"
    sleep 60
    INSTANCE_IDS=$(aws ec2 describe-instances --filters "Name=tag:Role,Values=LoadGenerator" "Name=instance-state-name,Values=running" --query "Reservations[*].Instances[*].InstanceId" --output text)
    INSTANCE_ARRAY=($INSTANCE_IDS)
    GENERATOR_COUNT=${#INSTANCE_ARRAY[@]}
fi

if [ "${GENERATOR_COUNT}" -eq 0 ]; then
    echo -e "\e[31mERROR: Failed to provision or discover any Load Generators.\e[0m"
    exit 1
fi

echo -e "\e[32mFound ${GENERATOR_COUNT} Load Generator(s): ${INSTANCE_IDS}\e[0m"

# EKS Nodegroup Scaling
EKS_NODES_NEEDED=$(( (TARGET_RPS + 1999) / 2000 ))
if [ "${EKS_NODES_NEEDED}" -lt 2 ]; then EKS_NODES_NEEDED=2; fi

echo -e "\e[32mTarget RPS (${TARGET_RPS}) requires ~${EKS_NODES_NEEDED} EKS nodes. Adjusting EKS Nodegroups if needed...\e[0m"
API_NODEGROUPS=$(aws eks list-nodegroups --cluster-name motionmesh-benchmark --query "nodegroups[?starts_with(@, 'api-') || starts_with(@, 'workers-')]" --output text 2>/dev/null || true)
if [ -n "$API_NODEGROUPS" ] && [ "$API_NODEGROUPS" != "None" ]; then
    for NG in $API_NODEGROUPS; do
        aws eks update-nodegroup-config --cluster-name motionmesh-benchmark --nodegroup-name "$NG" --scaling-config desiredSize=$EKS_NODES_NEEDED,maxSize=$((EKS_NODES_NEEDED * 2)) >/dev/null 2>&1 || true
    done
fi

# Distribute load (Floor division + remainder distribution)
BASE_RPS=$(( TARGET_RPS / GENERATOR_COUNT ))
REMAINDER=$(( TARGET_RPS % GENERATOR_COUNT ))

echo -e "\e[32mDistributing load...\e[0m"
TEST_ID="test-$(date +%s)"
START_TIME_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
mkdir -p "tests/load/k6/benchmark-results/${TEST_ID}"

echo -e "\e[32mEnsuring CloudWatch log group '/motionmesh/benchmark' exists...\e[0m"
aws logs create-log-group --log-group-name "/motionmesh/benchmark" 2>/dev/null || true

for i in "${!INSTANCE_ARRAY[@]}"; do
    INSTANCE="${INSTANCE_ARRAY[$i]}"
    RPS=$BASE_RPS
    if [ "$i" -lt "$REMAINDER" ]; then
        RPS=$(( RPS + 1 ))
    fi
    echo -e "\e[32mGenerator ${INSTANCE}: ${RPS} RPS\e[0m"

    # Send SSM command; stream to stdout for CloudWatch Logs
    CMD="set -euo pipefail; \
 sudo mkdir -p /opt/motionmesh-benchmark && \
 sudo chown ec2-user:ec2-user /opt/motionmesh-benchmark && \
 cd /opt/motionmesh-benchmark && \
 aws s3 cp s3://motionmesh-terraform-state-benchmark-425456324653/${BUNDLE_NAME} . --quiet && \
 tar -xzf ${BUNDLE_NAME} && \
 npm install --silent > /dev/null 2>&1 && \
 set +e; \
 echo 'while true; do aws s3 cp server/scripts/system.log s3://${REPORT_BUCKET}/report/${TEST_ID}/${INSTANCE}-system-live.log --quiet 2>/dev/null || true; sleep 5; done' > live.sh; \
 chmod +x live.sh; \
 ./live.sh >/dev/null 2>&1 & \
 LIVE_PID=\$!; \
 INSTANCE_ID=${INSTANCE} RPS_TIERS=${RPS} DURATION_SEC=${DURATION} MAX_CONCURRENCY=100000 BENCHMARK_MODE=true TEST_ID=${TEST_ID} \
   node server/scripts/sdk_distributed_benchmark.js 2>&1 | tee server/scripts/system.log; \
 EXIT=\${PIPESTATUS[0]}; \
 kill \$LIVE_PID 2>/dev/null || true; \
 set -e; \
 aws s3 cp server/scripts/api-calls.log s3://${REPORT_BUCKET}/report/${TEST_ID}/${INSTANCE}-api-calls.log --quiet || true; \
 aws s3 cp server/scripts/system.log s3://${REPORT_BUCKET}/report/${TEST_ID}/${INSTANCE}-system.log --quiet || true; \
 if [ \$EXIT -eq 0 ]; then \
   aws s3 cp server/scripts/result.json s3://${REPORT_BUCKET}/report/${TEST_ID}/${INSTANCE}-result.json --quiet; \
 else \
   echo 'BENCHMARK_FAILED'; \
   cat server/scripts/system.log; \
   exit 1; \
 fi"
    
    CMD_ID=$(aws ssm send-command \
        --instance-ids "${INSTANCE}" \
        --document-name "AWS-RunShellScript" \
        --parameters '{"commands":["'"${CMD}"'"]}' \
        --cloud-watch-output-config "CloudWatchLogGroupName=/motionmesh/benchmark,CloudWatchOutputEnabled=true" \
        --query "Command.CommandId" \
        --output text)
        
    echo -e "\e[32mDispatched to ${INSTANCE} -> CommandID: ${CMD_ID}\e[0m"
    echo "${CMD_ID}" > "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}.cmd"
done

echo -e "\e[32mStreaming live logs from all instances via S3 (updating every 5s)...\e[0m"

FAILED=0
NUM_COMPLETED=0
declare -A COMPLETED_INSTANCES
declare -A LAST_LINES

while [ $NUM_COMPLETED -lt ${GENERATOR_COUNT} ]; do
    for INSTANCE in "${INSTANCE_ARRAY[@]}"; do
        if [ "${COMPLETED_INSTANCES[$INSTANCE]:-}" = "1" ]; then
            continue
        fi

        CMD_ID=$(cat "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}.cmd")
        
        # Fetch the live system.log from S3
        aws s3 cp "s3://${REPORT_BUCKET}/report/${TEST_ID}/${INSTANCE}-system-live.log" "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log" --quiet 2>/dev/null || true
        
        if [ -f "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log" ]; then
            OLD_FILE="tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log.old"
            if [ -f "$OLD_FILE" ]; then
                OLD_LINES=$(wc -l < "$OLD_FILE")
                NEW_LINES=$(wc -l < "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log")
                if [ "$NEW_LINES" -gt "$OLD_LINES" ]; then
                    tail -n +$(( OLD_LINES + 1 )) "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log" | sed "s/^/[$INSTANCE] /"
                fi
            else
                cat "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log" | sed "s/^/[$INSTANCE] /"
            fi
            cp "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log" "$OLD_FILE"
        fi
        
        STATUS=$(aws ssm list-command-invocations \
            --command-id "${CMD_ID}" --instance-id "${INSTANCE}" \
            --query "CommandInvocations[0].Status" --output text 2>/dev/null || true)

        if [ "$STATUS" = "Success" ]; then
            # Download the final log to catch any remaining lines
            aws s3 cp "s3://${REPORT_BUCKET}/report/${TEST_ID}/${INSTANCE}-system.log" "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log" --quiet 2>/dev/null || true
            if [ -f "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log" ]; then
                OLD_FILE="tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log.old"
                if [ -f "$OLD_FILE" ]; then
                    OLD_LINES=$(wc -l < "$OLD_FILE")
                    NEW_LINES=$(wc -l < "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log")
                    if [ "$NEW_LINES" -gt "$OLD_LINES" ]; then
                        tail -n +$(( OLD_LINES + 1 )) "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log" | sed "s/^/[$INSTANCE] /"
                    fi
                else
                    cat "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log" | sed "s/^/[$INSTANCE] /"
                fi
            fi
            
            echo -e "\n\e[32m✅ Instance ${INSTANCE} completed successfully.\e[0m"
            aws s3 cp "s3://${REPORT_BUCKET}/report/${TEST_ID}/${INSTANCE}-result.json" "tests/load/k6/benchmark-results/${TEST_ID}/${INSTANCE}-result.json" --quiet 2>/dev/null || true
            COMPLETED_INSTANCES[$INSTANCE]=1
            NUM_COMPLETED=$((NUM_COMPLETED + 1))
        elif [ "$STATUS" = "Failed" ] || [ "$STATUS" = "DeliveryTimedOut" ] || [ "$STATUS" = "ExecutionTimedOut" ]; then
            # Attempt to grab any final logs on failure
            aws s3 cp "s3://${REPORT_BUCKET}/report/${TEST_ID}/${INSTANCE}-system.log" "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log" --quiet 2>/dev/null || true
            if [ -f "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log" ]; then
                OLD_FILE="tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log.old"
                if [ -f "$OLD_FILE" ]; then
                    OLD_LINES=$(wc -l < "$OLD_FILE")
                    NEW_LINES=$(wc -l < "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log")
                    if [ "$NEW_LINES" -gt "$OLD_LINES" ]; then
                        tail -n +$(( OLD_LINES + 1 )) "tests/load/k6/benchmark-results/${TEST_ID}/.${INSTANCE}-system.log" | sed "s/^/[$INSTANCE] /"
                    fi
                fi
            fi
            
            echo -e "\n\e[31m❌ Instance ${INSTANCE} FAILED (${STATUS}).\e[0m"
            FAILED=1
            COMPLETED_INSTANCES[$INSTANCE]=1
            NUM_COMPLETED=$((NUM_COMPLETED + 1))
        fi
    done

    if [ "$FAILED" -eq 1 ]; then
        break
    fi

    sleep 5
done

# No background log tail to kill

if [ "$FAILED" -eq 1 ]; then
    echo -e "\e[32mERROR: Benchmark failed due to instance failure.\e[0m"
    exit 1
fi

echo -e "\e[32mAll generators finished. Aggregating results...\e[0m"
END_TIME_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
node scripts/collect-cloudwatch-metrics.js "tests/load/k6/benchmark-results/${TEST_ID}" "${START_TIME_ISO}" "${END_TIME_ISO}"
node scripts/aggregate-results.js "tests/load/k6/benchmark-results/${TEST_ID}"

echo -e "\e[32mGenerating HTML report...\e[0m"
node scripts/generate-html-report.js "tests/load/k6/benchmark-results/${TEST_ID}"

echo -e "\e[32mUploading HTML report and data to S3...\e[0m"
aws s3 cp "tests/load/k6/benchmark-results/${TEST_ID}/report.html" "s3://${REPORT_BUCKET}/report/${TEST_ID}/index.html" --content-type "text/html"
aws s3 cp "tests/load/k6/benchmark-results/${TEST_ID}/workload.json" "s3://${REPORT_BUCKET}/report/${TEST_ID}/workload.json" --content-type "application/json"

echo -e "\e[32mUpdating benchmark index page...\e[0m"
INDEX_TMP=$(mktemp /tmp/benchmark-index-XXXXXX.html)
node scripts/generate-report-index.js "${REPORT_BUCKET}" "${REGION}" "${INDEX_TMP}"
aws s3 cp "${INDEX_TMP}" "s3://${REPORT_BUCKET}/index.html" --content-type "text/html"
rm -f "${INDEX_TMP}"

PUBLIC_URL="https://${REPORT_BUCKET}.s3.${REGION}.amazonaws.com/report/${TEST_ID}/index.html"
INDEX_URL="https://${REPORT_BUCKET}.s3.${REGION}.amazonaws.com/index.html"
echo -e "\e[32mBenchmark completed: tests/load/k6/benchmark-results/${TEST_ID}\e[0m"
echo -e "\e[34m🌐 This Run Report:\e[0m \e[4m${PUBLIC_URL}\e[0m"
echo -e "\e[34m📋 All Reports Index:\e[0m \e[4m${INDEX_URL}\e[0m"
