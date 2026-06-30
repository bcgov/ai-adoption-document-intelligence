#!/usr/bin/env bash
# Canonical entry point for re-regenerating the full benchmark analysis
# pipeline against share data. Use THIS script — not the individual
# wrappers — whenever you want to refresh all artifacts after a code
# change in the normalizer or recovery scripts.
#
# Pipeline (each step's output feeds the next):
#   1. normalize-benchmark-share.sh   — flips format-only mismatches
#   2. recover-numeric-zeros-share.sh — flips OCR-misread missing zeros,
#                                       merges recovery rows into the
#                                       normalizer's changes.csv
#   3. analyze-share.sh               — per-run markdown report
#   4. report-errors-share.sh         — cross-engine audit CSVs
#
# All sub-wrappers share the same RAM-only streaming pattern, so no
# persistent local disk ever sees share data.
#
# Defaults match the current SDPR neural-vs-template workflow. Minimum
# invocation is one arg:
#
#   ./regenerate-reports-share.sh '\\widget\share\<base-dir>'
#
# Flags (all optional; defaults shown in brackets):
#   --base-dir <unc-dir>          Share root for inputs + outputs.
#                                  [first positional arg]
#   --neural-input <name>         Raw neural benchmark JSON filename.
#                                  [benchmark-result-neural.json]
#   --baseline <name>             Template/baseline JSON for cross-engine
#                                  comparison. [benchmark-result.json]
#   --normalized <basename>       Output filename prefix for normalized
#                                  outputs (.json, .changes.csv, .md).
#                                  [benchmark-result-neural-normalized]
#   --ocr-cache-dir <name>        OCR cache directory name (joined with
#                                  base-dir). [ocr-cache-dfaddb26]
#   --reports-dir <name>          Cross-engine reports subdirectory.
#                                  [reports]
#   --neural-label <text>         Engine label for cross-engine reports.
#                                  [Neural (V2 normalized)]
#   --baseline-label <text>       Baseline engine label. [Template (V1)]
#   --strip-sample-id-suffix <s>  OCR cache filename suffix to strip when
#                                  matching to benchmark sampleIds. [.jpg]
#   --skip-recovery               Skip step 2 (no OCR cache available, or
#                                  you want to isolate normalize-only).
#   --skip-reports                Skip step 4 (single-engine — no baseline).
#
# Each sub-wrapper's stderr passes through. A final summary lists what
# was produced. Exits non-zero on any step failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASE_DIR=""
NEURAL_INPUT="benchmark-result-neural.json"
BASELINE="benchmark-result.json"
NORMALIZED="benchmark-result-neural-normalized"
OCR_CACHE_DIR="ocr-cache-dfaddb26"
REPORTS_DIR="reports"
NEURAL_LABEL="Neural (V2 normalized)"
BASELINE_LABEL="Template (V1)"
STRIP_SUFFIX=".jpg"
SKIP_RECOVERY=0
SKIP_REPORTS=0

usage() {
    awk 'NR > 1 && /^#($|[ ])/ { sub(/^#[ ]?/, ""); print; next } NR > 1 { exit }' "$0"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --base-dir)               BASE_DIR="$2"; shift 2 ;;
        --neural-input)           NEURAL_INPUT="$2"; shift 2 ;;
        --baseline)               BASELINE="$2"; shift 2 ;;
        --normalized)             NORMALIZED="$2"; shift 2 ;;
        --ocr-cache-dir)          OCR_CACHE_DIR="$2"; shift 2 ;;
        --reports-dir)            REPORTS_DIR="$2"; shift 2 ;;
        --neural-label)           NEURAL_LABEL="$2"; shift 2 ;;
        --baseline-label)         BASELINE_LABEL="$2"; shift 2 ;;
        --strip-sample-id-suffix) STRIP_SUFFIX="$2"; shift 2 ;;
        --skip-recovery)          SKIP_RECOVERY=1; shift ;;
        --skip-reports)           SKIP_REPORTS=1; shift ;;
        -h|--help)                usage; exit 0 ;;
        *)
            if [[ -z "$BASE_DIR" ]]; then
                BASE_DIR="$1"; shift
            else
                echo "error: unexpected arg: $1" >&2
                usage >&2
                exit 2
            fi
            ;;
    esac
