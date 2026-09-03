#!/usr/bin/env bash
#
# openshift-login.sh — oc login with retries.
#

# openshift_login <server> <token> [max_attempts] [wait_seconds]
openshift_login() {
  local server="$1"
  local token="$2"
  local max_attempts="${3:-3}"
  local wait_seconds="${4:-15}"
  local attempt=1

  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    echo "[INFO] Logging in to ${server} (attempt ${attempt}/${max_attempts})..."
    if oc login "${server}" \
      --token="${token}" \
      --insecure-skip-tls-verify=true; then
      return 0
    fi
    if [[ "${attempt}" -lt "${max_attempts}" ]]; then
      echo "[WARN] oc login failed; retrying in ${wait_seconds}s..."
      sleep "${wait_seconds}"
    fi
    attempt=$((attempt + 1))
  done

  echo "[ERROR] oc login to ${server} failed after ${max_attempts} attempts." >&2
  return 1
}
