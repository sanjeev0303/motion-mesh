#!/usr/bin/env bash

set -euo pipefail

FAILURES=0

function fail {
    echo "❌ $1"
    FAILURES=$((FAILURES + 1))
}

function check_success {
    if [ $? -eq 0 ]; then
        echo "✅ SUCCESS"
    else
        echo "❌ FAILED"
        FAILURES=$((FAILURES + 1))
    fi
}

ENVIRONMENT=${1:-benchmark}

cd infra/terraform/envs/$ENVIRONMENT
if ! AWS_REGION=$(terraform output -raw region); then fail "Terraform region output unavailable"; exit 1; fi
if ! S3_BUCKET_ID=$(terraform output -raw bucket_id); then fail "Terraform bucket_id output unavailable"; exit 1; fi
if ! DIAG_REPO=$(terraform output -raw diagnostic_repository_url); then fail "Terraform diagnostic_repository_url unavailable"; exit 1; fi

cd ../../../../

GIT_SHA=$(git rev-parse --short HEAD)

echo "=== Testing Pod Identity for $ENVIRONMENT ==="

API_POD=$(kubectl get pods -n motionmesh -l app=api -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
WORKER_POD=$(kubectl get pods -n motionmesh -l app=worker -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [[ -z "$API_POD" || -z "$WORKER_POD" ]]; then
    echo "❌ API or Worker pod not found. Please ensure they are deployed."
    exit 1
fi

echo "--- Testing API Pod Identity ---"
echo "Asserting token file presence:"
kubectl exec $API_POD -n motionmesh -- env | grep AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE || FAILURES=$((FAILURES + 1))

echo "Running Application-Level Diagnostics in API Pod:"
kubectl exec $API_POD -n motionmesh -- /app/diagnostic || FAILURES=$((FAILURES + 1))

echo "--- Testing Worker Pod Identity ---"
echo "Asserting token file presence:"
kubectl exec $WORKER_POD -n motionmesh -- env | grep AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE || FAILURES=$((FAILURES + 1))

echo "Running Application-Level Diagnostics in Worker Pod:"
kubectl exec $WORKER_POD -n motionmesh -- /app/diagnostic || FAILURES=$((FAILURES + 1))

echo "--- Testing ESO Pod Identity ---"
kubectl delete pod diag-eso-test -n external-secrets --ignore-not-found 2>/dev/null
kubectl run diag-eso-test --image=$DIAG_REPO:diagnostic-$GIT_SHA -n external-secrets --overrides='{"spec": {"serviceAccountName": "external-secrets"}}' --restart=Never --command -- sleep 300
kubectl wait --for=condition=Ready pod/diag-eso-test -n external-secrets --timeout=60s || FAILURES=$((FAILURES + 1))
echo "ESO Pod Identity (STS):"
kubectl exec diag-eso-test -n external-secrets -- aws sts get-caller-identity | grep "motionmesh-external-secrets-$ENVIRONMENT" || FAILURES=$((FAILURES + 1))

echo "--- Testing ExternalDNS Pod Identity ---"
kubectl delete pod diag-dns-test -n kube-system --ignore-not-found 2>/dev/null
kubectl run diag-dns-test --image=$DIAG_REPO:diagnostic-$GIT_SHA -n kube-system --overrides='{"spec": {"serviceAccountName": "external-dns"}}' --restart=Never --command -- sleep 300
kubectl wait --for=condition=Ready pod/diag-dns-test -n kube-system --timeout=60s || FAILURES=$((FAILURES + 1))
echo "ExternalDNS Pod Identity (STS):"
kubectl exec diag-dns-test -n kube-system -- aws sts get-caller-identity | grep "motionmesh-external-dns-$ENVIRONMENT" || FAILURES=$((FAILURES + 1))

# Cleanup
kubectl delete pod diag-eso-test -n external-secrets --ignore-not-found 2>/dev/null || true
kubectl delete pod diag-dns-test -n kube-system --ignore-not-found 2>/dev/null || true

if [ $FAILURES -gt 0 ]; then
    echo "❌ Pod Identity Verification FAILED with $FAILURES errors."
    exit 1
else
    echo "✅ Pod Identity Verification Complete: All successful."
    exit 0
fi
