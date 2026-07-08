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

# check_namespace_quota <namespace> [threshold_percent]
# Warns or fails when any hard quota resource is at or above the threshold.
check_namespace_quota() {
  local namespace="$1"
  local threshold="${2:-95}"

  local quotas
  quotas=$(oc get resourcequota -n "${namespace}" -o json 2>/dev/null) || return 0

  local at_limit
  at_limit=$(echo "${quotas}" | python3 -c "
import json, sys, re

# Kubernetes resource.Quantity suffixes. 'hard' and 'used' are NOT guaranteed to
# share a suffix (e.g. cpu hard='4' used='3230m', memory hard='16Gi' used='5736Mi'),
# so both sides must be normalized to a common base before comparing.
BINARY = {'Ki': 2**10, 'Mi': 2**20, 'Gi': 2**30, 'Ti': 2**40, 'Pi': 2**50, 'Ei': 2**60}
DECIMAL = {'n': 1e-9, 'u': 1e-6, 'm': 1e-3, '': 1.0,
           'k': 1e3, 'M': 1e6, 'G': 1e9, 'T': 1e12, 'P': 1e15, 'E': 1e18}

def parse_quantity(s):
    s = str(s).strip()
    m = re.fullmatch(r'([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([a-zA-Z]*)', s)
    if not m:
        raise ValueError(f'unparseable quantity: {s!r}')
    num, suffix = float(m.group(1)), m.group(2)
    if suffix in BINARY:
        return num * BINARY[suffix]
    if suffix in DECIMAL:
        return num * DECIMAL[suffix]
    raise ValueError(f'unknown quantity suffix: {suffix!r}')

data = json.load(sys.stdin)
threshold = ${threshold}
issues = []
for item in data.get('items', []):
    name = item['metadata']['name']
    hard = item.get('status', {}).get('hard', {})
    used = item.get('status', {}).get('used', {})
    for key, hard_val in hard.items():
        used_val = used.get(key, '0')
        try:
            h = parse_quantity(hard_val)
            u = parse_quantity(used_val)
        except ValueError:
            continue
        if h > 0 and (u / h) * 100 >= threshold:
            issues.append(f'{name}:{key}={used_val}/{hard_val}')
for line in issues:
    print(line)
" 2>/dev/null) || true

  if [[ -n "${at_limit}" ]]; then
    while IFS= read -r line; do
      [[ -z "${line}" ]] && continue
      _rollout_log_error "Namespace quota at or above ${threshold}%: ${line}"
    done <<< "${at_limit}"
    return 1
  fi
  return 0
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

  if ! check_namespace_quota "${namespace}"; then
    return 1
  fi

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
