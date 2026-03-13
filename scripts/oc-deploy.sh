#!/usr/bin/env bash
#
# oc-deploy.sh — Deploy a fully isolated instance of the application stack to OpenShift.
#
# Deploys frontend, backend, Temporal server + worker + UI, and Crunchy PostgreSQL
# database as a named instance within the target namespace.
#
# Usage:
#   ./scripts/oc-deploy.sh --env dev
#   ./scripts/oc-deploy.sh --env dev --instance my-custom-name
#
# Prerequisites:
#   - .oc-deploy-token exists (created by oc-setup-sa.sh)
#   - Code pushed to GitHub (images are built from the remote branch)
#   - gh CLI installed and authenticated (for triggering image builds)
#   - oc CLI installed
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source library functions
source "${SCRIPT_DIR}/lib/config-loader.sh"
source "${SCRIPT_DIR}/lib/instance-name.sh"
source "${SCRIPT_DIR}/lib/generate-overlay.sh"

TOKEN_FILE="${PROJECT_ROOT}/.oc-deploy/token"
GITHUB_REPO="bcgov/ai-adoption-document-intelligence"
REGISTRY="ghcr.io"
IMAGE_BASE="${REGISTRY}/${GITHUB_REPO}"
WORKFLOW_FILE="build-instance-images.yml"

# ---------- helpers ----------

usage() {
  cat <<EOF
Usage: $(basename "$0") --env <dev|prod> [--instance <name>]

Deploys the full application stack as an isolated instance on OpenShift.

Options:
  --env, -e       Environment profile: dev or prod (required)
  --instance, -i  Instance name override (default: derived from git branch)
  --help, -h      Show this help message
EOF
}

log_info() {
  echo "[INFO] $*"
}

log_error() {
  echo "[ERROR] $*" >&2
}

log_step() {
  echo ""
  echo "========================================"
  echo "  $*"
  echo "========================================"
}

# ---------- argument parsing ----------

ENV_PROFILE=""
INSTANCE_OVERRIDE=""
PASS_THROUGH_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env|-e)
      if [[ -z "${2:-}" ]]; then
        log_error "--env requires a value (dev or prod)"
        exit 1
      fi
      ENV_PROFILE="$2"
      shift 2
      ;;
    --instance|-i)
      if [[ -z "${2:-}" ]]; then
        log_error "--instance requires a value"
        exit 1
      fi
      INSTANCE_OVERRIDE="$2"
      PASS_THROUGH_ARGS+=(--instance "$2")
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${ENV_PROFILE}" ]]; then
  log_error "--env is required (dev or prod)"
  usage
  exit 1
fi

# ============================================================
# Step 1: Token validation
# ============================================================
log_step "Step 1: Validating deployment token"

if [[ ! -f "${TOKEN_FILE}" ]]; then
  log_error "Deployment token not found at ${TOKEN_FILE}"
  log_error "Please run './scripts/oc-setup-sa.sh --namespace <namespace>' first to create a service account and token."
  exit 1
fi

# Read token file values
NAMESPACE=""
SERVER=""
TOKEN=""

while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line}" ]] && continue
  [[ "${line}" =~ ^[[:space:]]*# ]] && continue
  case "${line}" in
    NAMESPACE=*) NAMESPACE="${line#NAMESPACE=}" ;;
    SERVER=*)    SERVER="${line#SERVER=}" ;;
    TOKEN=*)     TOKEN="${line#TOKEN=}" ;;
  esac
done < "${TOKEN_FILE}"

if [[ -z "${NAMESPACE}" || -z "${SERVER}" || -z "${TOKEN}" ]]; then
  log_error "Token file is incomplete. Expected NAMESPACE, SERVER, and TOKEN values."
  log_error "Please re-run './scripts/oc-setup-sa.sh --namespace <namespace>' to regenerate."
  exit 1
fi

log_info "Token loaded for namespace: ${NAMESPACE}"
log_info "Server: ${SERVER}"

# Log in to OpenShift using the service account token
oc login "${SERVER}" --token="${TOKEN}" --insecure-skip-tls-verify=true &>/dev/null || {
  log_error "Failed to authenticate with OpenShift. Token may have expired."
  log_error "Please re-run './scripts/oc-setup-sa.sh --namespace ${NAMESPACE}' to regenerate."
  exit 1
}

