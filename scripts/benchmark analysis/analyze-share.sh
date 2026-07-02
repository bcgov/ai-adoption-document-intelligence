#!/usr/bin/env bash
# Run analyze.js against a benchmark JSON on a Windows UNC share, writing the
# generated markdown report back to a UNC destination — no persistent local
# disk involvement.
#
# Usage:
#   analyze-share.sh <input.json> <output.md>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIFO_DIR="$(mktemp -d -t analyze-share-fifo-XXXXXX)"
SHM_DIR="$(mktemp -d -p /dev/shm analyze-share-XXXXXX 2>/dev/null \
            || mktemp -d -t analyze-share-XXXXXX)"
POWERSHELL="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
WRITER_PIDS=()

cleanup() {
    for pid in "${WRITER_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    rm -rf "$FIFO_DIR" "$SHM_DIR"
}
trap cleanup EXIT

ps_q() { local s="$1"; printf '%s' "${s//\'/\'\'}"; }

if [[ $# -ne 2 ]]; then
    echo "usage: $(basename "$0") <input.json> <output.md>" >&2
    exit 2
fi
INPUT="$1"
OUTPUT="$2"

INPUT_PATH="$INPUT"
if [[ "$INPUT" == \\\\* || "$INPUT" == //* ]]; then
    INPUT_FIFO="$FIFO_DIR/input.json.fifo"
    mkfifo "$INPUT_FIFO"
    IN_ESC=$(ps_q "$INPUT")
    (
        "$POWERSHELL" -NoProfile -Command \
            "\$b = [System.IO.File]::ReadAllBytes('${IN_ESC}'); \
             \$o = [System.Console]::OpenStandardOutput(); \
             \$o.Write(\$b, 0, \$b.Length); \$o.Close()" \
            > "$INPUT_FIFO"
    ) &
    WRITER_PIDS+=("$!")
    INPUT_PATH="$INPUT_FIFO"
    echo "input ← $INPUT (streamed)" >&2
fi

OUTPUT_LOCAL="$OUTPUT"
if [[ "$OUTPUT" == \\\\* || "$OUTPUT" == //* ]]; then
    OUTPUT_LOCAL="$SHM_DIR/report.md"
fi

node "${SCRIPT_DIR}/analyze.js" "$INPUT_PATH" "$OUTPUT_LOCAL"

for pid in "${WRITER_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
done

if [[ "$OUTPUT" == \\\\* || "$OUTPUT" == //* ]]; then
    local_win="$(wslpath -w "$OUTPUT_LOCAL")"
    SRC_ESC=$(ps_q "$local_win")
    DST_ESC=$(ps_q "$OUTPUT")
    "$POWERSHELL" -NoProfile -Command \
        "Copy-Item -LiteralPath '${SRC_ESC}' -Destination '${DST_ESC}' -Force" >&2
    echo "output → $OUTPUT" >&2
fi
