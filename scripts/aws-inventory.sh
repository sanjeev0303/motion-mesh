#!/bin/bash
set -e

echo "Exporting AWS Resource Inventory for 'motionmesh'..."
aws resourcegroupstaggingapi get-resources \
    --tag-filters Key=Project,Values=motionmesh Key=Environment,Values=benchmark \
    --query "ResourceTagMappingList[*].{ResourceARN:ResourceARN, Tags:Tags}" \
    --output json > aws-inventory.json

echo "Inventory saved to aws-inventory.json"