oc get pods -n "${NAMESPACE}" --no-headers &>/dev/null || {
  log_error "Cannot access namespace '${NAMESPACE}'. Token may lack permissions."
  exit 1
}

log_info "Authenticated with access to namespace: ${NAMESPACE}"

# ============================================================
# Step 2: Determine instance name
# ============================================================
log_step "Step 2: Resolving instance name"

INSTANCE_NAME=$(resolve_instance_name "${PASS_THROUGH_ARGS[@]+"${PASS_THROUGH_ARGS[@]}"}") || {
  log_error "Failed to resolve instance name."
  exit 1
}

log_info "Instance name: ${INSTANCE_NAME}"

# ============================================================
# Step 3: Load configuration
# ============================================================
log_step "Step 3: Loading configuration (profile: ${ENV_PROFILE})"

load_config --env "${ENV_PROFILE}" --instance "${INSTANCE_NAME}" || {
  log_error "Failed to load configuration."
  exit 1
}

export_config

# Compute ROUTE_HOST_SUFFIX from namespace + CLUSTER_DOMAIN
CLUSTER_DOMAIN=$(get_config "CLUSTER_DOMAIN") || {
  log_error "CLUSTER_DOMAIN not found in configuration. Please add it to deployments/openshift/config/${ENV_PROFILE}.env"
  exit 1
}
ROUTE_HOST_SUFFIX="${NAMESPACE}.${CLUSTER_DOMAIN}"

# Inject computed instance-specific values into the loaded config
FRONTEND_URL="https://${INSTANCE_NAME}-frontend.${ROUTE_HOST_SUFFIX}"
BACKEND_URL="https://${INSTANCE_NAME}-backend.${ROUTE_HOST_SUFFIX}"
SSO_REDIRECT_URI="${BACKEND_URL}/api/auth/callback"
TEMPORAL_ADDRESS="${INSTANCE_NAME}-temporal:7233"

# Make these available via the config system
export ROUTE_HOST_SUFFIX FRONTEND_URL BACKEND_URL SSO_REDIRECT_URI TEMPORAL_ADDRESS

log_info "Route host suffix: ${ROUTE_HOST_SUFFIX} (derived from namespace + CLUSTER_DOMAIN)"
log_info "Configuration loaded successfully."

# ============================================================
# Step 4: Build/verify container images
# ============================================================
log_step "Step 4: Building/verifying container images"

# Get current branch name (unsanitized, for GitHub Actions)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || {
  log_error "Failed to determine current git branch."
  exit 1
}

COMMIT_SHA=$(git rev-parse HEAD 2>/dev/null) || {
  log_error "Failed to determine current commit SHA."
  exit 1
}

# The image tag matches the sanitized branch name (same logic as the GitHub Actions workflow).
# This is always based on the branch, regardless of any --instance override.
IMAGE_TAG=$(sanitize_instance_name "${CURRENT_BRANCH}")

SERVICES=("backend-services" "frontend" "temporal")
IMAGES_EXIST=true

log_info "Checking for existing images on ${REGISTRY} for tag '${IMAGE_TAG}'..."

for service in "${SERVICES[@]}"; do
  IMAGE_REF="${IMAGE_BASE}/${service}:${IMAGE_TAG}"
  # Use skopeo or docker manifest inspect to check image existence
  # Fall back to gh api for checking packages
  if docker manifest inspect "${IMAGE_REF}" &>/dev/null 2>&1; then
    log_info "  Found: ${IMAGE_REF}"
  elif skopeo inspect "docker://${IMAGE_REF}" &>/dev/null 2>&1; then
    log_info "  Found: ${IMAGE_REF}"
  else
    log_info "  Not found: ${IMAGE_REF}"
    IMAGES_EXIST=false
  fi
done

