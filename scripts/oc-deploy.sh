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
  --env, -e         Environment profile: dev or prod (required)
  --instance, -i    Instance name override (default: derived from git branch)
  --build-local     Build and push images locally with Docker instead of via GitHub Actions
  --help, -h        Show this help message
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
BUILD_LOCAL=false
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
    --build-local)
      BUILD_LOCAL=true
      shift
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

# Build route hostnames as <instance>-<service>-<namespace>.<CLUSTER_DOMAIN>
# so they stay one level under the wildcard cert (*.apps.<cluster>).
# Using a dot between namespace and cluster domain would create a sub-subdomain
# that the wildcard cert doesn't cover, causing ERR_CERT_COMMON_NAME_INVALID.
CLUSTER_DOMAIN=$(get_config "CLUSTER_DOMAIN") || {
  log_error "CLUSTER_DOMAIN not found in configuration. Please add it to deployments/openshift/config/${ENV_PROFILE}.env"
  exit 1
}

# Inject computed instance-specific values into the loaded config
FRONTEND_URL="https://${INSTANCE_NAME}-frontend-${NAMESPACE}.${CLUSTER_DOMAIN}"
BACKEND_URL="https://${INSTANCE_NAME}-backend-${NAMESPACE}.${CLUSTER_DOMAIN}"
SSO_REDIRECT_URI="${FRONTEND_URL}/api/auth/callback"
TEMPORAL_ADDRESS="${INSTANCE_NAME}-temporal:7233"

# Make these available via the config system
export CLUSTER_DOMAIN FRONTEND_URL BACKEND_URL SSO_REDIRECT_URI TEMPORAL_ADDRESS

