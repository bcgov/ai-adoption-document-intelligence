#!/usr/bin/env bash
#
# config-loader.test.sh -- Tests for config-loader.sh
#
# Run: bash scripts/lib/config-loader.test.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Track test results
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Temp file for capturing output without subshells
_TEST_OUTPUT_FILE=$(mktemp)

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
  local haystack="$2"
  local needle="$3"
  TESTS_RUN=$((TESTS_RUN + 1))
  if [[ "${haystack}" == *"${needle}"* ]]; then
    echo "  PASS: ${description}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: ${description}"
    echo "    Expected to contain: '${needle}'"
    echo "    In: '${haystack}'"
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

# Create a temporary config directory for tests
TEST_CONFIG_DIR=$(mktemp -d)
trap 'rm -rf "${TEST_CONFIG_DIR}" "${_TEST_OUTPUT_FILE}"' EXIT

# Create test profile files
cat > "${TEST_CONFIG_DIR}/dev.env" <<'TESTEOF'
# Dev profile test file
NODE_ENV=production
PORT=3002
SSO_AUTH_SERVER_URL=https://dev.loginproxy.gov.bc.ca/auth
SSO_REALM=standard
SSO_CLIENT_ID=test-client-dev
BLOB_STORAGE_PROVIDER=azure
AZURE_STORAGE_CONTAINER_NAME=document-blobs
TEMPORAL_ADDRESS=temporal:7233
VITE_ENV=dev
THROTTLE_AUTH_LIMIT=10
TESTEOF

cat > "${TEST_CONFIG_DIR}/prod.env" <<'TESTEOF'
# Prod profile test file
NODE_ENV=production
PORT=3002
SSO_AUTH_SERVER_URL=https://loginproxy.gov.bc.ca/auth
SSO_REALM=standard
SSO_CLIENT_ID=test-client-prod
BLOB_STORAGE_PROVIDER=azure
AZURE_STORAGE_CONTAINER_NAME=document-blobs
TEMPORAL_ADDRESS=temporal:7233
VITE_ENV=prod
THROTTLE_AUTH_LIMIT=5
TESTEOF

cat > "${TEST_CONFIG_DIR}/my-instance.env" <<'TESTEOF'
# Instance override
PORT=3003
SSO_CLIENT_ID=custom-client
CUSTOM_VAR=custom-value
TESTEOF

# Source config-loader, overriding the config directory
source "${SCRIPT_DIR}/config-loader.sh"
_CONFIG_DIR="${TEST_CONFIG_DIR}"

# ---------- Test Suite ----------

echo ""
echo "=== config-loader.sh tests ==="
echo ""

# --- Test 1: Load dev profile ---
echo "Test 1: Load dev profile"
load_config --env dev > "${_TEST_OUTPUT_FILE}" 2>&1
assert_exit_code "load_config returns 0 for dev" 0 $?
assert_eq "NODE_ENV is production" "production" "$(get_config NODE_ENV)"
assert_eq "SSO_AUTH_SERVER_URL is dev URL" "https://dev.loginproxy.gov.bc.ca/auth" "$(get_config SSO_AUTH_SERVER_URL)"
assert_eq "VITE_ENV is dev" "dev" "$(get_config VITE_ENV)"
assert_eq "THROTTLE_AUTH_LIMIT is 10 (dev)" "10" "$(get_config THROTTLE_AUTH_LIMIT)"
assert_eq "BLOB_STORAGE_PROVIDER is azure" "azure" "$(get_config BLOB_STORAGE_PROVIDER)"
echo ""

# --- Test 2: Load prod profile ---
echo "Test 2: Load prod profile"
load_config --env prod > "${_TEST_OUTPUT_FILE}" 2>&1
assert_exit_code "load_config returns 0 for prod" 0 $?
assert_eq "SSO_AUTH_SERVER_URL is prod URL" "https://loginproxy.gov.bc.ca/auth" "$(get_config SSO_AUTH_SERVER_URL)"
assert_eq "VITE_ENV is prod" "prod" "$(get_config VITE_ENV)"
assert_eq "THROTTLE_AUTH_LIMIT is 5 (prod)" "5" "$(get_config THROTTLE_AUTH_LIMIT)"
assert_eq "SSO_CLIENT_ID is test-client-prod" "test-client-prod" "$(get_config SSO_CLIENT_ID)"
echo ""

