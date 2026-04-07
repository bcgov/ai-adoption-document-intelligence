# Field Format Engine & OCR Correction Improvements

**Date**: 2026-04-04
**Status**: Draft

## Problem

The current OCR correction system has three tools (character confusion, normalize fields, spellcheck) with hardcoded heuristics. Analysis of a representative benchmark run (20-regular-sin, 70 field mismatches) shows:

- **93% of errors are format differences**, not content errors — SIN separators (22), phone formatting (24), date format (14), whitespace/case (5)
- **7% are genuine OCR content errors** — character misreads, word substitutions, dropped digits (5)

The system's limitations:

1. **Field detection is name-based** — `isIdentifierLikeFieldKey` regex matches `*_sin` and `*_phone`; new field types require code changes
2. **Character confusion rules are hardcoded** — 8 fixed rules (O→0, l→1, etc.); new patterns require code changes
3. **No HITL validation** — reviewers filling in corrections get no feedback on whether their values match expected formats
4. **Evaluator uses exact string matching** — `evaluatorConfig.fieldRules` exists but is `{}` for all definitions; format differences count as errors
5. **AI recommendation mixes format and content concerns** — the AI sees 70 errors but 65 are format noise, drowning out the 5 real content errors

## Solution Overview

Five components that work together:

1. **Field Format Engine** — user-defined format specs on field definitions, shared canonicalize/validate/format module
2. **Confusion Profiles** — standalone reusable entity for character-level error patterns, derived from data
3. **AI Format Suggestion** — proposes format specs from error patterns, triggered from template model UI
4. **AI Content Recommendation** — existing pipeline refined to focus on residual content errors only
5. **HITL Validation** — real-time advisory validation on correction inputs

## 1. Field Format Engine

### Format Spec Structure

`FieldDefinition.field_format` (already exists as `String?` in Prisma) stores a JSON-encoded string that is parsed at runtime into a `FormatSpec` object. No schema migration needed — the column type stays `String?`.

```jsonc
// SIN — strip to digits, must be 9 digits
{ "canonicalize": "digits", "pattern": "^\\d{9}$" }

// Phone — strip to digits, reformat for display
{ "canonicalize": "digits", "pattern": "^\\d{9,10}$", "displayTemplate": "(###) ###-###" }

// Date — parse any date format, output ISO
{ "canonicalize": "date:YYYY-MM-DD" }

// Currency amount
{ "canonicalize": "number" }

// Free text — collapse whitespace, trim punctuation spacing
{ "canonicalize": "text" }

// Postal code — composable operations
{ "canonicalize": "uppercase|strip-spaces", "pattern": "^[A-Z]\\d[A-Z]\\d[A-Z]\\d$" }
```

### Format Spec Fields

**`canonicalize`** (required) — a small set of built-in transforms, chainable with `|`:

| Operation | Behavior |
|-----------|----------|
| `digits` | Strip everything except digits |
| `uppercase` | Convert to uppercase |
| `lowercase` | Convert to lowercase |
| `strip-spaces` | Remove all whitespace |
| `text` | Collapse whitespace, trim, remove space before punctuation |
| `number` | Strip currency symbols, commas, spaces; normalize to numeric string |
| `date:FORMAT` | Parse any recognizable date format, output as FORMAT (e.g., `YYYY-MM-DD`, `DD/MM/YYYY`) |
| `noop` | Pass through unchanged |

These operations are generic and composable. Adding new field types (postal codes, license plates, account numbers) requires combining existing operations — not code changes.

**`pattern`** (optional) — standard regex to validate the **canonicalized** value. Used by HITL validation and as a sanity check during normalization.

**`displayTemplate`** (optional) — reformats the canonicalized value for output. Placeholder characters: `#` = digit, `A` = letter. Only needed when ground truth expects specific display formatting (e.g., parenthesized phone numbers).

### Shared Module

A new `field-format-engine.ts` in `apps/temporal/src/` containing pure functions with no Node/DB dependencies (importable by frontend):

```typescript
interface FormatSpec {
  canonicalize: string;
  pattern?: string;
  displayTemplate?: string;
}

function canonicalize(value: string, spec: FormatSpec): string;
function validate(value: string, spec: FormatSpec): { valid: boolean; message?: string };
function format(value: string, spec: FormatSpec): string; // canonicalize + displayTemplate
function parseFormatSpec(raw: string | null): FormatSpec | null; // parse field_format JSON
```

