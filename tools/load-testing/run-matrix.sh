#!/usr/bin/env bash
# Run a k6 scenario and append a row to the test-matrix CSV.
#
# Wraps the existing `npm run k6:<scenario>` scripts so the same env vars
# (BASE_URL, LOAD_TEST_API_KEY, LOAD_TEST_GROUP_ID, LOAD_TEST_VUS,
#  LOAD_TEST_DURATION, ...) work unchanged. After the run it parses the
# k6 --summary-export JSON for that scenario and appends a single row to
# the matrix CSV (default tools/load-testing/test-matrix.csv).
#
# Usage:
#   ./run-matrix.sh <scenario> [options]
#
# Scenarios: smoke | datasets | documents | upload-ocr | payload-sizes |
#            blob-storage | review-hitl
#
# Common options:
#   --vus N                 Set LOAD_TEST_VUS for this run
#   --duration STR          Set LOAD_TEST_DURATION (e.g. 60s, 5m)
#   --seeded-rows N         Recorded as-is in the matrix (no DB action)
#   --instance NAME         Defaults to $LOAD_TEST_INSTANCE
#   --namespace NAME        Defaults to $LOAD_TEST_NAMESPACE
#   --notes "text"          Free-text column in the matrix
#   --extra-params "text"   Free-text column for scenario-specific overrides
#   --matrix-csv PATH       Override CSV path (default test-matrix.csv next to this script)
#   --no-run                Skip the k6 run; parse the existing summary JSON only
#   --summary-json PATH     Override the summary path (default results/k6-<scenario>-summary.json)
#   --help                  Show this message

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_MATRIX_CSV="${SCRIPT_DIR}/test-matrix.csv"

scenario=""
vus=""
duration=""
seeded_rows=""
instance="${LOAD_TEST_INSTANCE:-}"
namespace="${LOAD_TEST_NAMESPACE:-}"
notes=""
extra_params=""
matrix_csv="${DEFAULT_MATRIX_CSV}"
no_run="false"
summary_json=""

print_help() {
  awk 'NR==1 { next } /^[^#]/ { exit } { sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
}

if [[ $# -eq 0 ]]; then print_help; exit 1; fi

case "$1" in
  -h|--help) print_help; exit 0 ;;
esac
scenario="$1"; shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vus)            vus="$2"; shift 2 ;;
    --duration)       duration="$2"; shift 2 ;;
    --seeded-rows)    seeded_rows="$2"; shift 2 ;;
    --instance)       instance="$2"; shift 2 ;;
    --namespace)      namespace="$2"; shift 2 ;;
    --notes)          notes="$2"; shift 2 ;;
    --extra-params)   extra_params="$2"; shift 2 ;;
    --matrix-csv)     matrix_csv="$2"; shift 2 ;;
    --no-run)         no_run="true"; shift 1 ;;
    --summary-json)   summary_json="$2"; shift 2 ;;
    -h|--help)        print_help; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

case "${scenario}" in
  smoke|datasets|documents|upload-ocr|payload-sizes|blob-storage|review-hitl) ;;
  *) echo "unknown scenario: ${scenario}" >&2; print_help; exit 2 ;;
esac

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not installed" >&2; exit 3
fi

if [[ -z "${summary_json}" ]]; then
  summary_json="${SCRIPT_DIR}/results/k6-${scenario}-summary.json"
fi

base_url="${BASE_URL:-}"
api_key_present="false"
[[ -n "${LOAD_TEST_API_KEY:-}" ]] && api_key_present="true"
group_id="${LOAD_TEST_GROUP_ID:-seed-default-group}"

# Run k6 unless asked to skip. The npm scripts read LOAD_TEST_VUS/DURATION
# from the environment (where the underlying script supports it); for
# scenarios that ignore them we still record the *requested* values and
# the actual sample count is reflected in iterations/req_total.
exit_code=0
if [[ "${no_run}" != "true" ]]; then
  cmd_env=()
  [[ -n "${vus}" ]] && cmd_env+=("LOAD_TEST_VUS=${vus}")
  [[ -n "${duration}" ]] && cmd_env+=("LOAD_TEST_DURATION=${duration}")

  echo "[matrix] running scenario=${scenario} vus=${vus:-default} duration=${duration:-default}"
  set +e
  ( cd "${SCRIPT_DIR}" && env "${cmd_env[@]}" npm run "k6:${scenario}" )
  exit_code=$?
  set -e
  echo "[matrix] k6 exit_code=${exit_code} (0 = all thresholds passed)"
fi

if [[ ! -f "${summary_json}" ]]; then
  echo "[matrix] summary file missing: ${summary_json}" >&2
  exit 4
fi

# Parse k6 --summary-export shape:
#   metrics.http_req_duration.{avg,med,max,p(95)}
#   metrics.http_reqs.{count,rate}
#   metrics.iterations.count
#   metrics.http_req_failed.value (0..1)
#   metrics.data_received.count (bytes), metrics.data_sent.count (bytes)
#   thresholds.<expr>: true means crossed (failed); false means passed
read_metric() {
  jq -r "${1}" "${summary_json}"
}

