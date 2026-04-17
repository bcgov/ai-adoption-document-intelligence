# Benchmark Run — Error Detection Analysis

## Purpose

When viewing a benchmark run, the user needs to decide what confidence threshold to use per field so that low-confidence predictions are routed to human review. This feature turns the run's existing per-field confidence scores and ground-truth comparison into an interactive tool for picking those thresholds, and makes the consequences of each choice visible (how many real errors are caught vs. how many correct fields get unnecessarily flagged).

## Problem Framing

Each field instance in a benchmark run has:

- a predicted value
- a confidence score
- a ground-truth value (since this is a benchmark)

A field is **wrong** when predicted ≠ expected (after the existing normalization the evaluation pipeline already applies). Picking a confidence threshold is therefore a binary classifier problem: "flag for review iff confidence < threshold." The right operating point depends on how much review effort the user is willing to spend per error caught, and that trade-off differs from field to field.

## Scope

In scope:

- A new "Error Detection Analysis" section on the benchmark run detail page.
- Per-field threshold exploration via inline sliders and suggested-threshold chips.
- A roll-up summary showing the aggregate consequence of the current per-field choices.
- Backend precomputation of the threshold → metrics curve per field for the run.
- Plain-language UI for non-technical users.

Out of scope:

- A global (cross-field) threshold control.
- Persisting chosen thresholds across page loads or users.
- Charts or visualizations of the curves.
- Any change to how predictions, confidences, or ground truth are produced.
- Acting on the chosen thresholds (e.g. routing to a review queue) — this is an analysis tool only.

## User Experience

### Layout

A new section on the benchmark run detail page titled **"Error Detection Analysis"** containing:

1. **Roll-up summary** (read-only, top of section)
   Reflects the aggregate of the user's current per-field slider positions.
   Example copy:
   > "With your current per-field thresholds, you'd catch **142 of 158 real errors (90%)** and review **287 of 4,210 fields (7%)**."

2. **Per-field table**, one row per evaluable field. Columns:
   - **Field** — field name
   - **Evaluated** — count of field instances with both a confidence score and ground truth
   - **Error rate** — % wrong across evaluated instances
   - **Threshold** — inline slider (0.00–1.00, step 0.01) plus the numeric value
   - **Suggested** — three chips that snap the slider:
     - *Catch 90%* — lowest threshold whose recall ≥ 0.90
     - *Best balance* — threshold maximizing F1
     - *Minimize review* — highest threshold whose false-positive rate ≤ 0.10
     If a target is unattainable for the field (e.g. recall 0.90 impossible), the chip is disabled with a tooltip explaining why.
   - **Errors caught** — at the current slider position, "X of Y" with %
   - **False alarms** — correct fields that would be flagged
   - **Missed** — real errors that would slip through

   The table is sortable by every column. Default sort: error rate descending (problem fields first).

3. **Excluded fields footnote**
   > "3 fields excluded from analysis (no ground truth or no confidence data available)."
   Fields with zero evaluable instances do not appear in the table.

### Plain-language treatment

The technical terms *recall*, *precision*, *false positive*, and *F1* never appear as primary labels. The UI uses concrete phrasings ("errors caught", "false alarms", "of fields you'd review, % actually wrong") and exposes the technical term in a tooltip on hover, with a one-sentence definition. Example tooltip on "Errors caught":

> "Recall — the fraction of real errors in this field that your threshold would flag for review."

### Persistence

Slider state is ephemeral. Reloading the page resets all sliders to each field's *Best balance* threshold as a sensible default.

## Data Model and Computation

### What counts as "evaluable"

A field instance is included in analysis iff **all** of the following are true:

- It has a confidence score (not null/undefined).
- It has a ground-truth value for the corresponding document.
- It has a predicted value (a missing prediction with ground truth present is treated as an error and is evaluable, provided a confidence score exists; if no prediction was attempted there is also no confidence, so it falls out naturally).

A field is **excluded entirely** (not shown in the table) if it has zero evaluable instances across the run.

### Correctness check

Use the same comparison logic the existing benchmark evaluation already applies (whatever normalization, casing, whitespace, format-engine treatment is in effect). This feature must not introduce its own notion of correctness — it consumes the existing per-instance "correct / incorrect" judgement from the evaluation results.

### Precomputed curve

For each evaluable field in the run, the backend precomputes a curve at fixed threshold steps of **0.01** (101 points, 0.00 through 1.00). At each threshold *t*, "flagged" means `confidence < t`. For each point we store:

- `threshold`
- `tp` — flagged AND incorrect (errors caught)
- `fp` — flagged AND correct (false alarms)
- `fn` — not flagged AND incorrect (missed errors)
- `tn` — not flagged AND correct

Recall, precision, F1, and FPR are derived from these on the frontend (cheap, and avoids storing redundant numbers).

The three suggested thresholds are also computed server-side per field and returned alongside the curve, since they require scanning the curve and the rules may evolve:

- `suggestedCatch90`: smallest *t* with recall ≥ 0.90, or `null` if none exists
- `suggestedBestBalance`: *t* maximizing F1 (ties broken by smaller *t*)
- `suggestedMinimizeReview`: largest *t* with FPR ≤ 0.10, or `null` if none exists

### Per-field summary

