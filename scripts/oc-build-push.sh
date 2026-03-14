#!/usr/bin/env bash
#
# oc-build-push.sh — Build and push container images locally for OpenShift deployment.
#
# Builds specified service images with Docker and pushes them to ghcr.io.
# After pushing, optionally restarts the corresponding OpenShift deployments
# so pods pull the updated image.
#
# Usage:
#   ./scripts/oc-build-push.sh frontend
#   ./scripts/oc-build-push.sh frontend backend-services
#   ./scripts/oc-build-push.sh --all
#   ./scripts/oc-build-push.sh frontend --restart
#   ./scripts/oc-build-push.sh frontend --tag my-custom-tag
#
# Prerequisites:
#   - Docker installed and running
#   - gh CLI installed and authenticated (with packages:write scope)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

GITHUB_REPO="bcgov/ai-adoption-document-intelligence"
REGISTRY="ghcr.io"
IMAGE_BASE="${REGISTRY}/${GITHUB_REPO}"

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
Usage: $(basename "$0") [OPTIONS] <service ...>

Build and push container images locally to ghcr.io.

Services:
  backend-services    Backend NestJS API
  frontend            Frontend nginx SPA
  temporal            Temporal worker

Options:
  --all               Build all services
  --restart           Restart OpenShift deployments after push (requires oc login)
  --namespace, -n     OpenShift namespace for restart (default: auto-detect from oc)
  --tag, -t           Image tag override (default: sanitized git branch name)
  --help, -h          Show this help message

Examples:
  $(basename "$0") frontend                    # Build and push frontend only
  $(basename "$0") frontend backend-services   # Build and push two services
  $(basename "$0") --all                       # Build and push all services
  $(basename "$0") frontend --restart          # Build, push, and restart deployment
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

while [[ $# -gt 0 ]]; do
  case "$1" in
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

if ! command -v gh &>/dev/null; then
  log_error "'gh' CLI is not installed. Install it from https://cli.github.com/"
  exit 1
fi

if [[ "${DO_RESTART}" == "true" ]] && ! command -v oc &>/dev/null; then
  log_error "'oc' CLI is not installed. Required for --restart."
  exit 1
fi

# ---------- determine image tag ----------

if [[ -z "${IMAGE_TAG}" ]]; then
  IMAGE_TAG=$(get_image_tag)
fi

log_info "Registry:  ${IMAGE_BASE}"
log_info "Image tag: ${IMAGE_TAG}"
log_info "Services:  ${SERVICES_TO_BUILD[*]}"
echo ""

# ---------- authenticate ----------

log_info "Logging into ${REGISTRY}..."
gh auth token | docker login "${REGISTRY}" -u "$(gh api user --jq .login)" --password-stdin || {
  log_error "Failed to log in to ${REGISTRY}."
  log_error "Ensure 'gh' is authenticated with packages:write scope."
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
    NAMESPACE=$(oc project -q 2>/dev/null) || {
      log_error "Could not detect OpenShift namespace. Use --namespace to specify."
      exit 1
    }
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
