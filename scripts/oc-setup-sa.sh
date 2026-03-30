#!/usr/bin/env bash
#
# oc-setup-sa.sh — Create an OpenShift service account with scoped permissions
# and store its token locally for use by deployment scripts.
#
# Usage:
#   ./scripts/oc-setup-sa.sh --namespace <namespace>
#
# Prerequisites:
#   - oc CLI installed
#   - Developer logged into OpenShift via `oc login`
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SA_NAME="deploy-sa"
TOKEN_DIR="${PROJECT_ROOT}/.oc-deploy"
TOKEN_FILE="${TOKEN_DIR}/token"
ROLE_NAME="deploy-sa-role"
ROLE_BINDING_NAME="deploy-sa-rolebinding"

# ---------- helpers ----------

usage() {
  cat <<EOF
Usage: $(basename "$0") --namespace <namespace>

Creates an OpenShift service account with scoped deployment permissions
and saves its token to .oc-deploy-token in the project root.

Options:
  --namespace, -n   Target OpenShift namespace (required)
  --help, -h        Show this help message
EOF
}

log_info() {
  echo "[INFO] $*"
}

log_error() {
  echo "[ERROR] $*" >&2
}

# ---------- argument parsing ----------

NAMESPACE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace|-n)
      if [[ -z "${2:-}" ]]; then
        log_error "--namespace requires a value"
        exit 1
      fi
      NAMESPACE="$2"
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

if [[ -z "${NAMESPACE}" ]]; then
  log_error "--namespace is required"
  usage
  exit 1
fi

# ---------- pre-flight: verify oc login ----------

if ! oc whoami &>/dev/null; then
  log_error "You are not logged into OpenShift."
  log_error "Please run 'oc login' first, then re-run this script."
  exit 1
fi

log_info "Logged in as: $(oc whoami)"
log_info "Target namespace: ${NAMESPACE}"

# Verify the namespace exists and is accessible
if ! oc get namespace "${NAMESPACE}" &>/dev/null; then
  log_error "Namespace '${NAMESPACE}' does not exist or you do not have access to it."
  exit 1
fi

# ---------- create service account (idempotent) ----------

if oc get serviceaccount "${SA_NAME}" -n "${NAMESPACE}" &>/dev/null; then
  log_info "Service account '${SA_NAME}' already exists in namespace '${NAMESPACE}' — reusing."
else
  log_info "Creating service account '${SA_NAME}' in namespace '${NAMESPACE}'..."
  oc create serviceaccount "${SA_NAME}" -n "${NAMESPACE}"
fi

# ---------- create role with scoped permissions (idempotent via apply) ----------

log_info "Applying role '${ROLE_NAME}' with scoped permissions..."

oc apply -f - -n "${NAMESPACE}" <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${ROLE_NAME}
  namespace: ${NAMESPACE}
rules:
  # Core resources
  - apiGroups: [""]
    resources: ["services", "configmaps", "secrets", "persistentvolumeclaims", "pods", "events"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: [""]
    resources: ["pods/exec", "pods/portforward"]
    verbs: ["create"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get"]
  # Apps (deployments, replicasets, statefulsets, daemonsets)
  - apiGroups: ["apps"]
    resources: ["deployments", "deployments/scale", "replicasets", "replicasets/scale", "statefulsets"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  # Batch (jobs, cronjobs)
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  # OpenShift routes
  - apiGroups: ["route.openshift.io"]
    resources: ["routes"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["route.openshift.io"]
    resources: ["routes/custom-host"]
    verbs: ["create"]
  # Crunchy PostgreSQL operator
  - apiGroups: ["postgres-operator.crunchydata.com"]
    resources: ["postgresclusters"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  # Network policies
  - apiGroups: ["networking.k8s.io"]
    resources: ["networkpolicies"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  # Autoscaling
  - apiGroups: ["autoscaling"]
    resources: ["horizontalpodautoscalers"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
EOF

# ---------- create role binding (idempotent via apply) ----------

log_info "Applying role binding '${ROLE_BINDING_NAME}'..."

oc apply -f - -n "${NAMESPACE}" <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${ROLE_BINDING_NAME}
  namespace: ${NAMESPACE}
subjects:
  - kind: ServiceAccount
    name: ${SA_NAME}
    namespace: ${NAMESPACE}
roleRef:
  kind: Role
  name: ${ROLE_NAME}
  apiGroup: rbac.authorization.k8s.io
EOF

# ---------- generate token ----------

log_info "Generating service account token..."

TOKEN=$(oc create token "${SA_NAME}" -n "${NAMESPACE}" --duration=87600h)

if [[ -z "${TOKEN}" ]]; then
  log_error "Failed to generate token for service account '${SA_NAME}'."
  exit 1
fi

# ---------- save token to file ----------

mkdir -p "${TOKEN_DIR}"
cat > "${TOKEN_FILE}" <<TOKENEOF
# OpenShift deploy service account token
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Namespace: ${NAMESPACE}
# Service Account: ${SA_NAME}
# Server: $(oc whoami --show-server)
NAMESPACE=${NAMESPACE}
SERVER=$(oc whoami --show-server)
TOKEN=${TOKEN}
TOKENEOF

chmod 700 "${TOKEN_DIR}"
chmod 600 "${TOKEN_FILE}"

log_info "Token saved to ${TOKEN_FILE}"
log_info "Service account setup complete. All deployment scripts will use this token."
