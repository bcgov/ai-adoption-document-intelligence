#!/usr/bin/env bash
set -euo pipefail

MAX_ITERATIONS="${1:-10}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Ralph loop (Claude Code)"

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo "=== Iteration $i ==="

  OUTPUT="$(
    cat "$SCRIPT_DIR/prompt.md" \
      | claude 2>&1 \
      | tee /dev/stderr
  )" || true

  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo "Done"
    exit 0
  fi

  sleep 2
done

echo "Max iterations reached"
exit 1
