#!/usr/bin/env bash
# Wrapper for inspect-missing-zeros.py — runs against share data, writes
# per-sample diagnostic markdown into a UNC directory. Same I/O safety
# pattern as recover-numeric-zeros-share.sh: benchmark JSON streamed via
# named pipe, OCR cache dir streamed as `<b64-sid> <b64-bytes>` lines via
# named pipe, Python writes outputs into /dev/shm, PowerShell copies the
# whole subtree to the UNC out-dir. /dev/shm is wiped on exit.
#
# Usage:
#   ./inspect-missing-zeros-share.sh \
#       --benchmark '\\widget\share\benchmark-result-neural-normalized.json' \
#       --ocr-cache-dir '\\widget\share\ocr-cache-dfaddb26' \
#       --out-dir '\\widget\share\ocr-table-dumps-dfaddb26' \
#       --strip-sample-id-suffix '.jpg'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIFO_DIR="$(mktemp -d -t inspect-zeros-fifo-XXXXXX)"
SHM_DIR="$(mktemp -d -p /dev/shm inspect-zeros-XXXXXX 2>/dev/null \
            || mktemp -d -t inspect-zeros-XXXXXX)"
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

BENCHMARK=""
OCR_CACHE_DIR=""
OUT_DIR=""
OUT_FILE=""
STRIP_SUFFIX=""
INCLUDE_REGEX=""

usage() {
    cat <<EOF
Usage: $(basename "$0") --benchmark <path> --ocr-cache-dir <unc-dir> (--out-dir <unc-dir> | --out-file <unc-path>) [--strip-sample-id-suffix <ext>] [--include-only-fields-regex <regex>]

Args:
  --benchmark               Benchmark JSON (UNC ok).
  --ocr-cache-dir           Directory of <sampleId>.json files (UNC ok).
  --out-dir                 Write per-sample .md files into this dir (UNC ok).
  --out-file                Write all dumps into ONE combined .md file (UNC ok).
                            Mutually exclusive with --out-dir.
  --strip-sample-id-suffix  Optional suffix to strip from OCR cache sample IDs (e.g. '.jpg').
  --include-only-fields-regex
                            Optional regex; only field keys matching it are included
                            (default: every (expected=0, matched=false) detail).
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --benchmark)                 BENCHMARK="$2"; shift 2 ;;
        --ocr-cache-dir)             OCR_CACHE_DIR="$2"; shift 2 ;;
        --out-dir)                   OUT_DIR="$2"; shift 2 ;;
        --out-file)                  OUT_FILE="$2"; shift 2 ;;
        --strip-sample-id-suffix)    STRIP_SUFFIX="$2"; shift 2 ;;
        --include-only-fields-regex) INCLUDE_REGEX="$2"; shift 2 ;;
        -h|--help)                   usage; exit 0 ;;
        *) echo "error: unexpected arg: $1" >&2; usage; exit 2 ;;
    esac
done

if [[ -z "$BENCHMARK" || -z "$OCR_CACHE_DIR" ]]; then
    usage
    exit 2
fi

# Exactly one of --out-dir / --out-file is required.
if [[ ( -n "$OUT_DIR" && -n "$OUT_FILE" ) || ( -z "$OUT_DIR" && -z "$OUT_FILE" ) ]]; then
    echo "error: provide exactly one of --out-dir or --out-file" >&2
    usage
    exit 2
fi

if [[ ! -x "$POWERSHELL" ]]; then
    echo "error: powershell.exe not found at $POWERSHELL (WSL Windows interop required)" >&2
    exit 1
fi

