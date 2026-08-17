#!/bin/bash
set -e

# Insert retry_cmd after _recover_dns
sed -i '/^}$/a \
\
retry_cmd() {\
    local retries=5\
    local wait=10\
    for i in $(seq 1 $retries); do\
        if "$@"; then\
            return 0\
        fi\
        echo -e "\\e[33mCommand failed: $1. Retrying in ${wait}s... ($i/$retries)\\e[0m"\
        _recover_dns\
        sleep $wait\
    done\
    echo -e "\\e[31mCommand failed after $retries attempts: $*\\e[0m"\
    return 1\
}' scripts/aws-up.sh

