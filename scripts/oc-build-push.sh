#!/usr/bin/env bash
#
# oc-build-push.sh — Build and push container images locally for OpenShift deployment.
#
# Builds specified service images with Docker and pushes them to Artifactory.
# After pushing, optionally restarts the corresponding OpenShift deployments
# so pods pull the updated image.
#
# Usage:
#   ./scripts/oc-build-push.sh --env dev frontend
#   ./scripts/oc-build-push.sh --env dev frontend backend-services
#   ./scripts/oc-build-push.sh --env dev --all
#   ./scripts/oc-build-push.sh --env dev frontend --restart
#   ./scripts/oc-build-push.sh --env dev frontend --tag my-custom-tag
#
# Prerequisites:
#   - Docker installed and running
#   - Artifactory credentials configured in deployments/openshift/config/<env>.env
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source config loader for Artifactory credentials
source "${SCRIPT_DIR}/lib/config-loader.sh"

ARTIFACTORY_REPO_PATH="kfd3-fd34fb-local"

# Service definitions: context directory and Dockerfile path (relative to PROJECT_ROOT)
declare -A BUILD_CONTEXTS=(
  ["backend-services"]="."
  ["frontend"]="apps/frontend"
  ["temporal"]="."
)
declare -A BUILD_DOCKERFILES=(
  ["backend-services"]="apps/backend-services/Dockerfile"
  ["frontend"]="apps/frontend/Dockerfile"
  ["temporal"]="apps/temporal/Dockerfile"
)

ALL_SERVICES=("backend-services" "frontend" "temporal")

# ---------- helpers ----------

log_info()  { echo -e "\033[0;36m[INFO]\033[0m  $*"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }
log_ok()    { echo -e "\033[0;32m[OK]\033[0m    $*"; }

usage() {
  cat <<EOF
Usage: $(basename "$0") --env <dev|prod> [OPTIONS] <service ...>

Build and push container images locally to Artifactory.

Services:
  backend-services    Backend NestJS API
  frontend            Frontend nginx SPA
  temporal            Temporal worker

Options:
  --env, -e           Environment profile: dev or prod (required, for registry credentials)
  --all               Build all services
  --restart           Restart OpenShift deployments after push (requires oc login)
  --namespace, -n     OpenShift namespace for restart (default: auto-detect from oc)
  --tag, -t           Image tag override (default: sanitized git branch name)
  --help, -h          Show this help message

Examples:
  $(basename "$0") --env dev frontend                    # Build and push frontend only
  $(basename "$0") --env dev frontend backend-services   # Build and push two services
  $(basename "$0") --env dev --all                       # Build and push all services
  $(basename "$0") --env dev frontend --restart          # Build, push, and restart deployment
EOF
}

get_image_tag() {
  local branch
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || {
    log_error "Failed to determine current git branch."
    exit 1
  }
  echo "${branch}" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9._-]/-/g' \
    | sed 's/--*/-/g' \
    | sed 's/^-//;s/-$//' \
    | cut -c1-128
}

# ---------- parse arguments ----------

SERVICES_TO_BUILD=()
DO_RESTART=false
NAMESPACE=""
IMAGE_TAG=""
ENV_PROFILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env|-e)
      ENV_PROFILE="$2"
      shift 2
      ;;
    --all)
      SERVICES_TO_BUILD=("${ALL_SERVICES[@]}")
      shift
      ;;
    --restart)
      DO_RESTART=true
      shift
      ;;
    --namespace|-n)
      NAMESPACE="$2"
      shift 2
      ;;
    --tag|-t)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    -*)
      log_error "Unknown option: $1"
      usage
      exit 1
      ;;
    *)
      # Validate service name
      if [[ -z "${BUILD_CONTEXTS[$1]+x}" ]]; then
        log_error "Unknown service: $1"
        log_error "Valid services: ${ALL_SERVICES[*]}"
        exit 1
      fi
      SERVICES_TO_BUILD+=("$1")
      shift
      ;;
  esac
done

if [[ -z "${ENV_PROFILE}" ]]; then
  log_error "--env is required (dev or prod) — needed for Artifactory credentials."
  echo ""
  usage
  exit 1
fi

