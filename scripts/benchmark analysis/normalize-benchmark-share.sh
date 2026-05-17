#!/usr/bin/env bash
# Wrapper for normalize-benchmark.py that runs against a Windows network
# share WITHOUT touching local persistent disk with the data.
#
# Data path:
#   1. INPUT  — PowerShell `ReadAllBytes` → named pipe → Python reads it like
#              a file. The named pipe is a filesystem node but stores no
#              data; bytes flow through kernel pipe buffers in RAM only.
#   2. OUTPUT — Python writes the JSON + CSV to /dev/shm (tmpfs / RAM-backed)
#              so the bytes never hit persistent storage. PowerShell then
#              binary-copies them to the UNC destinations, and /dev/shm is
#              wiped on exit.
#
# Why not output FIFOs too? Output FIFOs deadlock: Python opens the FIFO for
# writing while PowerShell (on the reader side, invoked with `< fifo`) blocks
# on its own open-for-read; bash waits for both sides to open before
# unblocking, so neither side can proceed. /dev/shm sidesteps that with a
# simple write-then-copy.
#
# Usage:
#   normalize-benchmark-share.sh \
#       "\\widget\share\benchmark-result-neural.json" \
#       --out "\\widget\share\benchmark-result-neural-normalized.json" \
#       --changes "\\widget\share\benchmark-result-neural-normalized.changes.csv"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Hold the input FIFO node (zero bytes) on disk; the actual JSON contents
# pass through kernel pipe buffers in RAM only.
FIFO_DIR="$(mktemp -d -t normalize-bench-fifo-XXXXXX)"
# Hold the derived outputs (JSON + CSV) in tmpfs / RAM, never on persistent
# storage. /dev/shm is wiped on reboot and we delete our subtree on exit.
SHM_DIR="$(mktemp -d -p /dev/shm normalize-bench-XXXXXX 2>/dev/null \
            || mktemp -d -t normalize-bench-XXXXXX)"
POWERSHELL="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
WRITER_PIDS=()

cleanup() {
    for pid in "${WRITER_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    rm -rf "$FIFO_DIR" "$SHM_DIR"
}
trap cleanup EXIT

# Parse positional input + --out / --changes
INPUT=""
OUT=""
CHANGES=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --out)     OUT="$2"; shift 2 ;;
        --changes) CHANGES="$2"; shift 2 ;;
        -h|--help)
            sed -n 's/^# //p; s/^#//p' "$0" | sed -n '1,25p'
            exit 0 ;;
        *)
            if [[ -z "$INPUT" ]]; then INPUT="$1"; shift
            else echo "error: unexpected arg: $1" >&2; exit 2
            fi ;;
    esac
done

if [[ -z "$INPUT" || -z "$OUT" || -z "$CHANGES" ]]; then
    echo "usage: normalize-benchmark-share.sh <input.json> --out <output.json> --changes <changes.csv>" >&2
    exit 2
fi

# ---- Input: stream UNC source into a named pipe ----
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

# ---- Outputs: Python writes to tmpfs; we copy to UNC after ----
resolve_out() {
    local dest="$1"
    local local_name="$2"
    if [[ "$dest" == \\\\* || "$dest" == //* ]]; then
        echo "$SHM_DIR/$local_name"
    else
        echo "$dest"
    fi
}

OUT_LOCAL="$(resolve_out "$OUT" "out.json")"
CHANGES_LOCAL="$(resolve_out "$CHANGES" "changes.csv")"

# ---- Run the normaliser ----
python3 "${SCRIPT_DIR}/normalize-benchmark.py" \
    "$INPUT_PATH" \
    --out "$OUT_LOCAL" \
    --changes "$CHANGES_LOCAL"

# Wait for the input writer to finish (Python has consumed the FIFO to EOF
# already, but be tidy).
for pid in "${WRITER_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
done

# Publish derived outputs to UNC if requested.
publish() {
    local local_path="$1"
    local dest="$2"
    if [[ "$dest" == \\\\* || "$dest" == //* ]]; then
        local local_win
        local_win="$(wslpath -w "$local_path")"
        "$POWERSHELL" -NoProfile -Command \
            "Copy-Item -LiteralPath '$local_win' -Destination '$dest' -Force" >&2
        echo "output → $dest" >&2
    fi
}
publish "$OUT_LOCAL" "$OUT"
publish "$CHANGES_LOCAL" "$CHANGES"

echo "done." >&2