done

if [[ -z "$BASE_DIR" ]]; then
    echo "error: base-dir is required (positional arg or --base-dir)" >&2
    usage >&2
    exit 2
fi

# Use Windows-style backslash separator to keep UNC paths consistent
# with the rest of the share pipeline. Strip any trailing backslash on
# base-dir before re-joining.
BASE_DIR="${BASE_DIR%\\}"
sep="\\"

NORMALIZED_JSON="${BASE_DIR}${sep}${NORMALIZED}.json"
NORMALIZED_CHANGES="${BASE_DIR}${sep}${NORMALIZED}.changes.csv"
NORMALIZED_MD="${BASE_DIR}${sep}${NORMALIZED}.md"
NEURAL_PATH="${BASE_DIR}${sep}${NEURAL_INPUT}"
BASELINE_PATH="${BASE_DIR}${sep}${BASELINE}"
OCR_CACHE_PATH="${BASE_DIR}${sep}${OCR_CACHE_DIR}"
REPORTS_PATH="${BASE_DIR}${sep}${REPORTS_DIR}"

echo "=== regenerate-reports-share.sh ===" >&2
echo "base-dir:        $BASE_DIR" >&2
echo "neural input:    $NEURAL_PATH" >&2
echo "normalized json: $NORMALIZED_JSON" >&2
echo "changes csv:     $NORMALIZED_CHANGES" >&2
if [[ "$SKIP_RECOVERY" -eq 0 ]]; then
    echo "ocr cache:       $OCR_CACHE_PATH" >&2
fi
echo "" >&2

# --- Step 1: normalize -----------------------------------------------------
echo "--- step 1/4: normalize ---" >&2
bash "$SCRIPT_DIR/normalize-benchmark-share.sh" \
    "$NEURAL_PATH" \
    --out "$NORMALIZED_JSON" \
    --changes "$NORMALIZED_CHANGES"

# --- Step 2: recover-numeric-zeros (skippable) -----------------------------
# Note: --merge-into-changes is omitted on purpose. The recover wrapper
# defensively defaults it to the value of --changes when the changes file
# already exists, which it does after step 1. That preserves the
# normalizer rows and folds recovery rows into the same CSV.
if [[ "$SKIP_RECOVERY" -eq 1 ]]; then
    echo "" >&2
    echo "--- step 2/4: SKIPPED (--skip-recovery) ---" >&2
else
    echo "" >&2
    echo "--- step 2/4: recover-numeric-zeros ---" >&2
    bash "$SCRIPT_DIR/recover-numeric-zeros-share.sh" \
        --benchmark "$NORMALIZED_JSON" \
        --ocr-cache-dir "$OCR_CACHE_PATH" \
        --out "$NORMALIZED_JSON" \
        --changes "$NORMALIZED_CHANGES" \
        --strip-sample-id-suffix "$STRIP_SUFFIX"
fi

# --- Step 3: analyze.js → .md report ---------------------------------------
echo "" >&2
echo "--- step 3/4: analyze.js ---" >&2
bash "$SCRIPT_DIR/analyze-share.sh" \
    "$NORMALIZED_JSON" \
    "$NORMALIZED_MD"

# --- Step 4: report-errors → cross-engine reports (skippable) --------------
if [[ "$SKIP_REPORTS" -eq 1 ]]; then
    echo "" >&2
    echo "--- step 4/4: SKIPPED (--skip-reports) ---" >&2
else
    echo "" >&2
    echo "--- step 4/4: report-errors ---" >&2
    bash "$SCRIPT_DIR/report-errors-share.sh" \
        "${BASELINE_LABEL}=${BASELINE_PATH}" \
        "${NEURAL_LABEL}=${NORMALIZED_JSON}" \
        --out-dir "$REPORTS_PATH"
fi

echo "" >&2
echo "=== done ===" >&2
echo "produced:" >&2
echo "  $NORMALIZED_JSON" >&2
echo "  $NORMALIZED_CHANGES" >&2
echo "  $NORMALIZED_MD" >&2
if [[ "$SKIP_REPORTS" -eq 0 ]]; then
    echo "  $REPORTS_PATH${sep}wrong-by-category.csv" >&2
    echo "  $REPORTS_PATH${sep}missing-comparison.csv" >&2
fi