if [[ ${#SERVICES_TO_BUILD[@]} -eq 0 ]]; then
  log_error "No services specified. Use --all or specify service names."
  echo ""
  usage
  exit 1
fi

# ---------- prerequisites ----------

if ! command -v docker &>/dev/null; then
  log_error "'docker' is not installed. Install Docker to build images."
  exit 1
fi

if [[ "${DO_RESTART}" == "true" ]] && ! command -v oc &>/dev/null; then
  log_error "'oc' CLI is not installed. Required for --restart."
  exit 1
fi

# ---------- load config for Artifactory credentials ----------

load_config --env "${ENV_PROFILE}" || {
  log_error "Failed to load configuration for profile '${ENV_PROFILE}'."
  exit 1
}

ARTIFACTORY_URL=$(get_config "ARTIFACTORY_URL") || {
  log_error "ARTIFACTORY_URL not found in configuration."
  log_error "Add it to deployments/openshift/config/${ENV_PROFILE}.env (see .env.example)."
  exit 1
}
ARTIFACTORY_SA_USERNAME=$(get_config "ARTIFACTORY_SA_USERNAME") || {
  log_error "ARTIFACTORY_SA_USERNAME not found in configuration."
  exit 1
}
ARTIFACTORY_SA_PASSWORD=$(get_config "ARTIFACTORY_SA_PASSWORD") || {
  log_error "ARTIFACTORY_SA_PASSWORD not found in configuration."
  exit 1
}

IMAGE_BASE="${ARTIFACTORY_URL}/${ARTIFACTORY_REPO_PATH}"

# ---------- determine image tag ----------

if [[ -z "${IMAGE_TAG}" ]]; then
  IMAGE_TAG=$(get_image_tag)
fi

log_info "Registry:  ${IMAGE_BASE}"
log_info "Image tag: ${IMAGE_TAG}"
log_info "Services:  ${SERVICES_TO_BUILD[*]}"
echo ""

# ---------- authenticate ----------

log_info "Logging into ${ARTIFACTORY_URL}..."
echo "${ARTIFACTORY_SA_PASSWORD}" | docker login "${ARTIFACTORY_URL}" \
  -u "${ARTIFACTORY_SA_USERNAME}" --password-stdin || {
  log_error "Failed to log in to ${ARTIFACTORY_URL}."
  log_error "Check ARTIFACTORY_SA_USERNAME and ARTIFACTORY_SA_PASSWORD in your config."
  exit 1
}
echo ""

# ---------- build and push ----------

cd "${PROJECT_ROOT}"

BUILD_COUNT=0
TOTAL=${#SERVICES_TO_BUILD[@]}

for service in "${SERVICES_TO_BUILD[@]}"; do
  BUILD_COUNT=$((BUILD_COUNT + 1))
  IMAGE_REF="${IMAGE_BASE}/${service}:${IMAGE_TAG}"

  log_info "[${BUILD_COUNT}/${TOTAL}] Building ${service}"
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
  log_ok "[${BUILD_COUNT}/${TOTAL}] ${service} built in ${BUILD_ELAPSED}s"

  log_info "[${BUILD_COUNT}/${TOTAL}] Pushing ${service}..."
  PUSH_START=$(date +%s)
  docker push "${IMAGE_REF}" || {
    log_error "Docker push failed for ${IMAGE_REF}."
    exit 1
  }
  PUSH_ELAPSED=$(( $(date +%s) - PUSH_START ))
  log_ok "[${BUILD_COUNT}/${TOTAL}] ${service} pushed in ${PUSH_ELAPSED}s"
  echo ""
done

log_ok "All ${TOTAL} image(s) built and pushed."

# ---------- restart deployments ----------

if [[ "${DO_RESTART}" == "true" ]]; then
  echo ""
  log_info "Restarting OpenShift deployments..."

  if [[ -z "${NAMESPACE}" ]]; then
    # Try reading from token file first (SA login doesn't set oc project)
    token_file="${PROJECT_ROOT}/.oc-deploy/token"
    if [[ -f "${token_file}" ]]; then
      NAMESPACE=$(grep '^NAMESPACE=' "${token_file}" | cut -d= -f2-)
    fi
    if [[ -z "${NAMESPACE}" ]]; then
      NAMESPACE=$(oc project -q 2>/dev/null) || {
        log_error "Could not detect OpenShift namespace. Use --namespace to specify."
        exit 1
      }
    fi
  fi

  log_info "Namespace: ${NAMESPACE}"

  for service in "${SERVICES_TO_BUILD[@]}"; do
    # Deployment names in OpenShift are prefixed with the instance name:
    # e.g. "feature-deployment-f-frontend", "feature-deployment-f-backend-services"
    # Find the deployment ending with the service name.
    DEPLOYMENT_NAME=$(oc get deployments -n "${NAMESPACE}" -o name 2>/dev/null \
      | grep -E "/${service}$|/-${service}$|/${service}\$" \
      | sed 's|deployment.apps/||' \
      | head -n1)

    if [[ -z "${DEPLOYMENT_NAME}" ]]; then
      # Fallback: search for deployments containing the service name
      DEPLOYMENT_NAME=$(oc get deployments -n "${NAMESPACE}" -o name 2>/dev/null \
        | grep "${service}" \
        | sed 's|deployment.apps/||' \
        | head -n1)
    fi

    if [[ -n "${DEPLOYMENT_NAME}" ]]; then
      oc rollout restart deployment/"${DEPLOYMENT_NAME}" -n "${NAMESPACE}" || {
        log_error "Failed to restart deployment ${DEPLOYMENT_NAME}."
      }
      log_ok "Restarted deployment: ${DEPLOYMENT_NAME}"
    else
      log_info "No deployment matching '${service}' found in ${NAMESPACE} — skipping restart."
    fi
  done

  log_ok "Rollout restart(s) triggered. Use 'oc rollout status' to monitor."
fi
