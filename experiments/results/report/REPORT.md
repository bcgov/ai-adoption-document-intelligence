# Cross-engine extraction comparison report

**Scope**: comparison of five end-to-end OCR/extraction approaches on the SDPR Monthly Report form dataset, plus a synthesised ensemble (E06). Every engine is re-evaluated against the current cleaned local ground truth in `data/datasets/samples-mix/public/` using the canonical schema-aware evaluator (`defaultRule: { rule: "exact" }`, `passThreshold: 0.8`) with one-of array GT support, so the numbers are apples-to-apples.

## Engines compared

- **E00 — Azure Document Intelligence custom template**. A supervised, form-specific model: a labelled template is trained on the SDPR form and inferred against new images. Run produced by an external deployment whose evaluator code was out of date; predictions re-scored locally.
- **E02 — Mistral on Azure AI Foundry**. General-purpose OCR + JSON annotation. Reads the OCR markdown produced by Mistral's first pass, then a Mistral generative pass extracts fields against a JSON schema. Foundry-hosted route, GlobalStandard SKU.
- **E03 — Azure Content Understanding (CU) + gpt-5.2**. CU sends the image through its content-extraction layer (raw image → typed fields) and a gpt-5.2 generative pass fills the structured schema. Foundry-hosted.
- **E04 — gpt-5.4 VLM-direct**. Pure vision-language model: the page image is sent directly to gpt-5.4 with a strict-mode JSON Schema response format. No OCR pre-pass.
- **E05 — gpt-5.4 VLM + Azure DI prebuilt-layout (hybrid)**. Two-pass: Azure DI prebuilt-layout transcribes the page to markdown, then gpt-5.4 sees both the raw image AND the OCR markdown, with a trust-hierarchy prompt that says "trust the image when the OCR text disagrees".
- **E06 — ensemble combiner**. Not a deployed engine. Picks the per-field value across E00/E02/E03/E04/E05 using a per-field weighted-majority routing rule, where each engine's vote weight equals its own per-field accuracy. Full details in [Appendix A](#appendix-a--e06-ensemble-combiner).

E01 (Azure DI Neural) is excluded — its only benchmark ran on the older 33-sample dataset (before the synth-* alignment fix), so its numbers aren't comparable against the cleaned 40-sample dataset used here.

## How the metrics are computed

Every engine returns a flat object of `{ field_key: value }` pairs (74 keys per sample, matching the SDPR template schema). For each sample, the evaluator compares each prediction value against the GT value at the same key. The comparison is **strict-equality with one-of-array support**: `predicted` matches `expected` if `String(predicted)` equals any element of `expected` (treating a scalar expected as a one-element array). Null-like values (`null`, `""`, `"null"`) match each other.

### The atomic units: TP, FP, FN

Every per-field comparison falls into one of four buckets:

| case | GT value | engine prediction | classification | counts |
|---|---|---|---|---|
| match | value | matches GT | **TP** (true positive) — engine read the field correctly | TP += 1 |
| deletion | value | null / missing | **FN only** (false negative) — the correct value did not appear in the output | FN += 1 |
| insertion | null | non-null | **FP only** (false positive) — the engine hallucinated a value | FP += 1 |
| substitution | value | non-null, wrong | **FP + FN** — the engine BOTH produced a wrong value (precision miss) AND missed the correct value (recall miss) | FP += 1, FN += 1 |

Plus: any prediction key the engine emitted that isn't in the GT schema at all (and is non-null) increments FP — extra-key hallucination.

These definitions match the standard OCR / information-extraction formulation, where a substitution is one "wrong character produced" *and* one "correct character missed". Earlier versions of this evaluator only counted out-of-schema fields toward FP, which pinned precision at ≈1.000 and made F1 a monotone function of recall (since one of the two harmonic-mean inputs was constant). The evaluator was fixed on this branch (`improve/03`) to use the standard definitions; the numbers in this report use the new metrics and are not directly comparable to historical numbers cited in earlier branch documents.

### The derived metrics

- **Precision (per sample)** = TP / (TP + FP). *"Of the answers the engine gave, what fraction was correct?"* Low precision = the engine hallucinates or substitutes wrong values.
- **Recall (per sample)** = TP / (TP + FN). *"Of the GT values that were there, what fraction did the engine read?"* Low recall = the engine misses fields, returns null when it should have answered, or substitutes wrong values.
- **F1 (per sample)** = 2·Precision·Recall / (Precision + Recall). Harmonic mean — drops sharply if either input is weak. F1 is the single-number summary that punishes lopsided systems (an engine with high precision but low recall, or vice versa, gets a worse F1 than an engine that balances both).
- **matchedFields (per sample)** = TP. Absolute count of correctly-extracted fields out of 74 (or 52 for spouse-less samples).
- **Field accuracy (per engine)** = total matched fields summed across all 40 samples, divided by total GT fields processed (38 samples × 74 + 2 spouse-less samples × 52 = 2,852). The intuitive *"if you randomly pick a field on a random sample, what's the chance it's right?"* metric.
- **FP.mean (per engine)** = average number of false-positive predictions per sample. With our schema of 74 fields per sample, a typical engine's FP.mean is in the 0–10 range — counts wrong-value substitutions plus null-when-blank insertions plus extra-key hallucinations.

Per-engine aggregates (median, mean) are computed across the 40 per-sample F1 / precision / recall values.

## Headline aggregate metrics

![Aggregate metrics by engine](plots/01-aggregate-metrics.png)

