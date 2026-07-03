#!/usr/bin/env bash
# Idempotently provision the API-side fixtures the k6 scenarios need:
#   1. A workflow lineage + version (used by upload-ocr / payload-sizes
#      via LOAD_TEST_WORKFLOW_VERSION_ID).
#   2. A classifier (used by blob-storage via LOAD_TEST_BLOB_CLASSIFIER_NAME).
#
# Looks up by name first; only creates if missing. Reusing across runs is
# safe because the load-test scenarios target the resources by name/id and
# do not mutate them.
#
# Usage:
#   ./setup-fixtures.sh [options]
#
# Required env:
#   BASE_URL                 Backend API base URL
#   LOAD_TEST_API_KEY        x-api-key value (never logged)
#   LOAD_TEST_GROUP_ID       Target group id
#
# Options:
#   --workflow-name NAME       Workflow name to look up / create
#                              (default: loadtest-standard-ocr)
#   --classifier-name NAME     Classifier name to look up / create
#                              (default: loadtest-blob-classifier)
#   --workflow-template PATH   Graph workflow JSON used when creating
#                              (default: docs-md/graph-workflows/templates/standard-ocr-workflow.json)
#   --workflows-only           Skip classifier provisioning
#   --classifier-only          Skip workflow provisioning
#   --quiet                    Suppress info messages on stderr
#   --help                     Show this message
#
# Output (stdout): one `export KEY=VALUE` per line, ready for eval / sourcing
# in a POSIX shell. The export is required so child processes (npm scripts,
# docker containers running k6) inherit the values.
#   export LOAD_TEST_WORKFLOW_VERSION_ID=<id>
#   export LOAD_TEST_BLOB_CLASSIFIER_NAME=<name>
#
# Examples:
#   eval "$(./setup-fixtures.sh)"            # export both into the current shell
#   ./setup-fixtures.sh --workflows-only     # only ensure the workflow exists
#   ./setup-fixtures.sh > .fixtures.env      # capture for later sourcing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

DEFAULT_WORKFLOW_NAME="loadtest-standard-ocr"
DEFAULT_CLASSIFIER_NAME="loadtest-blob-classifier"
DEFAULT_TEMPLATE="${REPO_ROOT}/docs-md/graph-workflows/templates/standard-ocr-workflow.json"

workflow_name="${LOAD_TEST_FIXTURE_WORKFLOW_NAME:-${DEFAULT_WORKFLOW_NAME}}"
classifier_name="${LOAD_TEST_FIXTURE_CLASSIFIER_NAME:-${DEFAULT_CLASSIFIER_NAME}}"
workflow_template="${LOAD_TEST_FIXTURE_WORKFLOW_TEMPLATE:-${DEFAULT_TEMPLATE}}"
mode="both"
quiet="false"

print_help() {
  awk 'NR==1 { next } /^[^#]/ { exit } { sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workflow-name)     workflow_name="$2"; shift 2 ;;
    --classifier-name)   classifier_name="$2"; shift 2 ;;
    --workflow-template) workflow_template="$2"; shift 2 ;;
    --workflows-only)    mode="workflows"; shift 1 ;;
    --classifier-only)   mode="classifier"; shift 1 ;;
    --quiet)             quiet="true"; shift 1 ;;
    -h|--help)           print_help; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

log() {
  [[ "${quiet}" == "true" ]] && return 0
  printf '[fixtures] %s\n' "$*" >&2
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[fixtures] missing required command: $1" >&2
    exit 3
  fi
}
require_cmd curl
require_cmd jq

if [[ -z "${BASE_URL:-}" ]]; then
  echo "[fixtures] BASE_URL must be set (e.g. https://<instance>-backend-<ns>.apps...)" >&2
  exit 4
fi
if [[ -z "${LOAD_TEST_API_KEY:-}" ]]; then
  echo "[fixtures] LOAD_TEST_API_KEY must be set (never log or commit it)" >&2
  exit 4
fi
if [[ -z "${LOAD_TEST_GROUP_ID:-}" ]]; then
  echo "[fixtures] LOAD_TEST_GROUP_ID must be set" >&2
  exit 4
fi

api_get() {
  local path="$1"
  curl -sS --max-time 30 \
    -H "x-api-key: ${LOAD_TEST_API_KEY}" \
    -w '\n__HTTP_CODE__%{http_code}' \
    "${BASE_URL}${path}"
}

api_post_json() {
  local path="$1"
  local body_path="$2"
  curl -sS --max-time 60 \
    -H "x-api-key: ${LOAD_TEST_API_KEY}" \
    -H "Content-Type: application/json" \
    -X POST --data-binary "@${body_path}" \
    -w '\n__HTTP_CODE__%{http_code}' \
    "${BASE_URL}${path}"
}

# Splits the api_* response into status code (last line) and JSON body.
parse_status() { tail -n 1 <<< "$1" | sed 's/^__HTTP_CODE__//'; }
parse_body()   { sed '$d' <<< "$1"; }

