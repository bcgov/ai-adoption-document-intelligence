#!/usr/bin/env bash
#
# oc-backup-db-to-unc.sh — Stream a pg_dump backup directly to a Windows UNC share.
#
# Designed for WSL: pipes `pg_dump -Fc` from the Crunchy PostgreSQL pod through
# powershell.exe so the dump file is written straight to a UNC path
# (e.g. \\widget\SDPRDocuments\<file>.pgc) without ever touching the local
# filesystem. Use this when the backup must not be persisted on the WSL host.
#
# Usage:
#   ./scripts/oc-backup-db-to-unc.sh --dest '\\widget\SDPRDocuments'
#   ./scripts/oc-backup-db-to-unc.sh --instance bcgov-di --dest '\\server\share'
#
# Prerequisites:
#   - WSL with Windows interop enabled (powershell.exe reachable)
#   - The UNC share is mounted/accessible from the Windows side
#   - .oc-deploy/token exists (created by oc-setup-sa.sh)
#   - oc CLI installed; pods/exec permission granted to the service account
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

source "${SCRIPT_DIR}/lib/instance-name.sh"

TOKEN_FILE="${PROJECT_ROOT}/.oc-deploy/token"
POWERSHELL="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"

# ---------- helpers ----------

usage() {
  cat <<EOF
Usage: $(basename "$0") --dest <unc-path> [--instance <name>]

Streams a pg_dump backup of an instance's PostgreSQL database directly to a
Windows UNC share. No local file is created on the WSL host.

Options:
  --dest, -d      UNC directory to write the backup into (e.g. '\\\\server\\share')
  --instance, -i  Instance name to back up (default: derived from git branch)
  --help, -h      Show this help message

Output filename: <instance>-<timestamp>.pgc (pg_dump custom format)

Restore with:
  ./scripts/oc-restore-db.sh --instance <target> --from <local-copy-of-file>
EOF
}

log_info()  { echo "[INFO] $*"; }
log_error() { echo "[ERROR] $*" >&2; }
log_step()  {
  echo ""
  echo "========================================"
  echo "  $*"
  echo "========================================"
}

# Escape a value for safe interpolation inside a PowerShell single-quoted
# string literal. PowerShell single-quoted strings are fully literal except
# for embedded single quotes, which must be doubled.
ps_single_quote_escape() {
  local s="$1"
  printf '%s' "${s//\'/\'\'}"
}

# ---------- argument parsing ----------

DEST_UNC=""
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
    --dest|-d)
      if [[ -z "${2:-}" ]]; then
        log_error "--dest requires a value"
        exit 1
      fi
      DEST_UNC="$2"
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

if [[ -z "${DEST_UNC}" ]]; then
  log_error "--dest is required (UNC path, e.g. '\\\\server\\share')"
  usage
  exit 1
fi

if [[ "${DEST_UNC}" != \\\\* ]]; then
  log_error "--dest must be a UNC path starting with \\\\ (got: ${DEST_UNC})"
  exit 1
fi

# ============================================================
# Step 1: WSL + PowerShell availability
# ============================================================
log_step "Step 1: Checking WSL / PowerShell interop"

if [[ ! -x "${POWERSHELL}" ]]; then
  log_error "powershell.exe not found at ${POWERSHELL}."
  log_error "This script requires WSL with Windows interop enabled."
  exit 1
fi

log_info "Using PowerShell at ${POWERSHELL}"

# ============================================================
# Step 2: Token validation + login
# ============================================================
log_step "Step 2: Validating deployment token"

if [[ ! -f "${TOKEN_FILE}" ]]; then
  log_error "Deployment token not found at ${TOKEN_FILE}"
  log_error "Run './scripts/oc-setup-sa.sh --namespace <namespace>' first."
  exit 1
fi

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
  log_error "Token file is incomplete. Re-run './scripts/oc-setup-sa.sh --namespace <namespace>'."
  exit 1
fi

log_info "Token loaded for namespace: ${NAMESPACE}"
log_info "Server: ${SERVER}"

oc login "${SERVER}" --token="${TOKEN}" --insecure-skip-tls-verify=true &>/dev/null || {
  log_error "Failed to authenticate with OpenShift. Token may have expired."
  log_error "Re-run './scripts/oc-setup-sa.sh --namespace ${NAMESPACE}' to regenerate."
  exit 1
}

oc get pods -n "${NAMESPACE}" --no-headers &>/dev/null || {
  log_error "Cannot access namespace '${NAMESPACE}'. Token may lack permissions."
  exit 1
}

log_info "Authenticated with access to namespace: ${NAMESPACE}"

# ============================================================
# Step 3: Resolve instance name
# ============================================================
log_step "Step 3: Resolving instance name"

INSTANCE_NAME=$(resolve_instance_name "${PASS_THROUGH_ARGS[@]+"${PASS_THROUGH_ARGS[@]}"}") || {
  log_error "Failed to resolve instance name."
  exit 1
}

log_info "Instance name: ${INSTANCE_NAME}"

# ============================================================
# Step 4: Find the PostgreSQL pod
# ============================================================
log_step "Step 4: Finding PostgreSQL pod"

