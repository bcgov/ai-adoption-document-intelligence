#!/usr/bin/env bash
# Run a sequence of k6 load-test scenarios end-to-end and append one
# matrix row per scenario.
#
# Wraps `run-matrix.sh` so every per-scenario row carries the same
# columns (timestamp, params, throughput, latency, threshold pass,
# git ref, free-text notes, auto-generated result_summary).
#
# Usage:
#   ./run-suite.sh [options]
#
# By default the suite runs every scenario whose prerequisites are met
# given the current environment. Scenarios with missing prerequisites
# are skipped and reported, not failed.
#
# Required env (forwarded to underlying k6 scripts):
#   BASE_URL                       Backend API base URL
#   LOAD_TEST_API_KEY              x-api-key value (never logged)
#   LOAD_TEST_GROUP_ID             Target group id
#
# Optional env (gates scenarios):
#   LOAD_TEST_WORKFLOW_VERSION_ID  Required for upload-ocr / payload-sizes.
#                                  Auto-provisioned via setup-fixtures.sh if
#                                  unset (unless --no-auto-fixtures).
#   LOAD_TEST_BLOB_CLASSIFIER_NAME Required for blob-storage.
#                                  Auto-provisioned via setup-fixtures.sh if
#                                  unset (unless --no-auto-fixtures).
#
# Options:
#   --scenarios LIST            Comma-separated subset (default: all auto-detected).
#                               Allowed: smoke,datasets,documents,upload-ocr,
#                               payload-sizes,blob-storage,review-hitl
#   --vus N                     Forward as LOAD_TEST_VUS to scenarios that respect it
#   --duration STR              Forward as LOAD_TEST_DURATION (e.g. 60s, 5m)
#   --seeded-rows N             Recorded in matrix; no DB action
#   --instance NAME             Recorded in matrix (e.g. loadtest-1)
#   --namespace NAME            Recorded in matrix (e.g. fd34fb-test for a manual extra instance)
#   --notes "text"              Recorded in matrix (per-row)
#   --include-hitl              Force-include review-hitl (no env-level prereq check)
#   --matrix-csv PATH           Override the matrix CSV path
#   --stop-on-fail              Abort after the first scenario whose thresholds fail
#                               (default: continue and report the suite exit code at end)
#   --no-auto-fixtures          Do not call setup-fixtures.sh; rely on existing env.
#   --help                      Show this message

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_MATRIX="${SCRIPT_DIR}/run-matrix.sh"
SETUP_FIXTURES="${SCRIPT_DIR}/setup-fixtures.sh"
ALL_SCENARIOS=(smoke datasets documents upload-ocr payload-sizes blob-storage review-hitl)

scenarios_arg=""
vus=""
duration=""
seeded_rows=""
instance="${LOAD_TEST_INSTANCE:-}"
namespace="${LOAD_TEST_NAMESPACE:-}"
notes=""
include_hitl="false"
matrix_csv=""
stop_on_fail="false"
auto_fixtures="true"

print_help() {
  awk 'NR==1 { next } /^[^#]/ { exit } { sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenarios)     scenarios_arg="$2"; shift 2 ;;
    --vus)           vus="$2"; shift 2 ;;
    --duration)      duration="$2"; shift 2 ;;
    --seeded-rows)   seeded_rows="$2"; shift 2 ;;
    --instance)      instance="$2"; shift 2 ;;
    --namespace)     namespace="$2"; shift 2 ;;
    --notes)         notes="$2"; shift 2 ;;
    --include-hitl)  include_hitl="true"; shift 1 ;;
    --matrix-csv)    matrix_csv="$2"; shift 2 ;;
    --stop-on-fail)  stop_on_fail="true"; shift 1 ;;
    --no-auto-fixtures) auto_fixtures="false"; shift 1 ;;
    -h|--help)       print_help; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -x "${RUN_MATRIX}" ]]; then
  echo "missing or non-executable runner: ${RUN_MATRIX}" >&2
  exit 3
