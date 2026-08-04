# SDPR V2 workflow alignment — sizing and validation notes

Tracks P0 sizing and P8 alignment for reproducing
[`SDPR_OCR_Performance_Report_V2.md`](../../SDPR_OCR_Performance_Report_V2.md)
inside the product (see [`IMPLEMENTATION_BRIEF.md`](../../IMPLEMENTATION_BRIEF.md)).

## P0 — Rule sizing

**Status:** share inaccessible from this environment
(`\\widget\SDPRDocuments\convert_sd0081\100-doc\2026-05-05 performance report`
→ `Test-Path` returned `False`). Exact per-rule cell counts from
`benchmark-result-neural-normalized.changes.csv` could not be produced here.

**Re-run when share is available (PII-safe — counts only):**

```bash
awk -F, 'NR>1 {print $3}' changes.csv | sort | uniq -c | sort -rn
grep -c 'checkbox-tag' changes.csv
grep -c 'date-month-day-swap' changes.csv
```

### Aggregate gap (from report §10.3)

| View | Total errors | missing | extra | wrong |
|---|---:|---:|---:|---:|
| V2 strict | 623 | 225 | 46 | 352 |
| V2 current | 267 | 103 | 46 | 118 |
| Gap closed | 356 | 122 | 0 | 234 |

### Rule classification (from brief §5)

| Offline rule | Disposition | Mechanism |
|---|---|---|
| `recovered:checkbox-zero*` | **Port — workflow** | `ocr.recoverNumericZerosFromCheckboxes` (PR #169). Expected ~120 cells (= missing 225→103). |
| `digits-only` | **Port — workflow + evaluator canonicalize** | `format_spec` digits + evaluator `canonicalize` |
| `case-id-normalized` | **Port — workflow + evaluator** | `strip-spaces\|uppercase` |
| `date-calendar` | **Port — workflow + evaluator** | `date:YYYY-MM-DD` + rule `date` |
| `date-month-day-swap` | **Drop** | Accepts a different calendar date. Cost TBD from share CSV. |
| `currency-chrome`, `numeric-equality` | **Port — workflow + evaluator** | `number` + rule `numeric` |
| `income-single-char-zero`, `income-single-digit-to-zero` | **Port — workflow** | `singleCharacterToZero` on normalize |
| `signature-presence` | **Port — evaluator** | rule `presence` |
| `name-fuzzy`, `text-normalized`, `freeform-fuzzy` | **Port — evaluator** | fuzzy + `maxEdits` + canonicalize text |
| `checkbox-tag` | **Drop — fix at source** | Expected ~5–6 cells (strict 0.989 → current 0.991). |

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

No `date-month-day-swap`. Cost TBD from share CSV.

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