### Integration with `ocr.normalizeFields`

The existing `normalizeFields` activity changes:

- When `documentType` is set and a field has a `field_format` spec, call `format(value, spec)` instead of using hardcoded heuristics
- The `isIdentifierLikeFieldKey` / `isDateLikeFieldKey` regex checks become the **fallback** when no format spec exists — preserving backward compatibility

**Rule ordering with the format engine**: Base normalization rules (unicode, whitespace) run first as universal cleanup. Then, for fields with a `field_format` spec, the format engine's `canonicalize` + `displayTemplate` runs and its result takes precedence. Rules like dehyphenation, digitGrouping, dateSeparators, and the semantic field shaping (`digitsOnly`, `tryCanonicalDateString`) become unnecessary for fields with format specs — the format engine handles the same concerns. These rules remain active only for fields without format specs (backward compatibility).

**Note on `field_format` column**: The `FieldDefinition.field_format` column exists in Prisma as `String?` and is currently plumbed through to the enrichment rules but not used at runtime (the `parseDate` function receives it as `_hint` and ignores it). Storing JSON format specs in this column is safe — no behavioral change to existing code.

### Template Model UI

The existing `FieldSchemaEditor.tsx` gets a format spec editor:

- Dropdown for canonicalize operation (with common presets: "Digits only", "Date (ISO)", "Text", "Number")
- Text input for pattern regex (with live preview showing valid/invalid against a sample value)
- Optional text input for display template
- Raw JSON editor as an advanced option for composable operations like `uppercase|strip-spaces`

## 2. Confusion Profiles

### The Entity

A new Prisma model — a standalone, reusable artifact:

```prisma
model ConfusionProfile {
  id          String   @id @default(cuid())
  name        String
  description String?
  scope       String?                         // freeform tag: "numeric", "text", "general"
  matrix      Json                            // { "O": { "0": 42 }, ":": { "1": 3 }, ... }
  metadata    Json?                           // derivation info: source runs, thresholds, dates
  group_id    String
  group       Group    @relation(fields: [group_id], references: [id])
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  @@index([group_id])
  @@map("confusion_profiles")
}
```

The `matrix` field uses the same structure the existing `ConfusionMatrixService` already produces: `matrix[trueChar][recognizedChar] = count`.

### Lifecycle

**Derivation**: The existing `ConfusionMatrixService.derive()` computes character-level error frequencies from HITL corrections. The derive endpoint accepts multiple source types:

- **Template model IDs** — pulls HITL corrections for documents using those models
- **Benchmark run IDs** — pulls mismatches from `metrics.perSampleResults[].evaluationDetails`
- **Both combined** — merges pairs from all sources before computing the matrix

If no sources are specified, derives from all HITL corrections in the group. Optional filters: `fieldKeys`, `startDate`, `endDate`.

**Accumulation**: A profile can be re-derived from multiple data sources — multiple benchmark runs, multiple template models, across projects within the same group. Each derivation merges frequency counts, so the profile improves over time.

**Curation**: Operator can view the profile, remove noisy pairs, and manually add known patterns. The UI shows the matrix as a sortable table of `true char → OCR read as → count` rows with delete and add actions.

Each matrix entry stores up to 5 source examples (field key + predicted + expected) collected during derivation. These are shown in the curation UI as expandable rows or tooltips so the operator can see the actual corrections that produced each character pair. Entries also show a confidence indicator: the number of distinct fields the pair appeared in. Multi-field pairs are more likely real OCR confusions; single-field pairs may be word-level noise.

**Sharing**: Profiles are scoped to a group. Any workflow in that group can reference any profile.

**Default profile**: The current 8 hardcoded `BUILT_IN_CONFUSION_RULES` become a pre-seeded profile named "OCR Common Defaults" that ships with the system. This is the fallback when no profile is specified.

### Character Confusion Tool Changes

The `ocr.characterConfusion` activity changes:

- New parameter: `confusionProfileId` — loads the profile's matrix at runtime
- At runtime, all matrix entries become substitution rules (no frequency threshold — the profile is curated, so everything in it should apply)
- Gating logic simplified: if the field has a `format_spec` with numeric-context canonicalization (`digits`, `number`) → apply; if field type is `selectionMark`/`signature` → skip; otherwise → apply only if `applyToAllFields` is set. The old "value contains a digit" heuristic is dropped — the format spec and field type drive gating instead of content inspection
- `BUILT_IN_CONFUSION_RULES` array is replaced by the default "OCR Common Defaults" profile
- `confusionMapOverride` stays as an escape hatch for one-off overrides
- `enabledRules` / `disabledRules` parameters are deprecated (no longer meaningful with profile-driven rules)

