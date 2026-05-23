# US-040: Verify `SwitchNodeSettings` exposes the full recursive `ConditionExpressionEditor`

**As a** maintainer closing Phase 1B,
**I want** to confirm that switch cases can already author nested
AND/OR/NOT conditions in V2,
**So that** Phase 1B item 4 can be closed (or scoped to a small polish
fix).

## Acceptance Criteria

- [ ] **Scenario 1**: `ConditionExpressionEditor` is recursive
    - **Given** the existing source at `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx`
    - **When** the file is inspected
    - **Then** `LogicalBody` and `NotBody` both self-call `ConditionExpressionEditor` for their child operands (recon confirmed lines 533, 592)

- [ ] **Scenario 2**: `SwitchNodeSettings` uses the editor for each case's condition
    - **Given** the existing `SwitchNodeSettings.tsx`
    - **When** read
    - **Then** the per-case `CaseRow` renders `<ConditionExpressionEditor value={value.condition} onChange={...} />` without flattening or single-level fallback

- [ ] **Scenario 3**: Manual smoke test — nested condition in a switch case
    - **Given** a freshly loaded V2 editor with a switch node
    - **When** in a case row the user clicks "Convert to AND" (or equivalent), adds an OR child, adds a NOT around one leaf
    - **Then** the nested structure renders with visual indent depth ≥ 3 and saves byte-for-byte

- [ ] **Scenario 4**: If audit finds a gap, file it as a follow-up story; otherwise this milestone is a no-op close

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Files modified

- (none expected — audit-only milestone)
- If a gap is found: `ConditionExpressionEditor.tsx` (`graph-widgets/`) and/or `SwitchNodeSettings.tsx` (`settings/control-flow/`).
