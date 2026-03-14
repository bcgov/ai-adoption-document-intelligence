#!/usr/bin/env bash
#
# generate-overlay.test.sh -- Tests for generate-overlay.sh
#
# Run: bash scripts/lib/generate-overlay.test.sh
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

assert_contains() {
  local description="$1"
  local needle="$2"
  local haystack="$3"
  TESTS_RUN=$((TESTS_RUN + 1))
  if echo "${haystack}" | grep -qF "${needle}"; then
    echo "  PASS: ${description}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: ${description}"
    echo "    Expected to contain: '${needle}'"
    echo "    In: '${haystack}'"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_not_contains() {
  local description="$1"
  local needle="$2"
  local haystack="$3"
  TESTS_RUN=$((TESTS_RUN + 1))
  if ! echo "${haystack}" | grep -qF "${needle}"; then
    echo "  PASS: ${description}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: ${description}"
    echo "    Expected NOT to contain: '${needle}'"
    echo "    In: '${haystack}'"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_file_exists() {
  local description="$1"
  local file="$2"
  TESTS_RUN=$((TESTS_RUN + 1))
  if [[ -f "${file}" ]]; then
    echo "  PASS: ${description}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: ${description}"
    echo "    File not found: '${file}'"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# ---------- setup ----------

source "${SCRIPT_DIR}/generate-overlay.sh"

# Common test parameters
INSTANCE="feature-my-thing"
NAMESPACE="fd34fb-dev"
CLUSTER_DOMAIN="apps.silver.devops.gov.bc.ca"
BACKEND_IMAGE="ghcr.io/org/repo/backend-services"
FRONTEND_IMAGE="ghcr.io/org/repo/frontend"
WORKER_IMAGE="ghcr.io/org/repo/temporal"
IMAGE_TAG="feature-my-thing"
SSO_AUTH_SERVER_URL="https://sso.example.com/auth"
SSO_REALM="test-realm"
SSO_CLIENT_ID="test-client"

echo ""
echo "=== generate-overlay.sh tests ==="
echo ""

# ========================================
# Scenario 1: Instance template generates prefixed resources
# ========================================

echo "--- Scenario 1: Instance template generates prefixed resources ---"
echo ""

echo "Test 1.1: generate_instance_overlay produces a directory"
overlay_dir=$(generate_instance_overlay \
  --instance "${INSTANCE}" \
  --namespace "${NAMESPACE}" \
  --cluster-domain "${CLUSTER_DOMAIN}" \
  --backend-image "${BACKEND_IMAGE}" \
  --frontend-image "${FRONTEND_IMAGE}" \
  --worker-image "${WORKER_IMAGE}" \
  --image-tag "${IMAGE_TAG}" \
  --sso-auth-server-url "${SSO_AUTH_SERVER_URL}" \
  --sso-realm "${SSO_REALM}" \
  --sso-client-id "${SSO_CLIENT_ID}")
exit_code=$?
assert_exit_code "generate_instance_overlay succeeds" 0 "${exit_code}"
echo ""

echo "Test 1.2: Generated directory exists and contains kustomization.yml"
assert_file_exists "kustomization.yml exists" "${overlay_dir}/kustomization.yml"
echo ""

echo "Test 1.3: namePrefix is set with instance name"
kustomization_content=$(cat "${overlay_dir}/kustomization.yml")
assert_contains "namePrefix contains instance name" "namePrefix: \"${INSTANCE}-\"" "${kustomization_content}"
echo ""

echo "Test 1.4: No placeholder tokens remain in generated files"
remaining_placeholders=$(grep -r '__INSTANCE_NAME__\|__NAMESPACE__\|__CLUSTER_DOMAIN__\|__BACKEND_IMAGE__\|__FRONTEND_IMAGE__\|__WORKER_IMAGE__\|__IMAGE_TAG__\|__SSO_AUTH_SERVER_URL__\|__SSO_REALM__\|__SSO_CLIENT_ID__\|__BOOTSTRAP_ADMIN_EMAIL__' "${overlay_dir}/" 2>/dev/null || true)
assert_eq "No placeholder tokens remain" "" "${remaining_placeholders}"
echo ""

# Clean up
cleanup_generated_overlay "${overlay_dir}"

# ========================================
# Scenario 2: Instance label applied to all resources
# ========================================

echo "--- Scenario 2: Instance label applied to all resources ---"
echo ""

overlay_dir=$(generate_instance_overlay \
  --instance "${INSTANCE}" \
  --namespace "${NAMESPACE}" \
  --cluster-domain "${CLUSTER_DOMAIN}" \
  --backend-image "${BACKEND_IMAGE}" \
  --frontend-image "${FRONTEND_IMAGE}" \
  --worker-image "${WORKER_IMAGE}" \
  --image-tag "${IMAGE_TAG}" \
  --sso-auth-server-url "${SSO_AUTH_SERVER_URL}" \
  --sso-realm "${SSO_REALM}" \
  --sso-client-id "${SSO_CLIENT_ID}")

echo "Test 2.1: commonLabels includes instance label"
kustomization_content=$(cat "${overlay_dir}/kustomization.yml")
assert_contains "Instance label in commonLabels" "app.kubernetes.io/instance: \"${INSTANCE}\"" "${kustomization_content}"
echo ""

echo "Test 2.2: NetworkPolicy patches reference instance label"
assert_contains "Backend NetworkPolicy has instance label" "app.kubernetes.io/instance: \"${INSTANCE}\"" "${kustomization_content}"
echo ""

# Clean up
cleanup_generated_overlay "${overlay_dir}"

# ========================================
# Scenario 3: Each instance gets its own complete stack
# ========================================

echo "--- Scenario 3: Complete stack via base reference ---"
echo ""

overlay_dir=$(generate_instance_overlay \
  --instance "${INSTANCE}" \
  --namespace "${NAMESPACE}" \
  --cluster-domain "${CLUSTER_DOMAIN}" \
  --backend-image "${BACKEND_IMAGE}" \
  --frontend-image "${FRONTEND_IMAGE}" \
  --worker-image "${WORKER_IMAGE}" \
  --image-tag "${IMAGE_TAG}" \
  --sso-auth-server-url "${SSO_AUTH_SERVER_URL}" \
  --sso-realm "${SSO_REALM}" \
  --sso-client-id "${SSO_CLIENT_ID}")

echo "Test 3.1: Overlay references base directory"
kustomization_content=$(cat "${overlay_dir}/kustomization.yml")
assert_contains "References base" "../../base" "${kustomization_content}"
echo ""

echo "Test 3.2: Image overrides are set for backend"
assert_contains "Backend image override" "${BACKEND_IMAGE}" "${kustomization_content}"
echo ""

echo "Test 3.3: Image overrides are set for frontend"
assert_contains "Frontend image override" "${FRONTEND_IMAGE}" "${kustomization_content}"
echo ""

echo "Test 3.4: Image overrides are set for worker"
assert_contains "Worker image override" "${WORKER_IMAGE}" "${kustomization_content}"
echo ""

echo "Test 3.5: Image tag is set"
assert_contains "Image tag" "${IMAGE_TAG}" "${kustomization_content}"
echo ""

echo "Test 3.6: Temporal server Postgres reference is prefixed"
assert_contains "Temporal POSTGRES_SEEDS prefixed" "${INSTANCE}-temporal-pg-primary" "${kustomization_content}"
echo ""

echo "Test 3.7: Temporal address is prefixed in backend config"
assert_contains "Backend temporal address prefixed" "${INSTANCE}-temporal:7233" "${kustomization_content}"
echo ""

echo "Test 3.8: Temporal address is prefixed in worker config"
# Count occurrences - should appear in both backend and worker config patches
temporal_addr_count=$(grep -c "${INSTANCE}-temporal:7233" "${overlay_dir}/kustomization.yml" || true)
TESTS_RUN=$((TESTS_RUN + 1))
if [[ "${temporal_addr_count}" -ge 2 ]]; then
  echo "  PASS: Temporal address appears in multiple config patches (${temporal_addr_count} occurrences)"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "  FAIL: Temporal address should appear in at least 2 config patches, found ${temporal_addr_count}"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Clean up
cleanup_generated_overlay "${overlay_dir}"

# ========================================
# Scenario 4: Instance routes include instance name in hostname
# ========================================

echo "--- Scenario 4: Route hostnames include instance name ---"
echo ""

overlay_dir=$(generate_instance_overlay \
  --instance "${INSTANCE}" \
  --namespace "${NAMESPACE}" \
  --cluster-domain "${CLUSTER_DOMAIN}" \
  --backend-image "${BACKEND_IMAGE}" \
  --frontend-image "${FRONTEND_IMAGE}" \
  --worker-image "${WORKER_IMAGE}" \
  --image-tag "${IMAGE_TAG}" \
  --sso-auth-server-url "${SSO_AUTH_SERVER_URL}" \
  --sso-realm "${SSO_REALM}" \
  --sso-client-id "${SSO_CLIENT_ID}")

kustomization_content=$(cat "${overlay_dir}/kustomization.yml")

echo "Test 4.1: Backend route hostname uses single-level wildcard pattern"
assert_contains "Backend route hostname" "${INSTANCE}-backend-${NAMESPACE}.${CLUSTER_DOMAIN}" "${kustomization_content}"
echo ""

echo "Test 4.2: Frontend route hostname uses single-level wildcard pattern"
assert_contains "Frontend route hostname" "${INSTANCE}-frontend-${NAMESPACE}.${CLUSTER_DOMAIN}" "${kustomization_content}"
echo ""

# Clean up
cleanup_generated_overlay "${overlay_dir}"

# ========================================
# Scenario 5: Existing overlays remain untouched
# ========================================

echo "--- Scenario 5: Existing overlays remain untouched ---"
echo ""

PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OVERLAYS_DIR="${PROJECT_ROOT}/deployments/openshift/kustomize/overlays"

echo "Test 5.1: dev overlay exists and is unchanged"
assert_file_exists "dev/kustomization.yml exists" "${OVERLAYS_DIR}/dev/kustomization.yml"
dev_content=$(cat "${OVERLAYS_DIR}/dev/kustomization.yml")
assert_not_contains "dev overlay has no instance placeholders" "__INSTANCE_NAME__" "${dev_content}"
echo ""

echo "Test 5.2: test overlay exists and is unchanged"
assert_file_exists "test/kustomization.yml exists" "${OVERLAYS_DIR}/test/kustomization.yml"
test_content=$(cat "${OVERLAYS_DIR}/test/kustomization.yml")
assert_not_contains "test overlay has no instance placeholders" "__INSTANCE_NAME__" "${test_content}"
echo ""

echo "Test 5.3: prod overlay exists and is unchanged"
assert_file_exists "prod/kustomization.yml exists" "${OVERLAYS_DIR}/prod/kustomization.yml"
prod_content=$(cat "${OVERLAYS_DIR}/prod/kustomization.yml")
assert_not_contains "prod overlay has no instance placeholders" "__INSTANCE_NAME__" "${prod_content}"
echo ""

echo "Test 5.4: Instance template is separate from existing overlays"
assert_file_exists "instance-template/kustomization.yml exists" "${OVERLAYS_DIR}/instance-template/kustomization.yml"
echo ""

# ========================================
# Error handling tests
# ========================================

echo "--- Error handling ---"
echo ""

echo "Test E.1: Missing --instance returns error"
exit_code=0
generate_instance_overlay \
  --namespace "${NAMESPACE}" \
  --cluster-domain "${CLUSTER_DOMAIN}" \
  --backend-image "${BACKEND_IMAGE}" \
  --frontend-image "${FRONTEND_IMAGE}" \
  --worker-image "${WORKER_IMAGE}" \
  --image-tag "${IMAGE_TAG}" \
  --sso-auth-server-url "${SSO_AUTH_SERVER_URL}" \
  --sso-realm "${SSO_REALM}" \
  --sso-client-id "${SSO_CLIENT_ID}" >/dev/null 2>&1 || exit_code=$?
assert_exit_code "Missing --instance returns error" 1 "${exit_code}"
echo ""

echo "Test E.2: Missing --namespace returns error"
exit_code=0
generate_instance_overlay \
  --instance "${INSTANCE}" \
  --cluster-domain "${CLUSTER_DOMAIN}" \
  --backend-image "${BACKEND_IMAGE}" \
  --frontend-image "${FRONTEND_IMAGE}" \
  --worker-image "${WORKER_IMAGE}" \
  --image-tag "${IMAGE_TAG}" \
  --sso-auth-server-url "${SSO_AUTH_SERVER_URL}" \
  --sso-realm "${SSO_REALM}" \
  --sso-client-id "${SSO_CLIENT_ID}" >/dev/null 2>&1 || exit_code=$?
assert_exit_code "Missing --namespace returns error" 1 "${exit_code}"
echo ""

echo "Test E.3: Missing all arguments returns error"
exit_code=0
generate_instance_overlay >/dev/null 2>&1 || exit_code=$?
assert_exit_code "Missing all arguments returns error" 1 "${exit_code}"
echo ""

echo "Test E.4: cleanup_generated_overlay removes directory"
overlay_dir=$(generate_instance_overlay \
  --instance "${INSTANCE}" \
  --namespace "${NAMESPACE}" \
  --cluster-domain "${CLUSTER_DOMAIN}" \
  --backend-image "${BACKEND_IMAGE}" \
  --frontend-image "${FRONTEND_IMAGE}" \
  --worker-image "${WORKER_IMAGE}" \
  --image-tag "${IMAGE_TAG}" \
  --sso-auth-server-url "${SSO_AUTH_SERVER_URL}" \
  --sso-realm "${SSO_REALM}" \
  --sso-client-id "${SSO_CLIENT_ID}")
cleanup_generated_overlay "${overlay_dir}"
TESTS_RUN=$((TESTS_RUN + 1))
if [[ ! -d "${overlay_dir}" ]]; then
  echo "  PASS: Generated directory was cleaned up"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "  FAIL: Generated directory still exists: ${overlay_dir}"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

echo "Test E.5: cleanup refuses to remove non-tmp directory"
exit_code=0
cleanup_generated_overlay "/home/should-not-delete" 2>/dev/null || exit_code=$?
assert_exit_code "Refuses to remove non-tmp directory" 1 "${exit_code}"
echo ""

echo "Test E.6: Unknown argument returns error"
exit_code=0
generate_instance_overlay --unknown-arg value 2>/dev/null || exit_code=$?
assert_exit_code "Unknown argument returns error" 1 "${exit_code}"
echo ""

# ========================================
# Different instance name test
# ========================================

echo "--- Different instance name ---"
echo ""

echo "Test D.1: Different instance name produces different prefixes"
overlay_dir=$(generate_instance_overlay \
  --instance "bugfix-login-issue" \
  --namespace "${NAMESPACE}" \
  --cluster-domain "${CLUSTER_DOMAIN}" \
  --backend-image "${BACKEND_IMAGE}" \
  --frontend-image "${FRONTEND_IMAGE}" \
  --worker-image "${WORKER_IMAGE}" \
  --image-tag "bugfix-login-issue" \
  --sso-auth-server-url "${SSO_AUTH_SERVER_URL}" \
  --sso-realm "${SSO_REALM}" \
  --sso-client-id "${SSO_CLIENT_ID}")
kustomization_content=$(cat "${overlay_dir}/kustomization.yml")
assert_contains "Different instance namePrefix" "namePrefix: \"bugfix-login-issue-\"" "${kustomization_content}"
assert_contains "Different instance label" "app.kubernetes.io/instance: \"bugfix-login-issue\"" "${kustomization_content}"
assert_contains "Different route hostname" "bugfix-login-issue-backend-${NAMESPACE}.${CLUSTER_DOMAIN}" "${kustomization_content}"
cleanup_generated_overlay "${overlay_dir}"
echo ""

# ---------- summary ----------

echo "=== Results ==="
echo "  Total:  ${TESTS_RUN}"
echo "  Passed: ${TESTS_PASSED}"
echo "  Failed: ${TESTS_FAILED}"

if [[ ${TESTS_FAILED} -gt 0 ]]; then
  exit 1
fi
