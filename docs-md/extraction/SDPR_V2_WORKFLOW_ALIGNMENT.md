# SDPR V2 workflow alignment — sizing and validation notes

Tracks P0 sizing and P8 alignment for reproducing
[`SDPR_OCR_Performance_Report_V2.md`](../../SDPR_OCR_Performance_Report_V2.md)
inside the product (see [`IMPLEMENTATION_BRIEF.md`](../../IMPLEMENTATION_BRIEF.md)).

## P0 — Rule sizing

**Status:** done (2026-08-04). Counted from a local archive of the share
folder at `~/dev/data_archive/benchmark-result-neural-normalized.changes.csv`
(canonical share path remains
`\\widget\SDPRDocuments\convert_sd0081\100-doc\2026-05-05 performance report\`).
Counts only — rule names and flip totals; no sample IDs or values were
copied into this doc.

**Reproducible PII-safe command:**

```bash
python3 - <<'PY'
import csv
from collections import Counter
path = "benchmark-result-neural-normalized.changes.csv"  # on share / archive
counts = Counter()
with open(path, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        counts[row["rule"]] += 1
for rule, n in counts.most_common():
    print(f"{n}\t{rule}")
print(f"total\t{sum(counts.values())}")
PY
```

### Aggregate gap (from report §10.3)

| View | Total errors | missing | extra | wrong |
|---|---:|---:|---:|---:|
| V2 strict | 623 | 225 | 46 | 352 |
| V2 current | 267 | 103 | 46 | 118 |
| Gap closed | 356 | 122 | 0 | 234 |

Audit CSV total flips = **356** (matches gap closed exactly).

### Per-rule cell counts (from `*.changes.csv`)

| Rule | Cells flipped | Disposition |
|---:|---:|---|
| `income-single-char-zero` | 68 | **Port — workflow** (`singleCharacterToZero`) |
| `recovered:checkbox-zero` | 61 | **Port — workflow** (PR #169) |
| `income-single-digit-to-zero` | 58 | **Port — workflow** (`singleCharacterToZero`) |
| `recovered:checkbox-zero-label-anchor` | 43 | **Port — workflow** (PR #169) |
| `name-fuzzy` | 26 | **Port — evaluator** |
| `freeform-fuzzy` | 20 | **Port — evaluator** |
| `recovered:checkbox-zero-positional` | 18 | **Port — workflow** (PR #169) |
| `currency-chrome` | 15 | **Port — workflow + evaluator** |
| `signature-presence` | 11 | **Port — evaluator** |
| `digits-only` | 9 | **Port — workflow + evaluator** |
| `text-normalized` | 8 | **Port — evaluator** |
| `numeric-equality` | 7 | **Port — workflow + evaluator** |
| `checkbox-tag` | 6 | **Drop — fix at source** (P5) |
| `date-month-day-swap` | 3 | **Drop** (accepted cost) |
| `date-calendar` | 3 | **Port — workflow + evaluator** |
| `case-id-normalized` | **0** | Still wired in template for defense in depth; no flips in this export |

**Roll-ups for acceptance checks**

| Group | Cells | Notes |
|---|---:|---|
| `recovered:checkbox-zero*` | **122** | Equals missing 225→103. Split: 61 plain / 43 label-anchor / 18 positional. |
| `income-single-*` | **126** | 68 char + 58 digit. |
| Dropped (`checkbox-tag` + `date-month-day-swap`) | **9** | 6 + 3. Must be explained in P8 deltas, not chased as workflow misses. |
| Everything else ported | **225** | Evaluator + normalize/canonicalize path. |

### Rule classification (from brief §5)

| Offline rule | Cells | Disposition | Mechanism |
|---|---:|---|---|
| `recovered:checkbox-zero*` | 122 | **Port — workflow** | `ocr.recoverNumericZerosFromCheckboxes` (PR #169) |
| `digits-only` | 9 | **Port — workflow + evaluator canonicalize** | `format_spec` digits + evaluator `canonicalize` |
| `case-id-normalized` | 0 | **Port — workflow + evaluator** | `strip-spaces\|uppercase` (no flips in this CSV) |
| `date-calendar` | 3 | **Port — workflow + evaluator** | `date:YYYY-MM-DD` + rule `date` |
| `date-month-day-swap` | 3 | **Drop** | Cost = **3 cells** (does not move `date` category materially) |
| `currency-chrome`, `numeric-equality` | 15 + 7 | **Port — workflow + evaluator** | `number` + rule `numeric` |
| `income-single-char-zero`, `income-single-digit-to-zero` | 68 + 58 | **Port — workflow** | `singleCharacterToZero` on normalize |
| `signature-presence` | 11 | **Port — evaluator** | rule `presence` |
| `name-fuzzy`, `text-normalized`, `freeform-fuzzy` | 26 + 8 + 20 | **Port — evaluator** | fuzzy + `maxEdits` + canonicalize text |
| `checkbox-tag` | 6 | **Drop — fix at source** | Matches brief (~5–6 cells; strict 0.989 → current 0.991). |

### Dataset freeze

- Neural baseline run id: `dfaddb26-cf91-4afa-aef8-c1ddeec42cc1`
- Pin the 99-doc dataset version used for that run for all alignment benchmarks.
- Do not edit GT during validation except the checkbox serialisation fix (P5).

## P1 — Zero-recovery verification

**Code review (done on merged PR #169):**

- Workflow `parameters.tables` matches Python `SDPR_TABLE_CONFIG` for
  `find`, `columns`, `rows` (18 suffixes/labels), and `fallbackTableFinder`
  exactly. `recoveryValue: 0` and `cellEligibility` are omitted in the
  workflow JSON and rely on TS defaults (same values as Python).
- `Page.selectionMarks` is typed and consumed by the recovery activity;
  Azure extract passes pages through (`pages: analyzeResult.pages || []`).

**Still blocked on production:** cache-replay benchmark confirming
`missing` 225 → ~103 (~120 recovered cells). Re-run with
`ocrCacheBaselineRunId = dfaddb26-cf91-4afa-aef8-c1ddeec42cc1`.

## P4 evaluatorConfig

Implements brief §8.4: `FieldMatchingRule.maxEdits`/`minLength` and
`FieldMatchingRule.canonicalize`. Wired into
`docs-md/workflows/templates/standard-ocr-workflow-sdpr.json`
`metadata.evaluatorConfig` as:

- `defaultRule: { "rule": "exact" }` — checkboxes stay exact (P5).
- Explicit `fieldRules` for signatures, names/freeform, identifiers, dates,
  and all **36** income fields (`numeric` + number canonicalize).

No `date-month-day-swap`. Measured cost from audit CSV: **3 cells**.

## P5 checkbox representation

Canonical form is plain `selected` / `unselected` except at the Azure
labelling-export boundary (`:selected:`). Evaluator normalizes GT via
`normalizeSelectionMarksDeep` at load time
(`apps/temporal/src/selection-mark.ts`).

## P8 — Alignment targets and validation protocol

| Metric | Target |
|---|---:|
| Accuracy | 96.4% |
| Precision | 97.8% |
| Recall | 97.0% |
| F1 | 0.974 |
| FP/doc | 1.66 |
| missing / extra / wrong | 103 / 46 / 118 (= 267) |

Acceptable quantified deltas only: dropped `date-month-day-swap`; sin HITL
workload (prediction-only blank filter vs report's GT-peeking filter).

### Procedure (blocked on share + production access)

1. Benchmark definition: pinned 99-doc version + SDPR operational workflow +
   `schema-aware` + template `evaluatorConfig`.
2. Run with `ocrCacheBaselineRunId = dfaddb26-cf91-4afa-aef8-c1ddeec42cc1`.
3. Download export and compare **directly** (no normalize/recover scripts):
   ```bash
   python3 "scripts/benchmark analysis/compare-engines.py" \
     "Neural V2 current (report)=<share>/benchmark-result-neural-normalized.json" \
     "Workflow (in-app)=<your-export>.json" \
     --out-dir <out> --docs-count 99
   ```
4. HITL ladder: six defs overriding
   `ruleConfidenceOverrides.income-confidence-gate` /
   `sin-confidence-gate` to the §10.5.1 thresholds.
5. Per-cell reconcile with `report-errors.py`.
6. Optional live (non-replay) run.

**Status:** code path is in place; end-to-end alignment run not executed here
because share and production were unreachable from this environment.
