#!/usr/bin/env bash
#
# oc-login-sa.sh — Log in to OpenShift using the stored service account token.
#
# Reads credentials from .oc-deploy/token (created by oc-setup-sa.sh) and
# authenticates to the cluster as the deploy service account.
#
# Usage:
#   ./scripts/oc-login-sa.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TOKEN_FILE="${PROJECT_ROOT}/.oc-deploy/token"

if [[ ! -f "${TOKEN_FILE}" ]]; then
  echo "[ERROR] Token file not found at ${TOKEN_FILE}" >&2
  echo "[ERROR] Run './scripts/oc-setup-sa.sh --namespace <namespace>' first." >&2
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
  echo "[ERROR] Token file is incomplete. Expected NAMESPACE, SERVER, and TOKEN." >&2
  echo "[ERROR] Re-run './scripts/oc-setup-sa.sh --namespace <namespace>'." >&2
  exit 1
fi

oc login "${SERVER}" --token="${TOKEN}" --insecure-skip-tls-verify=true || {
  echo "[ERROR] Failed to authenticate. Token may have expired." >&2
  echo "[ERROR] Re-run './scripts/oc-setup-sa.sh --namespace ${NAMESPACE}'." >&2
  exit 1
}

echo "[INFO] Logged in as service account in namespace: ${NAMESPACE}"
