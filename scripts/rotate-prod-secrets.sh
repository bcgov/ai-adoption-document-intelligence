#!/usr/bin/env bash
#
# rotate-prod-secrets.sh — Rotate critical production secrets from an
# external secrets file into GitHub Actions env secrets and OpenShift.
#
# Reads keys from $DI_SECRETS_DIR/prod-secrets.env (default
# ~/.config/bcgov-di/prod-secrets.env) and applies them to:
#   1. GitHub Actions environment secrets (env: prod)
#   2. OpenShift secrets in the fd34fb-prod namespace for instance bcgov-di
#   3. Local token file (for OPENSHIFT_TOKEN only)
#
# The script never echoes, logs, or otherwise prints secret values. Unknown
# keys are skipped with a warning. Only the keys present in the file are
# touched — this is a targeted rotation, not a full re-seed.
#
# Usage:
#   ./scripts/rotate-prod-secrets.sh                # rotate everything in file
#   ./scripts/rotate-prod-secrets.sh --dry-run      # preview without changes
#   ./scripts/rotate-prod-secrets.sh --only SSO_CLIENT_SECRET --only AZURE_OPENAI_API_KEY
#   ./scripts/rotate-prod-secrets.sh --no-restart   # skip rollout restart
#
# Prerequisites:
#   - gh CLI installed and authenticated (with repo scope for bcgov/ai-adoption-document-intelligence)
#   - oc CLI installed
#   - jq installed
#   - .oc-deploy/token-fd34fb-prod exists (for OpenShift login)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------- constants ----------

DI_SECRETS_DIR="${DI_SECRETS_DIR:-${HOME}/.config/bcgov-di}"
SECRETS_FILE="${DI_SECRETS_DIR}/prod-secrets.env"

GH_REPO="bcgov/ai-adoption-document-intelligence"
GH_ENV="prod"

NAMESPACE="fd34fb-prod"
INSTANCE_NAME="bcgov-di"
BACKEND_SECRET="${INSTANCE_NAME}-backend-services-secrets"
WORKER_SECRET="${INSTANCE_NAME}-temporal-worker-secrets"

ARTIFACTORY_REGISTRY="artifacts.developer.gov.bc.ca"
# Deployments that pull images from ARTIFACTORY_REGISTRY — all need a restart
# when the pull secret changes, so new/scaled pods pull successfully.
ARTIFACTORY_DEPLOYMENTS=(backend-services frontend temporal temporal-ui temporal-worker)

OC_TOKEN_FILE="${PROJECT_ROOT}/.oc-deploy/token-${NAMESPACE}"
OC_TOKEN_DEFAULT="${PROJECT_ROOT}/.oc-deploy/token"

# ---------- helpers ----------

log_info()  { echo "[INFO] $*"; }
log_warn()  { echo "[WARN] $*" >&2; }
log_error() { echo "[ERROR] $*" >&2; }
log_step()  { echo ""; echo "--- $* ---"; }

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Rotate production secrets from ${SECRETS_FILE} to GitHub env:${GH_ENV} and
OpenShift namespace ${NAMESPACE} (instance ${INSTANCE_NAME}).

Options:
  --dry-run            Preview without applying any changes
  --only <KEY>         Restrict rotation to specific keys (repeatable)
  --no-restart         Skip rollout restart of affected deployments
  --help, -h           Show this help

Recognized keys (others are skipped with a warning):
  SSO_CLIENT_SECRET                     → GH + OpenShift backend
  AZURE_DOCUMENT_INTELLIGENCE_API_KEY   → GH + OpenShift backend + worker
  AZURE_STORAGE_CONNECTION_STRING       → GH + OpenShift backend + worker
  AZURE_STORAGE_ACCOUNT_NAME            → GH + OpenShift backend + worker
  AZURE_STORAGE_ACCOUNT_KEY             → GH + OpenShift backend + worker
  AZURE_OPENAI_API_KEY                  → GH + OpenShift worker
  ARTIFACTORY_SA_USERNAME               → GH only
  ARTIFACTORY_SA_PASSWORD               → GH only
  OPENSHIFT_TOKEN                       → GH (OPENSHIFT_TOKEN + OPENSHIFT_API_TOKEN)
                                          + local .oc-deploy/token-${NAMESPACE}
