# SDPR V2 report — data + plot generation pipeline

This document records how the data, plots, and tables in `SDPR_OCR_Performance_Report_V2.md` are generated. It exists so the report numbers are reproducible — anyone (human or AI session) can re-derive the headline accuracy, the per-category HITL trade-off, and the underlying CSVs by running the pipeline against the share's benchmark exports.

The companion script README ([`README.md`](README.md), same directory) covers each tool in detail; this document focuses on the SDPR-specific pipeline and the policy decisions baked into it. All command examples below assume you are running from the repository root.

## Inputs

The pipeline reads three benchmark JSONs from the Windows network share `\\widget\SDPRDocuments\convert_sd0081\100-doc\2026-05-05 performance report\`:

| File | Source | Engine | Notes |
|---|---|---|---|
| `benchmark-result.json` | Backend benchmark export | Template (V1) — Azure DI custom template model | The V1 baseline. Used as the comparison column in the report. |
| `benchmark-result-neural.json` | Backend benchmark export | Neural V2 strict — `sdpr-monthly-prod-neural-v2` | The neural model's raw output, evaluated with strict equality. The "stepping stone" column in the report. |
| `benchmark-result-neural-normalized.json` | Generated locally by the pipeline (see below) | Neural V2 current — the same predictions, scored under the normalisation ruleset + per-cell numeric-zero recovery | The headline V2 column. |

The OCR layout cache used by numeric-zero recovery lives in a sibling directory on the share (`ocr-cache-<run-id>/`, one JSONB file per sample) — populated by `scripts/oc-export-benchmark-ocr-cache.sh` from the production database. The cache is read directly by the recovery step.

**Data-handling policy.** Benchmark JSONs contain ground-truth values and OCR predictions and never leave the network drive in raw form. The pipeline streams them through named pipes (in RAM only) and stages derived outputs in `/dev/shm` (tmpfs / RAM) before PowerShell-copying them to the share. Local persistent disk never sees the raw JSON contents.

## Canonical end-to-end command

The whole pipeline runs from one wrapper. Defaults match the SDPR neural-vs-template workflow:

```bash
bash "scripts/benchmark analysis/regenerate-reports-share.sh" \
    '\\widget\SDPRDocuments\convert_sd0081\100-doc\2026-05-05 performance report'
```

That single command runs four steps in order, all against share data, with no persistent local-disk involvement:

1. **Normalize** — flips format-only mismatches in `benchmark-result-neural.json` and writes `benchmark-result-neural-normalized.json` + audit CSV `benchmark-result-neural-normalized.changes.csv`.
2. **Recover numeric zeros** — for income cells where the model returned blank but the OCR layout shows a selection mark in the cell, flips to `0`. Rows from this step roll into the same `changes.csv` from step 1.
3. **Analyze** — emits `benchmark-result-neural-normalized.md` (the per-field metric summary the `analyze.js` tool produces).
4. **Per-error audit reports** — emits `reports/wrong-by-category.csv` + `reports/missing-comparison.csv`.

Opt-out flags exist (`--skip-recovery`, `--skip-reports`) but the canonical SDPR run uses all four steps.

The wrapper is the recommended entry point because the steps have order dependencies that fail silently if chained by hand (e.g. running `analyze` without first re-running `normalize` after a logic change leaves the `.md` reflecting old rules).

## Plot and table generation (separate from the canonical pipeline)

The report's §10 plots and tables come from two additional scripts run on top of the normalized JSON:

### `compare-engines-share.sh` — 3-engine comparison

Used for §10.2, §10.3, §10.4 tables and plots 01–04. Invoke as:

```bash
bash "scripts/benchmark analysis/compare-engines-share.sh" \
    "Template (V1)=\\widget\SDPRDocuments\...\benchmark-result.json" \
    "Neural V2 strict=\\widget\SDPRDocuments\...\benchmark-result-neural.json" \
    "Neural V2 current=\\widget\SDPRDocuments\...\benchmark-result-neural-normalized.json" \
    --out-dir "\\widget\SDPRDocuments\...\plots" \
    --docs-count 99
