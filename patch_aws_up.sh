#!/bin/bash
set -euo pipefail

# This script will modify aws-up.sh

# 1. Insert retry_helm_install function at the top after set -euo pipefail
sed -i '/set -euo pipefail/a \
\
retry_helm_install() {\
    local release_name=$1\
    local repo_name=$2\
    local chart_name=$3\
    local namespace=$4\
    local create_namespace=$5\
    shift 5\
\
    echo -e "\\e[32mInstalling ${release_name} (with retry for network limits)...\\e[0m"\
    local max_retries=5\
    local retry_count=0\
\
    local ns_args=()\
    if [ "$create_namespace" = "true" ]; then\
        ns_args=(--create-namespace)\
    fi\
\
    until helm repo update "$repo_name" 2>/dev/null || true; \\\
          helm upgrade --install "$release_name" "$chart_name" --namespace "$namespace" "${ns_args[@]}" --timeout 10m "$@"; do\
        retry_count=$((retry_count+1))\
        if [ $retry_count -ge $max_retries ]; then\
            echo -e "\\e[31mERROR: Failed to install $release_name after $max_retries attempts.\\e[0m"\
            exit 1\
        fi\
        echo -e "\\e[33mHelm command timed out or failed. Cleaning up partial state and retrying in 30 seconds... ($retry_count/$max_retries)\\e[0m"\
        helm uninstall "$release_name" -n "$namespace" --ignore-not-found 2>/dev/null || true\
        if [ "$release_name" = "external-secrets" ]; then\
            kubectl delete secret -n external-secrets -l name=external-secrets --ignore-not-found 2>/dev/null || true\
        fi\
        sleep 30\
    done\
}' scripts/aws-up.sh

