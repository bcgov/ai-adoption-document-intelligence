#!/usr/bin/env bash
#
# oc-restore-db.sh — Restore a PostgreSQL database from a local SQL dump file.
#
# Reads a local SQL dump file (created by oc-backup-db.sh) and applies it to the
# target instance's PostgreSQL database by execing into the Crunchy PostgreSQL pod
# and running psql.
#
# Supports cross-instance restore (backup from instance A, restore into instance B)
# and destroy-and-rebuild workflows.
#
# Only the PostgreSQL database is restored — blob storage (Azure) is not included.
#
# Usage:
#   ./scripts/oc-restore-db.sh --instance feature-other-work --from ./backups/feature-my-thing-2026-03-13.sql
#
# Prerequisites:
#   - .oc-deploy-token exists (created by oc-setup-sa.sh)
#   - oc CLI installed
#   - pods/exec permission granted to the service account (via US-001)
#   - Target instance must be deployed with a running PostgreSQL pod
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source library functions
source "${SCRIPT_DIR}/lib/instance-name.sh"

TOKEN_FILE="${PROJECT_ROOT}/.oc-deploy-token"

# ---------- helpers ----------

usage() {
  cat <<EOF
Usage: $(basename "$0") --instance <name> --from <backup-file>

Restores a PostgreSQL database from a local SQL dump file into the specified instance.

The SQL dump is applied by execing into the Crunchy PostgreSQL pod and running psql.
Only the PostgreSQL database is restored — Azure Blob Storage content is not included.

Options:
  --instance, -i  Target instance name to restore into (required)
  --from, -f      Path to the local SQL dump file to restore from (required)
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

INSTANCE_NAME=""
BACKUP_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance|-i)
      if [[ -z "${2:-}" ]]; then
        log_error "--instance requires a value"
        exit 1
      fi
      INSTANCE_NAME="$2"
      shift 2
      ;;
    --from|-f)
      if [[ -z "${2:-}" ]]; then
        log_error "--from requires a value"
        exit 1
      fi
      BACKUP_FILE="$2"
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

# ---------- validate required arguments ----------

if [[ -z "${INSTANCE_NAME}" ]]; then
  log_error "Missing required argument: --instance <name>"
  usage
  exit 1
fi

if [[ -z "${BACKUP_FILE}" ]]; then
  log_error "Missing required argument: --from <backup-file>"
  usage
  exit 1
fi

# ============================================================
# Step 1: Validate backup file exists
# ============================================================
log_step "Step 1: Validating backup file"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  log_error "Backup file not found: ${BACKUP_FILE}"
  log_error "Please verify the file path and try again."
  exit 1
fi

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
log_info "Backup file: ${BACKUP_FILE}"
log_info "File size: ${BACKUP_SIZE}"

# ============================================================
# Step 2: Token validation
# ============================================================
log_step "Step 2: Validating deployment token"

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

oc project "${NAMESPACE}" &>/dev/null || {
  log_error "Failed to switch to namespace '${NAMESPACE}'."
  exit 1
}

log_info "Authenticated and switched to namespace: ${NAMESPACE}"

# ============================================================
# Step 3: Find the PostgreSQL pod
# ============================================================
log_step "Step 3: Finding PostgreSQL pod for instance '${INSTANCE_NAME}'"

# Crunchy PostgreSQL pods are labeled with the instance name and the postgres-operator role.
# The primary pod has role=master or the naming convention <instance>-postgres-<suffix>.
PG_POD=$(oc get pods -n "${NAMESPACE}" \
  -l "postgres-operator.crunchydata.com/instance,app.kubernetes.io/instance=${INSTANCE_NAME}" \
  -l "postgres-operator.crunchydata.com/role=master" \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null) || true

if [[ -z "${PG_POD}" ]]; then
  # Fallback: try without the role=master label (single-instance clusters may not have it)
  PG_POD=$(oc get pods -n "${NAMESPACE}" \
    -l "postgres-operator.crunchydata.com/instance,app.kubernetes.io/instance=${INSTANCE_NAME}" \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null) || true
fi

if [[ -z "${PG_POD}" ]]; then
  log_error "No PostgreSQL pod found for instance '${INSTANCE_NAME}' in namespace '${NAMESPACE}'."
  log_error "Ensure the instance is deployed and the database pod is running."
  exit 1
fi

log_info "Found PostgreSQL pod: ${PG_POD}"

# ============================================================
# Step 4: Determine database credentials
# ============================================================
log_step "Step 4: Reading database credentials"

# Crunchy PostgreSQL operator stores credentials in a secret named <instance>-pguser-<instance>
# The database name and user can be read from the secret.
PG_SECRET_NAME="${INSTANCE_NAME}-pguser-${INSTANCE_NAME}"

DB_NAME=$(oc get secret "${PG_SECRET_NAME}" -n "${NAMESPACE}" \
  -o jsonpath='{.data.dbname}' 2>/dev/null | base64 -d) || true

DB_USER=$(oc get secret "${PG_SECRET_NAME}" -n "${NAMESPACE}" \
  -o jsonpath='{.data.user}' 2>/dev/null | base64 -d) || true

if [[ -z "${DB_NAME}" || -z "${DB_USER}" ]]; then
  # Fallback: use the postgres superuser and default database name
  log_info "Could not read credentials from secret '${PG_SECRET_NAME}'. Falling back to defaults."
  DB_NAME="${INSTANCE_NAME}"
  DB_USER="postgres"
fi

log_info "Database name: ${DB_NAME}"
log_info "Database user: ${DB_USER}"

# ============================================================
# Step 5: Restore the SQL dump via pod exec
# ============================================================
log_step "Step 5: Restoring database from backup"

log_info "Restoring backup file '${BACKUP_FILE}' into database '${DB_NAME}' on pod '${PG_POD}'..."
log_info "This may take a while depending on the backup size."

# Pipe the local SQL dump into psql running inside the pod.
# The backup was created with pg_dump --clean --if-exists, so it includes DROP/CREATE
# statements that will replace existing data.
oc exec -i "${PG_POD}" -n "${NAMESPACE}" -c database -- \
  psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 < "${BACKUP_FILE}" || {
  log_error "Database restore failed."
  log_error "Check that the backup file is a valid SQL dump and the target database is accessible."
  exit 1
}

log_info "Database restore completed successfully."

# ============================================================
# Done
# ============================================================
log_step "Restore Complete"

cat <<EOF

Database for instance "${INSTANCE_NAME}" has been restored from:

  ${BACKUP_FILE}

Database: ${DB_NAME}
Pod: ${PG_POD}
Namespace: ${NAMESPACE}

Note: Only the PostgreSQL database was restored.
      Azure Blob Storage content is not included — it persists independently.

EOF
