#!/usr/bin/env bash
# Generate per-category HITL detail plots from a UNC share benchmark JSON.
# Same streaming pattern as hitl-planner-share.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIFO_DIR="$(mktemp -d -t hitl-plots-fifo-XXXXXX)"
SHM_DIR="$(mktemp -d -p /dev/shm hitl-plots-XXXXXX 2>/dev/null \
            || mktemp -d -t hitl-plots-XXXXXX)"
POWERSHELL="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
WRITER_PIDS=()

cleanup() {
    for pid in "${WRITER_PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
    rm -rf "$FIFO_DIR" "$SHM_DIR"
}
trap cleanup EXIT

INPUT=""
OUT_DIR=""
EXTRA=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --out-dir) OUT_DIR="$2"; shift 2 ;;
        --categories|--docs-count|--exclude-missing-in-categories|--skip-trivial-predictions-in-categories)
            EXTRA+=("$1" "$2"); shift 2 ;;
        *) if [[ -z "$INPUT" ]]; then INPUT="$1"; shift
           else echo "error: unexpected arg: $1" >&2; exit 2; fi ;;
    esac
done
[[ -z "$INPUT" || -z "$OUT_DIR" ]] && { echo "usage: $0 <input.json> --out-dir <dir> [options]" >&2; exit 2; }

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

python3 "${SCRIPT_DIR}/hitl-per-category-plots.py" \
    "$INPUT_PATH" \
    --out-dir "$SHM_DIR" \
    "${EXTRA[@]}"

for pid in "${WRITER_PIDS[@]}"; do wait "$pid" 2>/dev/null || true; done

if [[ "$OUT_DIR" == \\\\* || "$OUT_DIR" == //* ]]; then
    SHM_WIN=$(wslpath -w "$SHM_DIR")
    "$POWERSHELL" -NoProfile -Command \
        "if (-not (Test-Path -LiteralPath '$OUT_DIR')) { New-Item -ItemType Directory -Path '$OUT_DIR' -Force | Out-Null }; \
         Get-ChildItem -LiteralPath '$SHM_WIN' -File | ForEach-Object { Copy-Item -LiteralPath \$_.FullName -Destination '$OUT_DIR' -Force }" >&2
    echo "outputs → $OUT_DIR" >&2
else
    mkdir -p "$OUT_DIR"
    cp "${SHM_DIR}"/* "$OUT_DIR/"
    echo "outputs → $OUT_DIR" >&2
fi
echo "done." >&2
