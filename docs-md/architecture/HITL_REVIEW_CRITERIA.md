# HITL Review Criteria (`hitl.applyReviewCriteria`)

## Overview

`hitl.applyReviewCriteria` is a generic graph-workflow activity that decides, **per field**, whether a human reviewer needs to look at it. It replaces (or complements) whole-document confidence gating (`ocr.checkConfidence`) with a configurable, field-level rule engine.

The activity itself has no knowledge of any particular document type. All document-specific behavior — which fields matter, what thresholds apply, what counts as "review-worthy" — is expressed entirely through the `rules` parameter in the workflow's graph config. This keeps the activity reusable across arbitrary workloads; see [ADDING_GRAPH_NODES_AND_ACTIVITIES.md](../workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md) Scenario A for how it was registered.

## Prediction-only constraint

Every condition the rule engine evaluates reads only from the **prediction** — the OCR result's field values, per-field confidence, and static schema metadata (field type, format spec) — plus a small amount of upstream-provided pipeline state (`inferredFieldKeys`). It never reads, and has no parameter slot for, ground truth. This is intentional:

- The activity must behave identically in production (no GT available) and in benchmark evaluation (GT available but off-limits) — the same rules produce the same review plan either way.
- It keeps the "should a human look at this" decision separated from "was this actually correct", which is what human review is for in the first place.

## Inputs

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `documentId` | `string` | yes | |
| `ocrResult` | `OCRResult \| OcrPayloadRef` | yes | Resolved via `resolveOcrResultInput` — accepts either the inline result or a blob ref. |
| `groupId` | `string \| null` | no | Passed through to `resolveOcrResultInput`. |
| `documentType` | `string` | no | TemplateModel id. Loads `field_schema` for `formatValidationFails` and schema-typed `fieldTypes` selection. Without it, `fieldTypes` selection falls back to the per-field `type` already present on Azure custom-model fields, and `formatValidationFails` never matches (no format spec available). |
| `rules` | `ReviewCriteriaRule[]` | yes | Evaluated in order per field; see below. |
| `defaultAction` | `"review" \| "skip"` | no | Default `"skip"`. Applied when no rule matches a field. |
| `inferredFieldKeys` | `string[]` | no | Field keys a prior correction/enrichment step marked as inferred (LLM-filled, etc.). Backs `valueWasInferred`. |

## Field walking

The activity walks every field in the OCR result:

- `documents[].fields` (Azure custom-model / labeling shape) — value via the shared `extractAzureFieldDisplayValue` helper, confidence from the field's own `confidence`, field type from the field's own `type`.
- `keyValuePairs` (Azure prebuilt-document/read shape) — value from `value.content`, confidence from the pair's `confidence`.

If a field key appears in both (unusual), the `documents[].fields` entry wins. This mirrors the existing precedence in `buildFlatPredictionMapFromCtx` (`apps/temporal/src/azure-ocr-field-display-value.ts`) while covering both OCR shapes in one pass.

## Rule structure

```ts
interface ReviewCriteriaRule {
  name: string;
  select: {
    fields?: string[];              // exact field-key list
    fieldPatterns?: string[];       // `*`-glob on the field key
    excludeFieldPatterns?: string[];// `*`-glob veto (checked first)
    fieldTypes?: string[];          // schema/labeling field type list
  };
  when?: ReviewCriteriaCondition[];     // ALL must be true (AND)
  skipWhen?: ReviewCriteriaCondition[]; // ANY true suppresses the rule (OR)
  action: "review" | "skip";
  reason: string;
}
```

Rules are evaluated **in array order** per field; the **first** rule where `select` matches the field, every `when` condition is true, and no `skipWhen` condition is true, wins. If no rule matches, `defaultAction` applies (bucketed under the `"__default__"` key in `countsByRule`).

### Selection (`select`)

1. `excludeFieldPatterns` is checked first — a match here disqualifies the field from this rule regardless of everything else.
2. If `fields` and/or `fieldPatterns` are given, the field must match at least one of them (glob patterns and exact keys are OR'd together). If **both** are omitted, every field passes this step (useful for a catch-all rule that only filters by `fieldTypes`, or an "always" rule).
3. If `fieldTypes` is given, the field's resolved type (schema type when `documentType` is set, else the field's own `type`) must be one of them.

Glob syntax is a simple `*` wildcard (e.g. `*_date_*`, `applicant_*`) — not a full glob/minimatch implementation.

### Conditions

| Condition | Matches when |
|---|---|
| `{ confidenceBelow: n }` | field confidence is known and `< n` (unknown confidence never matches) |
| `{ predictionIsBlank: true }` | value is `null`/`undefined`/whitespace-only string |
| `{ predictionLengthAtMost: n }` | display value's trimmed string length `<= n` |
| `{ formatValidationFails: true }` | `documentType`'s field schema has a `format_spec` for this field, the value is non-empty, and `field-format-engine`'s `validate()` reports invalid |
| `{ valueOutsideRange: { min?, max? } }` | value parses as a number (currency/percent symbols and thousands separators stripped) and falls outside `[min, max]`; non-numeric values never match |
| `{ valueWasInferred: true }` | field key is in `inferredFieldKeys` |
| `{ always: true }` | always |

