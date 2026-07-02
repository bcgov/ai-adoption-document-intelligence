#!/usr/bin/env bash
# Wrapper for report-errors.py — runs against share data without staging
# the input JSONs to persistent local disk. Same I/O pattern as
# normalize-benchmark-share.sh: inputs stream through named pipes (bytes
# in RAM only), outputs land in /dev/shm (tmpfs) then PowerShell-copy to
# the UNC out-dir.
#
# Usage:
#   report-errors-share.sh \
#       "Template (V1)=\\widget\share\template.json" \
#       "Neural (V2)=\\widget\share\neural.json" \
#       --out-dir "\\widget\share\reports"
#
# At least one LABEL=PATH engine arg is required. With ≥2 engines, the
# missing-comparison.csv is also produced (engines[0] is the baseline).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIFO_DIR="$(mktemp -d -t report-errors-fifo-XXXXXX)"
SHM_DIR="$(mktemp -d -p /dev/shm report-errors-XXXXXX 2>/dev/null \
            || mktemp -d -t report-errors-XXXXXX)"
POWERSHELL="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
WRITER_PIDS=()

cleanup() {
    for pid in "${WRITER_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    rm -rf "$FIFO_DIR" "$SHM_DIR"
}
trap cleanup EXIT

ENGINE_ARGS=()
OUT_DIR=""
EXTRA_FLAGS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --out-dir) OUT_DIR="$2"; shift 2 ;;
        --include-all-predictions) EXTRA_FLAGS+=("$1"); shift ;;
        -h|--help)
            sed -n 's/^# //p; s/^#//p' "$0" | sed -n '1,18p'
            exit 0 ;;
        *) ENGINE_ARGS+=("$1"); shift ;;
    esac
done
if [[ -z "$OUT_DIR" ]]; then
    echo "error: --out-dir required" >&2; exit 2
fi
if [[ ${#ENGINE_ARGS[@]} -lt 1 ]]; then
    echo "error: at least one LABEL=PATH engine arg required" >&2; exit 2
fi

# Stage inputs through named pipes.
STAGED=()
for arg in "${ENGINE_ARGS[@]}"; do
    label="${arg%%=*}"
    path="${arg#*=}"
    if [[ "$path" == \\\\* || "$path" == //* ]]; then
        slug="$(printf '%s' "$label" | tr -c '[:alnum:]' '_')"
        fifo="$FIFO_DIR/${slug}.json.fifo"
        mkfifo "$fifo"
        ( "$POWERSHELL" -NoProfile -Command \
            "\$b = [System.IO.File]::ReadAllBytes('$path'); \
             \$o = [System.Console]::OpenStandardOutput(); \
             \$o.Write(\$b, 0, \$b.Length); \$o.Close()" \
            > "$fifo" ) &
        WRITER_PIDS+=("$!")
        STAGED+=("${label}=${fifo}")
        echo "input: ${label} ← ${path}" >&2
    else
        STAGED+=("${arg}")
    fi
done

# Run the report generator.
python3 "${SCRIPT_DIR}/report-errors.py" \
    "${STAGED[@]}" \
    --out-dir "$SHM_DIR" \
    "${EXTRA_FLAGS[@]}"

# Wait for input writers.
for pid in "${WRITER_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
done

# Publish outputs to UNC out-dir.
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
