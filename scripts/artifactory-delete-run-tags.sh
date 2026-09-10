#!/usr/bin/env bash
#
# artifactory-delete-run-tags.sh — Delete run-specific SHA tags from Artifactory.
#
# Used when a CI build or deploy fails to avoid leaving staged artifacts behind.
#
# Usage:
#   ./scripts/artifactory-delete-run-tags.sh --tag bcgov-di-test-abc123def456 --delete
#   ./scripts/artifactory-delete-run-tags.sh --env dev --tag my-branch-abc123def456 --delete
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/config-loader.sh"

ARTIFACTORY_REPO="kfd3-fd34fb-local"
DEFAULT_SERVICES=(backend-services frontend temporal ches-adapter)
CURL_OPTS=(--connect-timeout 30 --max-time 120)

log_info()  { echo -e "\033[0;36m[INFO]\033[0m  $*"; }
log_warn()  { echo -e "\033[0;33m[WARN]\033[0m  $*"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }

usage() {
  cat <<EOF
Usage: $(basename "$0") --tag <sha-tag> [--delete] [--env <dev|prod>] [service...]

Delete named tags for the given SHA tag from all (or specified) images, then run
orphan/uploads cleanup via artifactory-cleanup.sh.

Options:
  --tag, -t <tag>   SHA tag to delete (required)
  --delete          Actually delete (default: dry run)
  --env, -e <env>   Load credentials from config when env vars are unset
  --help, -h        Show this help
EOF
}

ENV_PROFILE=""
RUN_TAG=""
DO_DELETE=false
SERVICES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env|-e) ENV_PROFILE="$2"; shift 2 ;;
    --tag|-t) RUN_TAG="$2"; shift 2 ;;
    --delete) DO_DELETE=true; shift ;;
    --help|-h) usage; exit 0 ;;
    backend-services|frontend|temporal|ches-adapter) SERVICES+=("$1"); shift ;;
    *) log_error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "${RUN_TAG}" ]]; then
  log_error "--tag is required."
  usage
  exit 1
fi

if [[ ${#SERVICES[@]} -eq 0 ]]; then
  SERVICES=("${DEFAULT_SERVICES[@]}")
fi

if [[ -z "${ARTIFACTORY_URL:-}" || -z "${ARTIFACTORY_SA_USERNAME:-}" || -z "${ARTIFACTORY_SA_PASSWORD:-}" ]]; then
  if [[ -z "${ENV_PROFILE}" ]]; then
    log_error "Artifactory credentials not set in env and --env not provided."
    usage
    exit 1
  fi
  load_config --env "${ENV_PROFILE}" || { log_error "Failed to load config."; exit 1; }
  ARTIFACTORY_URL="${ARTIFACTORY_URL:-$(get_config ARTIFACTORY_URL 2>/dev/null || true)}"
  ARTIFACTORY_SA_USERNAME="${ARTIFACTORY_SA_USERNAME:-$(get_config ARTIFACTORY_SA_USERNAME 2>/dev/null || true)}"
  ARTIFACTORY_SA_PASSWORD="${ARTIFACTORY_SA_PASSWORD:-$(get_config ARTIFACTORY_SA_PASSWORD 2>/dev/null || true)}"
fi

if [[ -z "${ARTIFACTORY_URL}" || -z "${ARTIFACTORY_SA_USERNAME}" || -z "${ARTIFACTORY_SA_PASSWORD}" ]]; then
  log_error "Artifactory credentials could not be resolved."
  exit 1
fi

AUTH="${ARTIFACTORY_SA_USERNAME}:${ARTIFACTORY_SA_PASSWORD}"
BASE_URL="https://${ARTIFACTORY_URL}/artifactory"

log_info "Deleting run tag '${RUN_TAG}' from ${#SERVICES[@]} image(s)..."

for image in "${SERVICES[@]}"; do
  if [[ "${DO_DELETE}" == "true" ]]; then
    http_code=$(curl "${CURL_OPTS[@]}" -s -o /dev/null -w "%{http_code}" -u "${AUTH}" -X DELETE \
      "${BASE_URL}/${ARTIFACTORY_REPO}/${image}/${RUN_TAG}" 2>/dev/null || echo "000")
    if [[ "${http_code}" == "202" || "${http_code}" == "200" || "${http_code}" == "204" ]]; then
      log_info "  Deleted ${image}:${RUN_TAG}"
    elif [[ "${http_code}" == "404" ]]; then
      log_info "  Tag not found (skip): ${image}:${RUN_TAG}"
    else
      log_warn "  Failed to delete ${image}:${RUN_TAG} (HTTP ${http_code})"
    fi
  else
    echo "  [DRY RUN] Would delete ${image}:${RUN_TAG}"
  fi
done

if [[ "${DO_DELETE}" == "true" ]]; then
  log_info "Running orphan/uploads cleanup..."
  bash "${SCRIPT_DIR}/artifactory-cleanup.sh" --delete
fi
