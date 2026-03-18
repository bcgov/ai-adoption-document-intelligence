#!/usr/bin/env bash
#
# instance-name.test.sh -- Tests for instance-name.sh
#
# Run: bash scripts/lib/instance-name.test.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Track test results
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

assert_exit_code() {
  local description="$1"
  local expected="$2"
  local actual="$3"
  TESTS_RUN=$((TESTS_RUN + 1))
  if [[ "${expected}" -eq "${actual}" ]]; then
    echo "  PASS: ${description}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: ${description}"
    echo "    Expected exit code: ${expected}"
    echo "    Actual exit code:   ${actual}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# ---------- setup ----------

source "${SCRIPT_DIR}/instance-name.sh"

echo ""
echo "=== instance-name.sh tests ==="
echo ""

# ========================================
# Scenario 1: Branch name is sanitized for Kubernetes
# ========================================

echo "--- Scenario 1: Branch name sanitization ---"
echo ""

echo "Test 1.1: Slashes replaced with hyphens"
result=$(sanitize_instance_name "feature/my-thing")
assert_eq "feature/my-thing -> feature-my-thing" "feature-my-thing" "${result}"
echo ""

echo "Test 1.2: Already valid name passes through unchanged"
result=$(sanitize_instance_name "my-branch")
assert_eq "my-branch -> my-branch" "my-branch" "${result}"
echo ""

echo "Test 1.3: Uppercase converted to lowercase"
result=$(sanitize_instance_name "Feature/My-Thing")
assert_eq "Feature/My-Thing -> feature-my-thing" "feature-my-thing" "${result}"
echo ""

echo "Test 1.4: Nested slashes"
result=$(sanitize_instance_name "feature/us-003/my-thing")
assert_eq "feature/us-003/my-thing -> feature-us-003-my-thing" "feature-us-003-my-thing" "${result}"
echo ""

echo "Test 1.5: Simple branch names"
result=$(sanitize_instance_name "main")
assert_eq "main -> main" "main" "${result}"
echo ""

echo "Test 1.6: Numeric branch name"
result=$(sanitize_instance_name "123")
assert_eq "123 -> 123" "123" "${result}"
echo ""

# ========================================
# Scenario 2: Special characters are handled
# ========================================

echo "--- Scenario 2: Special character handling ---"
echo ""

echo "Test 2.1: Underscores replaced with hyphens"
result=$(sanitize_instance_name "feature_my_thing")
assert_eq "feature_my_thing -> feature-my-thing" "feature-my-thing" "${result}"
echo ""

echo "Test 2.2: Dots replaced with hyphens"
result=$(sanitize_instance_name "release.1.0")
assert_eq "release.1.0 -> release-1-0" "release-1-0" "${result}"
echo ""

echo "Test 2.3: Uppercase converted to lowercase"
result=$(sanitize_instance_name "Feature-MY-THING")
assert_eq "Feature-MY-THING -> feature-my-thing" "feature-my-thing" "${result}"
echo ""

echo "Test 2.4: Multiple consecutive invalid chars collapse to single hyphen"
result=$(sanitize_instance_name "feature//my__thing")
assert_eq "feature//my__thing -> feature-my-thing" "feature-my-thing" "${result}"
echo ""

echo "Test 2.5: Leading invalid characters stripped"
result=$(sanitize_instance_name "/feature-thing")
assert_eq "/feature-thing -> feature-thing" "feature-thing" "${result}"
echo ""

echo "Test 2.6: Trailing invalid characters stripped"
result=$(sanitize_instance_name "feature-thing/")
assert_eq "feature-thing/ -> feature-thing" "feature-thing" "${result}"
echo ""

echo "Test 2.7: Mixed special characters"
result=$(sanitize_instance_name "feature/my_thing.v2@test")
assert_eq "feature/my_thing.v2@test -> feature-my-thing-v2-test" "feature-my-thing-v2-test" "${result}"
echo ""

echo "Test 2.8: Truncation to 63 characters"
long_name="this-is-a-very-long-branch-name-that-exceeds-the-sixty-three-character-kubernetes-limit"
result=$(sanitize_instance_name "${long_name}")
length=${#result}
TESTS_RUN=$((TESTS_RUN + 1))
if [[ ${length} -le 63 ]]; then
  echo "  PASS: Result length ${length} <= 63"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "  FAIL: Result length ${length} > 63"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

echo "Test 2.9: Truncation does not leave trailing hyphen"
# Name that when truncated to 63 chars would end with a hyphen
name_with_hyphen_at_63="abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxy-z0"
result=$(sanitize_instance_name "${name_with_hyphen_at_63}")
TESTS_RUN=$((TESTS_RUN + 1))
if [[ "${result}" != *- ]]; then
  echo "  PASS: No trailing hyphen after truncation"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "  FAIL: Trailing hyphen found: '${result}'"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

echo "Test 2.10: Result starts with alphanumeric"
result=$(sanitize_instance_name "-leading-hyphen")
assert_eq "-leading-hyphen -> leading-hyphen" "leading-hyphen" "${result}"
echo ""

echo "Test 2.11: Result ends with alphanumeric"
result=$(sanitize_instance_name "trailing-hyphen-")
assert_eq "trailing-hyphen- -> trailing-hyphen" "trailing-hyphen" "${result}"
echo ""

echo "Test 2.12: Empty result returns error"
exit_code=0
sanitize_instance_name "---" >/dev/null 2>&1 || exit_code=$?
assert_exit_code "All-hyphens input returns error" 1 "${exit_code}"
echo ""

# ========================================
# Scenario 3: Instance name used as resource prefix and label
# ========================================

echo "--- Scenario 3: Resource prefix and label generation ---"
echo ""

echo "Test 3.1: Resource name prefixing"
result=$(get_resource_name "feature-my-thing" "backend")
assert_eq "Prefix backend" "feature-my-thing-backend" "${result}"
echo ""

echo "Test 3.2: Resource name prefixing - frontend"
result=$(get_resource_name "feature-my-thing" "frontend")
assert_eq "Prefix frontend" "feature-my-thing-frontend" "${result}"
echo ""

echo "Test 3.3: Resource name prefixing - temporal-server"
result=$(get_resource_name "feature-my-thing" "temporal-server")
assert_eq "Prefix temporal-server" "feature-my-thing-temporal-server" "${result}"
echo ""

echo "Test 3.4: Instance label generation"
result=$(get_instance_label "feature-my-thing")
assert_eq "Instance label" "app.kubernetes.io/instance=feature-my-thing" "${result}"
echo ""

echo "Test 3.5: Instance selector generation"
result=$(get_instance_selector "feature-my-thing")
assert_eq "Instance selector" "app.kubernetes.io/instance=feature-my-thing" "${result}"
echo ""

echo "Test 3.6: Resource prefix with simple instance name"
result=$(get_resource_name "main" "backend")
assert_eq "Prefix with simple name" "main-backend" "${result}"
echo ""

# ========================================
# Scenario 4: Manual instance name override
# ========================================

echo "--- Scenario 4: Manual instance name override ---"
echo ""

echo "Test 4.1: --instance overrides git branch"
result=$(resolve_instance_name --instance "my-custom-name")
assert_eq "--instance override" "my-custom-name" "${result}"
echo ""

echo "Test 4.2: --instance value is sanitized"
result=$(resolve_instance_name --instance "My_Custom.Name")
assert_eq "--instance value sanitized" "my-custom-name" "${result}"
echo ""

echo "Test 4.3: --instance with other args is still picked up"
result=$(resolve_instance_name --env dev --instance "custom-name" --namespace test)
assert_eq "--instance among other args" "custom-name" "${result}"
echo ""

echo "Test 4.4: --instance without value returns error"
exit_code=0
resolve_instance_name --instance 2>/dev/null || exit_code=$?
assert_exit_code "--instance without value returns 1" 1 "${exit_code}"
echo ""

echo "Test 4.5: No --instance falls back to git branch"
# We are in a git repo, so this should work
result=$(resolve_instance_name)
exit_code=$?
assert_exit_code "resolve_instance_name without --instance succeeds" 0 "${exit_code}"
TESTS_RUN=$((TESTS_RUN + 1))
if [[ -n "${result}" ]]; then
  echo "  PASS: Got instance name from git branch: '${result}'"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "  FAIL: Empty instance name from git branch"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

echo "Test 4.6: Git branch derived name is sanitized"
# The current branch name should be sanitized (whatever it is)
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
expected=$(sanitize_instance_name "${branch}")
result=$(resolve_instance_name)
assert_eq "Git branch name is sanitized" "${expected}" "${result}"
echo ""

# ---------- summary ----------

echo "=== Results ==="
echo "  Total:  ${TESTS_RUN}"
echo "  Passed: ${TESTS_PASSED}"
echo "  Failed: ${TESTS_FAILED}"

if [[ ${TESTS_FAILED} -gt 0 ]]; then
  exit 1
fi