# --- Test 3: Instance override merges on top of profile ---
echo "Test 3: Instance override merges on top of profile"
load_config --env dev --instance my-instance > "${_TEST_OUTPUT_FILE}" 2>&1
assert_exit_code "load_config returns 0 with instance override" 0 $?
assert_eq "PORT overridden to 3003" "3003" "$(get_config PORT)"
assert_eq "SSO_CLIENT_ID overridden to custom-client" "custom-client" "$(get_config SSO_CLIENT_ID)"
assert_eq "CUSTOM_VAR added by instance" "custom-value" "$(get_config CUSTOM_VAR)"
# Profile defaults that were NOT overridden remain intact
assert_eq "NODE_ENV still production from profile" "production" "$(get_config NODE_ENV)"
assert_eq "BLOB_STORAGE_PROVIDER still azure from profile" "azure" "$(get_config BLOB_STORAGE_PROVIDER)"
assert_eq "VITE_ENV still dev from profile" "dev" "$(get_config VITE_ENV)"
captured_output=$(cat "${_TEST_OUTPUT_FILE}")
assert_contains "output mentions loading profile" "${captured_output}" "Loading base profile"
assert_contains "output mentions merging instance" "${captured_output}" "Merging instance overrides"
echo ""

# --- Test 4: Missing instance override file is not an error ---
echo "Test 4: Missing instance override file is not an error"
load_config --env dev --instance nonexistent-instance > "${_TEST_OUTPUT_FILE}" 2>&1
assert_exit_code "load_config returns 0 when instance file missing" 0 $?
assert_eq "PORT is profile default 3002" "3002" "$(get_config PORT)"
captured_output=$(cat "${_TEST_OUTPUT_FILE}")
assert_contains "output mentions no override file" "${captured_output}" "No instance override file found"
echo ""

# --- Test 5: Invalid profile returns error ---
echo "Test 5: Invalid profile returns error"
exit_code=0
load_config --env staging > "${_TEST_OUTPUT_FILE}" 2>&1 || exit_code=$?
assert_exit_code "load_config returns 2 for invalid profile" 2 "${exit_code}"
captured_output=$(cat "${_TEST_OUTPUT_FILE}")
assert_contains "error mentions invalid profile" "${captured_output}" "Invalid profile"
echo ""

# --- Test 6: Missing --env returns error ---
echo "Test 6: Missing --env returns error"
exit_code=0
load_config > "${_TEST_OUTPUT_FILE}" 2>&1 || exit_code=$?
assert_exit_code "load_config returns 2 when --env missing" 2 "${exit_code}"
captured_output=$(cat "${_TEST_OUTPUT_FILE}")
assert_contains "error mentions --env required" "${captured_output}" "--env is required"
echo ""

# --- Test 7: Profile selection loads correct file ---
echo "Test 7: Profile selection loads the correct file"
load_config --env dev 2>/dev/null
dev_sso=$(get_config SSO_AUTH_SERVER_URL)
load_config --env prod 2>/dev/null
prod_sso=$(get_config SSO_AUTH_SERVER_URL)
TESTS_RUN=$((TESTS_RUN + 1))
if [[ "${dev_sso}" != "${prod_sso}" ]]; then
  echo "  PASS: dev and prod profiles have different SSO URLs"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "  FAIL: dev and prod profiles should have different SSO URLs"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# --- Test 8: export_config exports to environment ---
echo "Test 8: export_config exports values to environment"
load_config --env dev 2>/dev/null
export_config
assert_eq "NODE_ENV exported" "production" "${NODE_ENV}"
assert_eq "BLOB_STORAGE_PROVIDER exported" "azure" "${BLOB_STORAGE_PROVIDER}"
echo ""

# --- Test 9: get_config returns 1 for missing key ---
echo "Test 9: get_config returns 1 for missing key"
load_config --env dev 2>/dev/null
exit_code=0
get_config NONEXISTENT_KEY >/dev/null 2>&1 || exit_code=$?
assert_exit_code "get_config returns 1 for missing key" 1 "${exit_code}"
echo ""