EOF
}

# ---------- argument parsing ----------

DRY_RUN=false
NO_RESTART=false
ONLY_KEYS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)    DRY_RUN=true; shift ;;
    --no-restart) NO_RESTART=true; shift ;;
    --only)
      if [[ -z "${2:-}" ]]; then log_error "--only requires a value"; exit 1; fi
      ONLY_KEYS+=("$2"); shift 2 ;;
    --help|-h)    usage; exit 0 ;;
    *)            log_error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# ---------- tool checks ----------

for tool in gh oc jq; do
  if ! command -v "${tool}" &>/dev/null; then
    log_error "Required tool not installed: ${tool}"
    exit 1
  fi
done

if ! gh auth status --hostname github.com &>/dev/null; then
  log_error "gh CLI is not authenticated. Run: gh auth login"
  exit 1
fi

# ---------- secrets file validation ----------

if [[ ! -f "${SECRETS_FILE}" ]]; then
  log_error "Secrets file not found: ${SECRETS_FILE}"
  log_error "Create it with mode 0600 and populate with key=value pairs for the keys you want to rotate."
  exit 1
fi

FILE_PERMS=$(stat -c %a "${SECRETS_FILE}")
if [[ "${FILE_PERMS}" != "600" && "${FILE_PERMS}" != "400" ]]; then
  log_warn "${SECRETS_FILE} has permissions ${FILE_PERMS} — recommended 600."
fi

# ---------- routing tables ----------

# Keys that write to the backend-services secret
declare -A ROUTE_BACKEND=(
  [SSO_CLIENT_SECRET]=1
  [AZURE_DOCUMENT_INTELLIGENCE_API_KEY]=1
  [AZURE_STORAGE_CONNECTION_STRING]=1
  [AZURE_STORAGE_ACCOUNT_NAME]=1
  [AZURE_STORAGE_ACCOUNT_KEY]=1
)

# Keys that write to the temporal-worker secret
declare -A ROUTE_WORKER=(
  [AZURE_DOCUMENT_INTELLIGENCE_API_KEY]=1
  [AZURE_OPENAI_API_KEY]=1
  [AZURE_STORAGE_CONNECTION_STRING]=1
  [AZURE_STORAGE_ACCOUNT_NAME]=1
  [AZURE_STORAGE_ACCOUNT_KEY]=1
)

# Keys that push to GH only (no OpenShift secret patching)
declare -A ROUTE_GH_ONLY=(
  [ARTIFACTORY_SA_USERNAME]=1
  [ARTIFACTORY_SA_PASSWORD]=1
  [OPENSHIFT_TOKEN]=1
)

# Union of recognized keys
declare -A RECOGNIZED=(
  [SSO_CLIENT_SECRET]=1
  [AZURE_DOCUMENT_INTELLIGENCE_API_KEY]=1
  [AZURE_STORAGE_CONNECTION_STRING]=1
  [AZURE_STORAGE_ACCOUNT_NAME]=1
  [AZURE_STORAGE_ACCOUNT_KEY]=1
  [AZURE_OPENAI_API_KEY]=1
  [ARTIFACTORY_SA_USERNAME]=1
  [ARTIFACTORY_SA_PASSWORD]=1
  [OPENSHIFT_TOKEN]=1
)

# ---------- read secrets file ----------

declare -A SECRETS
declare -a KEYS_ORDERED=()

