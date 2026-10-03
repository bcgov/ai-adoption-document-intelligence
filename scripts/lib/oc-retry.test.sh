#!/usr/bin/env bash
#
# oc-retry.test.sh -- Tests for oc-retry.sh
#
# Run: bash scripts/lib/oc-retry.test.sh
#
# Puts fake `oc` and `helm` executables first on PATH. Each fake records its
# arguments, fails the first FAKE_FAIL_TIMES calls with FAKE_FAIL_MSG on stderr
# and exit code FAKE_FAIL_RC, then succeeds, printing the contents of any
# `-f <file>` it was given followed by "ok".
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

assert_not_contains() {
  local description="$1"
  local needle="$2"
  local haystack="$3"
  TESTS_RUN=$((TESTS_RUN + 1))
  if [[ "${haystack}" != *"${needle}"* ]]; then
    echo "  PASS: ${description}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: ${description}"
    echo "    Expected not to contain: '${needle}'"
    echo "    Actual:                  '${haystack}'"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# ---------- fakes ----------

FAKE_DIR="$(mktemp -d)"
trap 'rm -rf "${FAKE_DIR}"' EXIT

cat > "${FAKE_DIR}/fake-cli" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "${FAKE_CALLS_FILE}"
calls=$(wc -l < "${FAKE_CALLS_FILE}")
if (( calls <= ${FAKE_FAIL_TIMES:-0} )); then
  echo "${FAKE_FAIL_MSG}" >&2
  exit "${FAKE_FAIL_RC:-1}"
fi
prev=""
for arg in "$@"; do
  if [[ "${prev}" == "-f" && -f "${arg}" ]]; then
    cat "${arg}"
  fi
  prev="${arg}"
done
echo "ok"
FAKE
chmod +x "${FAKE_DIR}/fake-cli"
ln -s "${FAKE_DIR}/fake-cli" "${FAKE_DIR}/oc"
ln -s "${FAKE_DIR}/fake-cli" "${FAKE_DIR}/helm"
export PATH="${FAKE_DIR}:${PATH}"
export FAKE_CALLS_FILE="${FAKE_DIR}/calls"

export CLUSTER_RETRY_WAIT_SECONDS=0
# shellcheck source=oc-retry.sh
source "${SCRIPT_DIR}/oc-retry.sh"

REFUSED='dial tcp 10.0.0.1:6443: connect: connection refused'
NOT_FOUND='Error from server (NotFound): deployments.apps "x" not found'

reset_fake() {
  : > "${FAKE_CALLS_FILE}"
  export FAKE_FAIL_TIMES="${1:-0}"
  export FAKE_FAIL_MSG="${2:-}"
  export FAKE_FAIL_RC="${3:-1}"
}

call_count() {
  wc -l < "${FAKE_CALLS_FILE}" | tr -d ' '
}

# ---------- tests ----------

echo "=== Retries connection failures ==="

reset_fake 2 "${REFUSED}"
rc=0; oc get pods >/dev/null 2>&1 || rc=$?
assert_eq "succeeds after two refused connections" "0" "${rc}"
assert_eq "made three calls" "3" "$(call_count)"

reset_fake 10 "${REFUSED}"
rc=0; CLUSTER_RETRY_ATTEMPTS=3 oc get pods >/dev/null 2>&1 || rc=$?
assert_eq "fails once attempts run out" "1" "${rc}"
assert_eq "stops at CLUSTER_RETRY_ATTEMPTS calls" "3" "$(call_count)"

reset_fake 1 "Unable to connect to the server: net/http: TLS handshake timeout"
rc=0; oc whoami >/dev/null 2>&1 || rc=$?
assert_eq "retries a TLS handshake timeout" "0" "${rc}"
assert_eq "made two calls" "2" "$(call_count)"

reset_fake 1 "${REFUSED}"
stderr=$(oc get pods 2>&1 >/dev/null)
assert_contains "passes the failed attempt's stderr through" "connection refused" "${stderr}"
assert_contains "logs the retry" "attempt 1/6" "${stderr}"
echo ""

echo "=== Does not retry other failures ==="

reset_fake 5 "${NOT_FOUND}"
rc=0; oc get deployment x >/dev/null 2>&1 || rc=$?
assert_eq "NotFound returns non-zero" "1" "${rc}"
assert_eq "NotFound is not retried" "1" "$(call_count)"

reset_fake 5 "error: something specific" 3
rc=0; oc apply -f /dev/null >/dev/null 2>&1 || rc=$?
assert_eq "keeps the exit code of a non-connection failure" "3" "${rc}"

reset_fake 5 "${NOT_FOUND}"
result=$(set -e; if oc get deployment x >/dev/null 2>&1; then echo found; else echo missing; fi)
assert_eq "existence check under set -e reads NotFound as missing" "missing" "${result}"
echo ""

echo "=== Re-sends a stdin manifest ==="

reset_fake 1 "${REFUSED}"
output=$(printf 'kind: Secret\n' | oc apply -f - 2>/dev/null)
assert_contains "the retry sends the manifest read from stdin" "kind: Secret" "${output}"
assert_eq "made two calls" "2" "$(call_count)"
assert_not_contains "the retry reads a file, not stdin" " -f - " " $(tail -1 "${FAKE_CALLS_FILE}") "
echo ""

echo "=== Request timeout ==="

reset_fake 0
oc get pods >/dev/null 2>&1
assert_contains "one-shot subcommands get --request-timeout" "--request-timeout=60s" "$(cat "${FAKE_CALLS_FILE}")"

reset_fake 0
oc rollout status deployment/x --timeout=300s >/dev/null 2>&1
assert_not_contains "watches get no --request-timeout" "--request-timeout" "$(cat "${FAKE_CALLS_FILE}")"

reset_fake 0
oc get pods --request-timeout=5s >/dev/null 2>&1
assert_eq "an explicit --request-timeout is kept" "get pods --request-timeout=5s" "$(cat "${FAKE_CALLS_FILE}")"
echo ""

echo "=== helm ==="

reset_fake 1 "Error: Kubernetes cluster unreachable: Get \"https://api:6443/version\": ${REFUSED}"
rc=0; helm upgrade --install x chart >/dev/null 2>&1 || rc=$?
assert_eq "retries an unreachable cluster" "0" "${rc}"
assert_eq "made two calls" "2" "$(call_count)"

reset_fake 5 "Error: UPGRADE FAILED: context deadline exceeded"
rc=0; helm upgrade --install x chart --wait --timeout 300s >/dev/null 2>&1 || rc=$?
assert_eq "its own --wait timeout fails" "1" "${rc}"
assert_eq "its own --wait timeout is not retried" "1" "$(call_count)"

reset_fake 0
helm upgrade --install x chart >/dev/null 2>&1
assert_not_contains "helm gets no --request-timeout" "--request-timeout" "$(cat "${FAKE_CALLS_FILE}")"
echo ""

# ---------- summary ----------

echo "=== Results ==="
echo "  Total:  ${TESTS_RUN}"
echo "  Passed: ${TESTS_PASSED}"
echo "  Failed: ${TESTS_FAILED}"

if [[ ${TESTS_FAILED} -gt 0 ]]; then
  exit 1
fi