if [[ "${IMAGES_EXIST}" == "false" ]]; then
  log_info "One or more images not found. Triggering GitHub Actions build workflow..."

  if ! command -v gh &>/dev/null; then
    log_error "'gh' CLI is not installed. Install it from https://cli.github.com/ to trigger image builds."
    exit 1
  fi

  # Trigger the workflow via the REST API so it works from non-default branches
  gh api "repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches" \
    -f "ref=${CURRENT_BRANCH}" \
    -f 'inputs[branch]='"${CURRENT_BRANCH}" || {
    log_error "Failed to trigger image build workflow."
    log_error "Ensure your code is pushed to GitHub and 'gh' is authenticated."
    exit 1
  }

  log_info "Build workflow triggered for branch '${CURRENT_BRANCH}'."
  log_info "Waiting for workflow run to start..."
  sleep 5

  # Find the most recent run
  RUN_ID=""
  for attempt in $(seq 1 12); do
    RUN_ID=$(gh run list \
      --repo "${GITHUB_REPO}" \
      --workflow "${WORKFLOW_FILE}" \
      --branch "${CURRENT_BRANCH}" \
      --limit 1 \
      --json databaseId,status,createdAt \
      --jq '.[0].databaseId' 2>/dev/null) || true

    if [[ -n "${RUN_ID}" ]]; then
      break
    fi

    log_info "  Waiting for workflow to appear... (attempt ${attempt}/12)"
    sleep 5
  done

  if [[ -z "${RUN_ID}" ]]; then
    log_error "Could not find the triggered workflow run. Check GitHub Actions manually."
    exit 1
  fi

  log_info "Workflow run ID: ${RUN_ID}"
  log_info "Waiting for build to complete (this may take several minutes)..."

  # Wait for workflow completion
  gh run watch "${RUN_ID}" --repo "${GITHUB_REPO}" --exit-status || {
    log_error "Image build workflow failed. Check the run at:"
    log_error "  https://github.com/${GITHUB_REPO}/actions/runs/${RUN_ID}"
    exit 1
  }

  log_info "Image build completed successfully."
else
  log_info "All images already exist for tag '${IMAGE_TAG}'. Skipping build."
fi

# ============================================================
# Step 5: Generate Kustomize overlay
# ============================================================
log_step "Step 5: Generating Kustomize overlay"

BACKEND_IMAGE="${IMAGE_BASE}/backend-services"
FRONTEND_IMAGE="${IMAGE_BASE}/frontend"
WORKER_IMAGE="${IMAGE_BASE}/temporal"

OVERLAY_DIR=$(generate_instance_overlay \
  --instance "${INSTANCE_NAME}" \
  --route-suffix "${ROUTE_HOST_SUFFIX}" \
  --backend-image "${BACKEND_IMAGE}" \
  --frontend-image "${FRONTEND_IMAGE}" \
  --worker-image "${WORKER_IMAGE}" \
  --image-tag "${IMAGE_TAG}") || {
  log_error "Failed to generate Kustomize overlay."
  exit 1
}

log_info "Overlay generated at: ${OVERLAY_DIR}"