Alongside the curve, each field carries:

- `name`
- `evaluatedCount`
- `errorCount`
- `errorRate`
- `excluded: false`

Excluded fields are returned in a separate `excludedFields: string[]` list so the footnote can render an accurate count and (on hover) names.

### When the precomputation runs

The curve is computed lazily on first request for a given run and cached. Cache key is the benchmark run ID. Cache is invalidated only if the run's evaluation results are recomputed (which already happens through existing evaluation flows; this feature hooks into the same invalidation path).

Rationale for lazy + cached over eager computation at run completion: keeps the change isolated to the read path, avoids touching the workflow, and the cost of one-time computation per run is small relative to the run itself.

## Architecture

### Backend

A new endpoint on the benchmark run controller:

```
GET /api/benchmark/runs/:runId/error-detection-analysis
```

Returns:

```ts
{
  runId: string
  fields: Array<{
    name: string
    evaluatedCount: number
    errorCount: number
    errorRate: number
    curve: Array<{
      threshold: number
      tp: number
      fp: number
      fn: number
      tn: number
    }>
    suggestedCatch90: number | null
    suggestedBestBalance: number
    suggestedMinimizeReview: number | null
  }>
  excludedFields: string[]
}
```

Implementation lives in a new service method on the existing benchmark run service (or a small dedicated `BenchmarkErrorDetectionService` if the run service is already large — to be decided when reading the file). The method:

1. Loads the run's evaluation results (per field instance: confidence, correctness).
2. Groups by field name. Filters out instances missing confidence or ground truth.
3. For each field with ≥ 1 evaluable instance, sorts instances by confidence ascending and computes the curve in one linear pass. Stepping the threshold from 0.00 to 1.00 in 0.01 increments, the (tp, fp, fn, tn) counts update incrementally — no nested loop.
4. Derives the three suggested thresholds from the curve.
5. Caches the result keyed by run ID. Cache invalidation reuses whatever mechanism currently invalidates derived benchmark-run summaries.

The endpoint follows existing controller conventions: full Swagger documentation with dedicated DTO classes (`@ApiProperty` on every field), specific response decorators (`@ApiOkResponse`, `@ApiNotFoundResponse`, `@ApiUnauthorizedResponse`), and proper TypeScript types throughout (no `any`).

### Frontend

A new component `ErrorDetectionAnalysis` rendered in the benchmark run detail page below the existing summary sections. It:

1. Fetches the analysis on mount via the existing benchmark API client.
2. Holds an in-memory map `{ [fieldName]: threshold }` initialized from each field's `suggestedBestBalance`.
3. Renders the roll-up, table, and footnote.
4. Computes displayed metrics by indexing into each field's curve at `Math.round(threshold * 100)`.
5. Computes the roll-up by summing tp/fp/fn/tn across fields at each field's current threshold.

The component is self-contained and stateless across page loads (matches the "ephemeral" decision).

### Boundaries and isolation

- The new service method depends only on the existing per-instance evaluation results — it does not reach into ground-truth loading or correctness logic.
- The new controller endpoint is the only API surface added.
- The frontend component is a leaf — no other component needs to know about it.

## Error Handling

- **Run not found** → 404 from the endpoint, frontend shows "Run not found".
- **Run has no evaluation results yet** (still executing) → 200 with `fields: []` and a flag `notReady: true`; frontend shows "Analysis available once the run completes."
- **Run has results but zero evaluable fields** (all excluded) → 200 with `fields: []` and the full `excludedFields` list; frontend shows the footnote and a friendly empty-state message ("No fields in this run have both confidence scores and ground truth, so error detection analysis is not available.").
- **Backend computation fails** → standard 500 + logged error; frontend shows a retry control.

## Testing

Backend (vitest, alongside existing benchmark service tests):

- Curve computation produces correct tp/fp/fn/tn at known thresholds for a hand-crafted small dataset.
- Instances missing confidence are excluded.
- Instances missing ground truth are excluded.
- Fields with zero evaluable instances appear in `excludedFields` and not in `fields`.
- `suggestedCatch90` is `null` when recall 0.90 is unattainable.
- `suggestedMinimizeReview` is `null` when FPR ≤ 0.10 is unattainable at any threshold.
- `suggestedBestBalance` ties broken by smaller threshold.
- Caching: second call for the same run does not recompute (verified via spy on the inner computation).
- Endpoint returns 404 for unknown run, 200 + `notReady` for in-progress runs.
- Swagger DTO snapshot / contract test as per existing controller test conventions.

Frontend:

- Roll-up updates when a single slider moves.
- Suggested-threshold chips snap the slider correctly and disable when the corresponding suggestion is `null`.
- Excluded fields footnote shows the correct count.
- Empty-state copy renders when `fields: []`.
- Tooltips render the technical term and definition for each metric.

## Documentation

Update `/docs-md/benchmarking-*` to describe the Error Detection Analysis section, what counts as evaluable, what each metric means in plain language, and how the suggested thresholds are computed. No new top-level docs file is needed — extend the existing benchmarking docs.

## Open Questions / Gaps

None at spec time. If during implementation the existing evaluation results do not already expose a clean per-instance "correct / incorrect" boolean, stop and clarify with the user before introducing a new comparison path.