# --- Test 10: print_config outputs all keys ---
echo "Test 10: print_config outputs all keys"
load_config --env dev 2>/dev/null
output=$(print_config)
assert_contains "print_config includes NODE_ENV" "${output}" "NODE_ENV=production"
assert_contains "print_config includes BLOB_STORAGE_PROVIDER" "${output}" "BLOB_STORAGE_PROVIDER=azure"
assert_contains "print_config includes SSO_REALM" "${output}" "SSO_REALM=standard"
echo ""

# --- Test 11: Comments and blank lines are skipped ---
echo "Test 11: Comments and blank lines are skipped"
load_config --env dev 2>/dev/null
output=$(print_config)
TESTS_RUN=$((TESTS_RUN + 1))
if ! echo "${output}" | grep -q "^#"; then
  echo "  PASS: No comment lines in output"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "  FAIL: Comment lines found in output"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# --- Test 12: Verify actual dev.env file exists ---
echo "Test 12: Verify actual dev.env file exists"
_CONFIG_DIR="${PROJECT_ROOT}/deployments/openshift/config"
TESTS_RUN=$((TESTS_RUN + 1))
if [[ -f "${_CONFIG_DIR}/dev.env" ]]; then
  echo "  PASS: dev.env exists at expected path"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "  FAIL: dev.env not found at ${_CONFIG_DIR}/dev.env"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# --- Test 13: Verify actual prod.env file exists ---
echo "Test 13: Verify actual prod.env file exists"
TESTS_RUN=$((TESTS_RUN + 1))
if [[ -f "${_CONFIG_DIR}/prod.env" ]]; then
  echo "  PASS: prod.env exists at expected path"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "  FAIL: prod.env not found at ${_CONFIG_DIR}/prod.env"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# --- Test 14: Actual dev.env contains required SSO settings ---
echo "Test 14: Actual dev.env contains required settings"
load_config --env dev > "${_TEST_OUTPUT_FILE}" 2>&1
assert_exit_code "load actual dev.env" 0 $?
assert_eq "BLOB_STORAGE_PROVIDER is azure" "azure" "$(get_config BLOB_STORAGE_PROVIDER)"
# SSO settings must be present
sso_url=$(get_config SSO_AUTH_SERVER_URL)
TESTS_RUN=$((TESTS_RUN + 1))
if [[ -n "${sso_url}" ]]; then
  echo "  PASS: SSO_AUTH_SERVER_URL is set"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "  FAIL: SSO_AUTH_SERVER_URL is empty"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
realm=$(get_config SSO_REALM)
TESTS_RUN=$((TESTS_RUN + 1))
if [[ -n "${realm}" ]]; then
  echo "  PASS: SSO_REALM is set"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "  FAIL: SSO_REALM is empty"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
client_id=$(get_config SSO_CLIENT_ID)
TESTS_RUN=$((TESTS_RUN + 1))
if [[ -n "${client_id}" ]]; then
  echo "  PASS: SSO_CLIENT_ID is set"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "  FAIL: SSO_CLIENT_ID is empty"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# --- Test 15: Actual prod.env contains required settings ---
echo "Test 15: Actual prod.env contains required settings"
load_config --env prod > "${_TEST_OUTPUT_FILE}" 2>&1
assert_exit_code "load actual prod.env" 0 $?
assert_eq "BLOB_STORAGE_PROVIDER is azure" "azure" "$(get_config BLOB_STORAGE_PROVIDER)"
prod_sso=$(get_config SSO_AUTH_SERVER_URL)
assert_contains "prod SSO URL uses prod loginproxy" "${prod_sso}" "loginproxy.gov.bc.ca"
echo ""

# --- Test 16: Config resets between load_config calls ---
echo "Test 16: Config resets between load_config calls"
_CONFIG_DIR="${TEST_CONFIG_DIR}"
load_config --env dev --instance my-instance 2>/dev/null
assert_eq "CUSTOM_VAR present after instance load" "custom-value" "$(get_config CUSTOM_VAR)"
load_config --env dev 2>/dev/null
exit_code=0
get_config CUSTOM_VAR >/dev/null 2>&1 || exit_code=$?
assert_exit_code "CUSTOM_VAR gone after loading without instance" 1 "${exit_code}"
echo ""

# ---------- summary ----------

echo "=== Results ==="
echo "  Total:  ${TESTS_RUN}"
echo "  Passed: ${TESTS_PASSED}"
echo "  Failed: ${TESTS_FAILED}"

if [[ ${TESTS_FAILED} -gt 0 ]]; then
  exit 1
fi
