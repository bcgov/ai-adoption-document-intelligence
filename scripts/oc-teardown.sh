#!/usr/bin/env bash
#
# oc-teardown.sh — Completely destroy all resources for a named instance in OpenShift.
#
# Deletes all Kubernetes resources matching the instance label
# app.kubernetes.io/instance=<name>, including deployments, services, routes,
# secrets, configmaps, PVCs, and Crunchy PostgreSQL clusters.
#
# Usage:
#   ./scripts/oc-teardown.sh
#   ./scripts/oc-teardown.sh --instance feature-other-work
#
# Prerequisites:
#   - .oc-deploy-token exists (created by oc-setup-sa.sh)
#   - oc CLI installed
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source library functions
source "${SCRIPT_DIR}/lib/instance-name.sh"

TOKEN_FILE="${PROJECT_ROOT}/.oc-deploy/token"
SA_NAME="deploy-sa"
ROLE_NAME="deploy-sa-role"
ROLE_BINDING_NAME="deploy-sa-rolebinding"

# ---------- helpers ----------

usage() {
  cat <<EOF
Usage: $(basename "$0") [--instance <name>]

Tears down all resources for an instance in OpenShift.
Instance name defaults to the current git branch if --instance is not specified.

Options:
  --instance, -i  Instance name to tear down (default: derived from git branch)
  --help, -h      Show this help message
EOF
}

log_info() {
  echo "[INFO] $*"
}

log_error() {
  echo "[ERROR] $*" >&2
}

log_step() {
  echo ""
  echo "========================================"
  echo "  $*"
  echo "========================================"
}

# ---------- argument parsing ----------

PASS_THROUGH_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance|-i)
      if [[ -z "${2:-}" ]]; then
        log_error "--instance requires a value"
        exit 1
      fi
      PASS_THROUGH_ARGS+=(--instance "$2")
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

# ============================================================
# Step 1: Token validation
# ============================================================
log_step "Step 1: Validating deployment token"

if [[ ! -f "${TOKEN_FILE}" ]]; then
  log_error "Deployment token not found at ${TOKEN_FILE}"
  log_error "Please run './scripts/oc-setup-sa.sh --namespace <namespace>' first to create a service account and token."
  exit 1
fi

# Read token file values
NAMESPACE=""
SERVER=""
TOKEN=""

while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line}" ]] && continue
  [[ "${line}" =~ ^[[:space:]]*# ]] && continue
  case "${line}" in
    NAMESPACE=*) NAMESPACE="${line#NAMESPACE=}" ;;
    SERVER=*)    SERVER="${line#SERVER=}" ;;
    TOKEN=*)     TOKEN="${line#TOKEN=}" ;;
  esac
done < "${TOKEN_FILE}"

if [[ -z "${NAMESPACE}" || -z "${SERVER}" || -z "${TOKEN}" ]]; then
  log_error "Token file is incomplete. Expected NAMESPACE, SERVER, and TOKEN values."
  log_error "Please re-run './scripts/oc-setup-sa.sh --namespace <namespace>' to regenerate."
  exit 1
fi

log_info "Token loaded for namespace: ${NAMESPACE}"
log_info "Server: ${SERVER}"

# Log in to OpenShift using the service account token
oc login "${SERVER}" --token="${TOKEN}" --insecure-skip-tls-verify=true &>/dev/null || {
  log_error "Failed to authenticate with OpenShift. Token may have expired."
  log_error "Please re-run './scripts/oc-setup-sa.sh --namespace ${NAMESPACE}' to regenerate."
  exit 1
}

oc get pods -n "${NAMESPACE}" --no-headers &>/dev/null || {
  log_error "Cannot access namespace '${NAMESPACE}'. Token may lack permissions."
  exit 1
}

log_info "Authenticated with access to namespace: ${NAMESPACE}"

# ============================================================
# Step 2: Determine instance name
# ============================================================
log_step "Step 2: Resolving instance name"