PG_POD=$(oc get pods -n "${NAMESPACE}" \
  -l "postgres-operator.crunchydata.com/instance,app.kubernetes.io/instance=${INSTANCE_NAME}" \
  -l "postgres-operator.crunchydata.com/role=master" \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null) || true

if [[ -z "${PG_POD}" ]]; then
  PG_POD=$(oc get pods -n "${NAMESPACE}" \
    -l "postgres-operator.crunchydata.com/instance,app.kubernetes.io/instance=${INSTANCE_NAME}" \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null) || true
fi

if [[ -z "${PG_POD}" ]]; then
  log_error "No PostgreSQL pod found for instance '${INSTANCE_NAME}' in namespace '${NAMESPACE}'."
  exit 1
fi

log_info "Found PostgreSQL pod: ${PG_POD}"

# ============================================================
# Step 5: Read database credentials
# ============================================================
log_step "Step 5: Reading database credentials"

PG_SECRET_NAME="${INSTANCE_NAME}-app-pg-pguser-admin"

DB_NAME=$(oc get secret "${PG_SECRET_NAME}" -n "${NAMESPACE}" \
  -o jsonpath='{.data.dbname}' 2>/dev/null | base64 -d) || true

DB_USER="postgres"

if [[ -z "${DB_NAME}" ]]; then
  log_error "Could not read database name from secret '${PG_SECRET_NAME}'."
  exit 1
fi

log_info "Database name: ${DB_NAME}"
log_info "Database user: ${DB_USER}"

# ============================================================
# Step 6: Verify destination share is writable
# ============================================================
log_step "Step 6: Verifying destination share is writable"

DEST_ESC=$(ps_single_quote_escape "${DEST_UNC}")

PROBE_RESULT=$("${POWERSHELL}" -NoProfile -Command "
\$dest = '${DEST_ESC}'
if (-not (Test-Path \$dest)) { Write-Output 'NOT_FOUND'; exit 1 }
\$probe = Join-Path \$dest ('.write-probe-' + (Get-Date -Format yyyyMMddHHmmss) + '.tmp')
try {
  Set-Content -Path \$probe -Value 'ok' -NoNewline -ErrorAction Stop
  Remove-Item \$probe -Force
  Write-Output 'WRITABLE'
} catch {
  Write-Output ('WRITE_FAIL: ' + \$_.Exception.Message)
  exit 1
}
" 2>&1 | tr -d '\r')

if [[ "${PROBE_RESULT}" != "WRITABLE" ]]; then
  log_error "Destination not writable: ${DEST_UNC}"
  log_error "PowerShell result: ${PROBE_RESULT}"
  exit 1
fi

log_info "Destination is writable: ${DEST_UNC}"

# ============================================================
# Step 7: Stream pg_dump directly to the UNC share
# ============================================================
log_step "Step 7: Streaming pg_dump to UNC share"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILENAME="${INSTANCE_NAME}-${TIMESTAMP}.pgc"
DEST_FILE_ESC=$(ps_single_quote_escape "${DEST_UNC}")
FILENAME_ESC=$(ps_single_quote_escape "${BACKUP_FILENAME}")

log_info "Destination file: ${DEST_UNC}\\${BACKUP_FILENAME}"
log_info "Format: pg_dump -Fc --clean --if-exists"

# PowerShell side: read raw stdin bytes and write straight to the UNC file.
# Using [Console]::OpenStandardInput() (not the TextReader) avoids any
# CRLF translation, so the binary pg_dump custom-format stream is preserved.
PS_WRITE="
\$dir = '${DEST_FILE_ESC}'
\$name = '${FILENAME_ESC}'
\$dest = Join-Path \$dir \$name
try {
  \$in  = [Console]::OpenStandardInput()
  \$out = [System.IO.File]::Create(\$dest)
  \$in.CopyTo(\$out)
  \$out.Flush()
  \$out.Close()
  \$len = (Get-Item \$dest).Length
  Write-Output ('WROTE: ' + \$dest)
  Write-Output ('BYTES: ' + \$len)
} catch {
  Write-Output ('STREAM_FAIL: ' + \$_.Exception.Message)
  exit 1
}
"

set -o pipefail

if ! oc exec "${PG_POD}" -n "${NAMESPACE}" -c database -- \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" -Fc --clean --if-exists \
  | "${POWERSHELL}" -NoProfile -Command "${PS_WRITE}"; then
  log_error "Backup stream failed. The destination file may be partial — verify and delete if needed."
  exit 1
fi

# ============================================================
# Done
# ============================================================
log_step "Backup Complete"

cat <<EOF

Database backup for instance "${INSTANCE_NAME}" written to:

  ${DEST_UNC}\\${BACKUP_FILENAME}

Database: ${DB_NAME}
Timestamp: ${TIMESTAMP}

Note: Only the PostgreSQL database is included. Azure Blob Storage content is
      not included — it persists independently.

To restore this backup into an instance, the .pgc file must be reachable from
the WSL host (the restore script expects a local path):
  ./scripts/oc-restore-db.sh --instance <target> --from <local-path-to-pgc>

EOF
