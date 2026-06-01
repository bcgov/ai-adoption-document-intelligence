#!/usr/bin/env bash
# Emit the reviewable-items CSV against a benchmark JSON on the share.
# Input streams through a named pipe (RAM only); output is staged in /dev/shm
# then PowerShell-copied to the UNC destination.
#
# Usage:
#   reviewable-items-share.sh \
#       "\\widget\share\benchmark-result-neural-normalized.json" \
#       "\\widget\share\reviewable-items.csv"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIFO_DIR="$(mktemp -d -t reviewable-items-fifo-XXXXXX)"
SHM_DIR="$(mktemp -d -p /dev/shm reviewable-items-XXXXXX 2>/dev/null \
            || mktemp -d -t reviewable-items-XXXXXX)"
POWERSHELL="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
WRITER_PIDS=()

cleanup() {
    for pid in "${WRITER_PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
    rm -rf "$FIFO_DIR" "$SHM_DIR"
}
trap cleanup EXIT

[[ $# -ne 2 ]] && { echo "usage: $0 <input.json> <output.csv>" >&2; exit 2; }
INPUT="$1"
OUTPUT="$2"

INPUT_PATH="$INPUT"
if [[ "$INPUT" == \\\\* || "$INPUT" == //* ]]; then
    INPUT_FIFO="$FIFO_DIR/input.json.fifo"
    mkfifo "$INPUT_FIFO"
    ( "$POWERSHELL" -NoProfile -Command \
        "\$b = [System.IO.File]::ReadAllBytes('$INPUT'); \
         \$o = [System.Console]::OpenStandardOutput(); \
         \$o.Write(\$b, 0, \$b.Length); \$o.Close()" \
        > "$INPUT_FIFO" ) &
    WRITER_PIDS+=("$!")
    INPUT_PATH="$INPUT_FIFO"
    echo "input ← $INPUT (streamed)" >&2
fi

OUTPUT_LOCAL="$OUTPUT"
if [[ "$OUTPUT" == \\\\* || "$OUTPUT" == //* ]]; then
    OUTPUT_LOCAL="$SHM_DIR/reviewable-items.csv"
fi

python3 "${SCRIPT_DIR}/reviewable-items.py" "$INPUT_PATH" "$OUTPUT_LOCAL"

for pid in "${WRITER_PIDS[@]}"; do wait "$pid" 2>/dev/null || true; done

if [[ "$OUTPUT" == \\\\* || "$OUTPUT" == //* ]]; then
    LOCAL_WIN="$(wslpath -w "$OUTPUT_LOCAL")"
    "$POWERSHELL" -NoProfile -Command \
        "Copy-Item -LiteralPath '$LOCAL_WIN' -Destination '$OUTPUT' -Force" >&2
    echo "output → $OUTPUT" >&2
fi
