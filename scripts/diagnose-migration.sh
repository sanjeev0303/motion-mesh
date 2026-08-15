#!/bin/bash
set -e

echo "======================================"
echo "    DATABASE MIGRATION DIAGNOSTICS    "
echo "======================================"

echo "[1/4] Migration Job Status:"
kubectl get job motionmesh-db-migration -n motionmesh -o yaml | grep -A 10 "status:" || true

echo ""
echo "[2/4] Migration Pods Status:"
PODS=$(kubectl get pods -n motionmesh -l job-name=motionmesh-db-migration -o jsonpath='{.items[*].metadata.name}' || true)

if [ -z "$PODS" ]; then
    echo "No migration pods found."
    exit 0
fi

# Print detailed pod info
kubectl get pods -n motionmesh -l job-name=motionmesh-db-migration -o wide || true

echo ""
echo "[3/4] Pod Events (All Migration Pods):"
for POD in $PODS; do
    echo "--- Events for $POD ---"
    kubectl get events -n motionmesh --field-selector involvedObject.name=$POD || true
done

echo ""
echo "[4/4] Pod Logs:"
for POD in $PODS; do
    echo "---------------------------------------------------"
    echo "Logs for Pod: $POD"
    echo "---------------------------------------------------"
    
    echo ">>> Init Container - wait-for-db <<<"
    kubectl logs $POD -c wait-for-db -n motionmesh || echo "Failed to fetch wait-for-db logs."
    
    echo ""
    echo ">>> Main Container - migrate <<<"
    if kubectl logs $POD -c migrate -n motionmesh 2>/dev/null; then
        :
    else
        echo "Migration container has not started yet."
    fi
done

echo "======================================"
