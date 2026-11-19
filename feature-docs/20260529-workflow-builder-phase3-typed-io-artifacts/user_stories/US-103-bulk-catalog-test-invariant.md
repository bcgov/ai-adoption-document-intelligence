# US-103: Bulk catalog test — all-or-nothing per entry for `kind` annotations

**As a** catalog maintainer,
**I want** a single test that fails CI the moment someone partially-types an entry (some ports with `kind`, some without),
**So that** Phase 3.x fan-out can't ship half-typed entries that produce inconsistent picker/handle/validator behaviour.

## Acceptance Criteria

- [x] **Scenario 1**: Test asserts the invariant across every catalog entry
    - **Given** `packages/graph-workflow/src/catalog/catalog.test.ts` (extend existing bulk-invariant suite)
    - **When** the suite runs
    - **Then** for each entry in `ACTIVITY_CATALOG`, the test reads `entry.inputs[]` + `entry.outputs[]` and computes:
      - `hasAnyKind = inputs.some(p => p.kind !== undefined) || outputs.some(p => p.kind !== undefined)`
      - `allHaveKind = inputs.every(p => p.kind !== undefined) && outputs.every(p => p.kind !== undefined)`
    - **And** the assertion is: `hasAnyKind === false || allHaveKind === true` (entry either typed fully or not at all)
    - **And** a failure message lists the offending entry's `activityType` + the names of the un-typed ports

- [x] **Scenario 2**: Five exemplars (US-101 + US-102) pass the invariant
    - **Given** all Phase 3 catalog fan-outs (`document.split`, `mistral-ocr.process`, `document.validateFields`, `tables.lookup`, `document.classify`)
    - **When** the bulk test runs
    - **Then** every one of those five entries has `allHaveKind === true`
    - **And** the test reports zero invariant violations

- [x] **Scenario 3**: Remaining ~35 entries pass via `hasAnyKind === false`
    - **Given** the un-typed entries (Azure OCR triple, benchmark.*, document-extract-page-range, etc.)
    - **When** the bulk test runs
    - **Then** each shows `hasAnyKind === false` (no `kind` annotations anywhere on the entry)
    - **And** the invariant `hasAnyKind === false || allHaveKind === true` holds trivially

- [x] **Scenario 4**: A deliberately half-typed entry would fail the test
    - **Given** a tampered local copy of `document-split.ts` where `blobKey` retains `kind: "MultiPageDocument"` but `groupId` has its `kind` removed
    - **When** the bulk test runs locally
    - **Then** the suite fails with a message naming `document.split` and the un-typed port `groupId`
    - **And** reverting the tamper restores green
    - **And** this scenario is documented in the test file as a comment (not committed as a failing test — just a sanity check the dev can run manually)

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/catalog/catalog.test.ts` — extend with the bulk invariant

## Technical notes

- The invariant is the gate the user explicitly called out (REQUIREMENTS.md §3.2 D15): "if an entry declares `kind` on any port, it must declare `kind` on every port."
- The bulk test is the same suite that already asserts catalog-wide invariants (per the Phase 1B catalog adoption pattern). Don't create a separate test file.
- The test must walk both `inputs[]` AND `outputs[]` — partial typing on either side fails.
- Wildcard `kind: "Artifact"` counts as "typed" — the all-or-nothing rule is about declaration, not about kind specificity.
