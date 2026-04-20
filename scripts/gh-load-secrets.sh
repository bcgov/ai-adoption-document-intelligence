#!/usr/bin/env bash
#
# gh-load-secrets.sh — Load environment configuration into GitHub Actions secrets.
#
# Reads a .env file through the same config-loader used by deploy scripts
# (which strips comments, blank lines, and surrounding quotes), then pushes
# each key=value pair as a GitHub environment secret.
#
# Usage:
#   ./scripts/gh-load-secrets.sh --env prod --gh-env dev
#   ./scripts/gh-load-secrets.sh --env prod --gh-env prod
#   ./scripts/gh-load-secrets.sh --env prod --gh-env dev --gh-env prod
#
# Prerequisites:
#   - gh CLI installed and authenticated
#   - .env file exists at deployments/openshift/config/<env>.env
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/config-loader.sh"

# ---------- helpers ----------

log_info()  { echo "[INFO] $*"; }
log_error() { echo "[ERROR] $*" >&2; }

usage() {
  cat <<EOF
Usage: $(basename "$0") --env <dev|prod> --gh-env <environment> [--gh-env <environment>...]

Load configuration from a local .env file into GitHub Actions environment secrets.
Values are parsed through the same config-loader used by deploy scripts, which
strips surrounding double quotes and skips comments/blank lines.

Options:
  --env, -e       Local environment profile to read (required)
  --gh-env, -g    GitHub environment to push secrets to (required, repeatable)
  --dry-run       Show what would be set without actually setting secrets
  --help, -h      Show this help message

Examples:
  # Load prod.env values into the GitHub 'dev' environment
  ./scripts/gh-load-secrets.sh --env prod --gh-env dev

  # Load prod.env values into both GitHub 'dev' and 'prod' environments
  ./scripts/gh-load-secrets.sh --env prod --gh-env dev --gh-env prod

  # Preview what would be set
  ./scripts/gh-load-secrets.sh --env prod --gh-env dev --dry-run
EOF
}

# ---------- parse arguments ----------

ENV_PROFILE=""
GH_ENVS=()
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env|-e)
      ENV_PROFILE="$2"
      shift 2
      ;;
    --gh-env|-g)
      GH_ENVS+=("$2")
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
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
  log_error "--env is required"
  usage
  exit 1
fi

if [[ ${#GH_ENVS[@]} -eq 0 ]]; then
  log_error "At least one --gh-env is required"
  usage
  exit 1
fi

if ! command -v gh &>/dev/null; then
  log_error "'gh' CLI is not installed. Install it from https://cli.github.com/"
  exit 1
fi

# ---------- load config ----------

load_config --env "${ENV_PROFILE}" || {
  log_error "Failed to load config for profile '${ENV_PROFILE}'."
  exit 1
}

# ---------- push secrets ----------

KEY_COUNT=0
FAIL_COUNT=0

for key in $(echo "${!CONFIG_VALUES[@]}" | tr ' ' '\n' | sort); do
  value="${CONFIG_VALUES[${key}]}"

  for gh_env in "${GH_ENVS[@]}"; do
    if [[ "${DRY_RUN}" == "true" ]]; then
      # Show key and redacted value (first 4 chars + ***)
      if [[ ${#value} -gt 4 ]]; then
        redacted="${value:0:4}***"
      else
        redacted="***"
      fi
      echo "  [DRY RUN] ${key}=${redacted} -> env:${gh_env}"
    else
      if echo "${value}" | gh secret set "${key}" --env "${gh_env}" 2>/dev/null; then
        log_info "Set ${key} -> env:${gh_env}"
      else
        log_error "Failed to set ${key} -> env:${gh_env}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
      fi
    fi
  done

  KEY_COUNT=$((KEY_COUNT + 1))
done

echo ""
if [[ "${DRY_RUN}" == "true" ]]; then
  echo "Dry run complete. ${KEY_COUNT} keys would be set to ${#GH_ENVS[@]} environment(s)."
else
  echo "Done. Set ${KEY_COUNT} keys to ${#GH_ENVS[@]} environment(s)."
  if [[ ${FAIL_COUNT} -gt 0 ]]; then
    log_error "${FAIL_COUNT} secret(s) failed to set."
    exit 1
  fi
fi
