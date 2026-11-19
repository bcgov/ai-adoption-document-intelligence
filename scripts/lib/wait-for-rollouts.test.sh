#!/usr/bin/env bash
#
# wait-for-rollouts.test.sh -- Tests for wait-for-rollouts.sh
#
# Run: bash scripts/lib/wait-for-rollouts.test.sh
#
# Puts a fake `oc` first on PATH that records each call and answers:
#   get deployment <name>   exit 0 unless <name> is in FAKE_MISSING
#   rollout restart <d>     exit 0 unless <d> is in FAKE_RESTART_FAIL
#   rollout status <d>      exit 0 unless <d> is in FAKE_STATUS_FAIL
#   anything else           exit 0 (diagnostics)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# ---------- test helpers ----------

assert_eq() {
  local description="$1"
  local expected="$2"
  local actual="$3"
  TESTS_RUN=$((TESTS_RUN + 1))
  if [[ "${expected}" == "${actual}" ]]; then
    echo "  PASS: ${description}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: ${description}"
    echo "    Expected: '${expected}'"
    echo "    Actual:   '${actual}'"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_contains() {
  local description="$1"
  local needle="$2"
  local haystack="$3"
  TESTS_RUN=$((TESTS_RUN + 1))
  if [[ "${haystack}" == *"${needle}"* ]]; then
    echo "  PASS: ${description}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: ${description}"
    echo "    Expected to contain: '${needle}'"
    echo "    Actual:              '${haystack}'"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# ---------- fake oc ----------

FAKE_DIR="$(mktemp -d)"
trap 'rm -rf "${FAKE_DIR}"' EXIT

cat > "${FAKE_DIR}/oc" <<'FAKE'
#!/usr/bin/env bash
listed() { [[ " ${2} " == *" ${1} "* ]]; }
case "$1 $2" in
  "get deployment")
    echo "get $3" >> "${FAKE_CALLS_FILE}"
    listed "$3" "${FAKE_MISSING:-}" && exit 1
    exit 0 ;;
  "rollout restart")
    echo "restart ${3#deployment/}" >> "${FAKE_CALLS_FILE}"
    listed "${3#deployment/}" "${FAKE_RESTART_FAIL:-}" && exit 1
    exit 0 ;;
  "rollout status")
    echo "status ${3#deployment/}" >> "${FAKE_CALLS_FILE}"
    listed "${3#deployment/}" "${FAKE_STATUS_FAIL:-}" && exit 1
    exit 0 ;;
esac
exit 0
FAKE
chmod +x "${FAKE_DIR}/oc"
export PATH="${FAKE_DIR}:${PATH}"
export FAKE_CALLS_FILE="${FAKE_DIR}/calls"
unset GITHUB_ACTIONS

# shellcheck source=wait-for-rollouts.sh
source "${SCRIPT_DIR}/wait-for-rollouts.sh"

reset_fake() {
  : > "${FAKE_CALLS_FILE}"
  export FAKE_MISSING="${1:-}"
  export FAKE_RESTART_FAIL="${2:-}"
  export FAKE_STATUS_FAIL="${3:-}"
}

# Restart and status calls only, in order, space-separated.
rollout_calls() {
  grep -E '^(restart|status) ' "${FAKE_CALLS_FILE}" | tr '\n' ' ' | sed 's/ $//'
}

# ---------- tests ----------

echo "=== One deployment at a time ==="

reset_fake
rc=0; wait_for_rollouts ns inst a b c >/dev/null 2>&1 || rc=$?
assert_eq "all rollouts succeed" "0" "${rc}"
assert_eq "each restart is waited on before the next" \
  "restart inst-a status inst-a restart inst-b status inst-b restart inst-c status inst-c" \
  "$(rollout_calls)"
echo ""

echo "=== Missing deployments are skipped ==="

reset_fake "inst-b"
rc=0; wait_for_rollouts ns inst a b c >/dev/null 2>&1 || rc=$?
assert_eq "succeeds without the missing deployment" "0" "${rc}"
assert_eq "the missing deployment is neither restarted nor waited on" \
  "restart inst-a status inst-a restart inst-c status inst-c" \
  "$(rollout_calls)"
echo ""

echo "=== Failures ==="

reset_fake "" "" "inst-a"
rc=0; output=$(wait_for_rollouts ns inst a b 2>&1) || rc=$?
assert_eq "a rollout timeout fails the call" "1" "${rc}"
assert_contains "the timeout is reported" "Rollout failures: inst-a:timeout" "${output}"
assert_eq "later deployments still roll after a timeout" \
  "restart inst-a status inst-a restart inst-b status inst-b" \
  "$(rollout_calls)"
assert_contains "diagnostics list FailedCreate events" "FailedCreate events" "${output}"

reset_fake "" "inst-a" ""
rc=0; output=$(wait_for_rollouts ns inst a b 2>&1) || rc=$?
assert_eq "a failed restart fails the call" "1" "${rc}"
assert_contains "the failed restart is reported" "Rollout failures: inst-a:restart" "${output}"
assert_eq "a deployment whose restart failed is not waited on" \
  "restart inst-a restart inst-b status inst-b" \
  "$(rollout_calls)"
echo ""

# ---------- summary ----------

echo "=== Results ==="
echo "  Total:  ${TESTS_RUN}"
echo "  Passed: ${TESTS_PASSED}"
echo "  Failed: ${TESTS_FAILED}"

if [[ ${TESTS_FAILED} -gt 0 ]]; then
  exit 1
fi