```

Outputs to the share's `plots/` directory:

- `01-aggregate-metrics.png` — accuracy / precision / recall / F1 / FP-per-document, three bars per metric (one per engine).
- `02-error-class-breakdown.png` — missing / extra / wrong stacked, one stack per engine.
- `03-per-category-accuracy.png` — per-category accuracy, three bars per category.
- `04-per-field-heatmap.png` — 75 fields × 3 engines, colour = error rate.
- `05-threshold-sweep.png` — per-category confidence-threshold sweep (unused in §10; retained for diagnostic use).
- Corresponding `.csv` files with the same names, one per plot.

The matching plots also land in the repo at `plots/` (copied from the share via PowerShell).

### `hitl-planner-share.sh` — scoped HITL planner

Used for §10.5 tables and the HITL trade-off chart. Invoke with the SDPR-specific scope and policy:

```bash
bash "scripts/benchmark analysis/hitl-planner-share.sh" \
    "\\widget\SDPRDocuments\...\benchmark-result-neural-normalized.json" \
    --out-dir "\\widget\SDPRDocuments\...\hitl" \
    --categories income_amounts,sin \
    --exclude-missing-in-categories income_amounts \
    --engine-label "Neural (V2 current)"
```

Outputs to the share's `hitl/` directory:

- `hitl-per-category.csv` — full per-(category, target-recall) sweep with threshold T, reviews per 100 docs, residual errors, and the reviewable-cell denominator.
- `hitl-combined.csv` — one row per target recall, combined workload across the in-scope categories.
- `hitl-curves.png` — log-scale recall-vs-workload chart, one line per category, dots marking each operating point with T= labels.

The chart also lands in the repo at `hitl/hitl-curves.png`.

#### Two SDPR-specific policy switches built into the HITL invocation

- `--categories income_amounts,sin` — HITL workload analysis is **scoped to high-impact fields only**. Income drives benefit calculations; SIN gates the ICM lookup. Other categories (`signature`, `name`, `case_id`, `phone`, `freeform_text`, `checkboxes`, `date`) are validated through non-confidence layers documented in V2 §10.5.5 (ICM cross-validation, group consistency, presence checks, downstream LLM cleanup). Including them in the HITL planner would mix categories with fundamentally different safety mechanisms.
- `--exclude-missing-in-categories income_amounts` — Income `missing`-class errors (predicted blank, expected populated) are dropped from the HITL math. These cells are predicted blank with high confidence and are unreachable by confidence-gating; they require the per-cell numeric-zero recovery (step 2 of the canonical pipeline) and follow-on layers. Including them in HITL would inflate the workload with cells the gate provably cannot catch. In the current run, 82 such cells are excluded — the remaining 68 income errors form the in-scope pool.

The workload metric (`reviews_per_100_docs`) counts only **reviewable** flagged cells — cells where the form has something to verify (either model returned a value or GT has one). Correct-blank cells (both predicted and expected empty) don't count even when flagged below T, because the operator has nothing on the page to compare against. This matters for SIN specifically: of 198 total sin predictions (2 fields × 99 docs), only ~97 are reviewable — the rest are blank-blank pairs (mostly `spouse_sin` on single-applicant forms).

## Normalisation ruleset (V2 scoring policy)

The normaliser applies a category-specific ruleset. The full list is documented in §10.4.5 of the V2 report and in the docstring of `scripts/benchmark analysis/normalize-benchmark.py`. Summary:

| Category | What's relaxed |
|---|---|
| `sin`, `phone` (& spouse variants) | Punctuation stripped before comparison |
| `date`, `spouse_date` | Same calendar date in different formats; month/day transposition on ISO dates **(provisional — date's downstream use is undetermined)** |
| `signature`, `spouse_signature` | Any non-empty pair counts as match (presence-only) |
| `name`, `spouse_name` | Whitespace / case / punctuation / hyphen-spacing; plus fuzzy match (rapidfuzz ratio ≥80 OR Levenshtein ≤2) **(identity is validated by ICM SIN-lookup, not literal name match)** |
| `explain_changes` | Whitespace / case / punctuation; plus fuzzy match (rapidfuzz ratio ≥80 OR Levenshtein ≤4) **(downstream LLM cleanup handles residual drift)** |
| `case_id` | Whitespace + case |
| Income (`applicant_*` / `spouse_*` numeric) | Currency chrome (`$`); commas/whitespace; number-vs-string types; single-char predictions accepted as `0` when expected is `0`; per-cell numeric-zero recovery for blank cells with a selection-mark overlap |
| `checkbox_*` | Tag-style vs plain-string equivalence (`:selected:` ≡ `selected`) |

Each rule has a name that appears in the `rule` column of `benchmark-result-neural-normalized.changes.csv`, so the audit CSV is grep-able by rule type.

## Reproducing the report from scratch

Assuming the three input JSONs and the OCR cache are on the share:

```bash
SHARE='\\widget\SDPRDocuments\convert_sd0081\100-doc\2026-05-05 performance report'

