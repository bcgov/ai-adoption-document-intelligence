# US-101: Type 4 single-output catalog exemplars

**As a** catalog maintainer fanning out Phase 3 typing,
**I want** 4 single-output activities annotated with their port kinds end-to-end (every port declared, per the bulk-test invariant),
**So that** the typed-I/O machinery has real exemplars to drive handle colour, picker compat, and the multi-port verification's contrast.

## Acceptance Criteria

- [x] **Scenario 1**: `document.split` typed
    - **Given** [`packages/graph-workflow/src/catalog/activities/document-split.ts`](../../../packages/graph-workflow/src/catalog/activities/document-split.ts)
    - **When** the entry is read
    - **Then** inputs declare: `blobKey: kind: "MultiPageDocument"`, `groupId: kind: "Artifact"`, `documentId: kind: "Artifact"`
    - **And** outputs declare: `segments: kind: "Segment[]"`
    - **And** the existing entry tests (parameters schema, descriptions) remain green

- [x] **Scenario 2**: `mistral-ocr.process` typed
    - **Given** [`packages/graph-workflow/src/catalog/activities/mistral-ocr-process.ts`](../../../packages/graph-workflow/src/catalog/activities/mistral-ocr-process.ts)
    - **When** the entry is read
    - **Then** inputs declare: `fileData: kind: "Document"`, `templateModelId: kind: "Artifact"`, `documentAnnotationPrompt: kind: "Artifact"`
    - **And** outputs declare: `ocrResult: kind: "OcrResult"`
    - **And** the Azure OCR entries (`azure-ocr-submit`, `azure-ocr-poll`, `azure-ocr-extract`) are NOT typed in Phase 3 — they're explicitly deferred to Phase 3.x per REQUIREMENTS.md §3.2 D8

- [x] **Scenario 3**: `document.validateFields` typed
    - **Given** [`packages/graph-workflow/src/catalog/activities/document-validate-fields.ts`](../../../packages/graph-workflow/src/catalog/activities/document-validate-fields.ts)
    - **When** the entry is read
    - **Then** every declared input has a `kind` annotation (typed where the port maps cleanly to a taxonomy entry — e.g. an `ocrResult` or `ocrFields` input maps to `kind: "OcrResult"` or `kind: "OcrFields"`; identifiers / config inputs map to `kind: "Artifact"`)
    - **And** outputs declare: `validationResults: kind: "ValidationResult"`
    - **And** the all-or-nothing per-entry invariant holds: every port has `kind` set (including Artifact wildcards)

- [x] **Scenario 4**: `tables.lookup` typed
    - **Given** [`packages/graph-workflow/src/catalog/activities/tables-lookup.ts`](../../../packages/graph-workflow/src/catalog/activities/tables-lookup.ts)
    - **When** the entry is read
    - **Then** inputs declare: `groupId: kind: "Artifact"`, `tableId: kind: "Artifact"`, `lookupName: kind: "Artifact"`
    - **And** outputs declare: `result: kind: "Reference"`
    - **And** the entry typechecks via the new strict invariant from US-103

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/catalog/activities/document-split.ts` — add `kind` to every port
- `packages/graph-workflow/src/catalog/activities/mistral-ocr-process.ts` — same
- `packages/graph-workflow/src/catalog/activities/document-validate-fields.ts` — same
- `packages/graph-workflow/src/catalog/activities/tables-lookup.ts` — same

## Technical notes

- All four entries are single-typed-output exemplars per REQUIREMENTS.md §3.2 D7.
- The multi-typed-output exemplar (`document.classify`) is in its own story (US-102) so that the multi-port verification surface is isolated from the single-port pattern.
- `kind: "Artifact"` on identifier/config inputs is intentional — these aren't artifacts in the typed-I/O sense, but the all-or-nothing rule demands every port has SOME kind declared. `Artifact` is the wildcard.
- For `document.validateFields` inputs, if the existing port descriptors don't cleanly map to `OcrResult` / `OcrFields`, type them as `Artifact` — accuracy over wishful typing. The exemplar's value is showing the validator can chain off `OcrResult`, not retro-fitting the spec.
- Do NOT touch the parametersSchema (the Zod schema). Only `PortDescriptor` entries.
