#!/usr/bin/env bash
#
# retry.sh — run a command with retries and fixed backoff.
#
# Handles intermittent registry/network failures (e.g. Artifactory
# "Client.Timeout exceeded while awaiting headers") without failing the job on
# the first blip.
#

# with_retries <max_attempts> <wait_seconds> <command> [args...]
# Runs the command; on non-zero exit, waits and retries up to max_attempts.
# Returns the command's exit status from the final attempt.
with_retries() {
  local max_attempts="$1"
  local wait_seconds="$2"
  shift 2
  local attempt=1
  local status=0

  while true; do
    if "$@"; then
      return 0
    else
      status=$?
    fi
    if [[ "${attempt}" -ge "${max_attempts}" ]]; then
      echo "[ERROR] Command failed after ${max_attempts} attempts: $*" >&2
      return "${status}"
    fi
    echo "[WARN] Attempt ${attempt}/${max_attempts} failed (exit ${status}); retrying in ${wait_seconds}s..." >&2
    sleep "${wait_seconds}"
    attempt=$((attempt + 1))
  done
}
