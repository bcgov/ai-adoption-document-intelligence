#!/usr/bin/env bash
# Wrapper for recover-numeric-zeros.py that runs against a Windows network
# share WITHOUT touching local persistent disk with the data.
#
# Pipeline (mirrors normalize-benchmark-share.sh):
#   INPUT  — benchmark JSON: PowerShell `ReadAllBytes` → named pipe → Python.
#   INPUT  — OCR-cache directory: PowerShell iterates files in the UNC dir
#            and writes one `<b64-sid> <b64-bytes>\n` line per file into a
#            second named pipe. Python builds the in-memory cache from
#            stdin.
#   OUTPUT — Python writes mutated JSON + CSV to /dev/shm; PowerShell binary-
#            copies them to the UNC destinations. /dev/shm is wiped on exit.
#
# Usage:
#   ./recover-numeric-zeros-share.sh \
#       --benchmark '\\widget\share\benchmark-result-neural-normalized.json' \
#       --ocr-cache-dir '\\widget\share\ocr-cache-dfaddb26' \
#       --out '\\widget\share\benchmark-result-neural-normalized.json' \
#       --changes '\\widget\share\benchmark-result-neural-normalized.recovery.csv'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIFO_DIR="$(mktemp -d -t recover-zeros-fifo-XXXXXX)"
SHM_DIR="$(mktemp -d -p /dev/shm recover-zeros-XXXXXX 2>/dev/null \
            || mktemp -d -t recover-zeros-XXXXXX)"
POWERSHELL="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
WRITER_PIDS=()

cleanup() {
    for pid in "${WRITER_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    rm -rf "$FIFO_DIR" "$SHM_DIR"
}
trap cleanup EXIT

BENCHMARK=""
OCR_CACHE_DIR=""
OUT=""
CHANGES=""
STRIP_SUFFIX=""
MERGE_INTO_CHANGES=""

usage() {
    cat <<EOF
Usage: $(basename "$0") --benchmark <path> --ocr-cache-dir <unc-dir> --out <path> --changes <path> [--strip-sample-id-suffix <ext>]

Args (all support UNC paths):
  --benchmark         Input benchmark JSON (will be mutated; the mutation is
                      written to --out, not back to this path unless they are
                      the same).
  --ocr-cache-dir     Directory of <sampleId>.json files (typically the
                      output of scripts/oc-export-benchmark-ocr-cache.sh).
  --out               Where to write the mutated benchmark JSON.
  --changes           Where to write the recovery audit CSV.
  --strip-sample-id-suffix
                      Optional suffix to strip from OCR-cache sample IDs
                      before matching benchmark sample IDs (e.g. '.jpg').
  --merge-into-changes
                      Optional existing changes.csv (UNC ok) to merge with.
                      Existing rows are preserved except any with rule
                      starting "recovered:" (those are replaced by this
                      run's output). The merged CSV is written to --changes.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --benchmark)              BENCHMARK="$2"; shift 2 ;;
        --ocr-cache-dir)          OCR_CACHE_DIR="$2"; shift 2 ;;
        --out)                    OUT="$2"; shift 2 ;;
        --changes)                CHANGES="$2"; shift 2 ;;
        --strip-sample-id-suffix) STRIP_SUFFIX="$2"; shift 2 ;;
        --merge-into-changes)     MERGE_INTO_CHANGES="$2"; shift 2 ;;
        -h|--help)                usage; exit 0 ;;
        *)
            echo "error: unexpected arg: $1" >&2
            usage
            exit 2
            ;;
    esac
done

if [[ -z "$BENCHMARK" || -z "$OCR_CACHE_DIR" || -z "$OUT" || -z "$CHANGES" ]]; then
    usage
    exit 2
fi

if [[ ! -x "$POWERSHELL" ]]; then
    echo "error: powershell.exe not found at $POWERSHELL (WSL Windows interop required)" >&2
    exit 1
fi

# Escape a value for safe interpolation inside a PowerShell single-quoted literal.
ps_q() { local s="$1"; printf '%s' "${s//\'/\'\'}"; }