Every condition is a pure function of the field's prediction-side data — there is no other integration point for ground truth to enter.

## Output

```ts
{
  reviewPlan: Array<{
    field: string;
    decision: "review" | "skip";
    reason: string;
    ruleName: string;           // "__default__" when no rule matched
    confidence: number | null;
  }>;
  requiresReview: boolean;      // true iff any entry decided "review"
  reviewFieldCount: number;
  countsByRule: Record<string, number>;
}
```

`requiresReview` is **not** benchmark-aware — the activity always evaluates the configured rules regardless of `documentId`. Unlike `ocr.checkConfidence` (which force-sets `requiresReview=false` for `benchmark-`-prefixed document ids to avoid parking a benchmark run on a 24h human-gate timer), any benchmark bypass for this node belongs on the downstream Switch/gate node in the graph, not inside the activity. Keeping the activity itself GT-agnostic and bypass-agnostic is what makes it safe to reuse for benchmark field-level analysis.

## Example graph config snippet

```json
{
  "applyReviewCriteria": {
    "id": "applyReviewCriteria",
    "type": "activity",
    "label": "Apply Review Criteria",
    "activityType": "hitl.applyReviewCriteria",
    "inputs": [
      { "port": "documentId", "ctxKey": "documentId" },
      { "port": "ocrResult", "ctxKey": "cleanedResult" }
    ],
    "outputs": [
      { "port": "reviewPlan", "ctxKey": "reviewPlan" },
      { "port": "requiresReview", "ctxKey": "requiresReview" },
      { "port": "reviewFieldCount", "ctxKey": "reviewFieldCount" },
      { "port": "countsByRule", "ctxKey": "reviewCountsByRule" }
    ],
    "parameters": {
      "documentType": "sdpr-template-model-id",
      "defaultAction": "skip",
      "rules": [
        {
          "name": "low-confidence",
          "select": {},
          "when": [{ "confidenceBelow": 0.7 }],
          "action": "review",
          "reason": "Extraction confidence below threshold"
        },
        {
          "name": "blank-required-fields",
          "select": { "fields": ["applicant_name", "date_of_birth", "sin_number"] },
          "when": [{ "predictionIsBlank": true }],
          "action": "review",
          "reason": "Required field is blank"
        },
        {
          "name": "date-format-invalid",
          "select": { "fieldPatterns": ["*_date*"] },
          "when": [{ "formatValidationFails": true }],
          "action": "review",
          "reason": "Date does not match expected format"
        },
        {
          "name": "llm-inferred-values",
          "select": {},
          "when": [{ "valueWasInferred": true }],
          "skipWhen": [{ "confidenceBelow": 0 }],
          "action": "review",
          "reason": "Value was filled in by LLM enrichment; confirm before proceeding"
        }
      ]
    }
  }
}
```

A Switch node typically follows this activity, branching on `requiresReview` (and/or `reviewFieldCount`) to route to a Human Gate / HITL review queue or straight through to storage — the same pattern used after `ocr.checkConfidence`.

## `exposedParams` pattern for thresholds

Array-index paths into `rules` (e.g. `parameters.rules.0.when.0.confidenceBelow`) are rejected by `applyWorkflowConfigOverrides` because numeric path segments are unsafe. To keep operating points overridable per benchmark definition, `hitl.applyReviewCriteria` accepts an optional flat map:

```json
"ruleConfidenceOverrides": {
  "income-confidence-gate": 0.96,
  "sin-confidence-gate": 0.90
}
```

When a rule's `when` / `skipWhen` contains `confidenceBelow`, the override for that rule's `name` replaces the threshold. Hyphenated rule-name keys are valid override path segments.

`standard-ocr-workflow-sdpr.json`'s `quality-gate` node group exposes those override paths so the §10.5.1 recall ladder is six benchmark definitions over one workflow version.

## Relationship to the review UI

This activity produces a `reviewPlan` in workflow context. Persist it with `document.persistReviewPlan` onto `Document.review_plan`; `HitlService.getSession` returns it and `ReviewWorkspacePage` defaults to flagged fields. See [HITL_ARCHITECTURE.md](./HITL_ARCHITECTURE.md).

## Implementation files

- `apps/temporal/src/activities/hitl-apply-review-criteria.ts` — activity implementation
- `apps/temporal/src/activities/hitl-apply-review-criteria.test.ts` — unit tests
- `apps/temporal/src/activities/persist-review-plan.ts` (+ `.test.ts`) — `document.persistReviewPlan`
- `apps/temporal/src/activity-registry.ts` / `apps/temporal/src/activity-types.ts` — Temporal registration
- `apps/backend-services/src/workflow/activity-registry.ts` — backend save-time allow-list
- `apps/temporal/src/activity-parameter-schema-registry.ts` / `apps/backend-services/src/workflow/activity-parameter-schema-registry.ts` — `rules` shape validation at save time
