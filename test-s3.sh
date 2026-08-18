#!/bin/bash
TEST_ID="test-1787053050795"
INSTANCE="i-02a806d0ed4a78fd0"
REPORT_BUCKET="motionmesh-benchmark-reports-425456324653"

aws s3 ls "s3://${REPORT_BUCKET}/report/${TEST_ID}/${INSTANCE}-system-live.log" || echo "LIVE NOT FOUND"
aws s3 ls "s3://${REPORT_BUCKET}/report/${TEST_ID}/${INSTANCE}-system.log" || echo "FINAL NOT FOUND"