Workflow node configuration becomes:

```jsonc
{
  "activityType": "ocr.characterConfusion",
  "params": {
    "confusionProfileId": "clx9abc...",
    "documentType": "clx7def..."
  }
}
```

### API Surface

All routes are scoped to the group directly, since confusion profiles are group-level resources (like template models):

- `POST /api/groups/:groupId/confusion-profiles/derive` — derive a new profile from HITL correction data in the group
- `GET /api/groups/:groupId/confusion-profiles` — list profiles in group
- `GET /api/groups/:groupId/confusion-profiles/:id` — get profile with matrix
- `PATCH /api/groups/:groupId/confusion-profiles/:id` — update name, description, curate matrix entries
- `DELETE /api/groups/:groupId/confusion-profiles/:id`

## 3. AI Format Suggestion

### Trigger

Operator clicks "Suggest formats" from the template model UI. This is a schema-level action, not a workflow or benchmark action.

### Prerequisites

The template model has field definitions, and there is error data available — either baseline benchmark mismatches or HITL corrections for documents using this template model.

### Data Source

When the operator clicks "Suggest formats", the backend **automatically gathers all available data** for fields in that template model:

- All approved HITL corrections for documents using this template model
- All baseline benchmark run mismatches for definitions that reference this template model

No manual data source selection — use everything available. The suggestion results show how many corrections were analyzed and from which sources (for transparency). If there's not enough data, the system reports that.

Optional date-range or definition-specific filters can be added later if needed, but the default is "use everything."

### Flow

1. Load the template model's current field definitions (with any existing `field_format` values)
2. Automatically gather all available error data for this template model's fields (sampled up to 200 corrections)
3. Call Azure OpenAI with the field definitions, error samples, and the available canonicalize operations
4. AI analyzes per-field error patterns and proposes a `field_format` spec for each field that lacks one (or where observed patterns suggest the existing spec is wrong)
5. Present suggestions to the operator as a reviewable list: field key, proposed spec, rationale, sample corrections that motivated it
6. Operator approves, edits, or rejects each suggestion
7. Approved specs are saved to the template model's field definitions

### AI Prompt Design

The AI receives:

- List of fields with their current `field_type` and `field_format` (if any)
- Sample corrections grouped by field key (e.g., "sin: 22 corrections all strip separators from 9-digit values")
- The vocabulary of canonicalize operations with descriptions
- The format spec structure (canonicalize + pattern + displayTemplate)

The AI responds with a JSON array of suggestions:

```jsonc
[
  {
    "fieldKey": "sin",
    "formatSpec": { "canonicalize": "digits", "pattern": "^\\d{9}$" },
    "rationale": "All 22 corrections strip spaces/dashes from 9-digit values"
  },
  {
    "fieldKey": "phone",
    "formatSpec": { "canonicalize": "digits", "pattern": "^\\d{9,10}$", "displayTemplate": "(###) ###-###" },
    "rationale": "24 corrections reformat to (XXX) XXX-XXX pattern"
  }
]
```

### Not a Workflow Modification

This updates the template model schema only. It does not touch the workflow graph. The `normalizeFields` node in the workflow picks up the new specs automatically via its existing `documentType` reference.

## 4. AI Content Recommendation Changes

The existing OCR improvement pipeline (`OcrImprovementPipelineService`) continues to work but with a narrower, cleaner scope.

### What Changes

**Input is cleaner**: When the workflow includes a `normalizeFields` node with `documentType` set (which is the standard configuration), format specs are applied during the benchmark workflow run. The baseline mismatches the AI sees are only residual content errors — no format noise. Instead of 70 errors dominated by SIN/phone/date formatting, the AI sees ~5 genuine misreads.

**Character confusion uses profiles**: The AI no longer picks from `enabledRules: ["oToZero", "ilToOne", ...]`. Instead it recommends which confusion profile to use.

**`normalizeFields` is removed from the AI recommendation manifest**: It becomes a built-in pipeline step configured by field_format specs, not an optional AI-recommended tool. The AI only chooses between `ocr.characterConfusion` and `ocr.spellcheck`.

