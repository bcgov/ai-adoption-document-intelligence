# US-097: Variable picker — compatible-first ordering + dim-with-tooltip for incompatibles

**As a** workflow author binding a typed input port,
**I want** to see compatible variables surfaced first, with incompatible ones still visible but dimmed and explained,
**So that** I never lose track of a variable while the picker still steers me toward the right pick.

## Acceptance Criteria

- [ ] **Scenario 1**: Compatible-first sort + divider for incompatibles
    - **Given** a typed input port with `kind: "Segment"` and a workflow containing ctx variables: `seg1` (producer kind `Segment`), `seg2` (producer kind `Segment<Table>`), `docA` (producer kind `Document`), `ocrX` (producer kind `OcrResult`)
    - **When** the picker opens for this port
    - **Then** the list renders `seg1`, `seg2` at the top (compatible — exact match + valid subtype)
    - **And** a divider with the text `"Incompatible with this port"` separates them from the bottom group
    - **And** `docA`, `ocrX` render below the divider

- [ ] **Scenario 2**: Incompatible rows are dimmed and carry a hover tooltip naming the reason
    - **Given** the same picker state from Scenario 1
    - **When** the user hovers `docA`
    - **Then** the row opacity is ~50% (Mantine's `opacity: 0.5` or equivalent token)
    - **And** the hover tooltip text reads exactly: `"Document — incompatible with this port (expects Segment)"`
    - **And** clicking an incompatible row STILL binds the variable (we don't block the user — we surface the warning; save-time validation is the hard gate)

- [ ] **Scenario 3**: Picker on a port WITHOUT a declared kind shows no dimming
    - **Given** a port whose descriptor has no `kind` field (legacy entry pre-Phase-3 fan-out)
    - **When** the picker opens
    - **Then** all variables render in a single un-dimmed group with no divider
    - **And** no hover tooltips related to kind compatibility appear
    - **And** the picker behaviour matches the existing pre-Phase-3 UX (regression-safe)

- [ ] **Scenario 4**: Producer kind unknown → variable treated as compatible
    - **Given** a port with `kind: "Document"` and a ctx variable whose producer has no `kind` declared (legacy activity, or manual ctx with no Kind selected)
    - **When** the picker renders
    - **Then** the variable appears in the compatible (top) group
    - **And** no warning surfaces — undefined producer kind defaults to `Artifact` wildcard per `isAssignable` (US-091 Scenario 4)

- [ ] **Scenario 5**: Picker re-sorts when the target port's `kind` changes
    - **Given** the picker open with a port whose `kind` is `"Segment"`
    - **When** a parent state change (e.g. parent node's activity type swap) flips the port's expected kind to `"Document"`
    - **Then** the picker re-sorts: compatibles + incompatibles swap groups accordingly
    - **And** the divider position updates
    - **And** the previously-selected variable stays selected even if it moved to the incompatible group (UI surfaces the mismatch via dim + tooltip; user can rebind)

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx` — extend with kind-aware sort + dim + tooltip
- `apps/frontend/src/features/workflow-builder/graph-widgets/variable-picker-utils.ts` — new pure helper: `sortVariablesByCompatibility(variables, expectedKind, resolveProducerKind)` returns `{ compatible, incompatible, reasons: Map<varId, string> }`
- `apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.test.tsx` — covers scenarios 1-5

## Technical notes

- The picker is the PRIMARY design-time discovery surface per TYPED_IO_DESIGN.md §5. Make the dim + tooltip clarity high — the user will hit this dozens of times per workflow.
- Reason-string format: `"{producerKind} — incompatible with this port (expects {consumerKind})"`. Avoid mentioning ctx key paths in the tooltip — they go in the picker row label, not the tooltip.
- Use `isAssignable` from `@ai-di/graph-workflow` (US-091). Don't reimplement subtyping in the frontend.
- The producer-kind resolver looks up the upstream producer's kind via:
  1. Find the node whose output binding writes this ctx key.
  2. Resolve that output's kind via the same `resolvePortKind` helper used by the backend validator (US-093).
  3. Fall back to `CtxDeclaration.kind` if the ctx variable is manually declared (no node producer).
  4. Default to `undefined` (treated as `Artifact` wildcard).
