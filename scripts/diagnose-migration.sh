#!/bin/bash
set -e

echo "======================================"
echo "    DATABASE MIGRATION DIAGNOSTICS    "
echo "======================================"

echo "[1/4] Migration Job Status:"
kubectl get job motionmesh-db-migration -n motionmesh -o yaml | grep -A 10 "status:" || true

echo ""
echo "[2/4] Migration Pod Status:"
POD_NAME=$(kubectl get pods -n motionmesh -l job-name=motionmesh-db-migration -o jsonpath='{.items[0].metadata.name}' || true)

if [ -z "$POD_NAME" ]; then
    echo "No migration pod found."
    exit 0
fi

kubectl get pod $POD_NAME -n motionmesh || true

echo ""
echo "[3/4] Pod Events:"
kubectl get events -n motionmesh --field-selector involvedObject.name=$POD_NAME || true

echo ""
echo "[4/4] Pod Logs (Init Container - pg-wait):"
kubectl logs $POD_NAME -c pg-wait -n motionmesh || true

echo ""
echo "[4/4] Pod Logs (Migration Container):"
kubectl logs $POD_NAME -n motionmesh || true

echo "======================================"
