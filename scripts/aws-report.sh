#!/bin/bash
set -e

echo "===================================================================="
echo "Generating Benchmark Report (aws-report.sh)"
echo "===================================================================="

REPORT_DIR="docs/investor"
REPORT_FILE="$REPORT_DIR/scalability-report.md"

mkdir -p $REPORT_DIR

cat << 'EOF' > $REPORT_FILE
# MotionMesh AWS Scalability Report

> **Note**: This report clearly distinguishes between VERIFIED AWS test data and TARGET/ESTIMATED data.

## 1M RPM Progression
| Target RPS | Actual RPS | Error Rate | Status |
|------------|------------|------------|--------|

## Current Known Bottlenecks
- NOT_MEASURED

## Infrastructure Health
- **EKS API Nodes**: NOT_MEASURED
- **EKS Worker Nodes**: NOT_MEASURED
- **Aurora PostgreSQL**: NOT_MEASURED
- **ElastiCache Redis**: NOT_MEASURED
- **NATS JetStream**: NOT_MEASURED
- **Load Generators**: NOT_MEASURED
EOF

# Append dynamic results
if ls benchmark-results/*-summary.json 1> /dev/null 2>&1; then
    for f in benchmark-results/*-summary.json; do
        TARGET=$(grep -oP '"target_rps": \K[0-9]+' $f)
        ACTUAL=$(grep -oP '"actual_rps": \K[0-9.]+' $f)
        ERRORS=$(grep -oP '"dropped": \K[0-9]+' $f)
        
        # Calculate error rate roughly
        if [ "$ERRORS" != "0" ]; then
            SUCCESSFUL=$(grep -oP '"successful": \K[0-9]+' $f)
            TOTAL=$((SUCCESSFUL + ERRORS))
            ERR_RATE=$(awk "BEGIN {print ($ERRORS/$TOTAL)*100}")
        else
            ERR_RATE="0"
        fi
        
        # Insert row into the markdown table using sed
        sed -i "/|------------|/a | $TARGET | $ACTUAL | $ERR_RATE% | VERIFIED |" $REPORT_FILE
    done
fi

echo "Report generated at $REPORT_FILE"
