#!/usr/bin/env bash
# Deploy Azure infrastructure for Document Intelligence.
# Usage: ./deploy.sh [plan|apply|output] [--auto-approve]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

COMMAND="${1:-plan}"
AUTO_APPROVE=""
if [[ "${2:-}" == "--auto-approve" ]] || [[ "${CI:-false}" == "true" ]]; then
    AUTO_APPROVE="-auto-approve"
fi

# Backend configuration (override with environment variables)
BACKEND_RESOURCE_GROUP="${BACKEND_RESOURCE_GROUP:-doc-intel-tfstate-rg}"
BACKEND_STORAGE_ACCOUNT="${BACKEND_STORAGE_ACCOUNT:-docintelstate}"
BACKEND_CONTAINER_NAME="${BACKEND_CONTAINER_NAME:-tfstate}"
BACKEND_KEY="${BACKEND_KEY:-doc-intel.tfstate}"

# Read subscription_id and tenant_id from terraform.tfvars if not set as env vars
cd "$INFRA_DIR"
if [[ -z "${TF_VAR_subscription_id:-}" ]] && [[ -f terraform.tfvars ]]; then
    TF_VAR_subscription_id=$(grep '^subscription_id' terraform.tfvars | sed 's/.*"\(.*\)".*/\1/' | head -1)
    export TF_VAR_subscription_id
fi
if [[ -z "${TF_VAR_tenant_id:-}" ]] && [[ -f terraform.tfvars ]]; then
    TF_VAR_tenant_id=$(grep '^tenant_id' terraform.tfvars | sed 's/.*"\(.*\)".*/\1/' | head -1)
    export TF_VAR_tenant_id
fi

# Authentication
if [[ "${ARM_USE_OIDC:-false}" == "true" ]]; then
    export ARM_USE_OIDC=true
    export ARM_CLIENT_ID="${TF_VAR_client_id:-}"
    export ARM_TENANT_ID="${TF_VAR_tenant_id:-}"
    export ARM_SUBSCRIPTION_ID="${TF_VAR_subscription_id:-}"
else
    export ARM_USE_CLI=true
fi

echo "=== Document Intelligence Infrastructure ==="
echo "Command:      $COMMAND"
echo "Subscription: ${TF_VAR_subscription_id:-<not set>}"
echo "Backend:      $BACKEND_STORAGE_ACCOUNT/$BACKEND_CONTAINER_NAME/$BACKEND_KEY"
echo ""

# Initialize
echo "--- Terraform Init ---"
terraform init \
    -backend-config="resource_group_name=${BACKEND_RESOURCE_GROUP}" \
    -backend-config="storage_account_name=${BACKEND_STORAGE_ACCOUNT}" \
    -backend-config="container_name=${BACKEND_CONTAINER_NAME}" \
    -backend-config="key=${BACKEND_KEY}" \
    -backend-config="subscription_id=${TF_VAR_subscription_id:-}" \
    -backend-config="tenant_id=${TF_VAR_tenant_id:-}" \
    -reconfigure

case "$COMMAND" in
    plan)
        echo ""
        echo "--- Terraform Plan ---"
        terraform plan -var-file=terraform.tfvars
        ;;
    apply)
        echo ""
        echo "--- Terraform Apply ---"
        terraform apply -var-file=terraform.tfvars $AUTO_APPROVE
        echo ""
        echo "--- Deployment Complete ---"
        echo ""
        echo "Environment configuration:"
        terraform output -raw env_config 2>/dev/null || true
        echo ""
        echo "To get sensitive values:"
        echo "  terraform output -raw apim_subscription_key"
        echo "  terraform output -raw storage_connection_string"
        ;;
    output)
        echo ""
        echo "--- Terraform Output ---"
        terraform output
        ;;
    *)
        echo "ERROR: Unknown command '$COMMAND'. Use: plan, apply, or output"
        exit 1
        ;;
esac