# Verify OCR cache directory + count files
OCR_DIR_ESC=$(ps_q "$OCR_CACHE_DIR")
OCR_FILE_COUNT=$("$POWERSHELL" -NoProfile -Command "
\$dir = '${OCR_DIR_ESC}'
if (-not (Test-Path \$dir)) { Write-Output 'NOT_FOUND'; exit 1 }
(Get-ChildItem -LiteralPath \$dir -Filter *.json -File).Count
" 2>&1 | tr -d '\r')
if [[ "$OCR_FILE_COUNT" == "NOT_FOUND" || ! "$OCR_FILE_COUNT" =~ ^[0-9]+$ || "$OCR_FILE_COUNT" == "0" ]]; then
    echo "error: OCR cache dir not accessible or empty: $OCR_CACHE_DIR (result: $OCR_FILE_COUNT)" >&2
    exit 1
fi
echo "ocr-cache files (UNC): $OCR_FILE_COUNT" >&2

# Stage benchmark JSON through FIFO
BENCHMARK_PATH="$BENCHMARK"
if [[ "$BENCHMARK" == \\\\* || "$BENCHMARK" == //* ]]; then
    BENCHMARK_FIFO="$FIFO_DIR/benchmark.json.fifo"
    mkfifo "$BENCHMARK_FIFO"
    B_ESC=$(ps_q "$BENCHMARK")
    (
        "$POWERSHELL" -NoProfile -Command \
            "\$b = [System.IO.File]::ReadAllBytes('${B_ESC}'); \
             \$o = [System.Console]::OpenStandardOutput(); \
             \$o.Write(\$b, 0, \$b.Length); \$o.Close()" \
            > "$BENCHMARK_FIFO"
    ) &
    WRITER_PIDS+=("$!")
    BENCHMARK_PATH="$BENCHMARK_FIFO"
    echo "benchmark ← $BENCHMARK (streamed)" >&2
fi

# Stage OCR cache as <b64-sid> <b64-bytes>\n stream
OCR_FIFO="$FIFO_DIR/ocr-cache.stream.fifo"
mkfifo "$OCR_FIFO"
PS_CACHE_STREAM='
$ErrorActionPreference = "Stop"
$dir = '"'$(ps_q "$OCR_CACHE_DIR")'"'
$out = [System.Console]::OpenStandardOutput()
$utf8 = [System.Text.Encoding]::UTF8
$nl   = $utf8.GetBytes("`n")
$space= $utf8.GetBytes(" ")
$files = Get-ChildItem -LiteralPath $dir -Filter *.json -File
foreach ($f in $files) {
  $sid = $f.BaseName
  $sidBytes = $utf8.GetBytes($sid)
  $sidB64Bytes = $utf8.GetBytes([Convert]::ToBase64String($sidBytes))
  $bin = [System.IO.File]::ReadAllBytes($f.FullName)
  $binB64Bytes = $utf8.GetBytes([Convert]::ToBase64String($bin))
  $out.Write($sidB64Bytes, 0, $sidB64Bytes.Length)
  $out.Write($space, 0, $space.Length)
  $out.Write($binB64Bytes, 0, $binB64Bytes.Length)
  $out.Write($nl, 0, $nl.Length)
}
$out.Flush(); $out.Close()
'
(
    "$POWERSHELL" -NoProfile -Command "$PS_CACHE_STREAM" > "$OCR_FIFO"
) &
WRITER_PIDS+=("$!")
echo "ocr-cache ← $OCR_CACHE_DIR (streamed, $OCR_FILE_COUNT files)" >&2

# Output: either a dir of per-sample files OR a single combined .md.
# Either way, Python writes into /dev/shm; we then publish to UNC.
STRIP_ARG=()
if [[ -n "$STRIP_SUFFIX" ]]; then
    STRIP_ARG=(--strip-sample-id-suffix "$STRIP_SUFFIX")
fi
REGEX_ARG=()
if [[ -n "$INCLUDE_REGEX" ]]; then
    REGEX_ARG=(--include-only-fields-regex "$INCLUDE_REGEX")
fi

if [[ -n "$OUT_DIR" ]]; then
    LOCAL_OUT="$SHM_DIR/dumps"
    mkdir -p "$LOCAL_OUT"
    python3 "${SCRIPT_DIR}/inspect-missing-zeros.py" \
        "$BENCHMARK_PATH" \
        --out-dir "$LOCAL_OUT" \
        --ocr-cache-stream "$OCR_FIFO" \
        "${STRIP_ARG[@]}" \
        "${REGEX_ARG[@]}"
else
    LOCAL_OUT="$SHM_DIR/$(basename "$OUT_FILE")"
    python3 "${SCRIPT_DIR}/inspect-missing-zeros.py" \
        "$BENCHMARK_PATH" \
        --out-file "$LOCAL_OUT" \
        --ocr-cache-stream "$OCR_FIFO" \
        "${STRIP_ARG[@]}" \
        "${REGEX_ARG[@]}"
fi

for pid in "${WRITER_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
done

# Publish to UNC
if [[ -n "$OUT_DIR" ]]; then
    if [[ "$OUT_DIR" == \\\\* || "$OUT_DIR" == //* ]]; then
        LOCAL_WIN=$(wslpath -w "$LOCAL_OUT")
        SRC_ESC=$(ps_q "$LOCAL_WIN")
        DST_ESC=$(ps_q "$OUT_DIR")
        "$POWERSHELL" -NoProfile -Command \
            "if (-not (Test-Path -LiteralPath '${DST_ESC}')) { New-Item -ItemType Directory -Path '${DST_ESC}' -Force | Out-Null }; \
             Get-ChildItem -LiteralPath '${SRC_ESC}' -File | ForEach-Object { Copy-Item -LiteralPath \$_.FullName -Destination '${DST_ESC}' -Force }" >&2
        echo "outputs → $OUT_DIR" >&2
    else
        mkdir -p "$OUT_DIR"
        cp "${LOCAL_OUT}"/* "$OUT_DIR/"
        echo "outputs → $OUT_DIR" >&2
    fi
else
    if [[ "$OUT_FILE" == \\\\* || "$OUT_FILE" == //* ]]; then
        LOCAL_WIN=$(wslpath -w "$LOCAL_OUT")
        SRC_ESC=$(ps_q "$LOCAL_WIN")
        DST_ESC=$(ps_q "$OUT_FILE")
        "$POWERSHELL" -NoProfile -Command \
            "Copy-Item -LiteralPath '${SRC_ESC}' -Destination '${DST_ESC}' -Force" >&2
        echo "output → $OUT_FILE" >&2
    else
        mkdir -p "$(dirname "$OUT_FILE")"
        cp "$LOCAL_OUT" "$OUT_FILE"
        echo "output → $OUT_FILE" >&2
    fi
fi

echo "inspect done." >&2
