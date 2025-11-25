#!/bin/bash
set -euo pipefail

ENVIRONMENT=$1
OPENSHIFT_SERVER=$2
TOKEN=$3

# Namespace pattern - can be overridden via NAMESPACE_PREFIX env var
NAMESPACE_PREFIX="${NAMESPACE_PREFIX:-f3c07a}"
NAMESPACE="${NAMESPACE_PREFIX}-${ENVIRONMENT}"

echo "Deploying migrations to $ENVIRONMENT in namespace $NAMESPACE"

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

# Switch to project
if ! oc project "$NAMESPACE"; then
    echo "Error: Failed to switch to namespace $NAMESPACE"
    exit 1
fi

# Get pod name for sidecar
POD_NAME=$(oc get pod -l name=sidecar -o jsonpath="{.items[0].metadata.name}" || echo "")

if [ -z "$POD_NAME" ]; then
    echo "Error: No sidecar pod found with label 'name=sidecar'"
    exit 1
fi

echo "Using pod: $POD_NAME"

# Clean up previous Prisma files
if ! oc exec "$POD_NAME" -- rm -rf /tmp/prisma; then
    echo "Warning: Failed to remove old Prisma files (may not exist)"
fi

# Copy Prisma schema and migrations
if ! oc cp ./apps/backend/prisma "$POD_NAME:/tmp/prisma"; then
    echo "Error: Failed to copy Prisma files to pod"
    exit 1
fi

# Run migrations
echo "Running Prisma migrations..."
if ! oc exec "$POD_NAME" -- npx prisma migrate deploy --schema=/tmp/prisma/schema.prisma; then
    echo "Error: Migration failed"
    exit 1
fi

echo "Migrations completed successfully"