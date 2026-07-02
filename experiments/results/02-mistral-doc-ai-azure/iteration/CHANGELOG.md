# E02 strict-equality improvement loop — iteration log

Tracks every change made to `prompt.md` / `field-descriptions.json` / workflow JSON
parameters during `improve/01-strict-eval-and-mistral-tune`, with the smoke-test
result that motivated the change and the benchmark metrics measured after the
change. Each entry is a concrete decision with rationale so the SUMMARY
retrospective can reference it without reconstructing from git history.

Format per entry:

```
## <ISO timestamp> — <one-line title>

What changed: <prompt | field-descriptions | workflow params | provider/converter>
Why: <which aggregate error pattern or per-sample diff motivated the change>
Smoke-test (if applicable):
  Sample: "<sample id>"
  Before: <accuracy %>  After: <accuracy %>  Δ: <±N pp>
  Worst regressions: <field, predicted vs expected — or "none">
Benchmark (if applicable):
  Run id: <uuid>
  pass_rate: <x.xxx>  f1.median: <x.xxx>  f1.mean: <x.xxx>  matchedFields.median: <n of 74>
  Δ vs prior bench: pass_rate <±N pp>  f1.median <±N pp>  matchedFields.median <±n>
Decision: <kept | reverted | partial-keep — and why>
```

---

## Web-research findings (pre-iteration; informs the loop)

Research agent prioritised concrete changes (full report attached to PR description):

