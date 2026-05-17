#!/usr/bin/env bash
# Wrapper for compare-engines.py that runs against a Windows network share
# WITHOUT copying the source JSON to local disk.
#
# WSL Python can't read \\widget\... paths directly, but we don't want to
# stage the sensitive benchmark JSONs to /tmp either. So:
#
#   1. For each UNC input, create a named pipe in WORK_DIR (the FIFO is a
#      filesystem node but stores no data — bytes flow through kernel pipe
#      buffers in RAM).
#   2. Launch a background PowerShell process that streams the share file
#      into its FIFO via `Get-Content -Raw`. PowerShell uses the UNC path
#      directly; nothing is written to local disk.
#   3. Run compare-engines.py with the FIFO paths in place of the UNC paths.
#      Python reads each FIFO like a file; the PowerShell writer drains as
#      Python reads, then exits cleanly when the JSON is consumed.
#   4. Generated PNGs / CSVs are derived aggregate metrics, not raw data —
#      they go to WORK_DIR, then PowerShell-copy to the requested UNC out-dir,
#      and WORK_DIR is wiped on exit.
#
# Usage:
#   compare-engines-share.sh \
#       "Template (V1)=\\widget\share\template.json" \
#       "Neural (V2)=\\widget\share\neural.json" \
#       --out-dir "\\widget\share\plots" \
#       [--docs-count 99]
#
# Local paths (under /tmp or /home/...) pass through unchanged, so this same
# command works for non-UNC inputs too.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$(mktemp -d -t compare-engines-XXXXXX)"
LOCAL_OUT="${WORK_DIR}/out"
mkdir -p "$LOCAL_OUT"

POWERSHELL="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
WRITER_PIDS=()

cleanup() {
    # Kill any writer still alive (e.g. if Python exited early on error) and
    # wipe WORK_DIR. The FIFOs themselves don't store data, but matplotlib's
    # PNG output and the generated CSVs do — they're derived metrics, but we
    # still wipe them rather than leave them in /tmp.
    for pid in "${WRITER_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    rm -rf "$WORK_DIR"
}
trap cleanup EXIT

# Parse args. Engine= args go to STAGED after FIFO handling; --out-dir /
# --docs-count are captured.
ENGINE_ARGS=()
OUT_DIR=""
DOCS_COUNT="99"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --out-dir)    OUT_DIR="$2"; shift 2 ;;
        --docs-count) DOCS_COUNT="$2"; shift 2 ;;
        -h|--help)
            sed -n 's/^# //p; s/^#//p' "$0" | sed -n '1,30p'
            exit 0 ;;
        *)            ENGINE_ARGS+=("$1"); shift ;;
    esac
done

if [[ -z "$OUT_DIR" ]]; then
    echo "error: --out-dir is required" >&2
    exit 2
fi
if [[ ${#ENGINE_ARGS[@]} -lt 1 ]]; then
    echo "error: at least one LABEL=PATH engine arg required" >&2
    exit 2
fi

echo "preparing stream pipes (JSON contents do not touch local disk)..." >&2
STAGED=()
for arg in "${ENGINE_ARGS[@]}"; do
    label="${arg%%=*}"
    path="${arg#*=}"
    if [[ "$path" == \\\\* || "$path" == //* ]]; then
        # Sanitise the label for a FIFO filename.
        slug="$(printf '%s' "$label" | tr -c '[:alnum:]' '_')"
        fifo="${WORK_DIR}/${slug}.json.fifo"
        mkfifo "$fifo"
        # Stream-write to the FIFO in the background. Use raw .NET binary I/O
        # rather than Get-Content; Get-Content does text-mode processing
        # (BOM handling / encoding fix-ups) even with -Raw, which can corrupt
        # bytes that happen to look like a multi-byte sequence start.
        # ReadAllBytes + OpenStandardOutput.Write is encoding-neutral.
        ( "$POWERSHELL" -NoProfile -Command \
            "\$b = [System.IO.File]::ReadAllBytes('$path'); \
             \$o = [System.Console]::OpenStandardOutput(); \
             \$o.Write(\$b, 0, \$b.Length); \
             \$o.Close()" \
            > "$fifo" ) &
        WRITER_PIDS+=("$!")
        STAGED+=("${label}=${fifo}")
        echo "  ${label} ← ${path}" >&2
    else
        STAGED+=("${arg}")
    fi
done

echo "running compare-engines.py..." >&2
python3 "${SCRIPT_DIR}/compare-engines.py" \
    "${STAGED[@]}" \
    --out-dir "$LOCAL_OUT" \
    --docs-count "$DOCS_COUNT"

# Wait for any writer that hasn't exited yet (they should all be done by now
# since Python consumed their FIFOs to EOF).
for pid in "${WRITER_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
done

# Publish derived outputs to the share. WSL Linux paths aren't directly
# addressable from Windows PowerShell, so translate via `wslpath -w` to the
# `\\wsl.localhost\<distro>\tmp\...` UNC form that PowerShell can read.
if [[ "$OUT_DIR" == \\\\* || "$OUT_DIR" == //* ]]; then
    echo "" >&2
    echo "publishing outputs to ${OUT_DIR}..." >&2
    LOCAL_OUT_WIN="$(wslpath -w "$LOCAL_OUT")"
    "$POWERSHELL" -NoProfile -Command \
        "if (-not (Test-Path -LiteralPath '$OUT_DIR')) { New-Item -ItemType Directory -Path '$OUT_DIR' -Force | Out-Null }; \
         Get-ChildItem -LiteralPath '$LOCAL_OUT_WIN' -File | ForEach-Object { Copy-Item -LiteralPath \$_.FullName -Destination '$OUT_DIR' -Force }" \
        >&2
    echo "done." >&2
else
    mkdir -p "$OUT_DIR"
    cp "${LOCAL_OUT}"/* "$OUT_DIR/"
    echo "outputs copied to $OUT_DIR" >&2
fi
