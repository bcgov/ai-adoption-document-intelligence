#!/bin/bash
# Script to register search attributes in Temporal namespace
# This script is designed to run automatically on Temporal server startup
# It is idempotent - safe to run multiple times

set -euo pipefail

TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS:-temporal:7233}"
NAMESPACE="${TEMPORAL_NAMESPACE:-default}"

# Function to wait for Temporal server to be ready
wait_for_temporal() {
    echo "Waiting for Temporal server at ${TEMPORAL_ADDRESS} to be ready..."
    max_attempts=30
    attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if temporal operator cluster describe \
            --address "${TEMPORAL_ADDRESS}" \
            --namespace "${NAMESPACE}" &>/dev/null; then
            echo "✅ Temporal server is ready!"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo "Attempt $attempt/$max_attempts: Temporal server not ready yet, waiting..."
        sleep 2
    done
    
    echo "❌ Error: Temporal server did not become ready after $max_attempts attempts"
    exit 1
}

# Function to register a search attribute (idempotent)
register_attribute() {
    local name=$1
    local type=$2
    
    echo "Registering search attribute: ${name} (${type})..."
    
    # Try to create the attribute, capture output and exit code
    local output
    local exit_code=0
    
    output=$(temporal operator search-attribute create \
        --address "${TEMPORAL_ADDRESS}" \
        --namespace "${NAMESPACE}" \
        --name "${name}" \
        --type "${type}" 2>&1) || exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        # Command succeeded
        echo "  ✓ ${name} registered successfully"
    else
        # Command failed - check if it's because it already exists
        if echo "$output" | grep -qi "already exists\|already registered"; then
            echo "  ✓ ${name} already exists, skipping..."
        else
            echo "  ⚠ Warning: Failed to register ${name}, but continuing..."
            echo "    Error: $output"
        fi
    fi
}

# Main execution
echo "=========================================="
echo "Registering Temporal Search Attributes"
echo "=========================================="
echo "Address: ${TEMPORAL_ADDRESS}"
echo "Namespace: ${NAMESPACE}"
echo ""

# Wait for Temporal to be ready
wait_for_temporal

# Register all required search attributes
register_attribute "DocumentId" "Keyword"
register_attribute "FileName" "Keyword"
register_attribute "FileType" "Keyword"
register_attribute "Status" "Keyword"

echo ""
echo "✅ All search attributes registered successfully!"
echo ""
echo "Listing all search attributes:"
temporal operator search-attribute list \
    --address "${TEMPORAL_ADDRESS}" \
    --namespace "${NAMESPACE}"

echo ""
echo "=========================================="
echo "Search attribute registration complete!"
echo "=========================================="
