#!/usr/bin/env bash
#
# oc-login-sa.sh — Log in to OpenShift using a stored service account token.
#
# Reads credentials from .oc-deploy/token-<namespace> (or the default
# .oc-deploy/token) and authenticates to the cluster as the deploy
# service account.
#
# Usage:
#   ./scripts/oc-login-sa.sh                        # uses default token
#   ./scripts/oc-login-sa.sh --namespace fd34fb-dev  # uses token-fd34fb-dev
#   ./scripts/oc-login-sa.sh -n fd34fb-prod          # uses token-fd34fb-prod
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TOKEN_DIR="${PROJECT_ROOT}/.oc-deploy"

# ---------- parse arguments ----------

TARGET_NAMESPACE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace|-n)
      TARGET_NAMESPACE="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $(basename "$0") [--namespace <namespace>]"
      echo ""
      echo "Log in to OpenShift using a stored service account token."
      echo ""
      echo "Options:"
      echo "  --namespace, -n  Namespace to log in to (uses token-<namespace> file)"
      echo "                   If omitted, uses the default token file"
      echo ""
      echo "Available tokens:"
      shopt -s nullglob
      for f in "${TOKEN_DIR}"/token-*; do
        echo "  $(basename "$f" | sed 's/^token-//')"
      done
      shopt -u nullglob
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# ---------- resolve token file ----------

if [[ -n "${TARGET_NAMESPACE}" ]]; then
  TOKEN_FILE="${TOKEN_DIR}/token-${TARGET_NAMESPACE}"
  if [[ ! -f "${TOKEN_FILE}" ]]; then
    echo "[ERROR] Token file not found: ${TOKEN_FILE}" >&2
    echo "[ERROR] Run './scripts/oc-setup-sa.sh --namespace ${TARGET_NAMESPACE}' first." >&2
    echo "" >&2
    echo "Available tokens:" >&2
    shopt -s nullglob
    for f in "${TOKEN_DIR}"/token-*; do
      echo "  $(basename "$f" | sed 's/^token-//')" >&2
    done
    shopt -u nullglob
    exit 1
  fi
else
  TOKEN_FILE="${TOKEN_DIR}/token"
  if [[ ! -f "${TOKEN_FILE}" ]]; then
    echo "[ERROR] Default token file not found at ${TOKEN_FILE}" >&2
    echo "[ERROR] Run './scripts/oc-setup-sa.sh --namespace <namespace>' first." >&2
    exit 1
  fi
fi

# ---------- read token ----------

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
  echo "[ERROR] Token file is incomplete. Expected NAMESPACE, SERVER, and TOKEN." >&2
  echo "[ERROR] Re-run './scripts/oc-setup-sa.sh --namespace ${TARGET_NAMESPACE:-<namespace>}'." >&2
  exit 1
fi

# ---------- login ----------

oc login "${SERVER}" --token="${TOKEN}" --insecure-skip-tls-verify=true || {
  echo "[ERROR] Failed to authenticate. Token may have expired." >&2
  echo "[ERROR] Re-run './scripts/oc-setup-sa.sh --namespace ${NAMESPACE}'." >&2
  exit 1
}

echo "[INFO] Logged in as service account in namespace: ${NAMESPACE}"
