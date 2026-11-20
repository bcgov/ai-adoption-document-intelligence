#!/usr/bin/env bash
#
# openshift-login.test.sh -- Tests for openshift-login.sh
#
# Run: bash scripts/lib/openshift-login.test.sh
#
# Puts a fake `oc` first on PATH that records each call and fails the first
# FAKE_FAIL_TIMES calls with a connection error. `curl` is replaced by a shell
# function that prints FAKE_REGION, standing in for the instance metadata
# service.
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

# ---------- fakes ----------

FAKE_DIR="$(mktemp -d)"
trap 'rm -rf "${FAKE_DIR}"' EXIT

cat > "${FAKE_DIR}/oc" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "${FAKE_CALLS_FILE}"
calls=$(wc -l < "${FAKE_CALLS_FILE}")
if (( calls <= ${FAKE_FAIL_TIMES:-0} )); then
  echo "error: dial tcp 10.0.0.1:6443: i/o timeout" >&2
  exit 1
fi
exit 0
FAKE
chmod +x "${FAKE_DIR}/oc"
export PATH="${FAKE_DIR}:${PATH}"
export FAKE_CALLS_FILE="${FAKE_DIR}/calls"

curl() {
  echo "${FAKE_REGION:-}"
}

# shellcheck source=openshift-login.sh
source "${SCRIPT_DIR}/openshift-login.sh"

reset_fake() {
  : > "${FAKE_CALLS_FILE}"
  export FAKE_FAIL_TIMES="${1:-0}"
  export FAKE_REGION="${2:-}"
}

call_count() {
  wc -l < "${FAKE_CALLS_FILE}" | tr -d ' '
}

# ---------- tests ----------

echo "=== Retries ==="

reset_fake 2
rc=0; openshift_login https://api.example:6443 token 6 0 >/dev/null 2>&1 || rc=$?
assert_eq "logs in after two failed attempts" "0" "${rc}"
assert_eq "made three attempts" "3" "$(call_count)"

reset_fake 99 eastus
rc=0; output=$(openshift_login https://api.example:6443 token 6 0 2>&1) || rc=$?
assert_eq "fails when the API stays unreachable" "1" "${rc}"
assert_eq "gives up after six attempts by default" "6" "$(call_count)"
assert_contains "the error names the runner's Azure region" "Azure region eastus" "${output}"
assert_contains "the error says to re-run the failed job" "Re-run failed jobs" "${output}"

reset_fake 99
output=$(openshift_login https://api.example:6443 token 2 0 2>&1) || true
assert_contains "an unknown region is reported as unknown" "Azure region unknown" "${output}"
echo ""

echo "=== With oc-retry.sh sourced ==="

export CLUSTER_RETRY_WAIT_SECONDS=0
# shellcheck source=oc-retry.sh
source "${SCRIPT_DIR}/oc-retry.sh"
reset_fake 99
openshift_login https://api.example:6443 token 6 0 >/dev/null 2>&1 || true
assert_eq "the wrapper does not multiply login attempts" "6" "$(call_count)"
echo ""

# ---------- summary ----------

echo "=== Results ==="
echo "  Total:  ${TESTS_RUN}"
echo "  Passed: ${TESTS_PASSED}"
echo "  Failed: ${TESTS_FAILED}"

if [[ ${TESTS_FAILED} -gt 0 ]]; then
  exit 1
fi
