#!/bin/bash
set -euo pipefail

OPENSHIFT_SERVER=$1
TOKEN=$2
PROJECTS=$3
ENVIRONMENT=$4

# Namespace pattern - can be overridden via NAMESPACE_PREFIX env var
NAMESPACE_PREFIX="${NAMESPACE_PREFIX:-f3c07a}"
NAMESPACE="${NAMESPACE_PREFIX}-${ENVIRONMENT}"

echo "Re-deploying $PROJECTS to $ENVIRONMENT in namespace $NAMESPACE"

# TLS verification - can be disabled via SKIP_TLS_VERIFY env var (default: true for backward compatibility)
SKIP_TLS_VERIFY="${SKIP_TLS_VERIFY:-true}"
TLS_FLAG=""
if [ "$SKIP_TLS_VERIFY" = "true" ]; then
    TLS_FLAG="--insecure-skip-tls-verify=true"
    echo "Warning: TLS verification is disabled. This is a security risk."
fi

# Log in to OpenShift
if ! oc login "$OPENSHIFT_SERVER" --token="$TOKEN" $TLS_FLAG; then
    echo "Error: Failed to login to OpenShift"
    exit 1
fi

# Validate projects input
if [ -z "$PROJECTS" ] || [ "$PROJECTS" = "[]" ]; then
    echo "Error: No projects specified"
    exit 1
fi

# Parse and restart deployments
for PROJECT in $(echo "$PROJECTS" | jq -r '.[]'); do
    if [ -z "$PROJECT" ] || [ "$PROJECT" = "null" ]; then
        echo "Warning: Skipping invalid project"
        continue
    fi
    
    echo "Restarting deployment/$PROJECT in namespace $NAMESPACE"
    if ! oc rollout restart "deployment/$PROJECT" -n "$NAMESPACE"; then
        echo "Error: Failed to restart deployment/$PROJECT"
        exit 1
    fi
done

echo "Successfully triggered redeployment for all projects"