iterations=$(read_metric '.metrics.iterations.count // 0')
req_total=$(read_metric '.metrics.http_reqs.count // 0')
req_per_sec=$(read_metric '.metrics.http_reqs.rate // 0')
failure_rate=$(read_metric '.metrics.http_req_failed.value // 0')
latency_avg=$(read_metric '.metrics.http_req_duration.avg // 0')
latency_p50=$(read_metric '.metrics.http_req_duration.med // 0')
latency_p95=$(read_metric '.metrics.http_req_duration["p(95)"] // 0')
latency_max=$(read_metric '.metrics.http_req_duration.max // 0')
data_received_bytes=$(read_metric '.metrics.data_received.count // 0')
data_sent_bytes=$(read_metric '.metrics.data_sent.count // 0')

# Aggregate threshold pass: every threshold across every metric must be
# `false` (i.e. did not cross the bound). Empty thresholds set is a pass.
thresholds_pass=$(jq -r '
  [.metrics
    | to_entries[]
    | .value.thresholds // {}
    | to_entries[]
    | .value]
  | if length == 0 then "true"
    elif any(. == true) then "false"
    else "true"
    end
' "${summary_json}")

# Round bytes to MB / kB with 2 decimals.
data_received_mb=$(awk -v b="${data_received_bytes}" 'BEGIN{ printf "%.2f", b/1048576 }')
data_sent_kb=$(awk -v b="${data_sent_bytes}" 'BEGIN{ printf "%.2f", b/1024 }')
req_per_sec_fmt=$(awk -v r="${req_per_sec}" 'BEGIN{ printf "%.4f", r }')
failure_rate_fmt=$(awk -v r="${failure_rate}" 'BEGIN{ printf "%.4f", r }')
latency_avg_ms=$(awk -v v="${latency_avg}" 'BEGIN{ printf "%.2f", v }')
latency_p50_ms=$(awk -v v="${latency_p50}" 'BEGIN{ printf "%.2f", v }')
latency_p95_ms=$(awk -v v="${latency_p95}" 'BEGIN{ printf "%.2f", v }')
latency_max_ms=$(awk -v v="${latency_max}" 'BEGIN{ printf "%.2f", v }')

git_branch=""; git_sha=""
if git -C "${SCRIPT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_branch=$(git -C "${SCRIPT_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  git_sha=$(git -C "${SCRIPT_DIR}" rev-parse --short HEAD 2>/dev/null || true)
fi

timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
run_id="${scenario}-$(date -u '+%Y%m%d-%H%M%S')${vus:+-vus${vus}}"

# Build a one-line, human-skimmable result_summary cell. Latencies render as
# milliseconds below 1000ms and as seconds (2 decimals) at or above that.
fmt_latency() {
  awk -v v="$1" 'BEGIN{ if (v >= 1000) printf "%.2fs", v/1000; else printf "%.0fms", v }'
}
failure_pct=$(awk -v r="${failure_rate}" 'BEGIN{ printf "%.2f", r*100 }')
threshold_label="pass"
[[ "${thresholds_pass}" == "false" ]] && threshold_label="fail"
result_summary=$(printf '%s reqs · %s req/s · %s%% fail · p50 %s · p95 %s · max %s · thresholds %s' \
  "${req_total}" \
  "${req_per_sec_fmt}" \
  "${failure_pct}" \
  "$(fmt_latency "${latency_p50}")" \
  "$(fmt_latency "${latency_p95}")" \
  "$(fmt_latency "${latency_max}")" \
  "${threshold_label}")

# RFC 4180 CSV escaping for fields that may contain commas, quotes or newlines.
csv_escape() {
  local v="$1"
  if [[ "$v" =~ [\",$'\n'] ]]; then
    v=${v//\"/\"\"}
    printf '"%s"' "$v"
  else
    printf '%s' "$v"
  fi
}

header='timestamp_utc,run_id,scenario,instance,namespace,base_url,group_id,api_key_present,vus_requested,duration_requested,seeded_rows,extra_params,iterations,req_total,req_per_sec,failure_rate,latency_avg_ms,latency_p50_ms,latency_p95_ms,latency_max_ms,data_received_mb,data_sent_kb,thresholds_pass,k6_exit_code,git_branch,git_sha,notes,result_summary'

if [[ ! -f "${matrix_csv}" ]] || [[ ! -s "${matrix_csv}" ]]; then
  mkdir -p "$(dirname "${matrix_csv}")"
  printf '%s\n' "${header}" > "${matrix_csv}"
fi

row=""
append() { row="${row:+${row},}$(csv_escape "$1")"; }
append "${timestamp}"
append "${run_id}"
append "${scenario}"
append "${instance}"
append "${namespace}"
append "${base_url}"
append "${group_id}"
append "${api_key_present}"
append "${vus}"
append "${duration}"
append "${seeded_rows}"
append "${extra_params}"
append "${iterations}"
append "${req_total}"
append "${req_per_sec_fmt}"
append "${failure_rate_fmt}"
append "${latency_avg_ms}"
append "${latency_p50_ms}"
append "${latency_p95_ms}"
append "${latency_max_ms}"
append "${data_received_mb}"
append "${data_sent_kb}"
append "${thresholds_pass}"
append "${exit_code}"
append "${git_branch}"
append "${git_sha}"
append "${notes}"
append "${result_summary}"

printf '%s\n' "${row}" >> "${matrix_csv}"
echo "[matrix] appended row to ${matrix_csv}"
echo
echo "  scenario=${scenario}  vus=${vus:-?}  duration=${duration:-?}"
echo "  ${result_summary}"
echo "  k6_exit=${exit_code}"

exit "${exit_code}"
