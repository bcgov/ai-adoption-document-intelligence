#!/usr/bin/env bash
#
# oc-list-instances.sh — List all deployed instances in the OpenShift namespace.
#
# Discovers instances by querying for unique values of the
# app.kubernetes.io/instance label and displays a table with
# INSTANCE, STATUS, and AGE columns.
#
# Usage:
#   ./scripts/oc-list-instances.sh
#
# Prerequisites:
#   - .oc-deploy-token exists (created by oc-setup-sa.sh)
#   - oc CLI installed
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TOKEN_FILE="${PROJECT_ROOT}/.oc-deploy-token"

# ---------- helpers ----------

usage() {
  cat <<EOF
Usage: $(basename "$0")

Lists all deployed instances in the OpenShift namespace.

Options:
  --help, -h      Show this help message
EOF
}

log_info() {
  echo "[INFO] $*"
}

log_error() {
  echo "[ERROR] $*" >&2
}

# format_age <creation-timestamp>
#
# Converts an ISO 8601 timestamp to a human-readable age string.
# Example: "2026-03-11T10:30:00Z" → "2d" (if current time is 2026-03-13T10:30:00Z)
format_age() {
  local timestamp="$1"
  local created_epoch now_epoch diff_seconds

  # Parse the timestamp to epoch seconds
  created_epoch=$(date -d "${timestamp}" +%s 2>/dev/null) || {
    echo "Unknown"
    return
  }
  now_epoch=$(date +%s)
  diff_seconds=$((now_epoch - created_epoch))

  if [[ ${diff_seconds} -lt 0 ]]; then
    echo "0s"
    return
  fi

  local days=$((diff_seconds / 86400))
  local hours=$(( (diff_seconds % 86400) / 3600 ))
  local minutes=$(( (diff_seconds % 3600) / 60 ))

  if [[ ${days} -gt 0 ]]; then
    echo "${days}d"
  elif [[ ${hours} -gt 0 ]]; then
    echo "${hours}h"
  elif [[ ${minutes} -gt 0 ]]; then
    echo "${minutes}m"
  else
    echo "${diff_seconds}s"
  fi
}

# determine_instance_status <instance-name> <namespace>
#
# Checks all pods for a given instance and returns a status string:
#   - "Running"  if all pods are Running and all containers are ready
#   - "Pending"  if any pod is in Pending state
#   - "Error"    if any pod is in Failed, CrashLoopBackOff, or error state
#   - "Unknown"  if status cannot be determined
determine_instance_status() {
  local instance="$1"
  local namespace="$2"
  local selector="app.kubernetes.io/instance=${instance}"

  # Get pod phases and container ready status
  local pod_info
  pod_info=$(oc get pods -l "${selector}" -n "${namespace}" \
    -o jsonpath='{range .items[*]}{.status.phase}{" "}{range .status.containerStatuses[*]}{.ready}{" "}{end}{"\n"}{end}' 2>/dev/null) || {
    echo "Unknown"
    return
  }

  if [[ -z "${pod_info}" ]]; then
    echo "Unknown"
    return
  fi

  local has_error=false
  local has_pending=false
  local all_running=true

  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue

    local phase
    phase=$(echo "${line}" | awk '{print $1}')

    case "${phase}" in
      Running)
        # Check if all containers in this pod are ready
        local containers
        containers=$(echo "${line}" | awk '{for(i=2;i<=NF;i++) print $i}')
        for ready in ${containers}; do
          if [[ "${ready}" != "true" ]]; then
            all_running=false
          fi
        done
        ;;
      Succeeded)
        # Completed pods (e.g., init jobs) are fine
        ;;
      Pending)
        has_pending=true
        all_running=false
        ;;
      Failed|Unknown)
        has_error=true
        all_running=false
        ;;
      *)
        all_running=false
        ;;
    esac
  done <<< "${pod_info}"

  # Also check for CrashLoopBackOff in container statuses
  local waiting_reasons
  waiting_reasons=$(oc get pods -l "${selector}" -n "${namespace}" \
    -o jsonpath='{range .items[*]}{range .status.containerStatuses[*]}{.state.waiting.reason}{" "}{end}{end}' 2>/dev/null) || true

  if [[ "${waiting_reasons}" == *"CrashLoopBackOff"* ]] || [[ "${waiting_reasons}" == *"Error"* ]] || [[ "${waiting_reasons}" == *"ImagePullBackOff"* ]]; then
    has_error=true
    all_running=false
  fi

  if [[ "${has_error}" == "true" ]]; then
    echo "Error"
  elif [[ "${has_pending}" == "true" ]]; then
    echo "Pending"
  elif [[ "${all_running}" == "true" ]]; then
    echo "Running"
  else
    echo "Pending"
  fi
}

# get_instance_age <instance-name> <namespace>
#
# Returns the age of the oldest deployment for the given instance.
get_instance_age() {
  local instance="$1"
  local namespace="$2"
  local selector="app.kubernetes.io/instance=${instance}"

  # Get the earliest creation timestamp from deployments
  local timestamps
  timestamps=$(oc get deployments -l "${selector}" -n "${namespace}" \
    -o jsonpath='{range .items[*]}{.metadata.creationTimestamp}{"\n"}{end}' 2>/dev/null) || {
    echo "Unknown"
    return
  }

  if [[ -z "${timestamps}" ]]; then
    echo "Unknown"
    return
  fi

  # Find the earliest timestamp
  local earliest
  earliest=$(echo "${timestamps}" | sort | head -1)

  format_age "${earliest}"
}

# ---------- argument parsing ----------

while [[ $# -gt 0 ]]; do
  case "$1" in
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

# Log in to OpenShift using the service account token
oc login "${SERVER}" --token="${TOKEN}" --insecure-skip-tls-verify=true &>/dev/null || {
  log_error "Failed to authenticate with OpenShift. Token may have expired."
  log_error "Please re-run './scripts/oc-setup-sa.sh --namespace ${NAMESPACE}' to regenerate."
  exit 1
}

oc project "${NAMESPACE}" &>/dev/null || {
  log_error "Failed to switch to namespace '${NAMESPACE}'."
  exit 1
}

# ============================================================
# Step 2: Discover instances
# ============================================================

# Query for unique instance label values from deployments in the namespace
INSTANCES=$(oc get deployments -n "${NAMESPACE}" \
  -l "app.kubernetes.io/instance" \
  -o jsonpath='{range .items[*]}{.metadata.labels.app\.kubernetes\.io/instance}{"\n"}{end}' 2>/dev/null \
  | sort -u | grep -v '^$') || true

if [[ -z "${INSTANCES}" ]]; then
  echo "No instances found in namespace '${NAMESPACE}'."
  exit 0
fi

# ============================================================
# Step 3: Display instance table
# ============================================================

# Print table header
printf "%-40s %-12s %s\n" "INSTANCE" "STATUS" "AGE"

while IFS= read -r instance; do
  [[ -z "${instance}" ]] && continue

  status=$(determine_instance_status "${instance}" "${NAMESPACE}")
  age=$(get_instance_age "${instance}" "${NAMESPACE}")

  printf "%-40s %-12s %s\n" "${instance}" "${status}" "${age}"
done <<< "${INSTANCES}"
