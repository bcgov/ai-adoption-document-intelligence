#!/usr/bin/env bash
# One-time script to create the Azure Storage Account for Terraform state backend.
# Usage: ./init-backend.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

# Defaults - override with environment variables
BACKEND_RESOURCE_GROUP="${BACKEND_RESOURCE_GROUP:-doc-intel-tfstate-rg}"
BACKEND_STORAGE_ACCOUNT="${BACKEND_STORAGE_ACCOUNT:-docintelstate}"
BACKEND_CONTAINER_NAME="${BACKEND_CONTAINER_NAME:-tfstate}"
BACKEND_LOCATION="${BACKEND_LOCATION:-canadacentral}"

echo "=== Terraform State Backend Setup ==="
echo "Resource Group:  $BACKEND_RESOURCE_GROUP"
echo "Storage Account: $BACKEND_STORAGE_ACCOUNT"
echo "Container:       $BACKEND_CONTAINER_NAME"
echo "Location:        $BACKEND_LOCATION"
echo ""

# Check Azure CLI login
if ! az account show &>/dev/null; then
    echo "ERROR: Not logged into Azure CLI. Run 'az login' first."
    exit 1
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
echo "Subscription: $SUBSCRIPTION_ID"
echo ""

# Create resource group
echo "Creating resource group..."
az group create \
    --name "$BACKEND_RESOURCE_GROUP" \
    --location "$BACKEND_LOCATION" \
    --output none

# Create storage account
echo "Creating storage account..."
az storage account create \
    --name "$BACKEND_STORAGE_ACCOUNT" \
    --resource-group "$BACKEND_RESOURCE_GROUP" \
    --location "$BACKEND_LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --min-tls-version TLS1_2 \
    --allow-blob-public-access false \
    --output none

# Create container
echo "Creating blob container..."
az storage container create \
    --name "$BACKEND_CONTAINER_NAME" \
    --account-name "$BACKEND_STORAGE_ACCOUNT" \
    --auth-mode login \
    --output none

echo ""
echo "=== Backend Ready ==="
echo ""
echo "Add these to your deploy.sh or export as environment variables:"
echo ""
echo "  export BACKEND_RESOURCE_GROUP=\"$BACKEND_RESOURCE_GROUP\""
echo "  export BACKEND_STORAGE_ACCOUNT=\"$BACKEND_STORAGE_ACCOUNT\""
echo "  export BACKEND_CONTAINER_NAME=\"$BACKEND_CONTAINER_NAME\""
echo "  export TF_VAR_subscription_id=\"$SUBSCRIPTION_ID\""
echo ""
