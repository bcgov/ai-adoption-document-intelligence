# Benchmark run analysis

Local helpers for inspecting a downloaded benchmark run.

- `analyze.js` — produces a markdown summary of one run (per-field metrics + confidence-threshold trade-offs).
- `compare-engines.py` — compares two or more runs (engine-as-column tables + 6 PNG plots + 7 CSVs, including a per-category HITL threshold-sweep planner). Designed so additional engines slot in as extra `LABEL=PATH` arguments — no restructuring as the engine roster grows.
- `compare-engines-share.sh` — wrapper around `compare-engines.py` for inputs/outputs that live on a Windows network share (handles the WSL ↔ UNC path translation via PowerShell).
- `normalize-benchmark.py` — post-process a benchmark JSON to flip format-only mismatches (sin/phone digit-only, date calendar-parse, income currency / numeric-equality, text-like whitespace+case+punct) to `matched: true`. Produces a parallel JSON the same shape, plus an audit CSV listing every flipped error.
- `normalize-benchmark-share.sh` — wrapper that runs the normaliser against share data without staging the JSON to local disk (input stream through a named pipe; outputs land in `/dev/shm` tmpfs, then copy to the share).
- `report-errors.py` + `report-errors-share.sh` — two audit CSVs from one or more benchmark JSONs: `wrong-by-category.csv` (condensed counts of unique `(category, field, predicted, expected)` mismatch tuples, sorted by category then count, for spotting normalisation opportunities) and `missing-comparison.csv` (per `(sampleId, field)` cell with a missing error in any non-baseline engine, flagged as `new in <eng>` / `regressed from wrong` / `still missing` relative to the baseline). UNC inputs / outputs handled by the wrapper, same streaming pattern as the normaliser.
- `inspect-keys.py` — diagnostic that prints just the schema of a benchmark JSON (no values) so you can verify the shape before adding new analyses.
- `md-to-pdf.js` — renders any markdown file to PDF via headless Edge / Chrome (used to ship the analysis or related reports as a PDF).

## Folder layout

```
scripts/benchmark analysis/
├── analyze.js       ← analysis script (committed)
├── md-to-pdf.js     ← markdown → PDF script (committed)
├── package.json     ← declares the `marked` dep used by md-to-pdf.js (committed)
├── README.md        ← this file (committed)
├── drop/            ← put your downloaded benchmark JSON here (gitignored)
└── output/          ← generated markdown reports land here (gitignored)
```

`drop/` and `output/` only retain a `.gitignore` in the repo so the folders
exist; everything else inside them is ignored. Real benchmark data may
contain ground-truth and predictions you don't want to commit.

## Usage

1. Download a benchmark run from the run detail page (the **Download Results**
   button), or hit the API directly:

   ```bash
   curl -H "x-api-key: $API_KEY" \
     "http://localhost:3002/api/benchmark/projects/$PROJECT_ID/runs/$RUN_ID/download" \
     -o "scripts/benchmark analysis/drop/my-run.json"
   ```

2. Run the analysis:

   ```bash
   node "scripts/benchmark analysis/analyze.js"
   ```

   - With no arguments and exactly one `.json` file in `drop/`, that file is
     used. Otherwise it looks for `drop/sample.json`.
   - The report is written to `output/<input-basename>.md`.

3. Override paths if you need to:

   ```bash
   node "scripts/benchmark analysis/analyze.js" path/to/run.json path/to/report.md
   ```

## What the report contains

- **Run summary** — definition, status, duration, sample pass/fail counts.
- **Overall metrics recomputed from `perFieldResults`** — micro accuracy
  (instance-weighted), macro accuracy (field-weighted), totals. Recomputing
  matters because field rows in the export may have been edited by hand.
- **Per-field results** sorted by error rate, with confidence broken out for
  correct vs error subsets.
- **Confidence-threshold trade-offs**: the smallest review-gate threshold
  that catches 100% / 80% of errors per field, plus how many correct
  predictions would be flagged for review (false positives) at that
  threshold. Gate semantics: `flagged := confidence < threshold`. Fields
  marked `⚠ overlap` have correct predictions sitting at or below the
  highest error confidence — confidence gating cannot cleanly separate
  errors from correct predictions for those.
- **Confidence calibration** overview and **top error contributors**.
- **Suggestions** for follow-up analyses (per-sample worst documents,
  missing-vs-wrong split, cross-field error correlation, baseline diffs,
  etc).

## Notes

- `analyze.js` has no external dependencies — plain Node.js.
- Input must be the JSON returned by `GET /api/benchmark/projects/:projectId/runs/:runId/download`.
- False-positive counts come from `perSampleResults` (which carries the
  full confidence distribution per instance), not from `perFieldResults`
  (which only carries the error subset).