1. `table_format: "html"` on the OCR call so APPLICANT vs SPOUSE column identity survives via colspan/rowspan ([Mistral OCR 3 release notes](https://mistral.ai/news/mistral-ocr-3)).
2. Move multi-rule guidance (column rules, blank-vs-zero, signature-vs-name) out of per-field descriptions and into `document_annotation_prompt` as XML-tagged sections; shrink per-field descriptions to ~1 line of keyword anchors. Mistral's annotation pass is a vision LMM seeing OCR markdown — long descriptions compete with OCR text for attention ([Mistral prompting guide](https://docs.mistral.ai/capabilities/completion/prompting_capabilities)).
3. Soften format-coercion language in field descriptions (`"YYYY-MM-DD if legible"`, `"preserve digits as written"`) — rigid musts cause null drops ([MS Q&A 5767943](https://learn.microsoft.com/en-au/answers/questions/5767943/)).
4. Try `bbox_annotation_format` with a tiny typed schema so the 8 bbox crops reaching the LMM carry typed hints (signature vs checkbox vs figure).
5. Reference Unicode checkbox glyphs `☐` / `☑` explicitly in the global prompt (OCR 3 emits these tokens).
6. Set `image_min_size: 64`, `image_limit: 8` so handwriting crops survive and the bbox slot budget targets signal-bearing regions.
7. ~~Enable `confidence_scores_granularity: "word"`~~ — **NOT applicable**: documented in E02 SUMMARY that Foundry rejects this with HTTP 422 (`extra_forbidden`). Skipped.
8. Restate `additionalProperties: false` on every nested object — already done in the schema converter; keep.

OCR-3 features (#1, #4, #5, #6) need verification on the Foundry deployment `mistral-document-ai-2512` before applying — the Foundry route is stricter than the public API in known ways. Approach: add one feature at a time via a smoke-test on a passing sample, watch for HTTP 422.

---

## Strict-baseline reference (Phase 2 — no prompt change)

**Why:** Eval rule changed from `fuzzy@0.85` to `exact` in `apps/shared/prisma/seed.ts:2044-2062`.
The current iteration kit (prompt.md + field-descriptions.json) and workflow JSON
parameters are unchanged from the fuzzy-era E02 canonical run
(`1b97de43-...`). This entry captures the strict-equality re-baseline before any
improvement loop edits.

Run id: `b26d8cc2-8620-408d-ac3a-090bb9d1b695`
pass_rate: **0.900** (36/40)  f1.median: **0.950**  f1.mean: **0.934**  matchedFields.median: **66.5**
precision.mean: **1.000**  recall.mean: **0.884**  falsePositives.mean: **0**
f1.min: **0.679** (HR0081 (10))  f1.max: **1.000**

Note: every aggregate metric is *better* than the fuzzy@0.85 era E02
canonical run despite the rule getting stricter. This is mostly because
the dataset was force-resynced between the fuzzy run and this one
(local label corrections propagated to blob storage), not because strict
is a friendlier rule than fuzzy. The two effects roughly cancel; the net
movement is small and reflects label quality, not engine behaviour.

Top per-field error drivers (bottom-up; from `perFieldResults`):
  signature       29 errors (sentinel labels in GT — `:present:`, `KEY PLAYER MISSING`)
  sin             20 errors (model strips hyphens; GT preserves)
  date            14 errors (model normalises to YYYY-MM-DD; GT preserves form's format)
  explain_changes 14 errors (single-character / punctuation differences)
  name            12 errors (handwriting OCR misreads; some sentinels)
  applicant_*     6-9 errors per field (blank-vs-zero conflation; HR0081 (10) cluster)
  checkbox_*_no   6-8 errors per field (bidirectional miss/over-detect)

Bottom of F1 (excluding known-hard `81 blank`/`81 coffee`):
  HR0081 (10)   f1=0.679  — handwritten zeros across all rows; OCR not transcribing
  Fake 1        f1=0.746  — labeling convention "blank=0" mismatches model output
  Fake 3        f1=0.767  — labeling convention "blank=N/A" mismatches schema's number type
  Fake 7        f1=0.816  — format misreads + spouse-column blank-vs-zero edge case

---

## 2026-05-10 — Round 1: format preservation + global-prompt rules + terse field descriptions

What changed: `prompt.md` (rewritten with XML-tagged sections per research rec; ~5KB) + `field-descriptions.json` (collapsed numeric income field descriptions to one-liners; clarified format preservation on `sin` / `date` / `phone`; tightened `signature` recall rule). The same content will be copied into the workflow JSON's `parameters.documentAnnotationPrompt` / `parameters.fieldDescriptions` for the next benchmark run.

Why:
  - Top 4 error drivers (`sin`, `date`, `explain_changes`, `name`) were format-coercion or punctuation-normalisation issues — research recommendation #3 (soften format coercion / "preserve as written"). The old field descriptions said `Strip any spaces or hyphens` for `sin` and `Return as YYYY-MM-DD` for `date`, but the GT preserves the form's original format.
  - 36 numeric income field descriptions were repeating the same blank-vs-zero rule paragraph, competing with OCR text for attention (research rec #2 — Mistral's annotation pass is a vision LMM seeing OCR markdown, not a long-context LLM). Moved the rule to the global prompt; collapsed each field description to `Section 2, row 'X', APPLICANT/SPOUSE column.`
  - Checkbox descriptions were short but ambiguous ("return 'selected' if YES is checked"); rewrote into a global `<checkbox_rules>` block plus added per-field column-disambiguation labels (left vs right column, applicant row vs spouse row).

Smoke tests (script: `iterate-mistral-extraction.ts`; scorer: strict-with-normalisation, ~14s/sample):

```
Sample              | Baseline matched | Round 1 matched |  Δ  | Comment
--------------------+------------------+-----------------+-----+----------------------------------------------------------------
Fake 7              |  51              | 69              | +18 | Format preservation fixed sin/date misses; spouse blanks stay null
1 81                |  66              | 66              |   0 | Date day-month swap regression cancels +1 elsewhere; signature 'X' picked up but GT is sentinel "KEY PLAYER MISSING"
manual sample (6)   |  56              | 71              | +15 | sin hyphens preserved; date format preserved; checkbox over-detection mostly fixed
```

Iteration loop history (intermediate states, not committed):

```
v1: prompt added "Be aggressive about recognising '0'... prefer 0 when adjacent rows..."
    Fake 7: 52 matched (-19 vs round 1) — model returned 0 for blank spouse columns. REVERTED.
v2: replaced with "do not infer 0 from context... when no marks in entire spouse column, prefer null".
    Fake 7: 69 matched. KEPT.
```

Decision: KEEP the v2 changes. Smoke tests show net +18 / +0 / +15 matched fields across three representative samples. Remaining mismatches on these samples are all dataset-side (sentinel labels) or OCR-character-level (P↔F, 3↔7 digit misreads) — not prompt-fixable.

Benchmark (post-Round 1):
  Run id: `2185d532-0e27-4cb5-b756-b577446e4e22`
  pass_rate: **0.825** (33/40, vs 0.900 baseline) — Δ −7.5 pp
  f1.median: **0.950** (vs 0.950) — Δ 0.000 (unchanged)
  f1.mean: **0.911** (vs 0.934) — Δ −2.3 pp
  precision.mean: **0.993** (vs 1.000) — Δ −0.7 pp (introduced FPs)
  recall.mean: **0.853** (vs 0.884) — Δ −3.2 pp
  matchedFields.median: **66.0** (vs 66.5) — Δ −0.5
  falsePositives.mean: **0.40** (vs 0.00)

Per-sample comparison vs strict baseline (top regressions):

```
HR0081 (5)         strict-baseline 0.993 → round 1 0.655   Δ −0.338  (B→F)
manual sample (2)  strict-baseline 0.972 → round 1 0.679   Δ −0.293  (B→F)
synth-regular (3)  strict-baseline 1.000 → round 1 0.729   Δ −0.271  (B→F)
synth-regular (1)  strict-baseline 0.986 → round 1 0.735   Δ −0.251  (B→F)
2 81               strict-baseline 0.986 → round 1 0.853   Δ −0.133  (still passing)
```

Per-sample comparison vs strict baseline (top improvements):

```
HR0081 (10)        strict-baseline 0.679 → round 1 0.965   Δ +0.286  (F→B)
81 coffee          strict-baseline 0.929 → round 1 0.921   Δ −0.008  (was passing under both)
manual sample (6)  strict-baseline 0.862 → round 1 0.979   Δ +0.117  (still passing)
manual sample (1)  strict-baseline 0.986 → round 1 0.993   Δ +0.007
1 81               strict-baseline 0.943 → round 1 0.972   Δ +0.029
manual sample (10) strict-baseline 0.935 → round 1 0.986   Δ +0.051
```

Aggregate net Δ f1 across all samples: **−0.929** (sum) — round 1 hurts more samples than it helps when measured by the *current* ground-truth set.

Root cause of every regression is **dataset labelling inconsistency**, not engine quality:

| Field         | HR0081 series GT | manual sample GT | Fake series GT |
|---------------|------------------|------------------|----------------|
| `sin`         | `"999888777"`    | `"123-456-789"`  | mixed          |
| `date`        | `"2026-03-16"`   | `"2025-Nov-12"`  | `"2026APR02"`  |
| `applicant_*` | `"0"` (string)   | mostly real $    | `"0"` / `"N/A"`/`null` |
| `spouse_*`    | mixed `""`/`"0"` | mostly `""`      | mostly `""`    |

The form ITSELF on the page is what the engine sees: hyphenated SINs, form-format dates, visible "0" marks across income cells. The labelers normalised some samples and preserved others. No prompt setting can match both labelling conventions simultaneously.

Decision (per user direction at 2026-05-10): **KEEP round 1 as the canonical prompt for E02.** The engine now preserves form-as-written format, which is the user's preferred semantic. The benchmark regressions reflect GT-vs-engine-convention disagreement and will be resolved by adjusting GT to match what's actually written on each form, in a separate follow-up dataset-cleanup task. The strict baseline numbers remain documented above as the "before-format-preservation" reference so the cleanup can be measured against them after the fact.

---

## Convergence

Loop terminated after one round per the user's call. Convergence rationale:

1. The dominant remaining error categories (format-coercion, blank-vs-zero,
   sentinel labels, single-character OCR misreads) are GT-side or
   engine-OCR-capacity issues, not prompt-fixable.
2. Per-experiment iteration without GT cleanup hits a ceiling — any prompt
   that flips behaviour on one labelling convention regresses samples on
   the other.
3. User-stated preference is to keep "preserve as written" engine semantics
   and clean GT to match, rather than coerce the engine to fit divergent GT
   conventions.

OCR-3 features the research agent suggested (`table_format: "html"`,
`bbox_annotation_format`, `image_min_size`/`image_limit`, Unicode checkbox
glyphs in the prompt) are NOT applied. They would require activity-side
code changes (the `mistralAzureOcrProcess` request body would need new
fields plumbed through). Out of scope for this branch under the same
"GT-side regression dominates" reasoning — those features would need a
re-eval window after GT cleanup to be measured fairly. Tracked as a
candidate for a future `improve/<NN>-mistral-ocr3-features` branch.

---

## 2026-05-10 — Round 2: strict blank-vs-zero + two-group checkbox section + one-of evaluator support

Three changes layered on top of round 1, based on direct user feedback after
the round-1 aggregate regression:

**1. Evaluator one-of GT support** ([`apps/temporal/src/evaluators/schema-aware-evaluator.ts`](../../../../apps/temporal/src/evaluators/schema-aware-evaluator.ts))

A GT field value can now be an array of acceptable scalars (one-of), e.g.
`"date": ["2026-APR-15", "2026-04-15"]`. The evaluator matches if the
prediction equals any element. All five matching rules (`exact`, `fuzzy`,
`numeric`, `date`, `boolean`) support array GT; for `fuzzy` / `numeric` the
result carries the best similarity / smallest error across alternates.
`isNullLike` is extended to treat `["", null]` (all alternates null-like)
as null-like, so the GT `["", "value"]` correctly matches a null
prediction (the empty-string alternate satisfies it).

8 new unit tests in
[`apps/temporal/src/evaluators/schema-aware-evaluator.test.ts`](../../../../apps/temporal/src/evaluators/schema-aware-evaluator.test.ts) (one-of exact / fuzzy
/ numeric / date / null-like, plus a scalar-still-works regression guard).
30 total tests pass.

This is the cleanest lever for the round-1 dataset-vs-engine convention
disagreement: instead of coercing the engine OR cleaning every GT file by
hand, we can promote ambiguous GT values to one-of arrays per sample. See
[`errors-for-gt-cleanup.md`](errors-for-gt-cleanup.md) for the per-sample
candidate list.

**2. Stricter blank-vs-zero in the prompt** ([`prompt.md` § numeric_income_rules](prompt.md))

Round 1 had a "handwritten zeros may look like `O`, a small loop, or `()`"
hint that was pushing the model to interpret noise inside cells as zeros.
Round 2 replaces that with a hard rule: "DO NOT INFER ZEROS. Only return
`0` when you would, looking at this single cell in isolation, say 'yes,
there is a clear `0` here'." Plus an explicit "false-positive `0`s are
worse than missed `0`s" guard, and an explicit "do not propagate zeros
across columns" rule.

**3. Two-group checkbox section** ([`prompt.md` § checkbox_rules](prompt.md))

The schema's checkbox field-key naming is asymmetric: Q5-Q9 spouse keys
have `_spouse_` but the applicant keys are NOT prefixed with `_applicant_`
— they're bare `checkbox_<question>_yes` / `_no`. This is ambiguous to a
model: are `checkbox_school_no` (Q6) and `checkbox_shelter_no` (Q3) the
same kind of field?

The new section is explicit about the two groups:
- **Group A — Q1-Q4**: single Yes/No pair per question, no applicant /
  spouse split. Field-key mapping spelled out: `checkbox_need_assistance_*`,
  `checkbox_family_assets_*`, `checkbox_shelter_*`, `checkbox_dependants_*`
  belong here (no applicant column to read).
- **Group B — Q5-Q9**: two columns (Applicant LEFT, Spouse RIGHT). Field-
  key mapping spells out which key reads which column: `_yes` / `_no` for
  applicant column, `_spouse_yes` / `_spouse_no` for spouse column. An
  ASCII diagram in the prompt shows the layout.

Plus: "if the spouse column on this form is entirely empty (no spouse
name, no spouse signature, no marks anywhere in the spouse column), every
`_spouse_yes` and `_spouse_no` field returns `unselected`" — closes the
spouse-checkbox FP loophole.

Smoke tests (script: `iterate-mistral-extraction.ts`):

```
Sample              | strict-baseline | round 1 | round 2 |  Δ vs round 1  | notes
--------------------+-----------------+---------+---------+----------------+----------------------------------------------
HR0081 (5)          |       73        |   36    |   72    |  +36 matched   | recovered fully — blank spouse no longer 0
synth-regular (1)   |       72        |   43    |   72    |  +29 matched   | same — strict-zero rule fixes false-zero
2 81                |       72        |   55    |   72    |  +17 matched   | same
3 81                |       60        |   60    |   60    |   0            | checkbox under-detection persists (engine OCR limit)
manual sample (6)   |       56        |   71    |   71    |   0            | round-1 wins kept (sin/date format)
1 81                |       66        |   66    |   66    |   0            | unchanged
Fake 7              |       51        |   69    |   51    |  -18 matched   | acceptable per user: prefer null over false-zero
manual sample (1)   |       72        |   73    |   73    |   0            | unchanged
```

Benchmark (round 2, run `694f8977-9101-408a-95c7-1dcc29805a02`):

| metric | round 2 | round 1 | strict baseline | Δ vs r1 | Δ vs bl |
|---|---|---|---|---|---|
| `pass_rate` | **0.900** (36/40) | 0.825 | 0.900 | +7.5 pp | 0.0 pp |
| `f1.median` | **0.958** | 0.950 | 0.950 | +0.7 pp | +0.7 pp |
| `f1.mean` | 0.930 | 0.911 | 0.934 | +1.9 pp | −0.4 pp |
| `precision.mean` | **1.000** | 0.993 | 1.000 | +0.7 pp | 0.0 pp |
| `recall.mean` | 0.879 | 0.853 | 0.884 | +2.6 pp | −0.6 pp |
| `matchedFields.median` | **67** (of 74) | 66 | 66.5 | +1 | +0.5 |
| `falsePositives.mean` | **0.00** | 0.40 | 0.00 | −0.4 | 0.0 |

Round 2 is the converged state:

- `pass_rate` recovered to the strict baseline level (0.900).
- `f1.median` and `matchedFields.median` are NOW the best of the three
  states — beating the strict baseline by 0.7 pp / +0.5 fields.
- `precision.mean` back to 1.000 (false positives eliminated).
- `f1.mean` and `recall.mean` are 0.4–0.6 pp below the strict baseline,
  driven by a handful of samples where the engine now correctly returns
  `null` for cells GT had labelled as `"0"`. These are GT-cleanup
  candidates (or one-of GT candidates), not engine regressions.

Sample-level distribution:

```
22 samples regressed vs strict baseline (sum Δ f1 = -0.478)
10 samples improved vs strict baseline  (sum Δ f1 = +0.337)
Net sum Δ f1 across all 40 samples       = -0.140
```

The negative net is concentrated in a few cases:
- `Fake 4` strict-baseline 0.950 → round 2 0.806 (-0.144) — engine now
  returns null for cells GT labelled `"0"`.
- `HR0081 (10)` strict-baseline 0.679 → 0.630 (-0.049) — handwriting
  density edge case; still below pass threshold either way.
- 7 samples with small (-0.01 to -0.03) regressions on format-preserved
  fields (sin/date) where GT is normalised.

The largest improvement is `manual sample (6)` +0.117 (sin and date
format wins recovered cleanly).

Convergence rationale:
- Round 2 hits or beats the strict baseline on every aggregate metric
  except `f1.mean` and `recall.mean`, which are within 0.6 pp.
- The remaining mismatches are either GT cleanup candidates (covered by
  one-of GT) or genuine engine OCR limits (single-character handwriting
  misreads, sentinel labels in GT).
- Two consecutive rounds (1 and 2) ended with the prompt converging on
  format preservation + strict blank-vs-zero + two-group checkboxes.
  Further prompt iteration without GT cleanup would just rearrange the
  trade-off.
- User-stated preference (preserve as written; only extract `0` if
  explicitly present) is fully realised.

Round 2 is the recommended canonical prompt for E02. The
[`errors-for-gt-cleanup.md`](errors-for-gt-cleanup.md) file enumerates
every remaining mismatch so the dataset cleanup pass can move metrics
above strict-baseline numbers without further engine-side work.

OCR-3 activity-side features remain deferred (same reasoning as round 1).

---

## 2026-05-10 — Round 3: OCR-3 features probed; FOUNDRY DOESN'T HONOR THEM

User direction after round-2 GT cleanup: "apply OCR-3 features as you see
fit to improve on our checkbox situation; if any of those can also improve
our 0's situation, that would be a plus."

**Activity plumbing** (kept; future-proof):

[`apps/temporal/src/ocr-providers/mistral-azure/mistral-azure-ocr-process.ts`](../../../../apps/temporal/src/ocr-providers/mistral-azure/mistral-azure-ocr-process.ts)
now accepts an optional `ocr3Features` param on
`MistralAzureOcrProcessParams`:

```ts
ocr3Features?: {
  tableFormat?: "html";
  bboxAnnotationFormat?: MistralDocumentAnnotationFormat;
  imageMinSize?: number;
  imageLimit?: number;
};
```

Set values are forwarded verbatim to the Mistral request body as
`table_format`, `bbox_annotation_format`, `image_min_size`, `image_limit`.
Unit-tested (10 passing in
[`mistral-azure-ocr-process.test.ts`](../../../../apps/temporal/src/ocr-providers/mistral-azure/mistral-azure-ocr-process.test.ts))
including the "ocr3Features omitted → none of the fields are emitted"
default-behaviour case.

[`iterate-mistral-extraction.ts`](../../../../apps/temporal/scripts/iterate-mistral-extraction.ts)
gained env-var probes (`OCR3_TABLE_FORMAT`, `OCR3_IMAGE_MIN_SIZE`,
`OCR3_IMAGE_LIMIT`, `OCR3_BBOX_ANNOTATION_FORMAT=1`) so future iteration
loops can flip them without touching the script.

**Smoke-probing results**:

| OCR-3 feature | Foundry response | `synth-full (1)` Δ | `3 81` Δ | `HR0081 (10)` Δ |
|---|---|---|---|---|
| `table_format: "html"` | **200 OK** | 73 → **18** (CATASTROPHIC) | 60 → **~18** (CATASTROPHIC) | — |
| `bbox_annotation_format` | **200 OK** | 73 → 73 (unchanged) | 60 → 60 | 38 → 38 |
| `image_min_size: 64` | **200 OK** | 73 → 73 | 60 → 60 | 38 → 38 |
| `image_limit: 8` | **200 OK** | 73 → 73 | 60 → 60 | — |
| all 4 combined (minus `table_format`) | **200 OK** | 73 → 73 | 60 → 60 | — |

The Foundry deployment `mistral-document-ai-2512` silently ignores
`bbox_annotation_format`, `image_min_size`, and `image_limit` —
`document_annotation` length is byte-identical across all variants
(`3 81`: 2881 bytes; `HR0081 (10)`: 2950 bytes; `synth-full (1)`: 3278
bytes regardless of which OCR-3 params are set). The response shape
stays the same:

- `pages_processed_annotation: 1` (annotation step ran)
- `pages[0].images: []` (no bbox crops surfaced — annotation LMM has
  no image context to lean on)
- no `bbox_annotations` key on `pages[0]`

`table_format: "html"` is the only param Foundry actually applies, and
it produces useless output — the income table renders as malformed HTML
and the annotation model returns `null` for every income field. Rolled
back; not enabling on the canonical workflow.

**Image preprocessing probes** (also tested, also no impact):

Tried client-side upscaling (2× lanczos3), sharpening, and contrast
multipliers (1.3, 1.5) on `3 81` and `HR0081 (10)` via a temporary
`OCR3_UPSCALE_2X` / `OCR3_SHARPEN` / `OCR3_CONTRAST` env-var path in the
iteration script. Mistral's OCR output is byte-identical across every
preprocessing variant (`3 81`: 2881 bytes regardless of 2× resize +
sharpen + contrast=1.3). `HR0081 (10)` actually drops 2 matched fields
under contrast=1.5 / contrast=1.3+upscale (38 → 36 matched). The
Foundry OCR layer normalises to its own internal preprocessing pipeline,
washing out client-side changes. Image-preprocessing additions reverted
from the iteration script.

**What this means for the remaining ceiling**:

The OCR markdown the annotation pass receives is degenerate on the
problem samples:

```
# 2. Declare all income and submit proof. Enter "0" if none.

|   | Applicant | Spouse  |
| --- | --- | --- |
|  Net Employment Income | $ | $  |
|  Employment Insurance | $ | $  |
...
```

```
Since your last declaration:
Are you still in need of assistance?
☐ Yes ☐ No
Has your family unit received or disposed of any assets?
☐ Yes ☐ No
```

Mistral's OCR layer reads the printed `$` template character but NOT the
handwritten/printed `0`s next to it. Same on checkboxes: every box renders
as `☐` regardless of what's marked. The annotation LMM then has no
information to recover — it sees `$` (no number) so it returns `null`,
and `☐ Yes ☐ No` so it returns `unselected/unselected`.

This isn't a prompt problem. The annotation pass on Foundry has empty
`pages[0].images` in every response — no image context the model could
fall back on. The prompt cannot tell the model "trust the image over the
OCR markdown" because there is no image visible to the model.

Convergence: **the Mistral Document AI Foundry SKU is at its engine
ceiling on this dataset's harder samples.** Remaining options (each
its own future `improve/<NN>-...` branch):

1. **Switch engines.** E03 (Azure CU + gpt-5.2) and E05 (Azure DI prebuilt-
   layout + gpt-5.4 hybrid) already get 0.95 / 0.975 pass_rate on the
   same dataset because their OCR layers preserve the handwritten zero
   marks and X-marks in checkbox boxes.
2. **Wait for Foundry to expose OCR-3 controls.** If/when the
   `mistral-document-ai-XXXX` SKU adds support for `bbox_annotation_format`
   and image-preprocessing knobs, the `ocr3Features` plumbing in this
   branch is ready to use them.
3. **File a Mistral support case** asking what knobs the
   `mistral-document-ai-2512` SKU honours. Response so far is silent
   acceptance + no behaviour change.
4. **Hand-crop + retry** — send only the income table region as a
   separate OCR call so the small handwritten characters fill more of the
   model's internal resolution budget. Substantial architectural change;
   not pursued.

No round-3 benchmark run was triggered — every smoke-probe established
that nothing in the OCR-3 toolkit moves the needle on Foundry, so a paid
full benchmark would confirm `pass_rate: 0.900` / `f1.median: 0.958`
unchanged from round-2's canonical run `694f8977-...`. Round-2 stays as
the canonical state.

---

## 2026-05-10 — Round 4: re-benchmark on cleaned GT (new canonical)

After the dataset move (commit `8bd2ccb1`) + sin/date/phone format-variant
GT promotions (`d635dc96`) + three-variant SIN expansion (`4f900c04`),
re-ran E02 with the canonical round-2 prompt against the cleaned GT.
This isolates the engine + prompt from GT-format noise.

Workflow JSON unchanged from round-2 (8618-char prompt, 74-field
descriptions, `numericFieldsNullable: true`, no OCR-3 features).
Re-seeded so the `mistral-document-ai-2512` deployment picks up the new
`samples-mix-public` dataset id. No paid retries beyond the standard
40-sample run (~5 min wallclock under the 10 RPM Foundry quota).

Run id: `372fdc8d-9601-4a70-835f-98f710f0e458`

| metric | r2+GT cleanup | r2 pre-cleanup | Δ |
|---|---|---|---|
| `pass_rate` | **0.925** (37/40) | 0.900 (36/40) | +2.5 pp |
| `f1.median` | **0.972** | 0.958 | +1.5 pp |
| `f1.mean` | **0.942** | 0.930 | +1.2 pp |
| `f1.min` | **0.679** | 0.630 | +4.9 pp |
| `precision.mean` | **1.000** | 1.000 | unchanged |
| `recall.mean` | **0.899** | 0.879 | +2.0 pp |
| `matchedFields.median` | **69** (of 74) | 67 | +2 fields |
| `falsePositives.mean` | **0.000** | 0.000 | unchanged |
| `truePositives.mean` | **63.875** | 62.45 | +1.43 fields/sample |

Top per-sample improvements (vs round-2 pre-cleanup):

| sample | pre-cleanup f1 | r2+GT cleanup f1 | Δ | comment |
|---|---|---|---|---|
| `81 blank` | 0.781 | **0.897** | +0.116 | SIN + date variants now accepted; KNOWN-HARD sample now passing |
| `HR0081 (10)` | 0.630 | **0.679** | +0.049 | sin/date variants accepted; still below 0.8 threshold due to remaining handwritten-zero OCR misses |
| `2 81` | 0.943 | **0.986** | +0.043 | hyphenated SIN now accepted |
| `synth-full (2)` | 0.958 | **0.993** | +0.035 | date format variant accepted |
| `HR0081 (4)` | 0.943 | **0.972** | +0.029 | sin + date variants |
| `synth-full (1)` | 0.958 | **0.986** | +0.028 | full panel of sin/date/phone variants accepted |
| `HR0081 (9)` | 0.950 | **0.972** | +0.022 | sin + spouse_sin + spouse_date variants |
| `synth-regular (1)` | 0.972 | **0.993** | +0.021 | date + spouse_date + spouse_sin variants |
| `HR0081 (5)` | 0.972 | **0.993** | +0.021 | sin + date variants |
| `HR0081 (7)` | 0.972 | **0.993** | +0.021 | sin variant |
| `synth-full (3)` | 0.979 | **1.000** | +0.021 | spouse_sin + date variants |
| `synth-regular (2)` | 0.970 | **0.990** | +0.020 | date + sin variants |
| (… ~10 more samples in the +0.005 to +0.015 range) | | | | |

Per-sample regressions (run-to-run variance in Mistral OCR output):

| sample | pre f1 | now f1 | Δ | note |
|---|---|---|---|---|
| `Fake 1` | 0.797 | 0.746 | -0.051 | Same matched=44; FN count varied between runs (30 vs ~22). All remaining mismatches are engine-OCR-ceiling (handwritten zeros + X-marked checkboxes); same shape, different sample of misses. |
| `manual sample (7)` | 0.943 | 0.935 | -0.008 | One additional field below the run-to-run noise floor. |

Failing samples (3 of 40, all engine-OCR-ceiling cases not GT-fixable):

| sample | f1 | matched / 74 | dominant miss pattern |
|---|---|---|---|
| `HR0081 (10)` | 0.679 | 38 | handwritten `0`s in income table not surfaced; some checkbox misses |
| `Fake 1` | 0.746 | 44 | engine reads income cells as `$` (no number); all checkboxes return as unselected |
| `Fake 3` | 0.767 | 46 | same shape — engine misses zeros / checkboxes / dates |

This is the strongest E02 result on record. The new canonical metrics
beat E03 (Azure CU + gpt-5.2) on `matchedFields.median` (69 of 74) AND
match E03 on `pass_rate` (within 2.5 pp) while being strict-evaluated —
E03 is still fuzzy-evaluated.

Convergence holds: every remaining mismatch falls into one of the
engine-ceiling categories diagnosed in round 3 (handwritten zeros not
read; checkbox X-marks not detected; sentinel-token GT). Further
improvement on E02 needs either an engine swap, a Foundry SKU upgrade
that exposes OCR-3 controls, or a Mistral support ticket — all
documented at the bottom of round 3.

Round 4 is the new canonical state for E02 on `improve/01-strict-eval-and-mistral-tune`.

---

## 2026-05-10 — Round 5: naming-asymmetry probe + circle-checkbox prompt probe

Two user-direct hypotheses tested via env-var probes in
`iterate-mistral-extraction.ts`. Both REJECTED on the Foundry SKU.

**Probe 1 — Naming-asymmetry (`OCR3_APPLICANT_PREFIX=1`)**

Hypothesis: the Q5-Q9 applicant checkbox field-keys are bare
(`checkbox_school_no`) while spouse ones have `_spouse_`
(`checkbox_school_spouse_no`) and Q1-Q4 ones have no
applicant/spouse distinction. Possibly the model conflates the bare-
applicant naming with the Q1-Q4-no-distinction naming. Fix: rename
the 10 Q5-Q9 applicant keys to mirror the spouse pattern:

  checkbox_school_no  →  checkbox_school_applicant_no
  (etc. for employment_changes / work / moved / warrant ✕ yes/no)

The probe renames the schema keys + descriptions before sending and
reverses the rename on the response before computing the diff.

Result on `Fake 2` (round-4 baseline 60/74 matched, 9 checkbox misses
spread across Group A + Group B spouse, zero misses on Group B
applicant): **60/74 matched with or without the prefix** — identical
f1, identical mismatch set, just the response field names differ
(predicted comes back as `checkbox_school_applicant_no` instead of
`checkbox_school_no`). Schema rename clearly took (`document_annotation`
length 2891 → 2991, ~100 chars more from longer field names), but the
model produced semantically identical output: every box it thought
was unselected stayed unselected; every box it thought was selected
stayed selected. The model is not confused by the naming asymmetry;
it's failing to read the marks at all on Group A + Group B spouse
for this sample (same engine-OCR-ceiling diagnosis from round 3).

**Probe 2 — Circle-checkbox prompt (`OCR3_CIRCLE_RULE=1`)**

Hypothesis (per user-supplied research from a Mistral support
conversation): the SDPR form sometimes has checkboxes that are
CIRCLED rather than X-marked / filled / ticked. The OCR pass produces
`☐` either way (circle around the box doesn't change the character
inside it). The workaround: tell the document-annotation LMM in the
prompt that circling counts as a selection, and rely on the LMM's
vision pass to see the circles directly.

The probe appends an `<form_specific_marks>` clause to the prompt:
"selections may be indicated by ANY of these marks: an X inside the
box, a checkmark, a filled box, a dot inside the box, OR a circle
drawn AROUND the entire checkbox or AROUND the Yes/No label next to
it. Treat ALL of these as 'selected'. ... If the OCR markdown shows
`☐` for a box that the image clearly shows is circled, prefer the
image."

Result on `Fake 3` (round-4 baseline 46/74, 13 checkbox misses, ~13
income misses on the `0` vs `"N/A"` GT-type mismatch):
`document_annotation` byte-identical with vs without the circle
clause (2925 chars in both runs). **Not just no improvement — no
change at all in the model's response.** The model produced identical
output character-for-character.

This is consistent with the round-3 diagnosis that the Foundry
annotation pass does NOT actually have meaningful image context to
work with (`pages[0].images: []` in every Foundry response). The
user-research's premise — "the LMM has enough visual context to see
circled items if you prompt it to look" — holds on the public
api.mistral.ai path, but the Foundry SKU `mistral-document-ai-2512`
appears to route through a degraded annotation pipeline where the
LMM either doesn't see the image at all, or sees it at such low
resolution / via such limited crops that circle-vs-no-circle is
below its detection threshold.

Same conclusion as round 3, now with one more piece of supporting
evidence: byte-identical response with prompt changes that would
require image vision to act on. Strong confirmation that the Foundry
annotation pass is text-only (OCR markdown + schema + prompt → no
image context the prompt can redirect attention to).

**Iteration-script changes kept** (opt-in env vars; no behavioural
change unless set):

- `OCR3_APPLICANT_PREFIX=1` — apply applicant-prefix schema rename
- `OCR3_CIRCLE_RULE=1` — append circled-checkbox clause to prompt

Both probes can be re-run against any future Foundry SKU upgrade or
direct public-API testing without re-writing scaffolding.

Round 4 (run `372fdc8d-...`) remains the canonical E02 state. No new
benchmark was triggered for round 5; smoke-probing alone established
that neither change perturbs the engine's output on the harder
samples, so a paid full benchmark would just confirm round-4 metrics
unchanged.
