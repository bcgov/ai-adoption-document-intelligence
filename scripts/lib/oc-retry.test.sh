#!/usr/bin/env bash
#
# oc-retry.test.sh -- Tests for oc-retry.sh
#
# Run: bash scripts/lib/oc-retry.test.sh
#
# Puts fake `oc` and `helm` executables first on PATH. Each fake records its
# arguments, fails the first FAKE_FAIL_TIMES calls with FAKE_FAIL_MSG on stderr
# (a "|"-separated list gives one message per failing call, the last one
# repeating) and exit code FAKE_FAIL_RC, then succeeds, printing the contents
# of any `-f <file>` it was given followed by "ok". `helm history` prints
# FAKE_HELM_HISTORY and `helm rollback` succeeds; neither counts as a call for
# the failure sequence.
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
case "$1" in
  history) echo "${FAKE_HELM_HISTORY:-[]}"; exit 0 ;;
  rollback) exit 0 ;;
esac
echo "$*" >> "${FAKE_CALLS_FILE}.main"
calls=$(wc -l < "${FAKE_CALLS_FILE}.main")
if (( calls <= ${FAKE_FAIL_TIMES:-0} )); then
  msg=$(cut -d'|' -f"${calls}" <<< "${FAKE_FAIL_MSG}")
  echo "${msg:-${FAKE_FAIL_MSG##*|}}" >&2
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
  : > "${FAKE_CALLS_FILE}.main"
  export FAKE_FAIL_TIMES="${1:-0}"
  export FAKE_FAIL_MSG="${2:-}"
  export FAKE_FAIL_RC="${3:-1}"
  export FAKE_HELM_HISTORY="[]"
}

# Calls other than helm history/rollback.
call_count() {
  wc -l < "${FAKE_CALLS_FILE}.main" | tr -d ' '
}

# A helm history timestamp N minutes ago, with nanoseconds like helm prints.
helm_time() {
  python3 -c "from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc) - timedelta(minutes=$1)).strftime('%Y-%m-%dT%H:%M:%S.%f') + '123Z')"
}

# A history whose latest revision (67) is pending-upgrade, updated N minutes ago.
pending_history() {
  echo "[{\"revision\":66,\"updated\":\"$(helm_time 60)\",\"status\":\"deployed\"},{\"revision\":67,\"updated\":\"$(helm_time "$1")\",\"status\":\"pending-upgrade\"}]"
}

IN_PROGRESS='Error: UPGRADE FAILED: another operation (install/upgrade/rollback) is in progress'
MID_UPGRADE="Error: UPGRADE FAILED: could not get information about the resource: ${REFUSED}"

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

echo "=== helm upgrade and a pending release ==="

reset_fake 0
FAKE_HELM_HISTORY="$(pending_history 20)"
helm upgrade --install rel chart --namespace ns >/dev/null 2>&1
assert_eq "a pending release older than 10 minutes is rolled back before the upgrade" \
  "history rel -n ns --max 20 -o json|rollback rel 66 -n ns|upgrade --install rel chart --namespace ns" \
  "$(paste -sd'|' "${FAKE_CALLS_FILE}")"

reset_fake 5 "${IN_PROGRESS}"
FAKE_HELM_HISTORY="$(pending_history 1)"
rc=0; helm upgrade --install rel chart --namespace ns >/dev/null 2>&1 || rc=$?
assert_eq "a recently pending release (another run may own it) fails the upgrade" "1" "${rc}"
assert_not_contains "a recently pending release is not rolled back" "rollback" "$(cat "${FAKE_CALLS_FILE}")"
assert_eq "\"in progress\" without an earlier connection error is not retried" "1" "$(call_count)"

reset_fake 2 "${MID_UPGRADE}|${IN_PROGRESS}"
FAKE_HELM_HISTORY="$(pending_history 0)"
rc=0; output=$(helm upgrade --install rel chart --namespace ns 2>&1 >/dev/null) || rc=$?
assert_eq "recovers from its own mid-upgrade connection failure" "0" "${rc}"
assert_eq "made three upgrade attempts" "3" "$(call_count)"
assert_contains "rolls its own pending revision back before retrying" "rollback rel 66 -n ns" "$(cat "${FAKE_CALLS_FILE}")"
assert_contains "logs the rollback" "revision 67 is pending-upgrade; rolling back to revision 66" "${output}"

reset_fake 0
FAKE_HELM_HISTORY="$(pending_history 20)"
helm upgrade -n ns --install rel chart -f values.yaml --set a=b >/dev/null 2>&1
assert_contains "finds the release and namespace around value flags" "rollback rel 66 -n ns" "$(cat "${FAKE_CALLS_FILE}")"

reset_fake 0
FAKE_HELM_HISTORY="$(pending_history 20)"
helm upgrade --install rel chart >/dev/null 2>&1
assert_not_contains "without a namespace the release history is not touched" "history" "$(cat "${FAKE_CALLS_FILE}")"
echo ""

# ---------- summary ----------

echo "=== Results ==="
echo "  Total:  ${TESTS_RUN}"
echo "  Passed: ${TESTS_PASSED}"
echo "  Failed: ${TESTS_FAILED}"

if [[ ${TESTS_FAILED} -gt 0 ]]; then
  exit 1
fi