**The prompt simplifies**: No more rules about `disabledRules`, `slashToOne`, etc. The AI decides:

- Character confusion: include yes/no, which confusion profile
- Spellcheck: include yes/no, language, field scope

### Revised Pipeline Flow

```
1. Load baseline mismatches (same as today)
   — Format normalization already ran during the benchmark workflow
   — Mismatches are post-normalization residuals only
2. Load available confusion profiles + spellcheck manifest
3. AI recommends content correction tools for residual errors
4. Apply recommendations to workflow (insert/update correction nodes)
5. Create candidate workflow version
```

### What Stays the Same

- The pipeline orchestration structure in `OcrImprovementPipelineService`
- The `AiRecommendationService` pattern (Azure OpenAI call, JSON response, debug logging)
- Workflow modification utilities (insertion slots, graph editing)
- The benchmark run/compare/promote cycle

## 5. HITL Validation Integration

### Flow

1. **Page load**: The review session already fetches field definitions for the template model. The frontend extracts `field_format` specs from the field definitions.

2. **Generating validators**: A shared utility converts format specs into `@mantine/form` validators:
   - Canonicalize the input value per the spec
   - Test the canonicalized value against the `pattern` regex
   - Return error message if invalid, null if valid

3. **User interaction**: When the reviewer types or blurs a correction field:
   - If invalid: Mantine `TextInput` shows its built-in error state (red border + message)
   - If valid: normal appearance
   - If no `field_format` exists for the field: no validation, same as today

### Non-Blocking

Validation is **advisory** — the reviewer can still submit corrections that don't match the pattern. Sometimes the ground truth legitimately doesn't match the expected format (OCR returned garbage, field is blank, etc.). The indicator helps catch mistakes, not enforce a schema.

### Frontend Changes

- `ReviewWorkspacePage.tsx` — import `validate()` from the format engine, wire into correction input fields
- The `field-format-engine` module is pure functions (no Node dependencies) so it can be imported directly by the frontend

### No Backend Changes

- `CorrectionDto` stays the same — no server-side validation added
- The review session API — no new endpoints needed
- The approval/rejection workflow — unchanged

## Impact on Existing Code

### Files Modified

| File | Change |
|------|--------|
| `apps/shared/prisma/schema.prisma` | Add `ConfusionProfile` model |
| `apps/temporal/src/activities/ocr-normalize-fields.ts` | Use format engine when `field_format` exists; keep heuristics as fallback |
| `apps/temporal/src/activities/ocr-character-confusion.ts` | Load confusion profile by ID; replace hardcoded rules with matrix-driven rules |
| `apps/temporal/src/form-field-normalization.ts` | Remains as fallback; format engine supersedes for fields with specs |
| `apps/backend-services/src/benchmark/ai-recommendation.service.ts` | Remove `normalizeFields` from manifest; confusion profile selection instead of rule IDs |
| `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts` | Simplified — format normalization handled by workflow, AI only recommends content tools |
| `apps/backend-services/src/benchmark/confusion-matrix.service.ts` | Extend to save/load `ConfusionProfile` entities |
| `apps/backend-services/src/hitl/tool-manifest.service.ts` | Update character confusion manifest (new params), remove normalizeFields from AI manifest |
| `apps/backend-services/src/template-model/template-model.service.ts` | Add format suggestion action |
| `apps/frontend/src/features/annotation/template-models/components/FieldSchemaEditor.tsx` | Add format spec editor + "Suggest formats" button |
| `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx` | Wire format validation into correction inputs |

### New Files

| File | Purpose |
|------|---------|
| `apps/temporal/src/field-format-engine.ts` | Shared canonicalize/validate/format functions |
| `apps/backend-services/src/confusion-profile/confusion-profile.service.ts` | CRUD + derivation for confusion profiles |
| `apps/backend-services/src/confusion-profile/confusion-profile.controller.ts` | REST API for confusion profiles |
| `apps/backend-services/src/template-model/format-suggestion.service.ts` | AI-driven format spec suggestion |

### Backward Compatibility

- Fields without `field_format` behave exactly as today — heuristic-based normalization, no HITL validation
- Workflows without `confusionProfileId` fall back to the "OCR Common Defaults" profile (the current 8 built-in rules)
- The evaluator is unchanged — still uses exact matching with `evaluatorConfig` as configured
- Existing benchmark definitions and runs are unaffected
