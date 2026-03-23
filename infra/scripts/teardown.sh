#!/usr/bin/env bash
# Teardown Azure infrastructure for Document Intelligence.
# Usage: ./teardown.sh [--auto-approve]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

AUTO_APPROVE=""
if [[ "${1:-}" == "--auto-approve" ]] || [[ "${CI:-false}" == "true" ]]; then
    AUTO_APPROVE="-auto-approve"
fi

# Backend configuration
BACKEND_RESOURCE_GROUP="${BACKEND_RESOURCE_GROUP:-doc-intel-tfstate-rg}"
BACKEND_STORAGE_ACCOUNT="${BACKEND_STORAGE_ACCOUNT:-docintelstate}"
BACKEND_CONTAINER_NAME="${BACKEND_CONTAINER_NAME:-tfstate}"
BACKEND_KEY="${BACKEND_KEY:-doc-intel.tfstate}"

# Authentication
if [[ "${ARM_USE_OIDC:-false}" == "true" ]]; then
    export ARM_USE_OIDC=true
    export ARM_CLIENT_ID="${TF_VAR_client_id:-}"
    export ARM_TENANT_ID="${TF_VAR_tenant_id:-}"
    export ARM_SUBSCRIPTION_ID="${TF_VAR_subscription_id:-}"
else
    export ARM_USE_CLI=true
fi

echo "=== Teardown Document Intelligence Infrastructure ==="
echo ""
echo "WARNING: This will destroy ALL Azure resources managed by Terraform."
echo ""

cd "$INFRA_DIR"

# Initialize
terraform init \
    -backend-config="resource_group_name=${BACKEND_RESOURCE_GROUP}" \
    -backend-config="storage_account_name=${BACKEND_STORAGE_ACCOUNT}" \
    -backend-config="container_name=${BACKEND_CONTAINER_NAME}" \
    -backend-config="key=${BACKEND_KEY}" \
    -backend-config="subscription_id=${TF_VAR_subscription_id:-}" \
    -backend-config="tenant_id=${TF_VAR_tenant_id:-}" \
    -reconfigure

echo ""
echo "--- Terraform Destroy ---"
terraform destroy -var-file=terraform.tfvars $AUTO_APPROVE

echo ""
echo "--- Infrastructure Destroyed ---"
echo ""
echo "Note: Soft-deleted resources (Key Vault, Cognitive Services) will be"
echo "automatically purged by the provider's purge_soft_delete_on_destroy setting."
echo ""
echo "The Terraform state backend (RG: $BACKEND_RESOURCE_GROUP) is NOT destroyed."
echo "To remove it manually:"
echo "  az group delete --name $BACKEND_RESOURCE_GROUP --yes"
