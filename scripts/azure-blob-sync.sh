#!/usr/bin/env bash
#
# azure-blob-sync.sh — Sync an Azure Blob container between two storage accounts.
#
# Generates short-lived SAS tokens from account keys (same pattern the app uses)
# and uses azcopy to replicate structure from source to destination.
#
# Usage:
#   SOURCE_ACCOUNT_KEY=... DEST_ACCOUNT_KEY=... \
#   ./scripts/azure-blob-sync.sh \
#     --source-account <name> \
#     --dest-account <name> \
#     --container <name> \
#     [--wipe-dest]
#
set -euo pipefail

log_info()  { echo "[INFO]  $*"; }
log_error() { echo "[ERROR] $*" >&2; }

SOURCE_ACCOUNT=""
DEST_ACCOUNT=""
CONTAINER=""
WIPE_DEST=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-account) SOURCE_ACCOUNT="$2"; shift 2 ;;
    --dest-account)   DEST_ACCOUNT="$2";   shift 2 ;;
    --container)      CONTAINER="$2";      shift 2 ;;
    --wipe-dest)      WIPE_DEST=true;      shift ;;
    --help|-h)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *) log_error "Unknown option: $1"; exit 1 ;;
  esac
done

[[ -z "${SOURCE_ACCOUNT}" || -z "${DEST_ACCOUNT}" || -z "${CONTAINER}" ]] && {
  log_error "--source-account, --dest-account, and --container are required"
  exit 1
}
[[ -z "${SOURCE_ACCOUNT_KEY:-}" || -z "${DEST_ACCOUNT_KEY:-}" ]] && {
  log_error "SOURCE_ACCOUNT_KEY and DEST_ACCOUNT_KEY env vars are required"
  exit 1
}

command -v azcopy >/dev/null 2>&1 || {
  if [[ -x "${HOME}/.local/bin/azcopy" ]]; then
    export PATH="${HOME}/.local/bin:${PATH}"
  else
    log_error "azcopy not found. Install from https://aka.ms/downloadazcopy-v10-linux"
    exit 1
  fi
}
command -v az >/dev/null 2>&1 || { log_error "az CLI not found"; exit 1; }

EXPIRY=$(date -u -d '+4 hours' +%Y-%m-%dT%H:%MZ)

log_info "Generating SAS tokens (expires ${EXPIRY})..."

SOURCE_SAS=$(az storage container generate-sas \
  --account-name "${SOURCE_ACCOUNT}" \
  --account-key "${SOURCE_ACCOUNT_KEY}" \
  --name "${CONTAINER}" \
  --permissions rl \
  --expiry "${EXPIRY}" \
  --https-only \
  -o tsv)

DEST_SAS=$(az storage container generate-sas \
  --account-name "${DEST_ACCOUNT}" \
  --account-key "${DEST_ACCOUNT_KEY}" \
  --name "${CONTAINER}" \
  --permissions rwdlc \
  --expiry "${EXPIRY}" \
  --https-only \
  -o tsv)

SRC_URL="https://${SOURCE_ACCOUNT}.blob.core.windows.net/${CONTAINER}?${SOURCE_SAS}"
DST_URL="https://${DEST_ACCOUNT}.blob.core.windows.net/${CONTAINER}?${DEST_SAS}"

if [[ "${WIPE_DEST}" == "true" ]]; then
  log_info "Wiping destination container contents..."
  azcopy remove "${DST_URL}" --recursive=true || {
    log_info "Destination was empty or remove completed with warnings; continuing."
  }
fi

log_info "Syncing ${SOURCE_ACCOUNT}/${CONTAINER} -> ${DEST_ACCOUNT}/${CONTAINER}..."
azcopy sync "${SRC_URL}" "${DST_URL}" \
  --recursive=true \
  --delete-destination=true

log_info "Sync complete."