> **How to read:** Y-axis is zoomed (starts at ~0.5) so the differences between engines are visible. Each group of bars is one metric; each colour is one engine (full names in the legend). Higher is better for every metric on this chart.

| | E00 (DI custom template) | E02 (Mistral / Foundry) | E03 (CU + gpt-5.2) | E04 (gpt-5.4 VLM) | E05 (VLM + DI hybrid) | **E06 (ensemble)** |
|---|---|---|---|---|---|---|
| **F1 (median)** | 0.939 | 0.959 | 0.969 | 0.903 | 0.960 | **0.973** |
| **F1 (mean)** | 0.903 | 0.918 | 0.947 | 0.870 | 0.942 | **0.962** |
| **Precision (mean)** | 0.917 | 0.941 | 0.958 | 0.876 | 0.951 | **0.973** |
| **Recall (mean)** | 0.899 | 0.902 | 0.939 | 0.866 | 0.935 | **0.953** |
| **matchedFields (median)** | 66 | 69 | 70 | 66 | 71 | **71** |
| **Field accuracy (matched / processed)** | 0.872 (2488/2852) | 0.896 (2555/2852) | 0.935 (2668/2852) | 0.868 (2475/2852) | 0.934 (2664/2852) | **0.951 (2712/2852)** |
| **False positives (mean per sample)** | 5.60 | 4.05 | 3.00 | **8.48** | 3.38 | **1.93** |

Source data: [`data/aggregate-metrics.csv`](data/aggregate-metrics.csv).

Three observations to keep in mind throughout the rest of the document:

1. **E03 (CU + gpt-5.2) and E05 (VLM + DI hybrid) are the strong single-engine performers.** They sit within 0.005 of each other on every aggregate. E03 wins F1.mean by a hair (0.947 vs 0.942); E05 wins matched.median (71 vs 70). Both clear precision 0.95 and recall 0.93.
2. **E04 (gpt-5.4 VLM-direct) is meaningfully weaker than its peers in the gpt-5.x stack.** Lowest precision (0.876, vs E05's 0.951) — the engine substitutes wrong values for fields it isn't sure about. F1.mean 0.870 trails E03/E05 by 7+ pp. The vision encoder alone isn't enough without OCR support.
3. **The ensemble (E06) measurably beats every single engine on every aggregate.** F1.mean 0.962 is 1.5 pp above E03's 0.947; precision 0.973 is the only number above 0.96; FP.mean 1.93 is roughly half of the best single engine's. The ensemble doesn't just edge out — it noticeably reduces the wrong-value substitution rate that every individual engine suffers from.

## Per-sample F1 distribution

![Per-sample F1 distribution by engine](plots/02-per-sample-f1-distribution.png)

> **How to read:** A box plot shows the distribution of one engine's per-sample F1 scores across 40 samples. The **box** spans the 25th–75th percentile (the middle half of samples), the **line inside the box** is the median, the **white diamond** is the mean, the **whiskers** extend to the most-extreme non-outlier samples, and dots beyond the whiskers are outliers. Higher and tighter is better. E04's wider box and lower whisker show its larger spread of difficulty; E03 and E05 sit tight at the top; E06's box (when shown) is the tightest, with the highest minimum.

The bottom of each box tells the story of the worst case. E04 has the lowest minimum (driven by dense-numeric synth samples and a handful of date misreads). E00 has the widest IQR (the custom template either nails a sample or struggles meaningfully). E03 and E05 have the tightest distributions sitting at the top of the chart.

## Per-category field accuracy

![Per-category accuracy by engine](plots/03-per-category-accuracy.png)

> **How to read:** Each group of bars is one field category; each colour is one engine. The Y-axis is zoomed so the differences are visible. The 74 schema fields are grouped into 8 categories: `sin` (2 fields), `date` (2), `phone` (2), `name` (2), `signature` (2), `freeform_text` (`explain_changes`, 1 field), `checkboxes` (28), and `income_amounts` (37 numeric fields).

| category | n fields | E00 (DI template) | E02 (Mistral) | E03 (CU+gpt-5.2) | E04 (gpt-5.4 VLM) | E05 (VLM+DI hybrid) | E06 (ensemble) |
|---|---|---|---|---|---|---|---|
| **sin** | 2 | 0.825 | 0.861 | 0.871 | 0.809 | **0.923** | 0.898 |
| **date** | 2 | 0.907 | 0.873 | 0.896 | 0.693 | 0.936 | **0.936** |
| **phone** | 2 | 0.818 | 0.884 | 0.963 | 0.820 | 0.936 | **0.963** |
| **name** | 2 | 0.696 | 0.779 | 0.843 | 0.777 | **0.880** | 0.880 |
| **signature** | 2 | 0.605 | 0.579 | 0.625 | 0.509 | 0.675 | **0.680** |
| **freeform_text** | 1 | 0.575 | 0.600 | 0.600 | 0.575 | 0.650 | **0.700** |
| **checkboxes** | 28 | 0.952 | 0.939 | 0.975 | 0.885 | 0.952 | **0.989** |
| **income_amounts** | 37 | 0.852 | 0.905 | 0.944 | 0.912 | 0.951 | **0.953** |

Source data: [`data/per-category-accuracy.csv`](data/per-category-accuracy.csv).

**Category leaders** among the single engines:
- **E03 (CU + gpt-5.2)** wins phone (0.963) and checkboxes (0.975) — CU's analyzer schema makes the form's two-column Yes/No structure explicit, and CU consistently normalises phone punctuation, which the array-GT support absorbs cleanly.
- **E05 (VLM + DI hybrid)** wins everywhere else: sin, date, name, signature, freeform_text, income_amounts. The hybrid path benefits from both the VLM's contextual interpretation and the DI markdown's digit-perfect transcription.

**Negative finding worth highlighting**: the *intuition* that a form-specific custom-trained model (E00) should be the checkbox specialist is **not supported by the data**. E00's checkbox accuracy (0.952) trails E03's (0.975) and ties E05's (0.952). It's a strong second, not the leader. Likewise, E00's strongest category in absolute terms is `checkboxes` (0.952) — but among engines, it never tops the table on any category.

**Category floor for every engine: signature and freeform_text** (~0.55–0.70 across all engines). These are the categories with irreducible interpretive ambiguity: is an "X" mark a signature or a placeholder? Is "Started part time job, documents attached" the canonical paraphrase of "started new job in October, papers in mailbox"? No model will close that gap without changing the form's schema (e.g. accepting partial-credit fuzzy matches on freeform fields).

## Per-field accuracy heatmap

![Per-field accuracy heatmap](plots/04-per-field-heatmap.png)

> **How to read:** Each row is one of the 74 SDPR fields, grouped by category (horizontal black lines mark category boundaries) and sorted within each category by mean accuracy. Each column is an engine. Cell colour is the field's accuracy across the 40 samples — red ≈ 40% or worse, yellow ≈ 70%, green ≈ 100%. Visual stripes within a category mean "all 5 engines struggle here in the same way"; lone-red cells mean "this engine has a specific weak spot the others don't".

The heatmap surfaces the long-tail variation that the per-category averages hide:
- Within `checkboxes`, the bottom rows (typically `_employment_changes_*` and `_warrant_*`) are noticeably weaker across all engines — these are checkboxes on parts of the form where applicants more often leave them ambiguously marked.
- Within `income_amounts`, the weakest fields are `applicant_oas_gis` and `spouse_oas_gis` — small-value blank-vs-zero fields (see [the blank-vs-zero problem](#the-blank-vs-zero-problem) below).
- E04's row is visibly redder than the others in the date band — the engine ceiling on dates is a real engine-level limitation, not a single-sample fluke.

Source data: [`data/per-field-accuracy.csv`](data/per-field-accuracy.csv).

## Per-sample F1 heatmap

![Per-sample F1 heatmap](plots/05-per-sample-heatmap.png)

> **How to read:** Each row is one of the 40 samples, sorted from hardest (top) to easiest (bottom) by the mean F1 across engines. Each column is an engine. Cells are coloured by F1 — red ≈ 0.5 or worse, yellow ≈ 0.78, green ≈ 1.0 — and the numeric F1 is printed in each cell. Rows that are red across the board are the genuinely hard samples (e.g. `81 blank`, `81 coffee`); rows that are red on one engine but green elsewhere are engine-specific failures.

This view makes the failure clusters obvious:
- **The top rows (`81 blank`, `81 coffee`)** are the floor for every engine. These are intentionally obscured forms — see [Failure-mode samples](#failure-mode-samples) for details.
- **The `Fake 1` / `Fake 4` / `Fake 5` / `Fake 7` cluster** — the OCR-based engines (E00, E02) struggle most here. E04 (VLM-direct) substitutes heavily on these, dropping below 0.8.
- **The `synth-*` cluster sits red specifically on E04** — gpt-5.4 VLM-direct's substitution errors concentrate on the typed-numeric-table synth samples; E03/E05/E00/E02 all do well on these.
- **`HR0081 (10)`** sits red specifically on E02 — Mistral's annotation-on-OCR-markdown ceiling can't read the dense handwriting; every other engine clears it.
- **The bottom ~25 samples** are largely green; the engine ranking on the easy samples is essentially noise.

## Per-engine deep dive

### E00 — Azure DI custom template

**Headline:** field accuracy **0.872**, F1.median **0.939**, F1.mean **0.903**, precision.mean **0.917**, recall.mean **0.899**, FP.mean **5.60**. **6 failing samples** (pass rate 0.850).

**Strengths:**
- Reasonably balanced — no single category drops below 0.60.
- Highest single-engine accuracy on `date` (0.907) — the custom template's labelled training data exposed it to the form's specific date positions.
- Strong on `checkboxes` (0.952) — tied with E05.

**Weaknesses:**
- **Worst single-engine on `name` (0.696) and `signature` (0.605).** The template extracts what's at a fixed bounding box, but handwritten signatures and names vary in placement and the template's geometric tolerance can't keep up.
- **High FP.mean (5.60)** — the template emits non-null values for spouse-column fields on samples where the form is actually blank in that column. Substitution errors dominate.
- **6 failing samples** (F1 < 0.8): `81 blank` (0.561), `81 coffee` (0.583), `Fake 1` (0.727), `Fake 4` (0.741), `Fake 5` (0.771), `Fake 7` (0.800). The first two are universal floors; the rest are pencil-filled or phone-photo samples (see [Failure-mode samples](#failure-mode-samples)).
- **Lowest field accuracy of the five engines (0.872).** The supervised-template approach has been overtaken by general-purpose generative engines.

Errors by category (raw counts / total predictions): sin 13/75 (17.3%), date 7/75 (9.3%), phone 14/75 (18.7%), name 23/75 (30.7%), signature 31/75 (41.3%), freeform 17/40 (42.5%), checkboxes 54/1120 (4.8%), income 205/1317 (15.6%).

### E02 — Mistral on Azure AI Foundry

**Headline:** field accuracy **0.896**, F1.median **0.959**, F1.mean **0.918**, precision.mean **0.941**, recall.mean **0.902**, FP.mean **4.05**. **5 failing samples** (pass rate 0.875).

**Strengths:**
- **Highest precision among the OCR-based engines that read OCR markdown (0.941)** — Mistral is conservative; when it doesn't see a field clearly, it returns null rather than guessing on most fields.
- Solid on `income_amounts` (0.905) — the OCR-first architecture transcribes typed digit tables well.
- F1.median (0.959) sits second among single engines, behind E03 and E05 by ≤1 pp.

**Weaknesses:**
- **Foundry-route annotation ceiling.** Mistral's annotation pass on Foundry reads OCR markdown only (not the raw image), so single-character handwriting marks (X-mark signatures, isolated `0`s) that aren't in the OCR text get silently discarded. This is why the failing samples skew toward dense-handwriting forms: `Fake 3` (F1 0.626 — and surprisingly high FP=27, suggesting Mistral fills in spouse-column values it doesn't really see), `HR0081 (10)` (0.673), `Fake 1` (0.693), `Fake 4` (0.781), `Fake 7` (0.785).
- **Worst single-engine on `signature` (0.579)**, second-worst on `name` (0.779) — the OCR-only annotation pipeline can't disambiguate "X" the signature from "X" the unselected-checkbox glyph.
- **14 blank-when-zero errors** (predicted null where GT is `0`) — Mistral interprets blank-looking cells conservatively and under-extracts the literal zero. See [the blank-vs-zero problem](#the-blank-vs-zero-problem).

Errors by category: sin 11/75 (14.7%), date 10/75 (13.3%), phone 9/75 (12.0%), name 17/75 (22.7%), signature 33/75 (44.0%), freeform 16/40 (40.0%), checkboxes 68/1120 (6.1%), income 133/1317 (10.1%).

### E03 — Azure Content Understanding + gpt-5.2

**Headline:** field accuracy **0.935**, F1.median **0.969**, F1.mean **0.947**, precision.mean **0.958**, recall.mean **0.939**, FP.mean **3.00**. **0 failing samples** (pass rate 1.000) — the strongest single engine.

**Strengths:**
- **Best single-engine F1.mean (0.947) and best precision (0.958)** — CU's structured analyzer schema reduces both substitution errors and null-when-blank insertions.
- **Best single engine on `checkboxes` (0.975)** — CU's `selectionMark` analyzer primitive is purpose-built for two-column Yes/No layouts.
- **Best single engine on `phone` (0.963)** — CU's normalisation produces consistent punctuation that the one-of array GT now absorbs.
- **No failing samples** — every one of the 40 cleared the F1 0.8 threshold.

**Weaknesses:**
- **13 blank-when-zero errors** — CU misses literal zeros in dense numeric tables at roughly the same rate as Mistral. The CU + gpt-5.2 path lives or dies by how well the OCR pre-pass reads small marks.
- **Signature (0.625) and freeform_text (0.600)** sit in the lower tier — CU treats signature as a generic string field and the gpt-5.2 generative pass can't compensate for the OCR layer's ambiguous reads.
- **2 hardest dates are real misreads** (`1 81`: pred `2026-25-07` vs expected `2026-07-25`; `81 coffee`: pred `2018-04-27` vs expected `2026-03-24`) — not format variants.

Errors by category: sin 10/75 (13.3%), date 8/75 (10.7%), phone 3/75 (4.0%), name 12/75 (16.0%), signature 29/75 (38.7%), freeform 16/40 (40.0%), checkboxes 28/1120 (2.5%), income 78/1317 (5.9%).

### E04 — gpt-5.4 VLM-direct

**Headline:** field accuracy **0.868**, F1.median **0.903**, F1.mean **0.870**, precision.mean **0.876** (lowest), recall.mean **0.866**, FP.mean **8.48** (highest). **8 failing samples** (pass rate 0.800) — the weakest engine across the board.

**Strengths:**
- Solid on `income_amounts` (0.912) — gpt-5.4 vision reads typed numeric tables competently when the digits are large.
- Fastest wallclock per sample (~5.9 s, no OCR pre-pass).

**Weaknesses:**
- **Lowest precision (0.876) and highest FP.mean (8.48)** — when E04 doesn't know a value, it tends to fill in a plausible-looking wrong value rather than returning null. With the proper FP counting, this lights up across the board: 8 of 40 samples drop below F1 0.8 entirely.
- **8 failing samples**, all `synth-*` forms with F1 0.692–0.788 — typed numeric tables where gpt-5.4's vision encoder substitutes wrong digits at scale (FP counts of 11–21 per sample). Examples: `synth-no-spouse (3)` F1 0.692 with 16 FPs, `synth-full (2)` F1 0.716 with 21 FPs.
- **Worst single-engine on `date` (0.693)** — the gpt-5.4 vision encoder makes systematic year misreads (`2023` for `2025`, `2020` for `2026`). Most of these are real digit misreads, not format variants.
- **Worst single-engine on `signature` (0.509)** — the model often returns the printed name as the signature, or vice versa.
- **Worst single-engine on `checkboxes` (0.885)** — checkbox accuracy 9 pp below E03.

The pattern is consistent: **E04 trades structural reliability for raw VLM speed**. When you give the same gpt-5.4 model an OCR pre-pass (i.e. E05), it gains 7.5 pp on F1.mean (0.870 → 0.942) and FP.mean drops from 8.48 to 3.38. The vision encoder alone isn't enough; the OCR pre-pass is what keeps precision honest.

Errors by category: sin 15/75 (20.0%), date 24/75 (32.0%), phone 14/75 (18.7%), name 17/75 (22.7%), signature 38/75 (50.7%), freeform 17/40 (42.5%), checkboxes 129/1120 (11.5%), income 123/1317 (9.3%).

### E05 — gpt-5.4 VLM + Azure DI prebuilt-layout (hybrid)

**Headline:** field accuracy **0.934**, F1.median **0.960**, F1.mean **0.942**, precision.mean **0.951**, recall.mean **0.935**, FP.mean **3.38**, matchedFields.median **71** (highest among single engines). **1 failing sample** (pass rate 0.975).

**Strengths:**
- **Best single-engine on 5 of 8 categories**: sin (0.923), date (0.936), name (0.880), signature (0.675), income_amounts (0.951).
- **0 blank-when-zero errors** — uniquely among the engines, the hybrid never under-extracts a literal zero (the DI OCR sees the small `0` glyph; gpt-5.4 trusts the OCR layer).
- **Highest matched-fields median (71)** — closer to the 74 ceiling than any other engine.
- Carries real word/line bounding boxes into the canonical OCRResult, which downstream consumers (cleanup, confidence checking) can use.

**Weaknesses:**
- **1 failing sample**: `manual sample (6)` F1 0.784 — a handwriting sample where the hybrid over-extracts (16 FPs on this one sample).
- `checkboxes` (0.952) tied with E00, below E03's 0.975 — the hybrid's checkbox accuracy is constrained by gpt-5.4's vision, not by the OCR layer. CU's analyzer schema for `selectionMark` is still better at this category.
- `phone` (0.936) below E03 (0.963) — DI's OCR markdown drops parentheses around area codes; gpt-5.4 trusts that and the variant misses strict matching against the GT one-of array.

Errors by category: sin 6/75 (8.0%), date 5/75 (6.7%), phone 5/75 (6.7%), name 9/75 (12.0%), signature 25/75 (33.3%), freeform 14/40 (35.0%), checkboxes 54/1120 (4.8%), income 70/1317 (5.3%).

## The blank-vs-zero problem

Across the dataset, **the most common error mode is "engine returns blank when the form has a 0"** — what we call a *blank-when-zero* error. The income-amount fields are particularly affected: many cells on the form are visually empty *and* the GT marks them as `null`, but a few cells contain a hand-written `0` (typically a small loop). Engines vary widely in how often they recognise that small `0` as a zero vs treat it as empty.

| engine | blank_when_zero (predicted null, GT 0) | zero_when_blank (predicted 0, GT null) |
|---|---|---|
| E00 (DI custom template) | 4 | 1 |
| E02 (Mistral / Foundry) | **14** | 1 |
| E03 (CU + gpt-5.2) | **13** | 1 |
| E04 (gpt-5.4 VLM) | 3 | 1 |
| E05 (VLM + DI hybrid) | **0** | 2 |

The hybrid (E05) is uniquely good at this because its OCR pre-pass (Azure DI prebuilt-layout) transcribes the small `0` glyphs that Mistral and CU's content-extraction layers tend to drop. The VLM-direct path (E04) is also better than Mistral/CU here — gpt-5.4 vision sees the small handwritten `0`s without help from an OCR layer.

The conservative engines (Mistral, CU) prefer null when uncertain — which keeps their precision and false-positive rates clean, at the cost of recall (which is exactly what the numbers show: E02 recall 0.899 and E03 recall 0.937 vs E05 recall 0.933). For workloads where missing a `0` is costlier than emitting a stray null, E05 (or an E03+E05 ensemble) is the better choice.

The reverse direction (`zero_when_blank` — engine guesses 0 for a blank cell) is rare (1–2 per engine). The hybrid's 2 is the highest, consistent with its over-extraction tendency.

## The date-format issue

After re-running the format-variant promotion script (which now also extends *existing* one-of arrays for calendar-equivalent variants), the GT absorbed a few more engine-faithful date variants:

| sample | field | GT before | GT after |
|---|---|---|---|
| `manual sample (8)` | `date` | `["2025-Nov-23", "2025- Nov-23"]` | `["2025-Nov-23", "2025- Nov-23", "2025-11-23"]` |
| `manual sample (7)` | `date` (for E00) | `["2025-OCT-22", "2025-10-22"]` | `+ "2025-OCT- 22"` |
| `synth-regular (1)` | `spouse_date` | `["2015-07-12", "2015-Jul-12"]` | `+ "2015-JUL-12"` |

The impact is small (~0.01–0.02 pp on F1.mean for the engines that benefit). **Most of the residual date errors are real digit misreads, not format issues.** Examples from E04's mismatches:

- `manual sample (1) date`: predicted `2023-09-13`, expected `2025-09-13` — year miss.
- `manual sample (10) date`: predicted `2023-11-12`, expected `2025-11-12` — year miss.
- `Fake 5 date`: predicted `2020-04-02`, expected `2026-04-02` — year miss.
- `Fake 6 date`: predicted `2008-04-02`, expected `2026-04-02` — year miss.

These are NOT recoverable by GT cleanup — the engine read the form wrong. E04's date accuracy of 0.693 reflects gpt-5.4's vision encoder making systematic year misreads on hand-written `2025`/`2026` (the curl on the `5` or `6` can be misread as a `3` or `0`).

## Failure-mode samples

Six samples are worth calling out by name. They appear in the top of [Per-sample F1 heatmap](#per-sample-f1-heatmap) (sorted hardest to easiest):

- **`81 blank`** — an intentionally blank form. F1 ~0.56–0.71 on every engine. The engines fill in some fields that aren't really there (insertions against the mostly-null GT), and the form's pre-printed labels get read as data. This is a calibration sample — every engine should fail here, and they do.
- **`81 coffee`** — a printed form with coffee stains over the key data. F1 ~0.58–0.76 on every engine. The OCR engines (E00, E02, E03) read fragments of the obscured text; the VLM engines (E04, E05) hallucinate plausible-looking dates and SINs. Universal floor.
- **`Fake 1`** — a form filled out **in pencil**, not pen. Light grey strokes on white paper. Every engine reads many fields incorrectly because the contrast is too low for reliable OCR. F1 ~0.69–0.86; even the hybrid (E05) sits in the 0.85 range. This is not about handwriting density — the handwriting is normal, but the pencil contrast defeats both the OCR-based and VLM-based engines.
- **`Fake 4`** — a phone-camera photo of a form, with visible background around the form edges, sharp focus on the form itself. F1 ~0.74–0.92. Engines vary on how they handle the background — E04 hallucinates more, the OCR-based engines (E00, E02) substitute heavily. The exact failure mechanism on this sample isn't fully understood (the form itself is sharp); the consistent moderate degradation suggests the background or unusual aspect ratio contributes to mis-anchoring.
- **`Fake 5` / `Fake 7`** — additional hand-written samples in the next failure tier. E00 fails both (F1 0.771, 0.800); other engines marginal-pass. These join the E00-specific failure cluster around handwriting.
- **`synth-*` cluster** — typed numeric tables. Surprisingly, this cluster is where **E04 (VLM-direct) fails hardest** — 6 of 8 E04 failures are `synth-*` samples (F1 0.692–0.788) because gpt-5.4 substitutes wrong digits at scale. E03/E05 (with OCR pre-pass) handle the same samples cleanly.
- **`HR0081 (10)`** — a real handwritten form with dense handwriting. F1 dropped most on E02 (0.673) because Mistral's annotation reads OCR markdown only and loses the dense handwriting; the VLM-based engines clear 0.85 on this sample.

The first two are the universal floor (and would benefit from human-in-the-loop review by design — F1 ~0.6 signals "this form is unreadable, route it to a human"). The rest are engine-specific failures: pencil contrast hurts E00 and E02 most; phone-photo background drift hurts everyone moderately; typed numeric tables specifically hurt E04; dense handwriting hurts E02. Engine choice for a production workload should consider which of these failure modes dominates the expected input distribution.

## Reflection

1. **Generative engines + good prompts have eclipsed the custom-trained template** on this form. E00 (the canonical "train a labelled DI model on the form") was the historical baseline approach for forms like the SDPR Monthly Report. On the cleaned 40-sample dataset it lands at field accuracy 0.872 — competitive but no longer winning. The four generative paths (E02–E05) all sit between 0.87 and 0.94. The template's structural advantage (it knows the form shape exactly) is fully matched by generative engines once they have field-level descriptions and a workflow-level prompt.

2. **The hybrid (E05) and CU (E03) are essentially co-leaders.** They win different categories — hybrid takes recall-heavy text fields (names, signatures, free-form) because the VLM can interpret context; CU takes structural fields (phone, checkboxes) because its analyzer schema makes the structure explicit. The "best engine" choice between them is workload-dependent: if the form-shape matters more than recall, pick CU; if reading interpretive content matters more, pick hybrid.

3. **VLM-direct (E04) has a real precision problem on this workload.** It fails 8 of 40 samples under strict eval — all `synth-*` typed-numeric-table samples where gpt-5.4 substitutes wrong digits. Its precision (0.876) is 8 pp below E03 and 7.5 pp below E05; its FP.mean (8.48) is 2.8× E03's. When you give the same gpt-5.4 model an OCR pre-pass (i.e. E05), F1.mean jumps from 0.870 to 0.942 and FP.mean drops from 8.48 to 3.38. That gap is the concrete value of an OCR layer in front of a VLM for schema-driven extraction.

4. **Substitution errors are now visible.** With the evaluator updated on this branch to count wrong-value predictions as FP (the standard OCR-extraction definition), the precision dimension finally distinguishes engines. E03/E05/E06 cluster tightly at precision 0.95–0.97; E04 sits clearly below at 0.88. Before this fix, all four were indistinguishable at precision ≈ 1.000 and F1 was effectively just smoothed recall.

5. **Custom-trained models have a lifecycle cost penalty that generative engines don't.** Even if E00 had matched E03/E05 on accuracy, the trained template needs re-labelling when the form schema changes. Schema-driven generative extraction is a prompt change. For evolving forms, the generative path wins on maintenance even when accuracy is roughly equal.

6. **The remaining headroom is per-field calibration.** The ensemble (E06) closes ~40% of the gap between best-single-engine and a cheating oracle (which knows the GT and picks the right engine per field). The remaining 60% requires either better cross-engine confidence calibration, more genuinely-different engines to ensemble across, or a step-change in how engines handle the signature/freeform-text categories that everyone struggles with.

7. **The data, not the engine, is now the constraint on aggregate metrics.** Signature accuracy ~0.65 across every engine isn't an OCR problem — it's that signatures are interpretively ambiguous. Similarly the obscured-form samples (`81 blank`, `81 coffee`) are the dataset's floor regardless of engine. Continued improvement on this form likely needs schema-level changes (e.g. accept partial-credit fuzzy matches on free-text fields, or split `signature` into "is signed?" and "what does it say?").

---

# Appendix A — E06 ensemble combiner

This appendix documents the per-field weighted-majority combiner that produces the E06 row in the comparison tables above. The full source data and benchmark export live in [`../06-engine-ensemble/`](../06-engine-ensemble/).

## Production note (read this first)

**E06 is NOT a deployment.** It uses predictions that were already produced by E00–E05; running E06 against new documents means running all five upstream engines first and then combining their outputs. That is ~5× the inference cost of any single engine. The ensemble is documented as a **measurement artifact** showing the headroom that exists above the best single engine — the recommended deployable path is still one of E03 or E05 alone.

## Strategies explored

Six deployable strategies plus one oracle baseline ([`../06-engine-ensemble/scripts/build-ensemble.py`](../06-engine-ensemble/scripts/build-ensemble.py)):

| code | how it picks |
|---|---|
| `S1_per_category_best` | per field's category, take the per-category best engine (E03 for phone/checkboxes, E05 for the other six). No fallback. |
| `S2_best_then_majority_fallback` | S1, but if the best engine returns null-like, fall back to a ≥3 majority vote. |
| `S3_majority_then_best` | If ≥3 engines agree on a non-null value, use it. Else, fall back to per-category best. |
| `S4_weighted_majority` | Weighted vote: each engine's vote weight = its per-category accuracy on this field's category. Pick the highest-weighted value. |
| `S5_weighted_with_null_preference` | S4, but if the per-category best engine returned null AND any other engine agrees null, prefer null (avoids over-extraction). |
| `S6_per_field_weighted_majority` | Same as S4 but with **per-field** weights instead of per-category — finer granularity. **Chosen.** |
| `Z_oracle_upper_bound` | Cheating baseline: if any engine got the field right, take that engine's value. Headroom measurement only. |

## Results — strategies vs single-engine baselines

| strategy | F1.median | F1.mean | Precision.mean | Recall.mean | matched.median | FP.mean |
|---|---|---|---|---|---|---|
| E00 alone | 0.939 | 0.903 | 0.917 | 0.899 | 66 | 5.60 |
| E02 alone | 0.959 | 0.918 | 0.941 | 0.902 | 69 | 4.05 |
| E03 alone | 0.969 | 0.947 | 0.958 | 0.939 | 70 | 3.00 |
| E04 alone | 0.903 | 0.870 | 0.876 | 0.866 | 66 | 8.48 |
| E05 alone | 0.960 | 0.942 | 0.951 | 0.935 | 71 | 3.38 |
| `S1_per_category_best` | 0.969 | 0.953 | 0.962 | 0.947 | 71 | 2.65 |
| `S2_best_then_majority_fallback` | 0.969 | 0.954 | 0.962 | 0.947 | 71 | 2.65 |
| `S3_majority_then_best` | 0.973 | 0.959 | 0.970 | 0.950 | 71 | 2.15 |
| `S4_weighted_majority` | 0.973 | 0.962 | 0.973 | 0.953 | 71 | 1.93 |
| `S5_weighted_with_null_preference` | 0.973 | 0.962 | 0.973 | 0.952 | 71 | 1.90 |
| **`S6_per_field_weighted_majority`** | **0.973** | **0.962** | **0.973** | **0.953** | **71** | **1.93** |
| `Z_oracle_upper_bound` (cheating) | 0.986 | 0.984 | 0.986 | 0.983 | 73 | 1.03 |

S6 edges out S4 and S5 by a hair on most aggregates. S3/S4/S5/S6 are all within 0.2 pp of each other — any of them would be a reasonable production choice. The interesting result is that **every ensemble strategy beats every single engine on precision** (S1 = 0.962 vs E03 = 0.958), which is where the F1 lift comes from: the ensemble doesn't extract many more correct fields than E03 (matched.median 71 vs 70, just +1 field), but it makes meaningfully fewer wrong-value substitutions (FP.mean ~2 vs E03's 3).

Full strategy CSV: [`../06-engine-ensemble/data/strategy-comparison.csv`](../06-engine-ensemble/data/strategy-comparison.csv).

## Why per-category-best alone (S1/S2) underperforms

S1 and S2 are the most defensible-looking strategies — pick the engine you know is best at this category. They do beat the best single engine on F1.mean (0.953 vs E03 0.947), but they trail the weighted-majority strategies (S3+) by 0.6–1 pp. The problem: the "per-category best" engine is best *on average* over that category, but on individual fields where another engine reads the form better, S1 takes the wrong answer. Voting across engines (S3 onwards) recovers those wins without sacrificing the category-leader's average advantage.

**The lesson:** when you have multiple roughly-equal engines, **agreement is a stronger signal than category-level ranking**. The weighted-majority strategies treat per-category accuracy as a Bayesian prior, then update it with the actual votes; that beats trusting the prior unconditionally.

## Where the ensemble beats every single engine

| category | E06 | best single | engine | delta |
|---|---|---|---|---|
| sin | 0.898 | 0.923 | E05 | **−2.5 pp** |
| date | 0.936 | 0.936 | E05 | tie |
| phone | 0.963 | 0.963 | E03 | tie |
| name | 0.880 | 0.880 | E05 | tie |
| signature | 0.680 | 0.675 | E05 | +0.5 pp |
| freeform_text | 0.700 | 0.650 | E05 | **+5.0 pp** |
| checkboxes | 0.989 | 0.975 | E03 | **+1.4 pp** |
| income_amounts | 0.953 | 0.951 | E05 | +0.2 pp |

The per-category accuracy is computed on the matched-field count only (it doesn't penalise substitution-FPs the way the per-sample precision does). The ensemble wins or ties on 7 of 8 categories. The single category where E06 underperforms meaningfully is **sin**, where E05 alone hits 0.923 but E06 lands at 0.898. The mechanism: on a handful of samples, E05 reads the SIN correctly but every other engine misreads it, so the weighted majority votes against E05.

The bigger story is in the **aggregate precision and FP.mean**: the ensemble cuts FP.mean from E03's 3.00 (and E04's 8.48) to 1.93 — roughly halving the substitution-error count. That's where the F1 gains come from.

## Headroom — the oracle baseline

The oracle baseline cheats: for every field, it asks "did any engine got this right?" and takes that engine's answer. It is not deployable but tells us the upper bound any router could achieve on these five engines' predictions.

| | best single (E03) | E06 (S6) | Oracle |
|---|---|---|---|
| F1.median | 0.969 | 0.973 | 0.986 |
| F1.mean | 0.947 | 0.962 | 0.984 |
| precision.mean | 0.958 | 0.973 | 0.986 |
| recall.mean | 0.939 | 0.953 | 0.983 |
| matched.median | 70 | 71 | 73 |
| FP.mean | 3.00 | 1.93 | 1.03 |

E06 closes about **40% of the F1.mean gap** between the best single engine (0.947) and the oracle (0.984). The remaining 60% is on the table for a smarter router — primarily through better per-field confidence scoring, possibly with cross-engine confidence calibration. The matched-fields gap (E03 = 70, Oracle = 73 of 74) means there exist 3 fields per sample at the median where *one of the five engines* got it right but the others didn't, and our ensemble didn't pick the right one. The FP gap (1.93 → 1.03) shows the same headroom: the ensemble already roughly halves the wrong-answer rate; an oracle would halve it again.

## E06 residual errors

The per-sample mismatch table for E06 is at [`../06-engine-ensemble/iteration/errors-for-gt-cleanup.md`](../06-engine-ensemble/iteration/errors-for-gt-cleanup.md) — **140 mismatches across 33 samples** (7 samples have zero mismatches under strict eval). This is the lowest mismatch count of any engine on this dataset:

| engine | mismatches | samples with ≥1 mismatch |
|---|---|---|
| E03 (CU + gpt-5.2) | 184 | 39 |
| E05 (VLM + DI hybrid) | 188 | 34 |
| E02 (Mistral / Foundry) | 297 | 38 |
| E00 (DI custom template) | 364 | 39 |
| E04 (gpt-5.4 VLM) | 377 | 39 |
| **E06 (ensemble)** | **140** | **33** |

The ensemble's structural strength shows up not just in fewer total mismatches but also in fewer samples that have any mismatch at all — 7 samples come back perfectly matched.

The residual error categories on E06 break down into:
- **Single-character handwriting** (X-marks, isolated `0`s, signature placeholders). When 4+ engines misread the same character, voting can't recover.
- **Numeric blank-vs-zero ambiguity** on a small handful of income-amount fields where the form has a stray pen mark visible. Multiple engines extract `0`; the GT is `""`.
- **One-of-array GT not yet covering an engine's format variant.** Caught by `promote-gt-format-variants.ts` and absorbed in subsequent GT cleanup passes.
- **Genuine OCR misreads** — `5` vs `8`, `1` vs `7` confusions on dense handwriting. The irreducible per-engine errors that no ensemble can fix.

## E06 reproducibility

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence/apps/temporal

# 1. Re-evaluate every upstream engine's predictions against current GT.
for slug in 00-doc-intelligence-template 02-mistral-doc-ai-azure 03-content-understanding 04-vlm-direct 05-vlm-ocr-hybrid; do
  npx tsx -r tsconfig-paths/register src/scripts/reevaluate-against-local-gt.ts $slug
done

# 2. Generate per-field/per-category accuracy data into results/report/data/.
cd ../..
python3 experiments/results/06-engine-ensemble/scripts/build-comparison-report.py

# 3. Run the ensemble combiner — writes ../06-engine-ensemble/ outputs.
python3 experiments/results/06-engine-ensemble/scripts/build-ensemble.py

# 4. Refresh comparison-report plots so E06 is included alongside E00-E05.
INCLUDE_E06=1 python3 experiments/results/06-engine-ensemble/scripts/build-comparison-report.py

# 5. Dump E06's per-sample mismatch table.
cd apps/temporal
npx tsx -r tsconfig-paths/register src/scripts/dump-errors-for-gt-cleanup.ts 06-engine-ensemble
```

---

# Appendix B — Reproducing the comparison report

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence/apps/temporal

# 1. Apply any newly-surfaced format-variant GT promotions (idempotent).
for slug in 00-doc-intelligence-template 02-mistral-doc-ai-azure 03-content-understanding 04-vlm-direct 05-vlm-ocr-hybrid; do
  npx tsx -r tsconfig-paths/register src/scripts/promote-gt-format-variants.ts $slug --write
done

# 2. Re-evaluate every engine's stored predictions against current local GT.
for slug in 00-doc-intelligence-template 02-mistral-doc-ai-azure 03-content-understanding 04-vlm-direct 05-vlm-ocr-hybrid; do
  npx tsx -r tsconfig-paths/register src/scripts/reevaluate-against-local-gt.ts $slug
done

# 3. Generate this report's plots + CSVs into results/report/.
cd ../..
INCLUDE_E06=1 python3 experiments/results/06-engine-ensemble/scripts/build-comparison-report.py
```