INSTANCE_NAME=$(resolve_instance_name "${PASS_THROUGH_ARGS[@]+"${PASS_THROUGH_ARGS[@]}"}") || {
  log_error "Failed to resolve instance name."
  exit 1
}

LABEL_SELECTOR=$(get_instance_selector "${INSTANCE_NAME}")

log_info "Instance name: ${INSTANCE_NAME}"
log_info "Label selector: ${LABEL_SELECTOR}"

# ============================================================
# Step 3: Delete all resources by label selector
# ============================================================
log_step "Step 3: Deleting instance resources"

# Resource types to delete — order matters: dependents before parents
RESOURCE_TYPES=(
  "deployments.apps"
  "services"
  "routes.route.openshift.io"
  "networkpolicies.networking.k8s.io"
  "configmaps"
  "secrets"
  "persistentvolumeclaims"
  "postgresclusters.postgres-operator.crunchydata.com"
)

for resource_type in "${RESOURCE_TYPES[@]}"; do
  log_info "Deleting ${resource_type} with selector ${LABEL_SELECTOR}..."
  oc delete "${resource_type}" -l "${LABEL_SELECTOR}" -n "${NAMESPACE}" --ignore-not-found=true || {
    log_error "Failed to delete ${resource_type}. Continuing with remaining resources."
  }
done

log_info "All instance resources deleted."

# ============================================================
# Step 4: Verify deletion
# ============================================================
log_step "Step 4: Verifying deletion"

REMAINING=$(oc get all -l "${LABEL_SELECTOR}" -n "${NAMESPACE}" --no-headers 2>/dev/null | wc -l || echo "0")
REMAINING=$(echo "${REMAINING}" | tr -d '[:space:]')
REMAINING="${REMAINING:-0}"

if [[ "${REMAINING}" -gt 0 ]]; then
  log_info "Some resources are still terminating. This is expected for resources with finalizers."
  log_info "Remaining resources:"
  oc get all -l "${LABEL_SELECTOR}" -n "${NAMESPACE}" 2>/dev/null || true
else
  log_info "No resources found with selector ${LABEL_SELECTOR} — deletion complete."
fi

# ============================================================
# Step 5: Check if this was the last instance (cleanup SA)
# ============================================================
log_step "Step 5: Checking for remaining instances"

# Count distinct instance labels across all resources
# Look for the app.kubernetes.io/instance label on any remaining deployments
INSTANCE_LABELS=$(oc get deployments -n "${NAMESPACE}" \
  -l "app.kubernetes.io/instance" \
  -o jsonpath='{range .items[*]}{.metadata.labels.app\.kubernetes\.io/instance}{"\n"}{end}' 2>/dev/null || true)
REMAINING_INSTANCES=0
if [[ -n "${INSTANCE_LABELS}" ]]; then
  REMAINING_INSTANCES=$(echo "${INSTANCE_LABELS}" | sort -u | grep -vc '^$' || true)
  REMAINING_INSTANCES="${REMAINING_INSTANCES:-0}"
fi

if [[ "${REMAINING_INSTANCES}" -eq 0 ]]; then
  log_info "No other instances found in namespace '${NAMESPACE}'."
  log_info "Service account and token are preserved for future deployments."
  log_info "To remove them manually, log in as a namespace admin and delete:"
  log_info "  oc delete rolebinding ${ROLE_BINDING_NAME} -n ${NAMESPACE}"
  log_info "  oc delete role ${ROLE_NAME} -n ${NAMESPACE}"
  log_info "  oc delete serviceaccount ${SA_NAME} -n ${NAMESPACE}"
  log_info "  rm -rf $(dirname "${TOKEN_FILE}")"
else
  log_info "${REMAINING_INSTANCES} other instance(s) still deployed — keeping service account."
fi

# ============================================================
# Done
# ============================================================
log_step "Teardown Complete"

cat <<EOF

Instance "${INSTANCE_NAME}" has been torn down from namespace "${NAMESPACE}".

All resources with label ${LABEL_SELECTOR} have been deleted.

EOF
