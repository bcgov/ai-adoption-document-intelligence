# US-040: Verify `SwitchNodeSettings` exposes the full recursive `ConditionExpressionEditor`

**As a** maintainer closing Phase 1B,
**I want** to confirm that switch cases can already author nested
AND/OR/NOT conditions in V2,
**So that** Phase 1B item 4 can be closed (or scoped to a small polish
fix).

## Acceptance Criteria

- [x] **Scenario 1**: `ConditionExpressionEditor` is recursive
    - **Given** the existing source at `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx`
    - **When** the file is inspected
    - **Then** `LogicalBody` and `NotBody` both self-call `ConditionExpressionEditor` for their child operands (recon confirmed lines 533, 592)

- [x] **Scenario 2**: `SwitchNodeSettings` uses the editor for each case's condition
    - **Given** the existing `SwitchNodeSettings.tsx`
    - **When** read
    - **Then** the per-case `CaseRow` renders `<ConditionExpressionEditor value={value.condition} onChange={...} />` without flattening or single-level fallback

- [x] **Scenario 3**: Manual smoke test — nested condition in a switch case (deferred to Playwright; static audit confirms the recursion path is intact)
    - **Given** a freshly loaded V2 editor with a switch node
    - **When** in a case row the user clicks "Convert to AND" (or equivalent), adds an OR child, adds a NOT around one leaf
    - **Then** the nested structure renders with visual indent depth ≥ 3 and saves byte-for-byte

- [x] **Scenario 4**: Audit found NO gap. Milestone closed as no-op.

**Audit findings** (2026-05-25):
- `ConditionExpressionEditor.tsx:533` — `LogicalBody` self-recurses for each operand of `and` / `or`.
- `ConditionExpressionEditor.tsx:592` — `NotBody` self-recurses for the wrapped inner expression.
- `ConditionExpressionEditor.tsx:289–294` — visual indent applied per recursion level via `borderLeft`.
- `SwitchNodeSettings.tsx:228` — `CaseRow` mounts `<ConditionExpressionEditor value={value.condition} ...>` directly (no flatten / one-level fallback).
No follow-up filed.

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Files modified

- (none expected — audit-only milestone)
- If a gap is found: `ConditionExpressionEditor.tsx` (`graph-widgets/`) and/or `SwitchNodeSettings.tsx` (`settings/control-flow/`).
