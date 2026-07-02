#!/usr/bin/env bash
#
# Download benchmark runs for the extraction experiments and build a
# cross-experiment comparison report.
#
# Usage:
#   ./scripts/compare-experiment-benchmarks.sh                # pick latest completed per experiment
#   ./scripts/compare-experiment-benchmarks.sh -o /path/dir   # custom output dir
#
# Flow:
#   1. List runs in the seed-experiments-project via API.
#   2. Group by tag matching ^experiment-, pick the most recent COMPLETED run per tag.
#   3. Download each run JSON to <out-dir>/<slug>/run.json (uses existing
#      GET /runs/:runId/download endpoint).
#   4. Write <out-dir>/COMPARISON.md — a markdown table summarising metrics,
#      latency, and cost across experiments.
#
# Requires: jq, curl, TEST_API_KEY in env.

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:3002}"
PROJECT_ID="seed-experiments-project"
OUT_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--out)
      OUT_DIR="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,17p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v jq >/dev/null 2>&1; then
  echo "❌ jq is required (install via apt/brew/scoop)." >&2
  exit 1
fi

if [[ -z "${TEST_API_KEY:-}" ]]; then
  echo "❌ TEST_API_KEY not set. Source your override file or export it." >&2
  exit 1
fi

if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="/tmp/extraction-experiments-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$OUT_DIR"
echo "📁 Output directory: $OUT_DIR"

# 1. List runs.
runs_json=$(curl -sf -H "x-api-key: ${TEST_API_KEY}" \
  "${BACKEND_URL}/api/benchmark/projects/${PROJECT_ID}/runs") || {
    echo "❌ Failed to list runs from ${BACKEND_URL}" >&2
    exit 1
  }

run_count=$(echo "$runs_json" | jq 'length')
echo "ℹ️  Found ${run_count} run(s) in ${PROJECT_ID}"

# 2. For each tag matching ^experiment-, pick the most recent completed run.
#    Output one line per (slug, runId).
selection=$(echo "$runs_json" | jq -r '
  map(select(.status == "completed" or .status == "COMPLETED" or .status == "Completed"))
  | map(. as $r | ($r.tags // []) | map(select(startswith("experiment-"))) | map({slug: ., run: $r}))
  | flatten
  | group_by(.slug)
  | map(sort_by(.run.createdAt // .run.created_at) | last)
  | map("\(.slug)\t\(.run.id)")
  | .[]
')

if [[ -z "$selection" ]]; then
  echo "⚠ No completed runs tagged experiment-* in ${PROJECT_ID}." >&2
  echo "  Trigger runs first with: ./scripts/run-experiment-benchmarks.sh" >&2
  exit 2
fi

echo "🎯 Selected runs:"
echo "$selection" | sed 's/^/   /'

# 3. Download each.
report_rows=""
while IFS=$'\t' read -r slug run_id; do
  [[ -z "$slug" ]] && continue
  slug_dir="${OUT_DIR}/${slug}"
  mkdir -p "$slug_dir"
  out_file="${slug_dir}/run.json"
  echo "⬇  ${slug} (${run_id}) → ${out_file}"
  if ! curl -sf -H "x-api-key: ${TEST_API_KEY}" \
       "${BACKEND_URL}/api/benchmark/projects/${PROJECT_ID}/runs/${run_id}/download" \
       -o "$out_file"; then
    echo "    ✗ download failed"
    continue
  fi

  # 4a. Extract a row of metrics for the report.
  row=$(jq -r --arg slug "$slug" --arg runId "$run_id" '
    . as $root
    | ($root.summary // $root.run // $root) as $run
    | ($run.metrics // {}) as $m
    # Try several shapes for common metric names.
    | def num(k): ($m[k] // ($run[k] // null) // "—");
    | def fmt(v): if (v|type) == "number" then (v * 1000 | round / 1000 | tostring) else (v|tostring) end;
    | "| \($slug) | \($run.status // "—") | \(fmt(num("field_accuracy"))) | \(fmt(num("character_accuracy"))) | \(fmt(num("word_accuracy"))) | \($run.durationMs // $run.duration_ms // "—") | \(($run.totalCostUsd // $run.total_cost_usd // "—")|tostring) | \($runId) |"
  ' "$out_file" 2>/dev/null || echo "| $slug | (parse error) | — | — | — | — | — | $run_id |")
  report_rows+="${row}"$'\n'
done <<< "$selection"

# 4b. Write the comparison report.
report_path="${OUT_DIR}/COMPARISON.md"
{
  echo "# Extraction Experiments — Comparison Report"
  echo
  echo "Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "Project: \`${PROJECT_ID}\`"
  echo "Runs included: latest completed per \`experiment-{slug}\` tag."
  echo
  echo "## Summary"
  echo
  echo "| Slug | Status | Field acc. | Char acc. | Word acc. | Duration (ms) | Cost (USD) | Run ID |"
  echo "|---|---|---|---|---|---|---|---|"
  printf '%s' "$report_rows"
  echo
  echo "## Per-experiment downloads"
  echo
  while IFS=$'\t' read -r slug run_id; do
    [[ -z "$slug" ]] && continue
    echo "- \`${slug}\` → \`${OUT_DIR}/${slug}/run.json\` (run id \`${run_id}\`)"
  done <<< "$selection"
  echo
  echo "## Notes"
  echo
  echo "- Metrics shown are pulled from the run's \`metrics\` object using a best-effort parser."
  echo "- For per-sample details and field-class breakdowns, open the per-experiment \`run.json\` files."
  echo "- This report intentionally stays simple. Extend the script to add F1-by-field-class, latency P95, etc., once the metric shape is finalized across providers."
} > "$report_path"

echo
echo "✅ Comparison report: $report_path"
echo "   Per-experiment data: $OUT_DIR"