fi

if [[ -z "${BASE_URL:-}" ]]; then
  echo "BASE_URL must be set (e.g. https://<instance>-backend-<ns>.apps...)" >&2
  exit 4
fi
if [[ -z "${LOAD_TEST_API_KEY:-}" ]]; then
  echo "LOAD_TEST_API_KEY must be set (never log or commit it)" >&2
  exit 4
fi
if [[ -z "${LOAD_TEST_GROUP_ID:-}" ]]; then
  echo "LOAD_TEST_GROUP_ID must be set" >&2
  exit 4
fi

# Resolve which scenarios to run, either from --scenarios or the auto list.
selected=()
if [[ -n "${scenarios_arg}" ]]; then
  IFS=',' read -r -a selected <<< "${scenarios_arg}"
else
  selected=("${ALL_SCENARIOS[@]}")
fi

# Auto-provision fixtures (workflow + classifier) when the corresponding env
# var is unset and at least one selected scenario depends on it. Idempotent:
# setup-fixtures.sh reuses existing resources by name.
selection_needs() {
  local target="$1" s
  for s in "${selected[@]}"; do
    [[ "${s}" == "${target}" ]] && return 0
  done
  return 1
}

selection_needs_workflow() {
  selection_needs "upload-ocr" || selection_needs "payload-sizes"
}

selection_needs_classifier() {
  selection_needs "blob-storage"
}

if [[ "${auto_fixtures}" == "true" ]]; then
  fixtures_modes=()
  if [[ -z "${LOAD_TEST_WORKFLOW_VERSION_ID:-}" ]] && selection_needs_workflow; then
    fixtures_modes+=("workflow")
  fi
  if [[ -z "${LOAD_TEST_BLOB_CLASSIFIER_NAME:-}" ]] && selection_needs_classifier; then
    fixtures_modes+=("classifier")
  fi
  if [[ "${#fixtures_modes[@]}" -gt 0 ]]; then
    if [[ ! -x "${SETUP_FIXTURES}" ]]; then
      echo "[suite] auto-fixtures requested but ${SETUP_FIXTURES} is missing or not executable" >&2
      exit 5
    fi
    fixtures_args=()
    if [[ "${#fixtures_modes[@]}" -eq 1 ]]; then
      case "${fixtures_modes[0]}" in
        workflow)   fixtures_args+=("--workflows-only") ;;
        classifier) fixtures_args+=("--classifier-only") ;;
      esac
    fi
    echo "[suite] auto-provisioning fixtures (${fixtures_modes[*]}) via setup-fixtures.sh"
    fixtures_out=""
    if ! fixtures_out="$("${SETUP_FIXTURES}" "${fixtures_args[@]}")"; then
      echo "[suite] setup-fixtures.sh failed; rerun with --no-auto-fixtures or set the env vars manually" >&2
      exit 6
    fi
    # Source the `export KEY=VALUE` lines so run-matrix.sh (and the npm k6:*
    # scripts beneath it) inherit them. eval is intentional and safe here:
    # the input is the trusted setup-fixtures.sh output, which prints exactly
    # `export LOAD_TEST_*=<id>` lines.
    eval "${fixtures_out}"
  fi
fi

# Per-scenario gating. Returns 0 if runnable; non-zero with a reason on stdout
# when skipping.
gate_scenario() {
  local name="$1"
  case "${name}" in
    smoke|datasets|documents)
      return 0
      ;;
    upload-ocr|payload-sizes)
      if [[ -z "${LOAD_TEST_WORKFLOW_VERSION_ID:-}" ]]; then
        echo "missing LOAD_TEST_WORKFLOW_VERSION_ID"
        return 1
      fi
      return 0
      ;;
    blob-storage)
      if [[ -z "${LOAD_TEST_BLOB_CLASSIFIER_NAME:-}" ]]; then
        echo "missing LOAD_TEST_BLOB_CLASSIFIER_NAME"
        return 1
      fi
      return 0
      ;;
    review-hitl)
      if [[ "${include_hitl}" != "true" ]]; then
        echo "review-hitl requires HITL fixtures (run npm run load-test:hitl-fixtures first, then pass --include-hitl)"
        return 1
      fi
      return 0
      ;;
    *)
      echo "unknown scenario"
      return 2
      ;;
  esac
}

