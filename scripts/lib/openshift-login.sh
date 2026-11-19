#!/usr/bin/env bash
#
# openshift-login.sh — oc login with retries.
#
# Calls the oc binary directly (`command oc`), so the oc-retry.sh wrapper, if
# sourced, does not multiply the attempts. A GitHub runner that cannot reach
# the cluster API at all then fails in about four minutes rather than retrying
# for much longer. The final error names the runner's Azure region, read from
# the instance metadata service: from some regions the API is unreachable for
# the whole job, and re-running the failed job gets a different runner.
#

# Prints the runner's Azure region, or "unknown" off Azure.
_runner_azure_region() {
  local region
  region=$(curl -s --max-time 3 -H "Metadata: true" \
    "http://169.254.169.254/metadata/instance/compute/location?api-version=2021-02-01&format=text" 2>/dev/null) || true
  echo "${region:-unknown}"
}

# openshift_login <server> <token> [max_attempts] [wait_seconds]
openshift_login() {
  local server="$1"
  local token="$2"
  local max_attempts="${3:-6}"
  local wait_seconds="${4:-10}"
  local attempt=1

  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    echo "[INFO] Logging in to ${server} (attempt ${attempt}/${max_attempts})..."
    if command oc login "${server}" \
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

  echo "[ERROR] oc login to ${server} failed after ${max_attempts} attempts from a runner in Azure region $(_runner_azure_region)." >&2
  echo "[ERROR] From some regions the cluster API is unreachable for the whole job; use \"Re-run failed jobs\" to get a different runner." >&2
  return 1
}
