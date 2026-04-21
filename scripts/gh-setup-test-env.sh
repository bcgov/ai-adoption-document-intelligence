#!/usr/bin/env bash
#
# gh-setup-test-env.sh — One-off bootstrap for the GitHub `test` environment.
#
# Creates the GitHub `test` environment (no protection rules) and populates it
# with secrets needed by the Deploy Instance workflow to deploy to `fd34fb-test`.
#
# Secret sources:
#   - Bulk-loaded from deployments/openshift/config/dev.env (same values as dev)
#   - OPENSHIFT_TOKEN  overridden from .oc-deploy/token-fd34fb-test
#   - OPENSHIFT_NAMESPACE set to literal "fd34fb-test"
#   - OPENSHIFT_SERVER   set to the silver cluster API URL
#
# SAFETY: Secret values never touch stdout. Only key names and progress messages
# are printed. The `gh secret set` calls read values via stdin or --body (passed
# as argv to gh which handles it safely).
#
# Prerequisites:
#   - gh CLI installed and authenticated against bcgov/ai-adoption-document-intelligence
#   - deployments/openshift/config/dev.env present and up-to-date
#   - .oc-deploy/token-fd34fb-test present (test SA token)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

REPO="bcgov/ai-adoption-document-intelligence"
ENV_NAME="test"
DEV_ENV_FILE="${PROJECT_ROOT}/deployments/openshift/config/dev.env"
TEST_SA_TOKEN_FILE="${PROJECT_ROOT}/.oc-deploy/token-fd34fb-test"
OPENSHIFT_SERVER_URL="https://api.silver.devops.gov.bc.ca:6443"
OPENSHIFT_NAMESPACE_VALUE="fd34fb-test"

log_info()  { echo "[INFO]  $*"; }
log_ok()    { echo "[OK]    $*"; }
log_error() { echo "[ERROR] $*" >&2; }

# ---------- preflight ----------

if ! command -v gh &>/dev/null; then
  log_error "gh CLI is not installed."
  exit 1
fi

if [[ ! -f "${DEV_ENV_FILE}" ]]; then
  log_error "dev.env not found at ${DEV_ENV_FILE}"
  exit 1
fi

if [[ ! -f "${TEST_SA_TOKEN_FILE}" ]]; then
  log_error "Test SA token not found at ${TEST_SA_TOKEN_FILE}"
  log_error "Mint it first (oc create serviceaccount / oc create token) in namespace ${OPENSHIFT_NAMESPACE_VALUE}."
  exit 1
fi

# ---------- create environment ----------

log_info "Ensuring GitHub environment '${ENV_NAME}' exists in ${REPO}..."
# PUT with no body creates the environment with defaults (no protection rules,
# no reviewers, no deployment branch policy) — which is what we want for test.
gh api --silent -X PUT "/repos/${REPO}/environments/${ENV_NAME}" >/dev/null
log_ok "Environment '${ENV_NAME}' ready."

# ---------- bulk-load from dev.env ----------
# `gh secret set -f FILE --env E` reads KEY=VALUE lines and sets each without
# echoing values. This is the safest way to move many secrets at once.

log_info "Loading secrets from dev.env into '${ENV_NAME}' (values not printed)..."
DEV_KEY_COUNT=$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=' "${DEV_ENV_FILE}" || true)
gh secret set -f "${DEV_ENV_FILE}" --env "${ENV_NAME}" --repo "${REPO}" >/dev/null
log_ok "Loaded ${DEV_KEY_COUNT} secrets from dev.env."

# ---------- override OpenShift-specific secrets ----------

log_info "Setting OPENSHIFT_TOKEN from ${TEST_SA_TOKEN_FILE} (piped, not echoed)..."
gh secret set OPENSHIFT_TOKEN --env "${ENV_NAME}" --repo "${REPO}" < "${TEST_SA_TOKEN_FILE}" >/dev/null
log_ok "OPENSHIFT_TOKEN set."

log_info "Setting OPENSHIFT_NAMESPACE=${OPENSHIFT_NAMESPACE_VALUE}..."
gh secret set OPENSHIFT_NAMESPACE --env "${ENV_NAME}" --repo "${REPO}" --body "${OPENSHIFT_NAMESPACE_VALUE}" >/dev/null
log_ok "OPENSHIFT_NAMESPACE set."

log_info "Setting OPENSHIFT_SERVER=${OPENSHIFT_SERVER_URL}..."
gh secret set OPENSHIFT_SERVER --env "${ENV_NAME}" --repo "${REPO}" --body "${OPENSHIFT_SERVER_URL}" >/dev/null
log_ok "OPENSHIFT_SERVER set."

# ---------- summary ----------

echo ""
log_ok "Test environment bootstrap complete."
log_info "Verify with: gh secret list --env ${ENV_NAME} --repo ${REPO}"
