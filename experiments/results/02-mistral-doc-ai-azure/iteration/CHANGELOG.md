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
