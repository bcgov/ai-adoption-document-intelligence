# Feature: Visual Workflow Builder — Phase 1A Closeout

## Overview

Phase 1A of the visual workflow builder is functionally complete after the control-flow node milestone landed (commits `7965aff6` → `2b0f4923`, 14 commits ahead of `origin/AI-1192`). The remaining open item in [IMPLEMENTATION_PLAN.md §4](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md):

> Save / load round-trip via existing `useCreateWorkflow` / `useUpdateWorkflow` hooks. Test: load `multi-page-report-workflow.json`, rearrange, save, reload, verify identical config hash (modulo `nodeGroups` per existing hash rule).

That round-trip exercise has two outputs:

1. A **walkthrough verification** of the most complex template the system has (`multi-page-report-workflow.json` — 17 nodes covering every node type: 11 activities, 1 switch, 1 map, 1 join, 4 childWorkflows, 1 pollUntil). This is performed by the workflow author against a running dev server; it is not automatable in this milestone.
2. A small set of **polish items** the round-trip exposes that *are* code-fixable without UI verification by Claude. Auto-fit-on-add is the only one that survives an audit.

This feature ships the polish item, files the deferred items in the SESSION_HANDOFF, and hands the workflow author a clean test plan for the manual round-trip.

---

## Goals

- Ship `useReactFlow().fitView()` integration so adding a node from the palette brings the new node into view (the current canvas drops it offscreen at the stagger position).
- Audit the load/save path through code review and surface any predictable regressions before the workflow author runs the manual round-trip.
- File switch case-routed edges (visual differentiation + edge `type` setting) and the borderColor / borderLeftColor React style warning as Phase 1B follow-ups with enough context to pick them up.
- Update `SESSION_HANDOFF.md` so the next session knows what was verified vs. what is still pending Alex's manual walkthrough.

## Out of Scope

- **Switch case-routed edges visual differentiation.** Today edges have no `sourcePort`/`targetPort` and `handleConnect` always emits `type: "normal"`. Fixing this needs a custom edge component (color/label per case), an edge-type setting UI, and possibly handle-per-case on the switch node. **Deferred to Phase 1B** — too big to bundle here.
- **borderColor / borderLeftColor warning.** Code audit found no longhand/shorthand mix in the workflow-builder. Likely Mantine internal. Without the exact dev-console text, chasing it is speculative; deferred until Alex can paste the warning.
- **Auto-layout / dagre integration.** Templates lack `metadata.position` so all 17 template nodes stack at the stagger. Phase 1B item per IMPLEMENTATION_PLAN.md.
- **The actual round-trip walkthrough.** Done by Alex against his running dev server; this milestone only ships the auto-fit fix + test plan.
- **Rich-widget overrides for `splitAndClassify.keywordPatterns` and `validateFields.rules`.** Already Phase 1B per the catalog's `x-widget: rich-editor-tbd` hints. Data round-trips intact; users just can't edit those parameters in V2 yet.

---

## User Roles

| Role            | Description |
|-----------------|-------------|
| Workflow Author | Loads templates into the V2 editor, edits them, saves, reloads, expects the new node to be in view after every palette add. Already familiar with V2's three-column layout from the previous milestone. |

---

## Functional Requirements

### FR-1: Auto-fit-view on node add

- When a new node is added via the palette (`addActivity` or `addControlFlowNode` in `WorkflowEditorV2Page.tsx`), the canvas must call xyflow's `fitView` so the new node is visible.
- Drag stop, selection changes, and edge connect changes must NOT trigger `fitView` — only node-count increases.
- The `fitView` call uses the existing canvas options (`padding: 0.25`) plus a short animation `duration: 300` so it feels responsive rather than abrupt.
- The behaviour survives both create-mode and edit-mode entry: when loading an existing workflow (or template) on mount, the initial `fitView` from ReactFlow's `fitView` prop continues to work. Subsequent adds re-fit.
- `useReactFlow` is only available inside a `ReactFlowProvider`. Wrap the canvas's internal content accordingly without breaking the existing prop interface of `WorkflowEditorCanvas`.

### FR-2: Test coverage

- A React-Testing-Library test mounts the canvas with a single node, calls `setConfig` to add a second node (mirroring the palette-add flow), and asserts that the xyflow `fitView` hook fires exactly once for that change.
- A negative test confirms `fitView` does NOT fire when an existing node moves (`onNodeDragStop`).

### FR-3: SESSION_HANDOFF update

- Update `docs-md/workflow-builder/SESSION_HANDOFF.md`:
  - Replace the auto-fit-on-add entry in "What to do next" with a "done" reference.
  - Move the switch case-routed edges item and the borderColor / borderLeftColor warning into a new "Phase 1B follow-ups (filed)" section with the code references + reproduction context the next session will need.
  - Record the manual round-trip walkthrough as the pending sign-off Alex still owes against `multi-page-report-workflow.json`.

---

## Non-Functional Requirements

### NFR-1: Type safety

No `any`. The `useReactFlow` instance is typed via xyflow's exports.

### NFR-2: Existing canvas behaviour unchanged

The interactive surface (drag, select, connect, delete, validation badges) and the existing `fitView` prop on `<ReactFlow>` continue to work. The `ReactFlowProvider` wrapper is internal to `WorkflowEditorCanvas`; the page-level interface is unchanged.

### NFR-3: Mantine + Biome lint clean

`npx tsc --noEmit` in `apps/frontend` passes. Biome formatting clean.

---

## Files to create or modify

**Modify**:
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` — wrap inner content in `<ReactFlowProvider>`; extract inner content; trigger `fitView` on `internalNodes.length` increase.
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx` (create if missing) — add the two test cases from FR-2.
- `docs-md/workflow-builder/SESSION_HANDOFF.md` — update per FR-3.

---

## Acceptance Criteria

1. Clicking an activity or control-flow entry in the palette adds the new node AND animates the viewport so the new node is centred and visible (vs. today, where the node lands at the stagger position and the user must scroll/zoom to find it).
2. Dragging an existing node within the canvas does not trigger a re-fit.
3. Loading the visual editor on an existing workflow continues to fit the initial layout once on mount.
4. The new tests pass.
5. `apps/frontend` type-check passes.
6. `SESSION_HANDOFF.md` reflects the new state (auto-fit-on-add done; switch case-routed edges + borderColor warning filed as Phase 1B follow-ups; multi-page-report-workflow.json walkthrough still pending Alex's sign-off).
