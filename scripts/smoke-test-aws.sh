#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT=${1:-benchmark}
echo "=== Running Smoke Tests for $ENVIRONMENT ==="

cd infra/terraform/envs/$ENVIRONMENT
API_DOMAIN=$(terraform output -raw api_domain_name)
cd ../../../../


# Wait for DNS to resolve to ALB
echo "Waiting for DNS resolution of $API_DOMAIN..."
for i in {1..12}; do
    RESOLVED=$(dig +short $API_DOMAIN || echo "")
    if [[ -n "$RESOLVED" ]]; then
        echo "✅ DNS resolved: $RESOLVED"
        break
    fi
    echo "Still waiting for DNS (ExternalDNS propagation)..."
    sleep 10
done

echo "Testing API Health Endpoint (HTTPS)..."
curl -s --fail https://$API_DOMAIN/health || (echo "❌ API Health failed" && exit 1)
echo "✅ API Health Passed"

echo "Testing API Ready Endpoint (HTTPS)..."
curl -s --fail https://$API_DOMAIN/ready || (echo "❌ API Ready failed" && exit 1)
echo "✅ API Ready Passed"

echo "Smoke Tests Complete!"
