#!/usr/bin/env bash
#
# wait-for-rollouts.sh — Restart deployments and wait for rollout completion.
#
# Source this file and call wait_for_rollouts. On failure, emits diagnostics and
# returns non-zero. In GitHub Actions, failures are surfaced as ::error:: annotations.
#

# _rollout_log_error <message>
_rollout_log_error() {
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "::error::$*"
  else
    echo "[ERROR] $*" >&2
  fi
}

# _rollout_log_warn <message>
_rollout_log_warn() {
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "::warning::$*"
  else
    echo "[WARN] $*" >&2
  fi
}

# diagnose_rollout_failures <namespace> <instance>
diagnose_rollout_failures() {
  local namespace="$1"
  local instance="$2"
  local selector="app.kubernetes.io/instance=${instance}"

  echo ""
  echo "=== Rollout failure diagnostics (instance=${instance}, namespace=${namespace}) ==="

  echo ""
  echo "--- Pods ---"
  oc get pods -l "${selector}" -n "${namespace}" -o wide 2>/dev/null || true

  echo ""
  echo "--- Pod waiting reasons ---"
  oc get pods -l "${selector}" -n "${namespace}" \
    -o jsonpath='{range .items[*]}{.metadata.name}{": "}{range .status.containerStatuses[*]}{.state.waiting.reason}{" "}{end}{"\n"}{end}' 2>/dev/null || true

  echo ""
  echo "--- Recent FailedScheduling events ---"
  oc get events -n "${namespace}" \
    --field-selector reason=FailedScheduling \
    --sort-by='.lastTimestamp' 2>/dev/null | tail -20 || true

  echo ""
  echo "--- Resource quotas ---"
  oc describe resourcequota -n "${namespace}" 2>/dev/null || true

  echo "=== End diagnostics ==="
  echo ""
}

# wait_for_rollouts <namespace> <instance> <service>...
# Restarts each deployment and waits for rollout status. Returns 1 on any failure.
wait_for_rollouts() {
  local namespace="$1"
  local instance="$2"
  shift 2
  local services=("$@")
  local failed=()
  local deploy

  for svc in "${services[@]}"; do
    deploy="${instance}-${svc}"
    if ! oc get deployment "${deploy}" -n "${namespace}" &>/dev/null; then
      continue
    fi
    echo "Restarting ${deploy}..."
    if ! oc rollout restart "deployment/${deploy}" -n "${namespace}"; then
      failed+=("${deploy}:restart")
      _rollout_log_error "Rollout restart failed for ${deploy}"
    fi
  done

  for svc in "${services[@]}"; do
    deploy="${instance}-${svc}"
    if ! oc get deployment "${deploy}" -n "${namespace}" &>/dev/null; then
      continue
    fi
    echo "Waiting for ${deploy}..."
    if ! oc rollout status "deployment/${deploy}" -n "${namespace}" --timeout=300s; then
      failed+=("${deploy}:timeout")
      _rollout_log_error "Rollout timed out for ${deploy}"
    fi
  done

  if [[ ${#failed[@]} -gt 0 ]]; then
    echo "Rollout failures: ${failed[*]}"
    diagnose_rollout_failures "${namespace}" "${instance}"
    return 1
  fi

  return 0
}