# Ensure cleanup on exit
cleanup() {
  if [[ -n "${OVERLAY_DIR:-}" ]]; then
    cleanup_generated_overlay "${OVERLAY_DIR}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ============================================================
# Step 6: Create/update instance secrets
# ============================================================
log_step "Step 6: Creating instance secrets"

# Secrets are read from the same env file loaded in Step 3 (via get_config).
# No separate secrets file is needed.

# Create backend-services-secrets (prefixed by Kustomize namePrefix)
BACKEND_SECRET_NAME=$(get_resource_name "${INSTANCE_NAME}" "backend-services-secrets")
log_info "Creating secret: ${BACKEND_SECRET_NAME}"
oc create secret generic "${BACKEND_SECRET_NAME}" \
  --from-literal="SSO_CLIENT_SECRET=$(get_config SSO_CLIENT_SECRET || true)" \
  --from-literal="AZURE_DOCUMENT_INTELLIGENCE_API_KEY=$(get_config AZURE_DOCUMENT_INTELLIGENCE_API_KEY || true)" \
  --from-literal="AZURE_STORAGE_CONNECTION_STRING=$(get_config AZURE_STORAGE_CONNECTION_STRING || true)" \
  --from-literal="AZURE_STORAGE_ACCOUNT_NAME=$(get_config AZURE_STORAGE_ACCOUNT_NAME || true)" \
  --from-literal="AZURE_STORAGE_ACCOUNT_KEY=$(get_config AZURE_STORAGE_ACCOUNT_KEY || true)" \
  --dry-run=client -o yaml | \
  oc apply -f - -n "${NAMESPACE}" || {
  log_error "Failed to create backend-services-secrets."
  exit 1
}

# Label the secret for instance tracking
oc label secret "${BACKEND_SECRET_NAME}" \
  "app.kubernetes.io/instance=${INSTANCE_NAME}" \
  --overwrite -n "${NAMESPACE}" &>/dev/null || true

# Create temporal-worker-secrets (prefixed by Kustomize namePrefix)
WORKER_SECRET_NAME=$(get_resource_name "${INSTANCE_NAME}" "temporal-worker-secrets")
log_info "Creating secret: ${WORKER_SECRET_NAME}"
oc create secret generic "${WORKER_SECRET_NAME}" \
  --from-literal="AZURE_DOCUMENT_INTELLIGENCE_API_KEY=$(get_config AZURE_DOCUMENT_INTELLIGENCE_API_KEY || true)" \
  --from-literal="AZURE_OPENAI_API_KEY=$(get_config AZURE_OPENAI_API_KEY || true)" \
  --from-literal="AZURE_STORAGE_CONNECTION_STRING=$(get_config AZURE_STORAGE_CONNECTION_STRING || true)" \
  --from-literal="AZURE_STORAGE_ACCOUNT_NAME=$(get_config AZURE_STORAGE_ACCOUNT_NAME || true)" \
  --from-literal="AZURE_STORAGE_ACCOUNT_KEY=$(get_config AZURE_STORAGE_ACCOUNT_KEY || true)" \
  --dry-run=client -o yaml | \
  oc apply -f - -n "${NAMESPACE}" || {
  log_error "Failed to create temporal-worker-secrets."
  exit 1
}

oc label secret "${WORKER_SECRET_NAME}" \
  "app.kubernetes.io/instance=${INSTANCE_NAME}" \
  --overwrite -n "${NAMESPACE}" &>/dev/null || true

log_info "Instance secrets created successfully."

# ============================================================
# Step 7: Apply resources to OpenShift
# ============================================================
log_step "Step 7: Applying resources to OpenShift"

log_info "Running: oc apply -k ${OVERLAY_DIR} -n ${NAMESPACE}"
oc apply -k "${OVERLAY_DIR}" -n "${NAMESPACE}" || {
  log_error "Failed to apply Kustomize overlay to OpenShift."
  exit 1
}

log_info "Resources applied successfully."

# ============================================================
# Step 8: Wait for rollout completion
# ============================================================
log_step "Step 8: Waiting for rollout completion"

DEPLOYMENT_SERVICES=("backend-services" "frontend" "temporal" "temporal-ui" "temporal-worker")

for service in "${DEPLOYMENT_SERVICES[@]}"; do
  DEPLOY_NAME=$(get_resource_name "${INSTANCE_NAME}" "${service}")
  log_info "Waiting for deployment/${DEPLOY_NAME}..."

  if oc get deployment "${DEPLOY_NAME}" -n "${NAMESPACE}" &>/dev/null; then
    oc rollout status "deployment/${DEPLOY_NAME}" -n "${NAMESPACE}" --timeout=300s || {
      log_error "Rollout timed out for deployment/${DEPLOY_NAME}."
      log_error "Check status with: oc get pods -l $(get_instance_label "${INSTANCE_NAME}") -n ${NAMESPACE}"
      exit 1
    }
  else
    log_info "  Deployment '${DEPLOY_NAME}' not found — skipping (may not be in base manifests)."
  fi
done

log_info "All deployments rolled out successfully."

# ============================================================
# Step 9: Print access URLs
# ============================================================
log_step "Step 9: Deployment Complete"

FRONTEND_ROUTE="https://${INSTANCE_NAME}-frontend.${ROUTE_HOST_SUFFIX}"
BACKEND_ROUTE="https://${INSTANCE_NAME}-backend.${ROUTE_HOST_SUFFIX}"
TEMPORAL_UI_ROUTE="https://${INSTANCE_NAME}-temporal-ui.${ROUTE_HOST_SUFFIX}"

cat <<EOF

Instance "${INSTANCE_NAME}" deployed successfully to namespace "${NAMESPACE}".

  Frontend:    ${FRONTEND_ROUTE}
  Backend:     ${BACKEND_ROUTE}
  Temporal UI: ${TEMPORAL_UI_ROUTE}

Image tag: ${IMAGE_TAG}
Environment: ${ENV_PROFILE}

To check pod status:
  oc get pods -l $(get_instance_label "${INSTANCE_NAME}") -n ${NAMESPACE}

To tear down this instance:
  ./scripts/oc-teardown.sh --instance ${INSTANCE_NAME}

EOF