# Locate an existing workflow with the given name. Echoes its workflowVersionId
# on stdout if found; empty if not.
find_workflow_version_id() {
  local raw status body wfvid
  raw="$(api_get "/api/workflows?groupId=$(jq -nr --arg v "${LOAD_TEST_GROUP_ID}" '$v|@uri')")"
  status="$(parse_status "${raw}")"
  body="$(parse_body "${raw}")"
  if [[ "${status}" != "200" ]]; then
    echo "[fixtures] GET /api/workflows -> HTTP ${status}: ${body}" >&2
    return 5
  fi
  wfvid="$(jq -r --arg name "${workflow_name}" '
    (.workflows // [])
    | map(select(.name == $name))
    | first.workflowVersionId // empty
  ' <<< "${body}")"
  printf '%s' "${wfvid}"
}

# Create the workflow lineage + initial version using the JSON template.
# Echoes the new workflowVersionId on stdout.
create_workflow() {
  local body_path raw status body new_wfvid
  if [[ ! -f "${workflow_template}" ]]; then
    echo "[fixtures] workflow template not found: ${workflow_template}" >&2
    return 6
  fi
  body_path="$(mktemp -t fixtures-wf.XXXXXX.json)"
  trap 'rm -f "${body_path}"' RETURN
  jq -n \
    --arg name "${workflow_name}" \
    --arg description "Load-test workflow auto-provisioned by tools/load-testing/setup-fixtures.sh" \
    --arg groupId "${LOAD_TEST_GROUP_ID}" \
    --slurpfile config "${workflow_template}" \
    '{name: $name, description: $description, groupId: $groupId, config: $config[0]}' \
    > "${body_path}"

  raw="$(api_post_json "/api/workflows" "${body_path}")"
  status="$(parse_status "${raw}")"
  body="$(parse_body "${raw}")"
  if [[ "${status}" != "201" ]]; then
    echo "[fixtures] POST /api/workflows -> HTTP ${status}: ${body}" >&2
    return 7
  fi
  new_wfvid="$(jq -r '.workflow.workflowVersionId // empty' <<< "${body}")"
  if [[ -z "${new_wfvid}" ]]; then
    echo "[fixtures] POST /api/workflows succeeded but response missing workflowVersionId" >&2
    return 8
  fi
  printf '%s' "${new_wfvid}"
}

# Locate an existing classifier with the given name in the target group.
# Echoes the name on stdout if found; empty if not.
find_classifier_name() {
  local raw status body name
  raw="$(api_get "/api/azure/classifier?group_id=$(jq -nr --arg v "${LOAD_TEST_GROUP_ID}" '$v|@uri')")"
  status="$(parse_status "${raw}")"
  body="$(parse_body "${raw}")"
  if [[ "${status}" != "200" ]]; then
    echo "[fixtures] GET /api/azure/classifier -> HTTP ${status}: ${body}" >&2
    return 5
  fi
  name="$(jq -r --arg name "${classifier_name}" '
    .
    | (if type == "array" then . else [] end)
    | map(select(.name == $name))
    | first.name // empty
  ' <<< "${body}")"
  printf '%s' "${name}"
}

create_classifier() {
  local body_path raw status body
  body_path="$(mktemp -t fixtures-cls.XXXXXX.json)"
  trap 'rm -f "${body_path}"' RETURN
  jq -n \
    --arg name "${classifier_name}" \
    --arg description "Load-test classifier auto-provisioned by tools/load-testing/setup-fixtures.sh" \
    --arg group_id "${LOAD_TEST_GROUP_ID}" \
    '{name: $name, description: $description, source: "AZURE", group_id: $group_id}' \
    > "${body_path}"

  raw="$(api_post_json "/api/azure/classifier" "${body_path}")"
  status="$(parse_status "${raw}")"
  body="$(parse_body "${raw}")"
  case "${status}" in
    201)
      jq -r '.name // empty' <<< "${body}"
      ;;
    403)
      # Backend returns ForbiddenException("Classifier with this name already exists.")
      # if a TOCTOU happened between our find and create; fall back to find.
      if jq -e 'tostring | test("already exists"; "i")' <<< "${body}" >/dev/null 2>&1; then
        find_classifier_name
      else
        echo "[fixtures] POST /api/azure/classifier -> HTTP 403: ${body}" >&2
        return 7
      fi
      ;;
    *)
      echo "[fixtures] POST /api/azure/classifier -> HTTP ${status}: ${body}" >&2
      return 7
      ;;
  esac
}

# --- Workflow ---------------------------------------------------------------

if [[ "${mode}" == "both" || "${mode}" == "workflows" ]]; then
  log "checking for existing workflow name=${workflow_name} group=${LOAD_TEST_GROUP_ID}"
  existing_wfvid="$(find_workflow_version_id)"
  if [[ -n "${existing_wfvid}" ]]; then
    log "reusing workflow workflowVersionId=${existing_wfvid}"
    workflow_version_id="${existing_wfvid}"
  else
    log "creating workflow from template=${workflow_template}"
    workflow_version_id="$(create_workflow)"
    log "created workflow workflowVersionId=${workflow_version_id}"
  fi
  printf 'export LOAD_TEST_WORKFLOW_VERSION_ID=%s\n' "${workflow_version_id}"
fi

# --- Classifier -------------------------------------------------------------

if [[ "${mode}" == "both" || "${mode}" == "classifier" ]]; then
  log "checking for existing classifier name=${classifier_name} group=${LOAD_TEST_GROUP_ID}"
  existing_cls="$(find_classifier_name)"
  if [[ -n "${existing_cls}" ]]; then
    log "reusing classifier name=${existing_cls}"
    resolved_classifier="${existing_cls}"
  else
    log "creating classifier name=${classifier_name}"
    resolved_classifier="$(create_classifier)"
    log "created classifier name=${resolved_classifier}"
  fi
  printf 'export LOAD_TEST_BLOB_CLASSIFIER_NAME=%s\n' "${resolved_classifier}"
fi
