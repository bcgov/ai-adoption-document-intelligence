# US-102: Type `document.classify` as the multi-typed-port exemplar

**As a** catalog maintainer + a frontend verifier,
**I want** `document.classify` annotated with three outputs (one taxonomy-kind + two Artifact wildcards),
**So that** the multi-port handle rendering + on-selection type pill behaviour have a real catalog entry to drive their visual contrast (not a throwaway fixture).

## Acceptance Criteria

- [ ] **Scenario 1**: `document.classify` inputs typed
    - **Given** [`packages/graph-workflow/src/catalog/activities/document-classify.ts`](../../../packages/graph-workflow/src/catalog/activities/document-classify.ts)
    - **When** the entry is read
    - **Then** inputs declare: `ocrResult: kind: "OcrResult"`, `segment: kind: "Segment"`
    - **And** both inputs are typed — the bulk catalog test from US-103 demands all-or-nothing per entry

- [ ] **Scenario 2**: `document.classify` outputs typed including Artifact wildcards
    - **Given** the same entry
    - **When** the outputs are read
    - **Then** they declare: `segmentType: kind: "Classification"`, `confidence: kind: "Artifact"`, `matchedRule: kind: "Artifact"`
    - **And** the rationale (Classification kind for the typed output; Artifact wildcards for scalar/structural metadata not in the taxonomy) is documented inline via a brief JSDoc on the entry

- [ ] **Scenario 3**: Canvas renders this entry's handles as GRAY on both sides
    - **Given** the typed entry from Scenarios 1 + 2 + the canvas rendering from US-095
    - **When** `document.classify` is added to a canvas
    - **Then** the input handle is gray (2 typed inputs of distinct kinds → not single-typed-port → gray per US-095 Scenario 2)
    - **And** the output handle is gray (3 typed outputs → multi → gray)
    - **And** the hover tooltips show "Multiple inputs..." / "Multiple outputs — select node to view all"
    - **And** this scenario is asserted via vitest against the canvas rendering pipeline (the e2e check sits in US-105)

- [ ] **Scenario 4**: Selection type pill expands to the full signature
    - **Given** the same entry + the pill rendering from US-096
    - **When** the node is selected
    - **Then** the input pill lists `"ocrResult: OcrResult"` (violet dot) and `"segment: Segment"` (green dot)
    - **And** the output pill lists `"segmentType: Classification"` (amber dot), `"confidence: Artifact"` (gray dot), `"matchedRule: Artifact"` (gray dot)
    - **And** this scenario is asserted via vitest (real-canvas verification in US-105)

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/catalog/activities/document-classify.ts` — add `kind` to every port
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx` — extend with a `document.classify`-based vitest scenario asserting gray handles + multi-port pill content

## Technical notes

- This is the SINGLE multi-port catalog exemplar in Phase 3 (per REQUIREMENTS.md §3.2 D9). All other Phase 3 exemplars are single-output and exercise the colour-coded happy path (US-101).
- The Artifact wildcards on `confidence` + `matchedRule` are honest — these are scalar/metadata outputs, not artifacts in the taxonomy sense. Don't force them into kind names that don't exist (e.g. inventing a "ConfidenceScore" kind would force the taxonomy to grow without a real use case).
- The bulk catalog test (US-103) asserts the all-or-nothing rule — typing only `segmentType` and leaving `confidence` / `matchedRule` unannotated would fail the suite.
