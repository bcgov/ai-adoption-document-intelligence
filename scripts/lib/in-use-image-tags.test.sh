#!/usr/bin/env bash
#
# in-use-image-tags.test.sh -- Tests for in-use-image-tags.sh
#
# Run: bash scripts/lib/in-use-image-tags.test.sh
#
# Replaces `oc` with a shell function that records its arguments in
# OC_ARGS_FILE (it runs in the command substitution's subshell) and prints
# FAKE_JSON, or fails when FAKE_FAIL is set.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=in-use-image-tags.sh
source "${SCRIPT_DIR}/in-use-image-tags.sh"

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

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

FAKE_JSON=""
FAKE_FAIL=""
OC_ARGS_FILE=$(mktemp)
trap 'rm -f "${OC_ARGS_FILE}"' EXIT

oc() {
  echo "$*" > "${OC_ARGS_FILE}"
  if [[ -n "${FAKE_FAIL}" ]]; then
    echo "error: dial tcp: i/o timeout" >&2
    return 1
  fi
  printf '%s' "${FAKE_JSON}"
}

REG="artifacts.developer.gov.bc.ca/kfd3-fd34fb-local"

echo "in_use_image_tags"

FAKE_JSON=$(cat <<EOF
{"items": [
  {"kind": "Deployment", "spec": {"template": {"spec": {
    "initContainers": [{"name": "migrate-db", "image": "${REG}/backend-services:bcgov-di-test-aaaaaaaaaaaa"}],
    "containers": [{"name": "backend", "image": "${REG}/backend-services:bcgov-di-test-aaaaaaaaaaaa"}]}}}},
  {"kind": "Pod", "spec": {"containers": [{"name": "frontend", "image": "${REG}/frontend:bcgov-di-test-bbbbbbbbbbbb"}]},
   "status": {"containerStatuses": [{"image": "${REG}/frontend:status-only-tag"}]}},
  {"kind": "Deployment", "spec": {"template": {"spec": {"containers": [
    {"name": "ui", "image": "docker.io/temporalio/ui:2.25.0"},
    {"name": "ches", "image": "${REG}/ches-adapter:bcgov-di-test"}]}}}},
  {"kind": "CronJob", "spec": {"jobTemplate": {"spec": {"template": {"spec": {"containers": [
    {"name": "retention", "image": "${REG}/backend-services:bcgov-di-test-cccccccccccc"}]}}}}}},
  {"kind": "Pod", "spec": {"containers": [{"name": "pinned", "image": "${REG}/temporal@sha256:0123abcd"}]}}
]}
EOF
)
out=$(in_use_image_tags fd34fb-test)
assert_eq "collects tags from Pods, Deployments, init containers and CronJobs, sorted and unique" \
  "bcgov-di-test
bcgov-di-test-aaaaaaaaaaaa
bcgov-di-test-bbbbbbbbbbbb
bcgov-di-test-cccccccccccc" "${out}"
assert_eq "reads the five workload kinds in the given namespace" \
  "get pods,deployments,statefulsets,jobs,cronjobs -n fd34fb-test -o json" "$(cat "${OC_ARGS_FILE}")"

FAKE_JSON='{"items": []}'
status=0
out=$(in_use_image_tags fd34fb-test) || status=$?
assert_eq "an empty namespace prints nothing" "" "${out}"
assert_eq "an empty namespace still succeeds" "0" "${status}"

FAKE_FAIL=1
status=0
out=$(in_use_image_tags fd34fb-test 2>/dev/null) || status=$?
assert_eq "a failed lookup prints nothing" "" "${out}"
assert_eq "a failed lookup returns 1" "1" "${status}"
FAKE_FAIL=""

FAKE_JSON='not json'
status=0
out=$(in_use_image_tags fd34fb-test 2>/dev/null) || status=$?
assert_eq "an unreadable response prints nothing" "" "${out}"
assert_eq "an unreadable response returns non-zero" "1" "$([[ ${status} -ne 0 ]] && echo 1 || echo 0)"

echo ""
echo "Results: ${TESTS_PASSED}/${TESTS_RUN} passed, ${TESTS_FAILED} failed"
[[ "${TESTS_FAILED}" -eq 0 ]]