## Cross-engine comparison (`compare-engines.py`)

Produces engine-vs-engine deltas and a per-category HITL planning view. Same JSON input shape as `analyze.js`. Two or more `LABEL=PATH` pairs may be passed; the label becomes the column header in CSVs / chart legends and the order controls the visual ordering.

Requirements: Python 3.10+, `matplotlib`, `numpy`. Available in WSL by default; no need to install anything on the Windows side.

```bash
python3 "scripts/benchmark analysis/compare-engines.py" \
    "Template (V1)=/path/to/template.json" \
    "Neural (V2)=/path/to/neural.json" \
    --out-dir /path/to/output \
    --docs-count 99
```

If the inputs and outputs live on a Windows network share, use the wrapper — it stages the JSONs locally via PowerShell, runs the Python script, and copies the PNGs / CSVs back to the share:

```bash
bash "scripts/benchmark analysis/compare-engines-share.sh" \
    "Template (V1)=\\\\widget\\share\\path\\to\\template.json" \
    "Neural (V2)=\\\\widget\\share\\path\\to\\neural.json" \
    --out-dir "\\\\widget\\share\\path\\to\\plots" \
    --docs-count 99
```

### Outputs

CSVs (every number that appears in the plots, plus a few that don't):

- `aggregate-metrics.csv` — accuracy / precision / recall / F1 / FP-per-sample per engine.
- `error-class-breakdown.csv` — missing / extra / wrong counts per engine.
- `per-category-accuracy.csv` — field accuracy by category (sin, date, phone, name, signature, freeform_text, case_id, checkboxes, income_amounts) per engine.
- `per-field-results.csv` — per-field error counts and error rates per engine.
- `threshold-sweep.csv` — for every engine × category × threshold ∈ {0.50, 0.70, 0.80, 0.90, 0.95, 0.99}: errors caught, predictions flagged, flagged-per-100-docs, recall.
- `recommended-thresholds.csv` — the smallest threshold per engine × category that catches 90% of errors, plus the corresponding HITL workload. Categories with <5 errors are flagged as "low signal".

Plots (PNG, 150 dpi):

- `01-aggregate-metrics.png` — grouped bars: accuracy, precision, recall, F1.
- `02-error-class-breakdown.png` — stacked bars: missing / extra / wrong per engine.
- `03-per-category-accuracy.png` — grouped bars: field accuracy by category, one bar per engine per category.
- `04-per-field-heatmap.png` — fields × engines, cells coloured by error rate (0 → green, 1 → red). Fields grouped into the 8 categories with horizontal separators; within each category, fields sorted by mean error rate descending so the worst rows sit at the top of each group. Cell text is `errors/total`. Adds one column per engine, so scales to V3 / V4 by appending engines on the CLI.
- `05-threshold-sweep.png` — one subplot per engine. X = predictions flagged per 100 documents (log scale, because categories with 2 fields ≈ 200 max predictions and categories with 35 fields ≈ 3,500 max would otherwise bunch into the left edge). Y = % errors caught. One line per category. Filled dots mark the recommended threshold (catch 90%).

## Format-variant normaliser (`normalize-benchmark.py`)

Re-scores an existing benchmark JSON, treating pure format-difference mismatches as correct. Useful for separating real engine errors from format-only ones (currency-chrome, date-format, SIN punctuation, capitalisation, whitespace). Ports the equivalence rules from `apps/temporal/src/scripts/promote-gt-format-variants.ts` so the scoring matches what the local cross-engine experiments use.

```bash
# Local input + outputs:
python3 "scripts/benchmark analysis/normalize-benchmark.py" \
    /path/to/benchmark-result-neural.json \
    --out /path/to/benchmark-result-neural-normalized.json \
    --changes /path/to/benchmark-result-neural-normalized.changes.csv

# Inputs / outputs on a Windows network share — use the wrapper:
bash "scripts/benchmark analysis/normalize-benchmark-share.sh" \
    "\\\\widget\\share\\benchmark-result-neural.json" \
    --out "\\\\widget\\share\\benchmark-result-neural-normalized.json" \
    --changes "\\\\widget\\share\\benchmark-result-neural-normalized.changes.csv"
```

The wrapper streams the input JSON through a named pipe (bytes in RAM only, never touch local disk) and stages outputs in `/dev/shm` (tmpfs / RAM) before PowerShell-copying them to the share. Local disk never sees the data.

### Equivalence rules

The active ruleset is below. Each row corresponds to a `rule` name that appears in the audit CSV, so you can grep the CSV to inspect exactly what each rule flipped. The script's module docstring duplicates this table — keep both in sync when adding or removing rules.

| Field group | Rule name in CSV | What it checks | Examples treated as equivalent |
|---|---|---|---|
| `sin`, `spouse_sin`, `phone`, `spouse_phone` | `digits-only` | Same digit sequence after stripping non-digits | `999-888-777` ≡ `999888777`; `(555) 123-4567` ≡ `5551234567` |
| `date`, `spouse_date` | `date-calendar` | Both parse to the same calendar date under the SDPR date parser (YYYY-MMM-DD, YYYY-MM-DD, D/M/YY, etc., with DMY/MDY disambiguated by month validity) | `2026-Mar-16` ≡ `2026-03-16`; `16/03/2026` ≡ `2026-03-16` |
| `date`, `spouse_date` | `date-month-day-swap` | Year matches; month and day are transposed between the two values; both parse to valid calendar dates | `2026-07-03` ≡ `2026-03-07` |
| `signature`, `spouse_signature` | `signature-presence` | **Both predicted and expected are non-empty.** The literal characters don't matter — SDPR only needs to know whether a signature is present. Missing/extra errors (one side blank) are NOT flipped | `John` ≡ `Jane`; `X` ≡ `Smith Fake`. Missing/extra cases left as real errors |
| `name`, `spouse_name`, `explain_changes` | `text-normalized` | Whitespace runs collapsed, case-insensitive, trailing punctuation stripped, hyphen-spacing normalised | `HOMELESS` ≡ `Homeless`; `Lost job\nnew work.` ≡ `Lost job new work`; `Martinez - Jones` ≡ `Martinez-Jones` |
| `case_id` | `case-id-normalized` | Whitespace + case-insensitive | `ABC-123` ≡ `abc-123 ` |
| Income-like (`applicant_*` / `spouse_*` numeric) | `currency-chrome` | Predicted has a leading/trailing `$` that, once stripped, equals expected verbatim | `$ N/A` ≡ `N/A` |
| Income-like | `numeric-equality` | Both loose-parse to the same number (strips `$`, commas, whitespace; handles number-vs-string types; newline-stacked predictions accepted ONLY when every non-empty line parses to the same number and equals expected) | `$2,711.64` ≡ `2711.64`; `900` (num) ≡ `"900.00"`; `"7, 969"` ≡ `7969`; `"0\n0"` ≡ `0`. Rejects `"E\n0"` (non-numeric line) and `"69\n606"` (different numbers per line) |
| Income-like | `income-single-char-zero` | Predicted is a single non-whitespace character (any character) and expected parses to `0`. Captures OCR mis-reads of faint `0` glyphs as stray letters | `E` ≡ `0`; `Q` ≡ `0`; `o` ≡ `0`; `-` ≡ `0` |
| `checkbox_*` | `checkbox-tag` | Lowercase + strip surrounding `:` on both sides; equal if both reduce to `selected` or both to `unselected` | `selected` ≡ `:selected:`; `:UNSELECTED:` ≡ `unselected` |
| Sentinel GT (`:present:`, `:garbled:`, `Spouse Missing`, `Missed Box`, `Blank Declaration`, `Homeless`, `KEY PLAYER MISSING`) | _never flipped_ | Listed for transparency — these are GT-only tags, not engine output; the normaliser refuses to touch any cell whose expected matches a sentinel |

### Outputs

- **`<input-basename>-normalized.json`** — same shape as the input. Each format-variant mismatch in `perSampleResults[].evaluationDetails[]` has `matched: true` and an annotation `matchedVia: "normalized:<rule>"`. Per-field aggregates in `perFieldResults` are recomputed from the mutated details (errorCount, correctCount, errorRate, accuracy, averageConfidence*, errors[] list). A top-level `normalization` block records what ran.
- **`<input-basename>-normalized.changes.csv`** — one row per flipped error: `sampleId, field, rule, predicted, expected`. Use this to spot-check the normalisation before adopting it.
- The stderr summary prints flip counts by rule and by field (no values), useful as a sanity check.

### What the normaliser does NOT do

- It does **not** recompute the backend-supplied `suggestedCatch90` / `suggestedBestBalance` / `suggestedMinimizeReview` threshold suggestions. Those reflect the strict scoring; downstream analyses (`analyze.js`, `compare-engines.py`) ignore them anyway.
- It does **not** flip `missing` or `extra` errors. By construction, format variants exist only when both predicted and expected are non-empty.
- It does **not** modify the upstream GT files. If you also want the GT files updated, run `apps/temporal/src/scripts/promote-gt-format-variants.ts --write` against a local-pipeline benchmark.

## Error-class audit reports (`report-errors.py`)

Two CSVs intended for human review — spot patterns the standard aggregate analyses don't surface.

```bash
# Local input + outputs:
python3 "scripts/benchmark analysis/report-errors.py" \
    "Template (V1)=/path/to/template.json" \
    "Neural (V2 normalized)=/path/to/neural-normalized.json" \
    --out-dir /path/to/reports

# Share input + outputs — use the wrapper:
bash "scripts/benchmark analysis/report-errors-share.sh" \
    "Template (V1)=\\\\widget\\share\\template.json" \
    "Neural (V2 normalized)=\\\\widget\\share\\neural-normalized.json" \
    --out-dir "\\\\widget\\share\\reports"
```

### `wrong-by-category.csv` — scan for normalisation opportunities

One row per unique `(category, field, predicted, expected)` tuple where the prediction is in the `wrong` class (both sides non-empty, no exact match), aggregated across all engines passed in. Columns: `category, field, predicted, expected, total, count_<engine> ...`. Sorted by category in `CATEGORY_ORDER`, then by `total` descending so the most-common patterns surface at the top of each category section. Use this to find systematic format quirks worth promoting into `normalize-benchmark.py`'s ruleset (e.g. trailing-period differences, currency-symbol variants, capitalisation, partial transcription).

### `missing-comparison.csv` — flag new missings vs. a baseline

Only produced when ≥2 engines are passed. The first engine (CLI position 1) is the baseline; the rest are compared against it. One row per `(sampleId, field)` cell that has a `missing` error in any non-baseline engine. Columns include the baseline's status at that cell (`matched` / `missing` / `extra` / `wrong`) and each non-baseline engine's status, plus a `flag` column summarising the change vs. baseline:

| flag value | meaning |
|---|---|
| `new in <eng>` | baseline matched correctly; the engine introduced a missing error |
| `new in <eng> (not evaluated in baseline)` | the cell wasn't present in the baseline's predictions |
| `regressed from wrong` | baseline had a wrong-value error; engine now returns blank |
| `regressed from extra` | baseline had an extra/hallucinated value; engine now returns blank |
| `still missing` | both baseline and engine miss this cell |
| `(non-missing, included for context)` | the cell is missing in some non-baseline engine but matched in this one; included so you see the cross-engine context |

Sorted by flag rank (new-first), then category, then field, then sampleId. Use to identify cells where adopting a newer engine introduces fresh extraction gaps that didn't exist before.

### Field categorisation

The 75 SDPR fields are bucketed into 8 categories by name pattern. Matches the local cross-engine report (`experiments/results/report/REPORT.md`):

| category | fields |
|---|---|
| sin | `sin`, `spouse_sin` |
| date | `date`, `spouse_date` |
| phone | `phone`, `spouse_phone` |
| name | `name`, `spouse_name` |
| signature | `signature`, `spouse_signature` |
| freeform_text | `explain_changes` |
| case_id | `case_id` |
| checkboxes | every `checkbox_*` |
| income_amounts | every `applicant_*` and the remaining `spouse_*` income lines |

## Generating PDFs from markdown

`md-to-pdf.js` renders one or more `.md` files to `.pdf` using a headless
browser. Resolves images via paths relative to the source markdown.

### One-time setup

Install the `marked` dependency:

```bash
cd "scripts/benchmark analysis"
npm install
```

### Usage

```bash
node md-to-pdf.js <input.md> [<input2.md> ...] [--out-dir <dir>] [--browser <path>]
```

- By default the PDF is written next to the source markdown.
- `--out-dir <dir>` redirects output to a folder (created if missing).
- `--browser <path>` overrides browser auto-detection (also: `BROWSER_BIN` env var).

### Browser auto-detection

| Platform | Tries (in order) |
|---|---|
| Windows | Edge x64 → Edge x86 → Chrome x64 → Chrome x86 |
| macOS | Edge.app → Chrome.app → Chromium.app |
| Linux | `microsoft-edge` → `google-chrome` → `chromium` |

### Examples

```bash
# Local file
node md-to-pdf.js report.md

# Multiple files, output co-located with sources
node md-to-pdf.js a.md b.md c.md
```

Running from WSL against Windows-only paths (network shares, `C:\`, etc.) — invoke the Windows Node so the browser and the file share use the same SMB/file stack:

```bash
"/mnt/c/Program Files/nodejs/node.exe" \
  '\\wsl.localhost\Ubuntu\home\<user>\GitHub\ai-adoption-document-intelligence\scripts\benchmark analysis\md-to-pdf.js' \
  '\\server\share\folder\report.md'
```

(Replace `Ubuntu` with your WSL distro from `wsl -l -q` if different.)
