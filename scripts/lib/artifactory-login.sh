#!/usr/bin/env bash
#
# artifactory-login.sh — Docker login to Artifactory with retries.
#

# artifactory_docker_login <registry> <username> <password> [max_attempts] [wait_seconds]
artifactory_docker_login() {
  local registry="$1"
  local username="$2"
  local password="$3"
  local max_attempts="${4:-3}"
  local wait_seconds="${5:-15}"
  local attempt=1

  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    echo "[INFO] Logging in to ${registry} (attempt ${attempt}/${max_attempts})..."
    if printf '%s\n' "${password}" | docker login "${registry}" \
      -u "${username}" \
      --password-stdin; then
      return 0
    fi
    if [[ "${attempt}" -lt "${max_attempts}" ]]; then
      echo "[WARN] Docker login failed; retrying in ${wait_seconds}s..."
      sleep "${wait_seconds}"
    fi
    attempt=$((attempt + 1))
  done

  echo "[ERROR] Docker login to ${registry} failed after ${max_attempts} attempts." >&2
  return 1
}
