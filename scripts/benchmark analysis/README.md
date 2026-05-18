# Benchmark run analysis

Local helpers for inspecting a downloaded benchmark run.

**If you want to re-regenerate everything for a share-based run, run [`regenerate-reports-share.sh`](#full-re-regeneration-pipeline-regenerate-reports-sharesh) — do NOT chain the individual wrappers by hand. The order and flags are easy to get wrong and the failure mode (partial state in committed reports) is silent.**

- `regenerate-reports-share.sh` — **canonical end-to-end wrapper.** Runs normalize → recover-numeric-zeros → analyze → report-errors in order against share data. One arg (base dir). Use this every time you want fresh reports.
- `analyze.js` — produces a markdown summary of one run (per-field metrics + confidence-threshold trade-offs).
- `compare-engines.py` — compares two or more runs (engine-as-column tables + 6 PNG plots + 7 CSVs, including a per-category HITL threshold-sweep planner). Designed so additional engines slot in as extra `LABEL=PATH` arguments — no restructuring as the engine roster grows.
- `compare-engines-share.sh` — wrapper around `compare-engines.py` for inputs/outputs that live on a Windows network share (handles the WSL ↔ UNC path translation via PowerShell).
- `normalize-benchmark.py` — post-process a benchmark JSON to flip format-only mismatches (sin/phone digit-only, date calendar-parse, income currency / numeric-equality, text-like whitespace+case+punct, name/freeform fuzzy) to `matched: true`. Produces a parallel JSON the same shape, plus an audit CSV listing every flipped error.
- `normalize-benchmark-share.sh` — wrapper that runs the normaliser against share data without staging the JSON to local disk (input stream through a named pipe; outputs land in `/dev/shm` tmpfs, then copy to the share).
- `recover-numeric-zeros.py` + `recover-numeric-zeros-share.sh` — flip missing-zero income errors where the OCR cache shows a selection mark in the cell. Merges its recovery rows into the normaliser's `changes.csv` by default (preserves prior normaliser rows; `--no-merge` opts out).
- `report-errors.py` + `report-errors-share.sh` — two audit CSVs from one or more benchmark JSONs: `wrong-by-category.csv` (per-occurrence detail of every non-matched cell in the target engine — sampleId, category, field, kind, predicted, expected, confidence — sorted by category → field → sampleId; row count equals the engine's "Total errors" in the .md report) and `missing-comparison.csv` (per `(sampleId, field)` cell with a missing error in any non-baseline engine, flagged as `new in <eng>` / `regressed from wrong` / `still missing` relative to the baseline). UNC inputs / outputs handled by the wrapper, same streaming pattern as the normaliser.
- `hitl-planner.py` + `hitl-planner-share.sh` — target-recall HITL capacity planner for a single engine. Sweeps a 6-level recall ladder (50 / 70 / 80 / 90 / 95 / 99%) across an allowlist of categories (default: `income_amounts`, `sin`, `phone`), picks per-category thresholds independently, and reports combined reviews per 100 docs. Writes `hitl-per-category.csv`, `hitl-combined.csv`, and `hitl-curves.png` (one log-scale chart with per-category recall lines and operating-point dots). Models confidence-gating on ALL predictions (no skip-blank optimisation) — null predictions still carry confidence scores, so missing errors are catchable by the gate.
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

## Full re-regeneration pipeline (`regenerate-reports-share.sh`)

Whenever you change the normalizer or the numeric-zero recovery logic and want to refresh all share artifacts, run **one** command:

```bash
bash "scripts/benchmark analysis/regenerate-reports-share.sh" \
    '\\widget\SDPRDocuments\convert_sd0081\100-doc\2026-05-05 performance report'
```

That runs the four steps in order, against share data, with the same RAM-only streaming pattern as the individual wrappers (no persistent local disk involvement):

1. `normalize-benchmark-share.sh` — flips format-only mismatches; writes `<basename>.json` + `<basename>.changes.csv`.
2. `recover-numeric-zeros-share.sh` — flips OCR-misread missing zeros; **rolls recovery rows into the same `changes.csv`** (defensive default: `--merge-into-changes` defaults to `--changes` when that file exists).
3. `analyze-share.sh` — writes `<basename>.md`.
4. `report-errors-share.sh` — writes `reports/wrong-by-category.csv` + `reports/missing-comparison.csv`.

Defaults match the current SDPR neural-vs-template workflow (raw `benchmark-result-neural.json`, baseline `benchmark-result.json`, OCR cache `ocr-cache-dfaddb26/`, labels "Neural (V2 normalized)" and "Template (V1)", `--strip-sample-id-suffix '.jpg'`). Override any default via flags — see `regenerate-reports-share.sh --help`.

Opt-out flags:

- `--skip-recovery` — skip step 2 (no OCR cache available, or you want to isolate normalize-only effects).
- `--skip-reports` — skip step 4 (single-engine — no baseline to compare against).

### Why a combined wrapper

The individual share wrappers are still useful for debugging or one-off invocations, but the pipeline has an order dependency that's silent if you get it wrong:

- Skipping recovery → `missing-comparison.csv` still flags missing-zero cells that were already resolved.
- Running recover without `--merge-into-changes` → wipes the normaliser rows from `changes.csv`.
- Re-running analyze without re-running normalize first after a logic change → the `.md` reflects the old logic.

The combined wrapper makes the canonical sequence the one-command default. Use it; reach for the individual wrappers only when you have a specific reason.

### Idempotency

Each step is safe to re-run. The recovery script de-dupes prior `recovered:*` rows from the merge source before appending, so re-running the pipeline against an already-recovered JSON produces the same final state. The analyzer and report-errors scripts are pure reads of the JSON.

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

> For end-to-end share regeneration, use [`regenerate-reports-share.sh`](#full-re-regeneration-pipeline-regenerate-reports-sharesh) instead. The section below documents the normaliser in isolation for debugging.

Re-scores an existing benchmark JSON, treating pure format-difference mismatches as correct. Useful for separating real engine errors from format-only ones (currency-chrome, date-format, SIN punctuation, capitalisation, whitespace, fuzzy text). Ports the equivalence rules from `apps/temporal/src/scripts/promote-gt-format-variants.ts` and adds SDPR-specific rules on top (see "Equivalence rules" below).

Requirements: Python 3.10+, `rapidfuzz` (used by the `name-fuzzy` / `freeform-fuzzy` rules). Install once:

```bash
pip install -r "scripts/benchmark analysis/requirements.txt"
```

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
| `name`, `spouse_name` | `name-fuzzy` | See [§ Two-path fuzzy matching](#two-path-fuzzy-matching) below. Ratio threshold 80; max-edits 2; min length 3 | `Martinez` ≡ `Martínez` (1 edit); `Mackinnen` ≡ `MacKinnon` (2 edits); `Lee` ≡ `Lei` (1 edit, length floor 3 satisfied) |
| `explain_changes` | `freeform-fuzzy` | See [§ Two-path fuzzy matching](#two-path-fuzzy-matching) below. Ratio threshold 80; max-edits 4; min length 3 | `"Lost iob in March applied for EI"` (1 sub); long-paragraph paraphrase via ratio |
| `case_id` | `case-id-normalized` | Whitespace + case-insensitive | `ABC-123` ≡ `abc-123 ` |
| Income-like (`applicant_*` / `spouse_*` numeric) | `currency-chrome` | Predicted has a leading/trailing `$` that, once stripped, equals expected verbatim | `$ N/A` ≡ `N/A` |
| Income-like | `numeric-equality` | Both loose-parse to the same number (strips `$`, commas, whitespace; handles number-vs-string types; newline-stacked predictions accepted ONLY when every non-empty line parses to the same number and equals expected) | `$2,711.64` ≡ `2711.64`; `900` (num) ≡ `"900.00"`; `"7, 969"` ≡ `7969`; `"0\n0"` ≡ `0`. Rejects `"E\n0"` (non-numeric line) and `"69\n606"` (different numbers per line) |
| Income-like | `income-single-char-zero` | Predicted is a single NON-DIGIT character (letter or symbol) and expected parses to `0`. Captures OCR mis-reads of faint `0` glyphs as stray letters | `E` ≡ `0`; `Q` ≡ `0`; `o` ≡ `0`; `-` ≡ `0` |
| Income-like | `income-single-digit-to-zero` | Predicted is a single digit `0`-`9` and expected parses to `0`. Captures OCR mis-reads where a faint `0` was recognised as the wrong digit. Split from `income-single-char-zero` so the audit log distinguishes digit-OCR failures from letter/symbol-OCR failures | `1` ≡ `0`; `8` ≡ `0`; `5` ≡ `0` |
| `checkbox_*` | `checkbox-tag` | Lowercase + strip surrounding `:` on both sides; equal if both reduce to `selected` or both to `unselected` | `selected` ≡ `:selected:`; `:UNSELECTED:` ≡ `unselected` |
| Sentinel GT (`:present:`, `:garbled:`, `Spouse Missing`, `Missed Box`, `Blank Declaration`, `Homeless`, `KEY PLAYER MISSING`) | _never flipped_ | Listed for transparency — these are GT-only tags, not engine output; the normaliser refuses to touch any cell whose expected matches a sentinel |

### Two-path fuzzy matching

`name-fuzzy` and `freeform-fuzzy` both use a two-path approach. A pair flips if EITHER path succeeds. Both paths require the shorter string to meet `MIN_LEN`.

#### Path A — ratio (`rapidfuzz.fuzz.ratio() >= THRESHOLD`, 0-100 scale)

Catches **paragraph-level drift on long strings**. The Indel-based ratio rewards strings that are mostly-the-same with small scattered differences. It's the right metric for:

- Long paragraph paraphrasing where the meaning is preserved but individual word choices differ.
- Multiple OCR errors scattered across a long string where the overall percentage of agreement is still high.

But ratio is **length-sensitive**: a single character difference on a 5-char string drops the ratio to ~80, while the same single difference on a 30-char string keeps it at ~96. That's the wrong shape for short-string OCR errors, which is what path B is for.

#### Path B — absolute edit distance (`Levenshtein.distance() <= MAX_EDITS`)

Catches **character-level OCR errors uniformly regardless of string length**. One substitution counts as one edit whether the string is 5 chars or 50 chars. This makes the rule length-INDEPENDENT for the OCR failure mode:

- `Lee` ≡ `Lei`: 1 edit → flips, same as `Christopher` ≡ `Christophar` (1 edit).
- A single OCR misread in any-length string is treated equally forgivably.

#### Why both paths

Each path covers a failure mode the other handles poorly:

| Failure mode | Path A (ratio) | Path B (distance) |
|---|---|---|
| Single OCR sub in short string | ✗ ratio too low | ✓ distance = 1 |
| Single OCR sub in long string | ✓ ratio near 100 | ✓ distance = 1 |
| Many small drifts in long paragraph | ✓ ratio above threshold | ✗ too many edits |
| Totally unrelated strings | ✗ low ratio | ✗ high distance |

#### Min-length floor

Prevents the distance path from degenerate matches. Without `MIN_LEN >= 3`, two 1-char strings (`a` vs `b`, distance 1) would flip for both rules. The floor is asymmetric in intent:

- **Names** use `MIN_LEN = 3`, `MAX_EDITS = 2`. The 2-edit cap keeps short-name matches conservative (max 1 sub + 1 case shift, or 2 subs).
- **Freeform** uses `MIN_LEN = 3`, `MAX_EDITS = 4`. The wider 4-edit cap is permissive because explain_changes is LLM-post-processed downstream — noise here gets cleaned up.

**Caveat on the freeform settings**: with `min_len=3` and `max_edits=4`, the distance path will accept mostly-unrelated 3-4 char strings (e.g., `Yes` vs `Bad` at distance 3). This is a deliberate trade-off: per-cell precision is sacrificed for permissive aggregate coverage, knowing that downstream LLM cleanup will catch garbage flips. If audit noise becomes a problem, either raise `FREEFORM_FUZZY_MIN_LEN` or add an "at least one shared char" clamp.

#### Tuning knobs

All four constants live at the top of [normalize-benchmark.py](normalize-benchmark.py):

```python
NAME_FUZZY_THRESHOLD = 80    # ratio path: 0-100
NAME_FUZZY_MAX_EDITS = 2     # distance path: absolute count
NAME_FUZZY_MIN_LEN = 3       # both paths
FREEFORM_FUZZY_THRESHOLD = 80
FREEFORM_FUZZY_MAX_EDITS = 4
FREEFORM_FUZZY_MIN_LEN = 3
```

Adjust based on what the audit CSV (`<basename>-normalized.changes.csv`) shows. Each fuzzy flip carries the rule name (`name-fuzzy` / `freeform-fuzzy`) so you can grep just those rows for spot-checking.

### Outputs

- **`<input-basename>-normalized.json`** — same shape as the input. Each format-variant mismatch in `perSampleResults[].evaluationDetails[]` has `matched: true` and an annotation `matchedVia: "normalized:<rule>"`. Per-field aggregates in `perFieldResults` are recomputed from the mutated details (errorCount, correctCount, errorRate, accuracy, averageConfidence*, errors[] list). A top-level `normalization` block records what ran.
- **`<input-basename>-normalized.changes.csv`** — one row per flipped error: `sampleId, field, rule, predicted, expected`. Use this to spot-check the normalisation before adopting it.
- The stderr summary prints flip counts by rule and by field (no values), useful as a sanity check.

### What the normaliser does NOT do

- It does **not** recompute the backend-supplied `suggestedCatch90` / `suggestedBestBalance` / `suggestedMinimizeReview` threshold suggestions. Those reflect the strict scoring; downstream analyses (`analyze.js`, `compare-engines.py`) ignore them anyway.
- It does **not** flip `missing` or `extra` errors. By construction, format variants exist only when both predicted and expected are non-empty.
- It does **not** modify the upstream GT files. If you also want the GT files updated, run `apps/temporal/src/scripts/promote-gt-format-variants.ts --write` against a local-pipeline benchmark.

## Error-class audit reports (`report-errors.py`)

> For end-to-end share regeneration, use [`regenerate-reports-share.sh`](#full-re-regeneration-pipeline-regenerate-reports-sharesh) instead. The section below documents `report-errors.py` in isolation.

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

### `wrong-by-category.csv` — per-occurrence error detail for the target engine

One row per non-matched `(sampleId, field)` cell in the target engine (the LAST engine in argv — by convention `report-errors-share.sh` and `regenerate-reports-share.sh` pass the baseline first and the target neural last). Columns:

| column | meaning |
|---|---|
| `sampleId` | identifies the file/document where the error occurred |
| `category` | field category bucket (sin, date, name, income_amounts, …) — same buckets as compare-engines.py |
| `field` | exact field name (e.g., `applicant_employment_insurance`) |
| `kind` | `wrong` (both sides populated, mismatch), `missing` (predicted empty), or `extra` (expected empty) — matches the analyze.js classification |
| `predicted` | engine's predicted value (raw, not normalised) |
| `expected` | ground-truth value |
| `confidence` | engine's confidence score for this cell (blank if not reported) |

Sorted by category → field → sampleId so same-field errors cluster together. **Row count equals the engine's "Total errors" in the `.md` report** — every non-matched cell appears exactly once. Use this as the source-of-truth audit log for investigating individual errors (open in Excel, filter by `kind=wrong` or by `field`, sort by `confidence` to find low-confidence mistakes).

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