# Build a row of common args for run-matrix.sh based on suite-level options.
# Emits null-delimited args. When no suite-level flags are set the function
# exits without printing anything (bash printf would otherwise emit a single
# empty record, which run-matrix.sh would then reject as `unknown option:`).
build_matrix_args() {
  local args=()
  [[ -n "${vus}" ]]          && args+=(--vus "${vus}")
  [[ -n "${duration}" ]]     && args+=(--duration "${duration}")
  [[ -n "${seeded_rows}" ]]  && args+=(--seeded-rows "${seeded_rows}")
  [[ -n "${instance}" ]]     && args+=(--instance "${instance}")
  [[ -n "${namespace}" ]]    && args+=(--namespace "${namespace}")
  [[ -n "${notes}" ]]        && args+=(--notes "${notes}")
  [[ -n "${matrix_csv}" ]]   && args+=(--matrix-csv "${matrix_csv}")
  if [[ "${#args[@]}" -gt 0 ]]; then
    printf '%s\0' "${args[@]}"
  fi
}

ran=()
ran_status=()
ran_summary=()
skipped=()
skipped_reason=()
suite_exit=0
suite_started_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

echo "[suite] started_at=${suite_started_at} scenarios=(${selected[*]})"

for s in "${selected[@]}"; do
  reason=""
  if ! reason=$(gate_scenario "${s}"); then
    echo "[suite] SKIP ${s}: ${reason}"
    skipped+=("${s}"); skipped_reason+=("${reason}")
    continue
  fi
  echo ""
  echo "============================================================"
  echo "[suite] running scenario: ${s}"
  echo "============================================================"
  matrix_args=()
  while IFS= read -r -d '' a; do matrix_args+=("$a"); done < <(build_matrix_args)
  set +e
  "${RUN_MATRIX}" "${s}" "${matrix_args[@]}"
  rc=$?
  set -e
  ran+=("${s}"); ran_status+=("${rc}")
  # Pull this scenario's last appended row's result_summary out of the CSV.
  csv_path="${matrix_csv:-${SCRIPT_DIR}/test-matrix.csv}"
  if [[ -f "${csv_path}" ]]; then
    # Last line, scenario must match column 3, take the trailing column 28.
    last_summary=$(awk -F',' -v want="${s}" '
      $3 == want { row = $0 }
      END {
        if (row == "") { print ""; exit }
        n = split(row, f, ",")
        # Last cell is result_summary; if it was quoted (because it contained
        # commas), reassemble. With our printf format it is unquoted.
        print f[n]
      }
    ' "${csv_path}")
    ran_summary+=("${last_summary}")
  else
    ran_summary+=("(no CSV found)")
  fi
  if [[ "${rc}" -ne 0 ]]; then
    suite_exit="${rc}"
    if [[ "${stop_on_fail}" == "true" ]]; then
      echo "[suite] stop_on_fail set; aborting after non-zero exit from ${s}"
      break
    fi
  fi
done

echo ""
echo "============================================================"
echo "[suite] summary"
echo "============================================================"
for i in "${!ran[@]}"; do
  rc="${ran_status[$i]}"
  state="pass"
  [[ "${rc}" -ne 0 ]] && state="fail"
  printf '  [%s] %-15s rc=%s  %s\n' "${state}" "${ran[$i]}" "${rc}" "${ran_summary[$i]}"
done
for i in "${!skipped[@]}"; do
  printf '  [skip] %-15s %s\n' "${skipped[$i]}" "${skipped_reason[$i]}"
done
echo ""
echo "[suite] suite_exit=${suite_exit} (0 = every executed scenario passed thresholds)"
exit "${suite_exit}"