log_info "Route pattern: <instance>-<service>-${NAMESPACE}.${CLUSTER_DOMAIN}"
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
# Uses the same sanitization as the GHA workflow (128-char OCI tag limit), NOT the instance
# name truncation (20 chars) which is shorter to avoid Kubernetes label limits.
IMAGE_TAG=$(echo "${CURRENT_BRANCH}" \
  | tr '[:upper:]' '[:lower:]' \
  | sed 's/[^a-z0-9._-]/-/g' \
  | sed 's/--*/-/g' \
  | sed 's/^-//;s/-$//' \
  | cut -c1-128)

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

  if [[ "${BUILD_LOCAL}" == "true" ]]; then
    # ---------- Local Docker build ----------
    log_info "Building images locally with Docker..."

    if ! command -v docker &>/dev/null; then
      log_error "'docker' is not installed. Install Docker to use --build-local."
      exit 1
    fi

    # Log in to ghcr.io using gh CLI token
    log_info "Logging into ${REGISTRY}..."
    gh auth token | docker login "${REGISTRY}" -u "$(gh api user --jq .login)" --password-stdin || {
      log_error "Failed to log in to ${REGISTRY}. Ensure 'gh' is authenticated with packages:write scope."
      exit 1
    }

    # Service definitions: name, context, dockerfile (matches GHA workflow matrix)
    declare -A BUILD_CONTEXTS=( ["backend-services"]="." ["frontend"]="apps/frontend" ["temporal"]="." )
    declare -A BUILD_DOCKERFILES=( ["backend-services"]="apps/backend-services/Dockerfile" ["frontend"]="apps/frontend/Dockerfile" ["temporal"]="apps/temporal/Dockerfile" )

    BUILD_COUNT=0
    TOTAL_SERVICES=${#SERVICES[@]}

    for service in "${SERVICES[@]}"; do
      BUILD_COUNT=$((BUILD_COUNT + 1))
      IMAGE_REF="${IMAGE_BASE}/${service}:${IMAGE_TAG}"
      log_info "[${BUILD_COUNT}/${TOTAL_SERVICES}] Building ${service}"
      log_info "  Dockerfile: ${BUILD_DOCKERFILES[${service}]}"
      log_info "  Context:    ${BUILD_CONTEXTS[${service}]}"
      log_info "  Image:      ${IMAGE_REF}"

      BUILD_START=$(date +%s)
      docker build \
        --progress=plain \
        -f "${BUILD_DOCKERFILES[${service}]}" \
        -t "${IMAGE_REF}" \
        "${BUILD_CONTEXTS[${service}]}" || {
        log_error "Docker build failed for ${service}."
        exit 1
      }
      BUILD_ELAPSED=$(( $(date +%s) - BUILD_START ))
      log_info "[${BUILD_COUNT}/${TOTAL_SERVICES}] ${service} built in ${BUILD_ELAPSED}s"

      log_info "[${BUILD_COUNT}/${TOTAL_SERVICES}] Pushing ${service}..."
      PUSH_START=$(date +%s)
      docker push "${IMAGE_REF}" || {
        log_error "Docker push failed for ${IMAGE_REF}."
        exit 1
      }
      PUSH_ELAPSED=$(( $(date +%s) - PUSH_START ))
      log_info "[${BUILD_COUNT}/${TOTAL_SERVICES}] ${service} pushed in ${PUSH_ELAPSED}s"
    done

    log_info "All ${TOTAL_SERVICES} images built and pushed locally."

  else
    # ---------- GitHub Actions build ----------
    log_info "Triggering GitHub Actions build workflow..."

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
      log_error "If the workflow is not on the default branch, use --build-local instead."
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
  fi

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

SSO_AUTH_SERVER_URL=$(get_config "SSO_AUTH_SERVER_URL") || { log_error "SSO_AUTH_SERVER_URL not found in configuration."; exit 1; }
SSO_REALM=$(get_config "SSO_REALM") || { log_error "SSO_REALM not found in configuration."; exit 1; }
SSO_CLIENT_ID=$(get_config "SSO_CLIENT_ID") || { log_error "SSO_CLIENT_ID not found in configuration."; exit 1; }

OVERLAY_DIR=$(generate_instance_overlay \
  --instance "${INSTANCE_NAME}" \
  --namespace "${NAMESPACE}" \
  --cluster-domain "${CLUSTER_DOMAIN}" \
  --backend-image "${BACKEND_IMAGE}" \
  --frontend-image "${FRONTEND_IMAGE}" \
  --worker-image "${WORKER_IMAGE}" \
  --image-tag "${IMAGE_TAG}" \
  --sso-auth-server-url "${SSO_AUTH_SERVER_URL}" \
  --sso-realm "${SSO_REALM}" \
  --sso-client-id "${SSO_CLIENT_ID}") || {
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
    oc rollout status "deployment/${DEPLOY_NAME}" -n "${NAMESPACE}" --timeout=120s || {
      log_error "Rollout timed out for deployment/${DEPLOY_NAME}. Continuing with remaining deployments."
      log_error "Check status with: oc get pods -l $(get_instance_label "${INSTANCE_NAME}") -n ${NAMESPACE}"
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

FRONTEND_ROUTE="https://${INSTANCE_NAME}-frontend-${NAMESPACE}.${CLUSTER_DOMAIN}"
BACKEND_ROUTE="https://${INSTANCE_NAME}-backend-${NAMESPACE}.${CLUSTER_DOMAIN}"

cat <<EOF

Instance "${INSTANCE_NAME}" deployed successfully to namespace "${NAMESPACE}".

  Frontend:    ${FRONTEND_ROUTE}
  Backend:     ${BACKEND_ROUTE}

Image tag: ${IMAGE_TAG}
Environment: ${ENV_PROFILE}

To check pod status:
  oc get pods -l $(get_instance_label "${INSTANCE_NAME}") -n ${NAMESPACE}

To access Temporal UI (not publicly exposed):
  oc port-forward deployment/${INSTANCE_NAME}-temporal-ui 8080:8080 -n ${NAMESPACE}
  Then open http://localhost:8080

To tear down this instance:
  ./scripts/oc-teardown.sh --instance ${INSTANCE_NAME}

EOF
