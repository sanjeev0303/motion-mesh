#!/bin/bash
set -e

echo -e "\e[32mExporting AWS Resource Inventory for 'motionmesh'...\e[0m"
aws resourcegroupstaggingapi get-resources \
    --tag-filters Key=Project,Values=motionmesh Key=Environment,Values=benchmark \
    --query "ResourceTagMappingList[*].{ResourceARN:ResourceARN, Tags:Tags}" \
    --output json > aws-inventory.json

echo -e "\e[32mInventory saved to aws-inventory.json\e[0m"
