#!/usr/bin/env bash
#
# oc-build-push.sh — Build container images locally and push to Artifactory.
#
# Use before ./scripts/oc-deploy-instance.sh when you need images from the
# current branch (or a custom tag) in the shared registry.
#
# Usage:
#   ./scripts/oc-build-push.sh --env dev --all [--tag <tag>]
#   ./scripts/oc-build-push.sh --env dev backend-services frontend temporal --tag my-tag
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

source "${SCRIPT_DIR}/lib/config-loader.sh"
source "${SCRIPT_DIR}/lib/image-tag.sh"

usage() {
  cat <<EOF
Usage: $(basename "$0") --env <dev|prod> (--all | <service>...) [options]

Services: backend-services, frontend, temporal

Options:
  --env <dev|prod>   Profile for deployments/openshift/config/<env>.env (Artifactory + Vite args)
  --tag, -t <tag>    Image tag for all services (default: sanitized current git branch)
  --all              Build and push all three services
  -h, --help         Show this help

Examples:
  $(basename "$0") --env dev --all
  $(basename "$0") --env dev --all --tag ai-1209-loadtest
  $(basename "$0") --env dev frontend backend-services --tag patch-1
EOF
}

ENV_PROFILE=""
IMAGE_TAG=""
ALL_SERVICES=false
SERVICES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV_PROFILE="$2"
      shift 2
      ;;
    --tag|-t)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --all)
      ALL_SERVICES=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    backend-services|frontend|temporal)
      SERVICES+=("$1")
      shift
      ;;
    *)
      echo "[ERROR] Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${ENV_PROFILE}" ]]; then
  echo "[ERROR] --env <dev|prod> is required." >&2
  usage >&2
  exit 1
fi

if [[ "${ALL_SERVICES}" == true ]]; then
  SERVICES=(backend-services frontend temporal)
fi

if [[ ${#SERVICES[@]} -eq 0 ]]; then
  echo "[ERROR] Specify --all or one or more services." >&2
  usage >&2
  exit 1
fi

load_config --env "${ENV_PROFILE}" || exit $?

ARTIFACTORY_URL=$(get_config ARTIFACTORY_URL) || {
  echo "[ERROR] ARTIFACTORY_URL missing from config." >&2
  exit 1
}
ARTIFACTORY_SA_USERNAME=$(get_config ARTIFACTORY_SA_USERNAME) || {
  echo "[ERROR] ARTIFACTORY_SA_USERNAME missing from config." >&2
  exit 1
}
ARTIFACTORY_SA_PASSWORD=$(get_config ARTIFACTORY_SA_PASSWORD) || {
  echo "[ERROR] ARTIFACTORY_SA_PASSWORD missing from config." >&2
  exit 1
}

if [[ -z "${IMAGE_TAG}" ]]; then
  IMAGE_TAG=$(sanitize_branch_as_image_tag) || exit 1
fi

echo "[INFO] Using image tag: ${IMAGE_TAG}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] docker CLI not found." >&2
  exit 1
fi

echo "[INFO] Logging in to ${ARTIFACTORY_URL}..."
printf '%s\n' "${ARTIFACTORY_SA_PASSWORD}" | docker login "${ARTIFACTORY_URL}" \
  -u "${ARTIFACTORY_SA_USERNAME}" \
  --password-stdin

IMAGE_BASE="${ARTIFACTORY_URL}/kfd3-fd34fb-local"

build_push_one() {
  local svc="$1"
  local context=""
  local dockerfile=""
  case "${svc}" in
    backend-services)
      context="${PROJECT_ROOT}"
      dockerfile="${PROJECT_ROOT}/apps/backend-services/Dockerfile"
      ;;
    frontend)
      context="${PROJECT_ROOT}/apps/frontend"
      dockerfile="${PROJECT_ROOT}/apps/frontend/Dockerfile"
      ;;
    temporal)
      context="${PROJECT_ROOT}"
      dockerfile="${PROJECT_ROOT}/apps/temporal/Dockerfile"
      ;;
    *)
      echo "[ERROR] Unknown service: ${svc}" >&2
      exit 1
      ;;
  esac

  local dest="${IMAGE_BASE}/${svc}:${IMAGE_TAG}"
  echo "[INFO] Building ${dest}"

  if [[ "${svc}" == frontend ]]; then
    local vite_auth vite_realm vite_client vite_name vite_env
    vite_auth=$(get_config VITE_SSO_AUTH_SERVER_URL) || {
      echo "[ERROR] VITE_SSO_AUTH_SERVER_URL missing from config." >&2
      exit 1
    }
    vite_realm=$(get_config VITE_SSO_REALM) || {
      echo "[ERROR] VITE_SSO_REALM missing from config." >&2
      exit 1
    }
    vite_client=$(get_config VITE_SSO_CLIENT_ID) || {
      echo "[ERROR] VITE_SSO_CLIENT_ID missing from config." >&2
      exit 1
    }
    vite_name=$(get_config VITE_APP_NAME) || {
      echo "[ERROR] VITE_APP_NAME missing from config." >&2
      exit 1
    }
    vite_env=$(get_config VITE_ENV) || {
      echo "[ERROR] VITE_ENV missing from config." >&2
      exit 1
    }

    docker build \
      --push \
      -f "${dockerfile}" \
      -t "${dest}" \
      --build-arg "VITE_API_BASE_URL=/api" \
      --build-arg "VITE_SSO_AUTH_SERVER_URL=${vite_auth}" \
      --build-arg "VITE_SSO_REALM=${vite_realm}" \
      --build-arg "VITE_SSO_CLIENT_ID=${vite_client}" \
      --build-arg "VITE_APP_NAME=${vite_name}" \
      --build-arg "VITE_ENV=${vite_env}" \
      "${context}"
  else
    docker build \
      --push \
      -f "${dockerfile}" \
      -t "${dest}" \
      "${context}"
  fi
}

for svc in "${SERVICES[@]}"; do
  build_push_one "${svc}"
done

echo "[INFO] Done. Images pushed with tag: ${IMAGE_TAG}"
echo "[INFO] Deploy with: ./scripts/oc-deploy-instance.sh --env ${ENV_PROFILE} --namespace <ns> --image-tag ${IMAGE_TAG} [--instance <name>]"
