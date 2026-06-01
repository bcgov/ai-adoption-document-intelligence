#!/usr/bin/env bash
# Seed the SDPR HITL timing experiment Documents + OcrResults by streaming
# the benchmark JSON from a UNC share through stdin into the tsx seed script.
# No JSON bytes touch local disk.
#
# Run from repo root. Requires:
#   - apps/backend-services .env with valid DATABASE_URL
#   - npm run db:seed has been run (seeddefaultgroup must exist)
#
# Usage:
#   bash scripts/sdpr-experiment/seed-from-share.sh \
#       "\\widget\SDPRDocuments\convert_sd0081\100-doc\2026-05-05 performance report\benchmark-result-neural-normalized.json" \
#       [--limit 1]   # for end-to-end smoke test
set -euo pipefail

POWERSHELL="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

[[ $# -lt 1 ]] && { echo "usage: $0 <benchmark-json-unc-path> [--limit N] [--model-id ID]" >&2; exit 2; }
INPUT="$1"; shift

# Forward env from the backend .env so DATABASE_URL is available to tsx.
set -a
# shellcheck disable=SC1091
source "${REPO_ROOT}/apps/backend-services/.env"
set +a

if [[ "$INPUT" == \\\\* || "$INPUT" == //* ]]; then
    "$POWERSHELL" -NoProfile -Command \
        "\$b = [System.IO.File]::ReadAllBytes('$INPUT'); \
         \$o = [System.Console]::OpenStandardOutput(); \
         \$o.Write(\$b, 0, \$b.Length); \$o.Close()" \
    | npx tsx "${SCRIPT_DIR}/seed-documents.ts" "$@"
else
    npx tsx "${SCRIPT_DIR}/seed-documents.ts" "$@" < "$INPUT"
fi