while IFS= read -r line || [[ -n "${line}" ]]; do
  # Skip blanks and comments
  [[ -z "${line}" ]] && continue
  [[ "${line}" =~ ^[[:space:]]*# ]] && continue

  key="${line%%=*}"
  value="${line#*=}"
  # Trim whitespace from key
  key="$(echo "${key}" | xargs)"
  [[ -z "${key}" ]] && continue
  # Strip outer double quotes from value
  if [[ "${value}" =~ ^\"(.*)\"$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi

  SECRETS["${key}"]="${value}"
  KEYS_ORDERED+=("${key}")
done < "${SECRETS_FILE}"

# ---------- filter by --only ----------

if [[ ${#ONLY_KEYS[@]} -gt 0 ]]; then
  declare -a FILTERED=()
  for k in "${ONLY_KEYS[@]}"; do
    if [[ -v "SECRETS[${k}]" ]]; then
      FILTERED+=("${k}")
    else
      log_warn "Key not in secrets file (ignored): ${k}"
    fi
  done
  KEYS_ORDERED=("${FILTERED[@]+"${FILTERED[@]}"}")
fi

TOTAL_FOUND=${#KEYS_ORDERED[@]}
if [[ ${TOTAL_FOUND} -eq 0 ]]; then
  log_info "No keys to rotate. Nothing to do."
  exit 0
fi

# ---------- OpenShift login ----------

if [[ "${DRY_RUN}" != "true" ]]; then
  log_step "Logging in to OpenShift (namespace: ${NAMESPACE})"
  if [[ ! -f "${OC_TOKEN_FILE}" ]]; then
    log_error "OpenShift token file missing: ${OC_TOKEN_FILE}"
    log_error "Run: ./scripts/oc-setup-sa.sh --namespace ${NAMESPACE}"
    exit 1
  fi
  # oc-login-sa.sh echoes the server URL but no secrets
  bash "${SCRIPT_DIR}/oc-login-sa.sh" --namespace "${NAMESPACE}" >/dev/null || {
    log_error "OpenShift login failed. Token may have expired."
    exit 1
  }
  log_info "Logged in as service account in ${NAMESPACE}"
fi

# ---------- aggregate OpenShift patches ----------

# Build JSON arg lists for each target secret: (--arg K "V")
# We compose stringData maps via jq to avoid shell-quoting pitfalls.
declare -a BACKEND_JQ_ARGS=()
declare -a WORKER_JQ_ARGS=()
declare -a BACKEND_KEY_LIST=()
declare -a WORKER_KEY_LIST=()

BACKEND_TOUCHED=false
WORKER_TOUCHED=false

# ---------- per-key processing ----------

GH_SUCCESS=0
GH_FAIL=0
UNKNOWN_COUNT=0
SKIPPED_COUNT=0

log_step "Rotating ${TOTAL_FOUND} key(s)"

IDX=0
for KEY in "${KEYS_ORDERED[@]}"; do
  IDX=$((IDX + 1))
  VALUE="${SECRETS[${KEY}]}"

  if [[ ! -v "RECOGNIZED[${KEY}]" ]]; then
    log_warn "Unknown key, skipping: ${KEY}"
    UNKNOWN_COUNT=$((UNKNOWN_COUNT + 1))
    continue
  fi

  if [[ -z "${VALUE}" ]]; then
    log_warn "Empty value for ${KEY}, skipping"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  # --- push to GitHub env secret ---
  if [[ "${DRY_RUN}" == "true" ]]; then
    log_info "[DRY RUN] ${IDX}/${TOTAL_FOUND} would set GH secret: ${KEY}"
  else
    if printf '%s' "${VALUE}" | gh secret set "${KEY}" \
        --env "${GH_ENV}" --repo "${GH_REPO}" --body - &>/dev/null; then
      GH_SUCCESS=$((GH_SUCCESS + 1))
    else
      log_error "GitHub secret set failed: ${KEY}"
      GH_FAIL=$((GH_FAIL + 1))
    fi
  fi

  # --- special: OPENSHIFT_TOKEN ---
  if [[ "${KEY}" == "OPENSHIFT_TOKEN" ]]; then
    # Also set OPENSHIFT_API_TOKEN (the db-restore workflow uses this name)
    if [[ "${DRY_RUN}" == "true" ]]; then
      log_info "[DRY RUN] ${IDX}/${TOTAL_FOUND} would also set GH secret: OPENSHIFT_API_TOKEN"
      log_info "[DRY RUN] would rewrite ${OC_TOKEN_FILE}"
    else
      if printf '%s' "${VALUE}" | gh secret set "OPENSHIFT_API_TOKEN" \
          --env "${GH_ENV}" --repo "${GH_REPO}" --body - &>/dev/null; then
        GH_SUCCESS=$((GH_SUCCESS + 1))
      else
        log_error "GitHub secret set failed: OPENSHIFT_API_TOKEN"
        GH_FAIL=$((GH_FAIL + 1))
      fi

      # Rewrite the local token file (preserving NAMESPACE and SERVER lines)
      if [[ -f "${OC_TOKEN_FILE}" ]]; then
        EXISTING_NAMESPACE=$(grep '^NAMESPACE=' "${OC_TOKEN_FILE}" | head -1 || true)
        EXISTING_SERVER=$(grep '^SERVER=' "${OC_TOKEN_FILE}" | head -1 || true)
        TMP_FILE=$(mktemp)
        {
          echo "# OpenShift deploy service account token"
          echo "# Rotated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
          echo "# Namespace: ${NAMESPACE}"
          [[ -n "${EXISTING_NAMESPACE}" ]] && echo "${EXISTING_NAMESPACE}" || echo "NAMESPACE=${NAMESPACE}"
          [[ -n "${EXISTING_SERVER}" ]] && echo "${EXISTING_SERVER}" || echo "SERVER=https://api.silver.devops.gov.bc.ca:6443"
          printf 'TOKEN=%s\n' "${VALUE}"
        } > "${TMP_FILE}"
        chmod 600 "${TMP_FILE}"
        mv "${TMP_FILE}" "${OC_TOKEN_FILE}"
        # Keep default token file in sync (matches oc-setup-sa.sh behavior)
        cp "${OC_TOKEN_FILE}" "${OC_TOKEN_DEFAULT}"
        chmod 600 "${OC_TOKEN_DEFAULT}"
      fi
    fi
    continue
  fi

  # --- GH-only keys: nothing more to do ---
  if [[ -v "ROUTE_GH_ONLY[${KEY}]" ]]; then
    continue
  fi

  # --- aggregate OpenShift patches ---
  if [[ -v "ROUTE_BACKEND[${KEY}]" ]]; then
    BACKEND_JQ_ARGS+=(--arg "${KEY}" "${VALUE}")
    BACKEND_KEY_LIST+=("${KEY}")
    BACKEND_TOUCHED=true
  fi
  if [[ -v "ROUTE_WORKER[${KEY}]" ]]; then
    WORKER_JQ_ARGS+=(--arg "${KEY}" "${VALUE}")
    WORKER_KEY_LIST+=("${KEY}")
    WORKER_TOUCHED=true
  fi
done

# ---------- apply OpenShift secret patches ----------

OS_PATCH_SUCCESS=0
OS_PATCH_FAIL=0

apply_os_patch() {
  local secret_name="$1"
  shift
  local -a jq_args=("$@")

  # Build patch JSON: {"stringData": {K1: "v1", K2: "v2", ...}}
  local patch
  if ! patch=$(jq -n "${jq_args[@]}" '{stringData: $ARGS.named}' 2>/dev/null); then
    log_error "Failed to construct patch for ${secret_name}"
    return 1
  fi

  if ! printf '%s' "${patch}" | oc patch secret "${secret_name}" \
      -n "${NAMESPACE}" --type=merge --patch-file=/dev/stdin &>/dev/null; then
    log_error "oc patch failed for secret: ${secret_name}"
    return 1
  fi
  return 0
}

if [[ "${BACKEND_TOUCHED}" == "true" ]]; then
  if [[ "${DRY_RUN}" == "true" ]]; then
    log_info "[DRY RUN] would patch ${BACKEND_SECRET} (${#BACKEND_KEY_LIST[@]} keys)"
  else
    if apply_os_patch "${BACKEND_SECRET}" "${BACKEND_JQ_ARGS[@]}"; then
      OS_PATCH_SUCCESS=$((OS_PATCH_SUCCESS + 1))
    else
      OS_PATCH_FAIL=$((OS_PATCH_FAIL + 1))
    fi
  fi
fi

if [[ "${WORKER_TOUCHED}" == "true" ]]; then
  if [[ "${DRY_RUN}" == "true" ]]; then
    log_info "[DRY RUN] would patch ${WORKER_SECRET} (${#WORKER_KEY_LIST[@]} keys)"
  else
    if apply_os_patch "${WORKER_SECRET}" "${WORKER_JQ_ARGS[@]}"; then
      OS_PATCH_SUCCESS=$((OS_PATCH_SUCCESS + 1))
    else
      OS_PATCH_FAIL=$((OS_PATCH_FAIL + 1))
    fi
  fi
fi

# ---------- patch Artifactory pull secret ----------
#
# Cross-namespace copy of the Archeobot-managed credential. Archeobot maintains
# the canonical secret in -tools but does NOT propagate to fd34fb-prod (the
# copy here was seeded manually when the platform pull flow was set up). So
# whenever the Artifactory SA is rotated (delete + recreate), we must refresh
# the dockerconfigjson here ourselves. Requires both USERNAME and PASSWORD.

ARTIFACTORY_TOUCHED=false
PULL_SECRET_PATCHED=false
PULL_SECRET_FAIL=false

if [[ -v "SECRETS[ARTIFACTORY_SA_USERNAME]" && -v "SECRETS[ARTIFACTORY_SA_PASSWORD]" ]]; then
  declare -A _PROCESS_SET=()
  for _k in "${KEYS_ORDERED[@]}"; do _PROCESS_SET["${_k}"]=1; done
  if [[ -v "_PROCESS_SET[ARTIFACTORY_SA_USERNAME]" && -v "_PROCESS_SET[ARTIFACTORY_SA_PASSWORD]" && \
        -n "${SECRETS[ARTIFACTORY_SA_USERNAME]}" && -n "${SECRETS[ARTIFACTORY_SA_PASSWORD]}" ]]; then
    ARTIFACTORY_TOUCHED=true
  fi
  unset _PROCESS_SET
elif [[ -v "SECRETS[ARTIFACTORY_SA_USERNAME]" || -v "SECRETS[ARTIFACTORY_SA_PASSWORD]" ]]; then
  log_warn "Only one of ARTIFACTORY_SA_USERNAME/PASSWORD present — skipping prod pull-secret patch (need both)"
fi

if [[ "${ARTIFACTORY_TOUCHED}" == "true" ]]; then
  if [[ "${DRY_RUN}" == "true" ]]; then
    log_info "[DRY RUN] would patch Artifactory pull secret in ${NAMESPACE}"
  else
    # Find the pull secret dynamically (name includes the rotating plate suffix)
    PULL_SECRET_NAME=$(oc get secret -n "${NAMESPACE}" --no-headers \
      -o custom-columns=NAME:.metadata.name,TYPE:.type 2>/dev/null \
      | awk '$1 ~ /^artifacts-pull-default-/ && $2 == "kubernetes.io/dockerconfigjson" {print $1; exit}')

    if [[ -z "${PULL_SECRET_NAME}" ]]; then
      log_error "No artifacts-pull-default-* dockerconfigjson secret found in ${NAMESPACE}"
      PULL_SECRET_FAIL=true
    else
      # Build dockerconfigjson via jq (stdin-safe), base64, then patch.
      _U="${SECRETS[ARTIFACTORY_SA_USERNAME]}"
      _P="${SECRETS[ARTIFACTORY_SA_PASSWORD]}"
      _DOCKERCFG=$(jq -nc --arg r "${ARTIFACTORY_REGISTRY}" --arg u "${_U}" --arg p "${_P}" \
        '{"auths": {($r): {"username": $u, "password": $p, "auth": ($u+":"+$p|@base64)}}}')
      _DOCKERCFG_B64=$(printf '%s' "${_DOCKERCFG}" | base64 -w0)
      _PATCH=$(jq -nc --arg v "${_DOCKERCFG_B64}" '{data: {".dockerconfigjson": $v}}')

      if printf '%s' "${_PATCH}" | oc patch secret "${PULL_SECRET_NAME}" \
          -n "${NAMESPACE}" --type=merge --patch-file=/dev/stdin &>/dev/null; then
        PULL_SECRET_PATCHED=true
      else
        log_error "Failed to patch pull secret: ${PULL_SECRET_NAME}"
        PULL_SECRET_FAIL=true
      fi
      unset _U _P _DOCKERCFG _DOCKERCFG_B64 _PATCH
    fi
  fi
fi

# ---------- rollout restart ----------

RESTARTED=0
declare -A _RESTARTED_SET=()

restart_deployment() {
  local svc="$1"
  local deploy="${INSTANCE_NAME}-${svc}"
  [[ -v "_RESTARTED_SET[${deploy}]" ]] && return 0
  if oc rollout restart "deployment/${deploy}" -n "${NAMESPACE}" &>/dev/null; then
    _RESTARTED_SET["${deploy}"]=1
    RESTARTED=$((RESTARTED + 1))
  else
    log_error "Failed to restart ${deploy}"
  fi
}

if [[ "${DRY_RUN}" != "true" && "${NO_RESTART}" != "true" ]]; then
  log_step "Restarting affected deployments"

  if [[ "${BACKEND_TOUCHED}" == "true" ]]; then
    restart_deployment "backend-services"
  fi

  if [[ "${WORKER_TOUCHED}" == "true" ]]; then
    restart_deployment "temporal-worker"
  fi

  # Artifactory pull-secret change: restart every deployment that pulls from
  # the registry so new/scaled pods don't hit stale creds cached in the API.
  if [[ "${ARTIFACTORY_TOUCHED}" == "true" ]]; then
    for svc in "${ARTIFACTORY_DEPLOYMENTS[@]}"; do
      restart_deployment "${svc}"
    done
  fi
fi

# ---------- summary ----------

log_step "Summary"

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "Mode: DRY RUN (no changes applied)"
  echo "Keys found in file:           ${TOTAL_FOUND}"
  echo "Unknown keys (skipped):       ${UNKNOWN_COUNT}"
  echo "Empty values (skipped):       ${SKIPPED_COUNT}"
else
  echo "Keys processed:               ${TOTAL_FOUND}"
  echo "Unknown keys (skipped):       ${UNKNOWN_COUNT}"
  echo "Empty values (skipped):       ${SKIPPED_COUNT}"
  echo "GitHub secrets updated:       ${GH_SUCCESS}"
  echo "GitHub secrets failed:        ${GH_FAIL}"
  echo "OpenShift secrets patched:    ${OS_PATCH_SUCCESS}"
  echo "OpenShift secrets failed:     ${OS_PATCH_FAIL}"
  if [[ "${ARTIFACTORY_TOUCHED}" == "true" ]]; then
    if [[ "${PULL_SECRET_PATCHED}" == "true" ]]; then
      echo "Pull secret patched:          yes"
    else
      echo "Pull secret patched:          no (FAILED)"
    fi
  fi
  if [[ "${NO_RESTART}" == "true" ]]; then
    echo "Deployment restarts:          skipped (--no-restart)"
  else
    echo "Deployments restarted:        ${RESTARTED}"
  fi
fi

# Non-zero exit code if any failures occurred
if [[ "${DRY_RUN}" != "true" ]] && \
   (( GH_FAIL > 0 || OS_PATCH_FAIL > 0 )) || \
   [[ "${PULL_SECRET_FAIL}" == "true" ]]; then
  exit 1
fi

exit 0