# ---- Verify OCR cache directory + count files (counts only, no names) ----
OCR_DIR_ESC=$(ps_q "$OCR_CACHE_DIR")
OCR_FILE_COUNT=$("$POWERSHELL" -NoProfile -Command "
\$dir = '${OCR_DIR_ESC}'
if (-not (Test-Path \$dir)) { Write-Output 'NOT_FOUND'; exit 1 }
\$files = Get-ChildItem -LiteralPath \$dir -Filter *.json -File
Write-Output \$files.Count
" 2>&1 | tr -d '\r')

if [[ "$OCR_FILE_COUNT" == "NOT_FOUND" || ! "$OCR_FILE_COUNT" =~ ^[0-9]+$ ]]; then
    echo "error: OCR cache dir not accessible or empty: $OCR_CACHE_DIR (result: $OCR_FILE_COUNT)" >&2
    exit 1
fi
if [[ "$OCR_FILE_COUNT" == "0" ]]; then
    echo "error: OCR cache dir contains no .json files: $OCR_CACHE_DIR" >&2
    exit 1
fi
echo "ocr-cache files (UNC): $OCR_FILE_COUNT" >&2

# ---- Input: stream benchmark JSON through a FIFO ----
BENCHMARK_PATH="$BENCHMARK"
if [[ "$BENCHMARK" == \\\\* || "$BENCHMARK" == //* ]]; then
    BENCHMARK_FIFO="$FIFO_DIR/benchmark.json.fifo"
    mkfifo "$BENCHMARK_FIFO"
    BENCHMARK_ESC=$(ps_q "$BENCHMARK")
    (
        "$POWERSHELL" -NoProfile -Command \
            "\$b = [System.IO.File]::ReadAllBytes('${BENCHMARK_ESC}'); \
             \$o = [System.Console]::OpenStandardOutput(); \
             \$o.Write(\$b, 0, \$b.Length); \$o.Close()" \
            > "$BENCHMARK_FIFO"
    ) &
    WRITER_PIDS+=("$!")
    BENCHMARK_PATH="$BENCHMARK_FIFO"
    echo "benchmark ← $BENCHMARK (streamed)" >&2
fi

# ---- Input: stream OCR cache directory as <b64-sid> <b64-bytes>\n lines ----
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
  $sidB64 = [Convert]::ToBase64String($sidBytes)
  $sidB64Bytes = $utf8.GetBytes($sidB64)
  $bin = [System.IO.File]::ReadAllBytes($f.FullName)
  $binB64 = [Convert]::ToBase64String($bin)
  $binB64Bytes = $utf8.GetBytes($binB64)
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
OUT_LOCAL="$(resolve_out "$OUT" "benchmark.recovered.json")"
CHANGES_LOCAL="$(resolve_out "$CHANGES" "benchmark.recovery.csv")"

# ---- Optional: stream the existing changes.csv to merge with ----
MERGE_PATH=""
if [[ -n "$MERGE_INTO_CHANGES" ]]; then
    if [[ "$MERGE_INTO_CHANGES" == \\\\* || "$MERGE_INTO_CHANGES" == //* ]]; then
        MERGE_FIFO="$FIFO_DIR/existing-changes.csv.fifo"
        mkfifo "$MERGE_FIFO"
        MERGE_ESC=$(ps_q "$MERGE_INTO_CHANGES")
        (
            "$POWERSHELL" -NoProfile -Command \
                "\$b = [System.IO.File]::ReadAllBytes('${MERGE_ESC}'); \
                 \$o = [System.Console]::OpenStandardOutput(); \
                 \$o.Write(\$b, 0, \$b.Length); \$o.Close()" \
                > "$MERGE_FIFO"
        ) &
        WRITER_PIDS+=("$!")
        MERGE_PATH="$MERGE_FIFO"
        echo "merge-into ← $MERGE_INTO_CHANGES (streamed)" >&2
    else
        MERGE_PATH="$MERGE_INTO_CHANGES"
    fi
fi

# ---- Run the recovery script ----
STRIP_ARG=()
if [[ -n "$STRIP_SUFFIX" ]]; then
    STRIP_ARG=(--strip-sample-id-suffix "$STRIP_SUFFIX")
fi
MERGE_ARG=()
if [[ -n "$MERGE_PATH" ]]; then
    MERGE_ARG=(--merge-into-changes "$MERGE_PATH")
fi

python3 "${SCRIPT_DIR}/recover-numeric-zeros.py" \
    "$BENCHMARK_PATH" \
    --out "$OUT_LOCAL" \
    --changes "$CHANGES_LOCAL" \
    --ocr-cache-stream "$OCR_FIFO" \
    "${STRIP_ARG[@]}" \
    "${MERGE_ARG[@]}"

# Wait for writer processes.
for pid in "${WRITER_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
done

# ---- Publish derived outputs to UNC ----
publish() {
    local local_path="$1"
    local dest="$2"
    if [[ "$dest" == \\\\* || "$dest" == //* ]]; then
        local local_win
        local_win="$(wslpath -w "$local_path")"
        local dest_esc; dest_esc=$(ps_q "$dest")
        local src_esc; src_esc=$(ps_q "$local_win")
        "$POWERSHELL" -NoProfile -Command \
            "Copy-Item -LiteralPath '${src_esc}' -Destination '${dest_esc}' -Force" >&2
        echo "output → $dest" >&2
    fi
}
publish "$OUT_LOCAL" "$OUT"
publish "$CHANGES_LOCAL" "$CHANGES"

echo "recovery done." >&2
