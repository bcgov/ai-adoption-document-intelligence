#!/usr/bin/env bash
#
# Trigger benchmark runs for the extraction experiments.
#
# Usage:
#   ./scripts/run-experiment-benchmarks.sh                # run all 5 experiments
#   ./scripts/run-experiment-benchmarks.sh 02 04          # run only E02 and E04
#
# Each experiment must have seeded a BenchmarkDefinition with id
# `seed-experiment-{slug}-definition` (see experiments/briefs/_shared-rules.md
# checklist item 11).
#
# Environment:
#   TEST_API_KEY  — backend API key (x-api-key header). Falls back to the
#                   TEST_API_KEY in your override file if running this from a
#                   shell that has it sourced.
#   BACKEND_URL   — defaults to http://localhost:3002
#
# Exits 0 if every triggered run accepted (HTTP 201). Non-zero otherwise.

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:3002}"
PROJECT_ID="seed-experiments-project"

if [[ -z "${TEST_API_KEY:-}" ]]; then
  echo "❌ TEST_API_KEY not set. Source your override file or export it." >&2
  exit 1
fi

ALL_SLUGS=(
  "01-neural-doc-intelligence"
  "02-mistral-doc-ai-azure"
  "03-content-understanding"
  "04-vlm-direct"
  "05-vlm-ocr-hybrid"
)

# Filter: if args given, keep only matching slugs (match by the leading number).
if [[ $# -gt 0 ]]; then
  filtered=()
  for arg in "$@"; do
    for slug in "${ALL_SLUGS[@]}"; do
      if [[ "$slug" == "$arg"* ]]; then
        filtered+=("$slug")
      fi
    done
  done
  if [[ ${#filtered[@]} -eq 0 ]]; then
    echo "❌ No experiment slugs matched: $*" >&2
    exit 1
  fi
  SLUGS=("${filtered[@]}")
else
  SLUGS=("${ALL_SLUGS[@]}")
fi

failures=0
for slug in "${SLUGS[@]}"; do
  definition_id="seed-experiment-${slug}-definition"
  url="${BACKEND_URL}/api/benchmark/projects/${PROJECT_ID}/definitions/${definition_id}/runs"
  echo "▶ Triggering ${slug}: POST ${url}"
  # `tags` must be an object (CreateRunDto @IsObject), not an array.
  status=$(curl -s -o /tmp/run-experiment-${slug}.json -w "%{http_code}" \
    -X POST \
    -H "x-api-key: ${TEST_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"tags\": {\"experiment\": \"${slug}\"}, \"persistOcrCache\": true}" \
    "${url}" || echo "000")

  if [[ "$status" == "201" || "$status" == "200" ]]; then
    run_id=$(grep -oE '"id":"[^"]+"' "/tmp/run-experiment-${slug}.json" | head -n1 | cut -d'"' -f4 || true)
    echo "  ✓ accepted (run id: ${run_id:-unknown})"
  else
    body=$(cat "/tmp/run-experiment-${slug}.json" 2>/dev/null || echo "(no body)")
    echo "  ✗ HTTP ${status}: ${body}"
    failures=$((failures + 1))
  fi
done

echo
if [[ $failures -gt 0 ]]; then
  echo "❌ ${failures} of ${#SLUGS[@]} runs failed to trigger."
  exit 1
fi
echo "✅ All ${#SLUGS[@]} runs triggered successfully."
echo "   Watch progress at: ${BACKEND_URL}/api/benchmark/projects/${PROJECT_ID}/runs"
