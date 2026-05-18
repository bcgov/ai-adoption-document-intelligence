#!/usr/bin/env bash
#
# oc-export-benchmark-ocr-cache.sh — Stream OCR cache rows for a benchmark run
# directly to a Windows UNC share, one file per sample. Designed for WSL.
#
# The query runs inside the database pod, the JSONB payload is base64-encoded
# and emitted on stdout one row per line as
#   {"sid":"<sampleId>","b64":"<base64 of jsonb-as-text>"}
# A single PowerShell process on the WSL host reads stdin and writes
# `<sanitized-sid>.json` into the destination subfolder. No payload bytes ever
# land on the WSL filesystem; only the pipe buffer between oc exec and
# powershell.exe carries them.
#
# Usage:
#   ./scripts/oc-export-benchmark-ocr-cache.sh \
#     --run-id dfaddb26-cf91-4afa-aef8-c1ddeec42cc1 \
#     --dest '\\widget\SDPRDocuments\convert_sd0081\100-doc\2026-05-05 performance report\ocr-cache'
#
# Pre-flight:
#   - .oc-deploy/token present and valid for the target namespace
#   - powershell.exe reachable from WSL (Windows interop)
#   - UNC share already mounted/visible from Windows
#   - Service account has pods/exec on the database pod
#
# Output:
#   <dest>/<sampleId>.json  — one file per cached sample (sample IDs are
#                              sanitized for Windows filename rules)
#
# Safety: nothing about the payloads is printed to the terminal. Sample IDs
# (which become filenames on the destination) are not logged either; only
# aggregate counts and progress markers are emitted.
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
Usage: $(basename "$0") --run-id <uuid> --dest <unc-path> [--instance <name>]

Streams every benchmark_ocr_cache row for the given source run id directly to
a Windows UNC share, writing one file per sample. No payload data is stored
on the WSL host.

Options:
  --run-id, -r     BenchmarkRun id (uuid). Matches benchmark_ocr_cache.sourceRunId.
  --dest, -d       UNC directory to write into (e.g. '\\\\widget\\share\\sub')
  --instance, -i   Instance name (default: derived from git branch)
  --dry-run        Run pre-flight + emit counts; do not stream payloads
  --help, -h       Show this help
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

ps_single_quote_escape() {
  local s="$1"
  printf '%s' "${s//\'/\'\'}"
}

# ---------- argument parsing ----------

RUN_ID=""
DEST_UNC=""
DRY_RUN="false"
PASS_THROUGH_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-id|-r)
      [[ -z "${2:-}" ]] && { log_error "--run-id requires a value"; exit 1; }
      RUN_ID="$2"; shift 2 ;;
    --dest|-d)
      [[ -z "${2:-}" ]] && { log_error "--dest requires a value"; exit 1; }
      DEST_UNC="$2"; shift 2 ;;
    --instance|-i)
      [[ -z "${2:-}" ]] && { log_error "--instance requires a value"; exit 1; }
      PASS_THROUGH_ARGS+=(--instance "$2"); shift 2 ;;
    --dry-run)
      DRY_RUN="true"; shift ;;
    --help|-h)
      usage; exit 0 ;;
    *)
      log_error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "${RUN_ID}" ]]; then
  log_error "--run-id is required"
  usage
  exit 1
fi

if [[ -z "${DEST_UNC}" ]]; then
  log_error "--dest is required (UNC path, e.g. '\\\\server\\share\\sub')"
  usage
  exit 1
fi

if [[ "${DEST_UNC}" != \\\\* ]]; then
  log_error "--dest must be a UNC path starting with \\\\ (got: ${DEST_UNC})"
  exit 1
fi

