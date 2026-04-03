#!/usr/bin/env bash
#
# oc-backup-db.sh — Create a pg_dump backup of an instance's PostgreSQL database.
#
# Execs into the Crunchy PostgreSQL pod and runs pg_dump to create a SQL dump,
# then downloads it to the local filesystem at ./backups/<instance>-<timestamp>.sql.
#
# Only the PostgreSQL database is backed up — blob storage (Azure) is not included.
#
# Usage:
#   ./scripts/oc-backup-db.sh
#   ./scripts/oc-backup-db.sh --instance feature-my-thing
#
# Prerequisites:
#   - .oc-deploy-token exists (created by oc-setup-sa.sh)
#   - oc CLI installed
#   - pods/exec permission granted to the service account (via US-001)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source library functions
source "${SCRIPT_DIR}/lib/instance-name.sh"

TOKEN_FILE="${PROJECT_ROOT}/.oc-deploy/token"
BACKUPS_DIR="${PROJECT_ROOT}/backups"

# ---------- helpers ----------

usage() {
  cat <<EOF
Usage: $(basename "$0") [--instance <name>]

Creates a pg_dump backup of an instance's PostgreSQL database.

The backup is saved to ./backups/<instance>-<timestamp>.sql on the local filesystem.
Only the PostgreSQL database is backed up — Azure Blob Storage content is not included.

Options:
  --instance, -i  Instance name to back up (default: derived from git branch)
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

log_info "Instance name: ${INSTANCE_NAME}"

# ============================================================
# Step 3: Find the PostgreSQL pod
# ============================================================
log_step "Step 3: Finding PostgreSQL pod"

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

# Crunchy PostgreSQL operator stores credentials in a secret named <instance>-app-pg-pguser-admin.
# The database name is read from the secret. For the user, we always use "postgres" because
# pg_dump runs via local socket inside the pod, and Crunchy pg_hba.conf only allows the
# postgres superuser for local (non-TCP) connections.
PG_SECRET_NAME="${INSTANCE_NAME}-app-pg-pguser-admin"

DB_NAME=$(oc get secret "${PG_SECRET_NAME}" -n "${NAMESPACE}" \
  -o jsonpath='{.data.dbname}' 2>/dev/null | base64 -d) || true

DB_USER="postgres"

if [[ -z "${DB_NAME}" ]]; then
  log_error "Could not read database name from secret '${PG_SECRET_NAME}'."
  log_error "Ensure the instance is deployed and the Crunchy PostgreSQL cluster is running."
  exit 1
fi

log_info "Database name: ${DB_NAME}"
log_info "Database user: ${DB_USER}"

# ============================================================
# Step 5: Create local backups directory
# ============================================================
log_step "Step 5: Preparing local backups directory"

mkdir -p "${BACKUPS_DIR}"
log_info "Backups directory: ${BACKUPS_DIR}"

# ============================================================
# Step 6: Run pg_dump via pod exec
# ============================================================
log_step "Step 6: Running pg_dump"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILENAME="${INSTANCE_NAME}-${TIMESTAMP}.sql"
BACKUP_PATH="${BACKUPS_DIR}/${BACKUP_FILENAME}"

log_info "Executing pg_dump on pod '${PG_POD}' for database '${DB_NAME}'..."
log_info "Output file: ${BACKUP_PATH}"

# Run pg_dump inside the pod and stream the output to a local file.
# The Crunchy PostgreSQL container has pg_dump available and the database
# container uses the 'database' container name.
oc exec "${PG_POD}" -n "${NAMESPACE}" -c database -- \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists > "${BACKUP_PATH}" || {
  log_error "pg_dump failed."
  # Clean up partial dump file
  rm -f "${BACKUP_PATH}"
  exit 1
}

# Verify the backup file is not empty
if [[ ! -s "${BACKUP_PATH}" ]]; then
  log_error "Backup file is empty. The database may be empty or pg_dump failed silently."
  rm -f "${BACKUP_PATH}"
  exit 1
fi

BACKUP_SIZE=$(du -h "${BACKUP_PATH}" | cut -f1)
log_info "Backup completed successfully."

# ============================================================
# Done
# ============================================================
log_step "Backup Complete"

cat <<EOF

Database backup for instance "${INSTANCE_NAME}" saved to:

  ${BACKUP_PATH}

File size: ${BACKUP_SIZE}
Database: ${DB_NAME}
Timestamp: ${TIMESTAMP}

Note: Only the PostgreSQL database is included in this backup.
      Azure Blob Storage content is not included — it persists independently.

To restore this backup into an instance:
  ./scripts/oc-restore-db.sh --instance <target-instance> --from ${BACKUP_PATH}

EOF
