#!/bin/bash
# Script to register search attributes in Temporal namespace
# Run this after setting up Temporal server to enable search attributes for workflows

set -e

TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS:-temporal:7233}"
NAMESPACE="${TEMPORAL_NAMESPACE:-default}"

echo "Registering search attributes in namespace '${NAMESPACE}' at ${TEMPORAL_ADDRESS}..."

# Check if running in Docker or locally
if command -v docker &> /dev/null && docker ps | grep -q temporal; then
    # Running in Docker - use docker exec
    echo "Using Docker container..."
    docker exec temporal temporal operator search-attribute create \
        --address "${TEMPORAL_ADDRESS}" \
        --namespace "${NAMESPACE}" \
        --name DocumentId \
        --type Keyword
    
    docker exec temporal temporal operator search-attribute create \
        --address "${TEMPORAL_ADDRESS}" \
        --namespace "${NAMESPACE}" \
        --name FileName \
        --type Keyword
    
    docker exec temporal temporal operator search-attribute create \
        --address "${TEMPORAL_ADDRESS}" \
        --namespace "${NAMESPACE}" \
        --name FileType \
        --type Keyword
    
    docker exec temporal temporal operator search-attribute create \
        --address "${TEMPORAL_ADDRESS}" \
        --namespace "${NAMESPACE}" \
        --name Status \
        --type Keyword
    
    echo ""
    echo "✅ Search attributes registered successfully!"
    echo ""
    echo "Listing all search attributes:"
    docker exec temporal temporal operator search-attribute list \
        --address "${TEMPORAL_ADDRESS}" \
        --namespace "${NAMESPACE}"
else
    # Running locally - use temporal CLI directly
    echo "Using local Temporal CLI..."
    temporal operator search-attribute create \
        --address "${TEMPORAL_ADDRESS}" \
        --namespace "${NAMESPACE}" \
        --name DocumentId \
        --type Keyword
    
    temporal operator search-attribute create \
        --address "${TEMPORAL_ADDRESS}" \
        --namespace "${NAMESPACE}" \
        --name FileName \
        --type Keyword
    
    temporal operator search-attribute create \
        --address "${TEMPORAL_ADDRESS}" \
        --namespace "${NAMESPACE}" \
        --name FileType \
        --type Keyword
    
    temporal operator search-attribute create \
        --address "${TEMPORAL_ADDRESS}" \
        --namespace "${NAMESPACE}" \
        --name Status \
        --type Keyword
    
    echo ""
    echo "✅ Search attributes registered successfully!"
    echo ""
    echo "Listing all search attributes:"
    temporal operator search-attribute list \
        --address "${TEMPORAL_ADDRESS}" \
        --namespace "${NAMESPACE}"
fi