# Basic uuid shape check (defence against accidental string interpolation)
if [[ ! "${RUN_ID}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  log_error "--run-id does not look like a uuid: ${RUN_ID}"
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
  exit 1
}

oc get pods -n "${NAMESPACE}" --no-headers &>/dev/null || {
  log_error "Cannot access namespace '${NAMESPACE}'. Token may lack permissions."
  exit 1
}

log_info "Authenticated with access to namespace: ${NAMESPACE}"

# ============================================================
# Step 3: Resolve instance name + pod
# ============================================================
log_step "Step 3: Resolving instance + PostgreSQL pod"

INSTANCE_NAME=$(resolve_instance_name "${PASS_THROUGH_ARGS[@]+"${PASS_THROUGH_ARGS[@]}"}") || {
  log_error "Failed to resolve instance name."
  exit 1
}
log_info "Instance name: ${INSTANCE_NAME}"

PG_POD=$(oc get pods -n "${NAMESPACE}" \
  -l "postgres-operator.crunchydata.com/instance,app.kubernetes.io/instance=${INSTANCE_NAME}" \
  -l "postgres-operator.crunchydata.com/role=master" \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null) || true

if [[ -z "${PG_POD}" ]]; then
  log_error "No master PostgreSQL pod found for instance '${INSTANCE_NAME}' in '${NAMESPACE}'."
  exit 1
fi
log_info "PostgreSQL pod: ${PG_POD}"

# ============================================================
# Step 4: Read database credentials
# ============================================================
log_step "Step 4: Reading database name"

PG_SECRET_NAME="${INSTANCE_NAME}-app-pg-pguser-admin"
DB_NAME=$(oc get secret "${PG_SECRET_NAME}" -n "${NAMESPACE}" \
  -o jsonpath='{.data.dbname}' 2>/dev/null | base64 -d) || true

if [[ -z "${DB_NAME}" ]]; then
  log_error "Could not read database name from secret '${PG_SECRET_NAME}'."
  exit 1
fi
log_info "Database name resolved (length=${#DB_NAME})"

# ============================================================
# Step 5: Verify destination share is writable
# ============================================================
log_step "Step 5: Verifying destination share is writable"

DEST_ESC=$(ps_single_quote_escape "${DEST_UNC}")
PROBE_RESULT=$("${POWERSHELL}" -NoProfile -Command "
\$dest = '${DEST_ESC}'
if (-not (Test-Path \$dest)) {
  try { New-Item -ItemType Directory -Path \$dest -Force | Out-Null } catch {
    Write-Output ('MKDIR_FAIL: ' + \$_.Exception.Message); exit 1
  }
}
\$probe = Join-Path \$dest ('.write-probe-' + (Get-Date -Format yyyyMMddHHmmss) + '.tmp')
try {
  Set-Content -Path \$probe -Value 'ok' -NoNewline -ErrorAction Stop
  Remove-Item \$probe -Force
  Write-Output 'WRITABLE'
} catch {
  Write-Output ('WRITE_FAIL: ' + \$_.Exception.Message); exit 1
}
" 2>&1 | tr -d '\r')

if [[ "${PROBE_RESULT}" != "WRITABLE" ]]; then
  log_error "Destination not writable: ${DEST_UNC}"
  log_error "PowerShell result: ${PROBE_RESULT}"
  exit 1
fi
log_info "Destination is writable: ${DEST_UNC}"

# ============================================================
# Step 6: Confirm row count before streaming
# ============================================================
log_step "Step 6: Counting rows for run ${RUN_ID}"

# Note: RUN_ID is already shape-validated as a uuid above, so the inline SQL is safe.
COUNT_OUT=$(oc exec "${PG_POD}" -n "${NAMESPACE}" -c database -- \
  bash -c "psql -U postgres -d \"$DB_NAME\" --no-psqlrc -At -F'|' -c \"SELECT count(*), count(DISTINCT \\\"sampleId\\\"), coalesce(sum(octet_length(\\\"ocrResponse\\\"::text)), 0) FROM benchmark_ocr_cache WHERE \\\"sourceRunId\\\" = '${RUN_ID}';\"" 2>&1 | tr -d '\r')

if [[ -z "${COUNT_OUT}" || "${COUNT_OUT}" == *FATAL* ]]; then
  log_error "Count query failed: ${COUNT_OUT}"
  exit 1
fi

IFS='|' read -r N_ROWS N_DISTINCT TOTAL_BYTES <<<"${COUNT_OUT}"
log_info "Rows: ${N_ROWS} (distinct sampleId: ${N_DISTINCT}), total payload bytes: ${TOTAL_BYTES}"

if [[ "${N_ROWS}" == "0" ]]; then
  log_error "No rows found for sourceRunId=${RUN_ID}. Nothing to export."
  exit 1
fi

if [[ "${N_ROWS}" != "${N_DISTINCT}" ]]; then
  log_error "WARNING: ${N_ROWS} rows but only ${N_DISTINCT} distinct sample IDs. Duplicate filenames would collide."
  log_error "Aborting. Investigate and re-run with deduplication if required."
  exit 1
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  log_info "DRY-RUN: skipping streaming step. Exiting."
  exit 0
fi

# ============================================================
# Step 7: Stream rows + write per-file on the Windows side
# ============================================================
log_step "Step 7: Streaming and writing ${N_ROWS} files"

# Batched streaming: a single oc exec carrying 99 large rows truncates on
# gRPC/kubelet streaming limits. Loop in chunks of BATCH_SIZE rows ordered
# deterministically by sampleId, persisting progress via the PowerShell-side
# totals across batches. Per-line format is simply
#   <base64-of-sampleId> <base64-of-jsonb-as-text>
# which avoids JSON parsing entirely on the PowerShell side.
DEST_FOR_PS=$(ps_single_quote_escape "${DEST_UNC}")
BATCH_SIZE=10

PIPELINE_LOG=$(mktemp)
trap 'rm -f "${PIPELINE_LOG}"' EXIT
: > "${PIPELINE_LOG}"

PS_WRITE='
$ErrorActionPreference = "Stop"
$dest = '"'${DEST_FOR_PS}'"'
$count = 0
$bytes = 0
$collisions = 0
$rejected = 0

$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
while (-not $reader.EndOfStream) {
  $line = $reader.ReadLine()
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $sp = $line.IndexOf(" ")
  if ($sp -lt 1 -or $sp -ge $line.Length - 1) { $rejected++; continue }
  $encSid = $line.Substring(0, $sp)
  $encData = $line.Substring($sp + 1)
  try {
    $sidBytes = [Convert]::FromBase64String($encSid)
    $sid = [System.Text.Encoding]::UTF8.GetString($sidBytes)
    $bin = [Convert]::FromBase64String($encData)
  } catch {
    $rejected++; continue
  }
  $safe = $sid -replace "[<>:`"/\\|?*]", "_"
  $safe = $safe.Trim()
  if ($safe.Length -eq 0) { $rejected++; continue }
  if ($safe.Length -gt 200) { $safe = $safe.Substring(0,200) }
  $path = Join-Path $dest ($safe + ".json")
  if (Test-Path $path) { $collisions++ }
  [System.IO.File]::WriteAllBytes($path, $bin)
  $count++
  $bytes += $bin.Length
}
Write-Host ("BATCH_FINAL: files=" + $count + " bytes=" + $bytes + " collisions=" + $collisions + " rejected=" + $rejected)
'

TOTAL_WRITTEN=0
TOTAL_BYTES_WRITTEN=0
TOTAL_REJECTED=0
TOTAL_COLLISIONS=0

OFFSET=0
BATCH_INDEX=0
NUM_BATCHES=$(( (N_ROWS + BATCH_SIZE - 1) / BATCH_SIZE ))

while (( OFFSET < N_ROWS )); do
  BATCH_INDEX=$(( BATCH_INDEX + 1 ))
  log_info "Batch ${BATCH_INDEX}/${NUM_BATCHES} (offset=${OFFSET}, limit=${BATCH_SIZE})"

  # Order by sampleId so OFFSET/LIMIT pagination is stable and disjoint
  # across batches. Encode sampleId in base64 too so the line delimiter (space)
  # is unambiguous and Windows-forbidden characters in IDs survive transit.
  PSQL_INVOCATION="set -e; psql -U postgres -v ON_ERROR_STOP=1 -d \"${DB_NAME}\" --no-psqlrc -At <<'SQL'
SELECT
  replace(encode(convert_to(\"sampleId\", 'UTF8'), 'base64'), E'\\n', '')
  || ' '
  || replace(encode(convert_to(\"ocrResponse\"::text, 'UTF8'), 'base64'), E'\\n', '')
FROM benchmark_ocr_cache
WHERE \"sourceRunId\" = '${RUN_ID}'
ORDER BY \"sampleId\"
OFFSET ${OFFSET} LIMIT ${BATCH_SIZE};
SQL"

  set -o pipefail
  if ! oc exec -i "${PG_POD}" -n "${NAMESPACE}" -c database -- bash -c "${PSQL_INVOCATION}" \
    | "${POWERSHELL}" -NoProfile -Command "${PS_WRITE}" 2>&1 | tee -a "${PIPELINE_LOG}"; then
    log_error "Streaming pipeline failed during batch ${BATCH_INDEX}. Destination may be partial."
    exit 1
  fi

  BATCH_LINE=$(tail -n 5 "${PIPELINE_LOG}" | grep -E '^BATCH_FINAL: files=' | tail -1)
  if [[ -z "${BATCH_LINE}" ]]; then
    log_error "Batch ${BATCH_INDEX} did not emit a BATCH_FINAL summary — assume failure."
    exit 1
  fi

  BATCH_FILES=$(echo "${BATCH_LINE}" | sed -n 's/.*files=\([0-9]\+\).*/\1/p')
  BATCH_BYTES=$(echo "${BATCH_LINE}" | sed -n 's/.*bytes=\([0-9]\+\).*/\1/p')
  BATCH_REJ=$(echo "${BATCH_LINE}" | sed -n 's/.*rejected=\([0-9]\+\).*/\1/p')
  BATCH_COL=$(echo "${BATCH_LINE}" | sed -n 's/.*collisions=\([0-9]\+\).*/\1/p')

  TOTAL_WRITTEN=$(( TOTAL_WRITTEN + BATCH_FILES ))
  TOTAL_BYTES_WRITTEN=$(( TOTAL_BYTES_WRITTEN + BATCH_BYTES ))
  TOTAL_REJECTED=$(( TOTAL_REJECTED + BATCH_REJ ))
  TOTAL_COLLISIONS=$(( TOTAL_COLLISIONS + BATCH_COL ))

  log_info "  batch files=${BATCH_FILES} bytes=${BATCH_BYTES} rejected=${BATCH_REJ} (running total: files=${TOTAL_WRITTEN})"

  OFFSET=$(( OFFSET + BATCH_SIZE ))
done

if [[ "${TOTAL_WRITTEN}" != "${N_ROWS}" ]]; then
  log_error "Expected to write ${N_ROWS} files but wrote ${TOTAL_WRITTEN} (rejected=${TOTAL_REJECTED}, collisions=${TOTAL_COLLISIONS})."
  exit 1
fi
log_info "Wrote ${TOTAL_WRITTEN} files, ${TOTAL_BYTES_WRITTEN} bytes (rejected=${TOTAL_REJECTED}, collisions=${TOTAL_COLLISIONS})"

# ============================================================
# Done
# ============================================================
log_step "Export Complete"

cat <<EOF

OCR cache for benchmark run ${RUN_ID} written to:

  ${DEST_UNC}

  File pattern: <sampleId>.json (one per cached sample)
  Source rows : ${N_ROWS}
  Total bytes : ${TOTAL_BYTES}

EOF