# 1. Normalize + recover + analyze + per-error reports
bash "scripts/benchmark analysis/regenerate-reports-share.sh" "$SHARE"

# 2. Cross-engine comparison plots + tables
bash "scripts/benchmark analysis/compare-engines-share.sh" \
    "Template (V1)=$SHARE\benchmark-result.json" \
    "Neural V2 strict=$SHARE\benchmark-result-neural.json" \
    "Neural V2 current=$SHARE\benchmark-result-neural-normalized.json" \
    --out-dir "$SHARE\plots" --docs-count 99

# 3. Scoped HITL planner
bash "scripts/benchmark analysis/hitl-planner-share.sh" \
    "$SHARE\benchmark-result-neural-normalized.json" \
    --out-dir "$SHARE\hitl" \
    --categories income_amounts,sin \
    --exclude-missing-in-categories income_amounts \
    --engine-label "Neural (V2 current)"
```

After these run, the share has:

- `benchmark-result-neural-normalized.json` + `.changes.csv` + `.md`
- `plots/01-aggregate-metrics.png` through `05-threshold-sweep.png` plus matching CSVs
- `hitl/hitl-per-category.csv` + `hitl/hitl-combined.csv` + `hitl/hitl-curves.png`
- `reports/wrong-by-category.csv` + `reports/missing-comparison.csv`

The plots and the HITL chart also exist in the repo at `plots/` and `hitl/` (copied from the share) so the V2 markdown can reference them with simple relative paths.

## Reviewing changes

Each step is safe to re-run. The normaliser is idempotent (rules detect already-matched cells and skip them). The recovery step de-duplicates prior `recovered:*` rows from the merge source. The analyzer and per-error reports are pure reads of the JSON.

When a normaliser or recovery rule changes:

1. Re-run the canonical pipeline (`regenerate-reports-share.sh`).
2. Re-run `compare-engines-share.sh` so the 3-engine plots reflect the new normalised numbers.
3. Re-run `hitl-planner-share.sh` so the HITL chart and tables reflect the new error distribution.
4. Update the affected sections of `SDPR_OCR_Performance_Report_V2.md` — at minimum §10.2 (aggregate metrics), §10.3 (error-class breakdown), §10.4 (per-category accuracy), and §10.5 (HITL tables) all carry numbers that flow from the pipeline.

A `regenerate-reports-share.sh` log line at the end of each run records how many rule-flips the normaliser made, separated by rule name. Comparing that line across runs is the quickest way to see what a change did.

## Future engines (V3 and beyond)

The 3-column structure of §10's tables is engine-as-column. Adding V3 means:

1. Get the new engine's benchmark JSON onto the share.
2. Run the canonical pipeline against it to produce its normalised JSON (same ruleset; if a new engine's output format demands rule extensions, document them).
3. Re-run `compare-engines-share.sh` with the new engine as an extra `LABEL=PATH` argument. The plots regrow with another column / bar series per chart.
4. Re-run `hitl-planner-share.sh` against the new engine's normalised JSON to size HITL workload at the same recall ladder. The per-category policy (scoped categories, missing-exclusion on income) is engine-agnostic and can be reused as-is.
5. Append a column to the §10 tables in the V2 markdown.

The methodology — normalisation rules, recovery rules, reviewable-cell workload definition — is engine-agnostic and reproducible. Only the input JSON identity changes.
