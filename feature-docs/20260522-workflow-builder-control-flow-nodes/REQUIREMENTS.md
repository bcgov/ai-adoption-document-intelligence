# Feature: Visual Workflow Builder — Control-Flow Node Settings

## Overview

The visual workflow editor at `/workflows/create-v2` and `/workflows/:workflowId/edit-v2` is currently fully functional for **activity** nodes — palette → drag → connect → schema-driven settings panel → save. The six non-activity node types (`switch`, `map`, `join`, `childWorkflow`, `pollUntil`, `humanGate`) still render a stub in the settings panel and cannot be added from the palette in the visual editor (they have to be authored via the JSON editor today).

This feature adds **first-class visual-editor support for the six control-flow node types**, so the entire workflow surface can be authored end-to-end in the V2 visual editor.

It is a milestone-only deliverable in the larger Phase 1A program tracked in [docs-md/workflow-builder/IMPLEMENTATION_PLAN.md](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md). Locked architectural decisions live in `IMPLEMENTATION_PLAN.md §3`; do not re-litigate.

---

## Goals

- Author switch / map / join / childWorkflow / pollUntil / humanGate nodes entirely in the visual editor — add from palette, edit in settings panel, save round-trip, no JSON editor needed.
- Build the **3 reusable graph-aware UI primitives** that the per-type forms compose: `NodePicker`, `EdgePicker`, `ConditionExpressionEditor`. These are the parts that the generic JSON-Schema renderer cannot express.
- Keep the schema-driven `JsonSchemaForm` renderer untouched for activity nodes — control-flow forms are **hand-rolled per type** and assemble the primitives + ad-hoc Mantine inputs.
- Wire the resulting forms into the existing `NodeSettingsPanel` (replace the current "Settings for {type} nodes are not yet supported in V2" stub).
- Make the palette and canvas accept the new node types (current palette is catalog-driven for activities; add a separate "Flow Control" section that adds control-flow node skeletons).

## Out of Scope

- **Backend / schema changes.** The control-flow node shapes are already defined in `packages/graph-workflow/src/types.ts` and validated by the existing `validateGraphConfig`. This feature is UI-only.
- **A new visual condition-tree editor with a separate canvas-style layout.** The `ConditionExpressionEditor` is a nested form-style editor (operator dropdown → operand rows, recursive for `and`/`or`/`not`), not a node-based mini-canvas. Visual-canvas-style condition trees are a Phase 1B item per `IMPLEMENTATION_PLAN.md §4`.
- **Typed I/O artifacts on the canvas.** Already deferred to Phase 4 per the locked decisions.
- **`childWorkflow` inline-graph authoring.** When the user chooses `workflowRef.type === "inline"`, the inline `graph` field is shown as read-only JSON for now (with a "library-mode is preferred" hint). Full nested-graph editing is out of scope.
- **Templates / starter shapes for control-flow nodes.** Just add a bare-bones skeleton on palette click; the user fills in cases / mappings.
- **Backwards compatibility for any prior stub UI.** Replace it cleanly; do not keep the old stub or a fallback.

---

## User Roles

| Role             | Description |
|------------------|-------------|
| Workflow Author  | Builds workflows in the visual editor. Already accustomed to the schema-driven activity settings panel. Expects the control-flow forms to feel consistent with that (Mantine styling, same drawer-style layout, same validation surfacing). |

---

## Functional Requirements

### FR-1: Reusable graph-aware primitives

A new folder `apps/frontend/src/features/workflow-builder/graph-widgets/` houses three reusable components. Each is purely presentational — it takes the current graph config as a prop, surfaces the picker UI, and emits the user's selection through `onChange`. The components do **not** mutate the graph themselves; the parent (per-type settings form) owns the mutation.

#### FR-1a: `NodePicker`

- Renders a Mantine `Select` (or `Autocomplete` if total node count > ~20) sourced from the keys of `config.nodes`.
- Accepts an optional `filterType?: NodeType` prop. When supplied, only nodes whose `type` matches are listed. Example: `join.sourceMapNodeId` must pick a `map` node, so `filterType="map"`.
- Excludes the currently-selected node (a node cannot reference itself via these pickers).
- Each option label shows `node.label` (or the node id if no label) plus a small badge for the node's type.
- Emits the chosen node's id via `onChange(nodeId: string | null)`. Allows clearing.
- Shows an inline warning when the currently-bound value points to a node that no longer exists in `config.nodes`.

#### FR-1b: `EdgePicker`

- Renders a Mantine `Select` of edges that originate from a specified node id.
- Accepts `fromNodeId: string` and emits the chosen edge's id via `onChange(edgeId: string | null)`.
- Option labels show the target node's label (or id) plus the edge id as secondary text.
- Used by `switch.cases[*].edgeId`, `switch.defaultEdge`, `humanGate.fallbackEdgeId`, `errorPolicy.fallbackEdgeId`.
- Shows an inline warning when the currently-bound value points to an edge that no longer exists or whose source is no longer `fromNodeId`.

#### FR-1c: `ConditionExpressionEditor`

- Renders a recursive editor for the `ConditionExpression` discriminated union from `packages/graph-workflow/src/types.ts`:
  - `ComparisonExpression` — operator (equals / not-equals / gt / gte / lt / lte / contains) + left `ValueRef` + right `ValueRef`.
  - `LogicalExpression` — operator (`and` / `or`) + N operands, each a recursive `ConditionExpression` with Add / Remove row affordances.
  - `NotExpression` — operator (`not`) + a single recursive operand.
  - `NullCheckExpression` — operator (`is-null` / `is-not-null`) + a single `ValueRef`.
  - `ListMembershipExpression` — operator (`in` / `not-in`) + value `ValueRef` + list `ValueRef`.
- Top-level operator-type selector ("Comparison / Logical AND / Logical OR / NOT / Null check / Membership") swaps the body to the matching shape. Switching shapes preserves what fits (e.g., switching from comparison to NOT wraps the existing comparison as the NOT's operand).
- `ValueRef` editor: a small toggle "Ref / Literal". `Ref` mode renders the existing variable picker (autocomplete over `ctx` keys + upstream node outputs) — reuse the same picker the activity input-port bindings use (the `VariablePicker` that landed in commit `634ecb3f`). `Literal` mode renders a `TextInput`. Persist exactly one of `ref` / `literal`.
- Recursive nesting is rendered with a left border / indent so the tree is visually obvious. No depth limit; UI must remain usable to at least 4 levels deep (test target).
- Receives the current `ConditionExpression` (or `undefined` for a new editor) and emits the updated expression via `onChange`. Emits `undefined` when the editor is cleared.

### FR-2: Per-type settings forms (hand-rolled, one per node type)

New files under `apps/frontend/src/features/workflow-builder/settings/control-flow/`, one per node type. Each is a React component that receives the current `GraphNode`, the full `config`, and an `onConfigChange` callback. Each form is responsible for editing every field of its node type (other than the common `id` / `label` / `errorPolicy` / `metadata`, which the existing `NodeSettingsPanel` already handles).

#### FR-2a: `SwitchNodeSettings`

Edits `SwitchNode`:
- A list editor of `cases: SwitchCase[]`. Each row contains:
  - A `ConditionExpressionEditor` (FR-1c) for `condition`.
  - An `EdgePicker` (FR-1b) for `edgeId`, scoped to edges originating from this switch node.
- Add Case / Remove Case affordances.
- An `EdgePicker` for the optional `defaultEdge` (also scoped to edges from this node).

#### FR-2b: `MapNodeSettings`

Edits `MapNode`:
- `collectionCtxKey`, `itemCtxKey`, optional `indexCtxKey` — each a `VariablePicker` (existing) so the author selects an existing ctx variable.
- `maxConcurrency` — `NumberInput` (optional, integer ≥ 1).
- `bodyEntryNodeId` and `bodyExitNodeId` — each a `NodePicker` (FR-1a) over all nodes.

#### FR-2c: `JoinNodeSettings`

Edits `JoinNode`:
- `sourceMapNodeId` — `NodePicker` with `filterType="map"`.
- `strategy` — Mantine `SegmentedControl` with options `all` / `any`.
- `resultsCtxKey` — `VariablePicker` (writes to a ctx key).

#### FR-2d: `ChildWorkflowNodeSettings`

Edits `ChildWorkflowNode`:
- A `SegmentedControl` chooses `workflowRef.type` between `library` and `inline`.
- `library` mode: a `TextInput` for `workflowId`. (Future: dropdown sourced from the workflow list API — out of scope here.)
- `inline` mode: read-only JSON preview of `graph` with a `Text c="dimmed"` hint that inline graph editing is not yet supported in V2; switch to JSON editor to author.
- `inputMappings` and `outputMappings` — each a list editor of `PortBinding` rows (`port` text input + `ctxKey` `VariablePicker`). Add / Remove rows.

#### FR-2e: `PollUntilNodeSettings`

Edits `PollUntilNode`:
- `activityType` — Mantine `Select` populated from the activity catalog (`ACTIVITY_CATALOG`). When the user picks a type, render its `parametersSchema` via the existing `JsonSchemaForm` to edit `parameters`.
- `condition` — `ConditionExpressionEditor` (FR-1c).
- `interval` — `TextInput` validated as a Temporal duration string (e.g. `30s`, `5m`); show inline error on invalid format.
- `maxAttempts` — `NumberInput` (optional, integer ≥ 1).
- `initialDelay` and `timeout` — `TextInput` (Temporal duration, optional).

#### FR-2f: `HumanGateNodeSettings`

Edits `HumanGateNode`:
- `signal.name` — `TextInput`.
- `signal.payloadSchema` — read-only JSON preview with an "advanced" hint. (Schema authoring is out of scope.)
- `timeout` — `TextInput` (Temporal duration, required).
- `onTimeout` — `SegmentedControl` with `fail` / `continue` / `fallback`.
- `fallbackEdgeId` — `EdgePicker` scoped to edges from this node. Only shown when `onTimeout === "fallback"`.

### FR-3: Wire forms into `NodeSettingsPanel`

- Replace the current stub at `apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx` lines 68-80 (the `node.type !== "activity"` branch) with a switch that delegates to the matching per-type form from FR-2.
- The common header (label input, type badge, delete button) and footer (input/output port bindings list) stay shared across all node types.
- Saving / dirty-state behaviour matches the existing activity-node experience.

### FR-4: Palette support for control-flow nodes

- Add a new "Flow Control" section at the top of the left palette (`ActivityPalette.tsx`) listing the six control-flow node types as palette entries.
- Each entry has an icon + display name + short description, consistent with the activity entries.
- Clicking a "Flow Control" entry adds a skeleton node to the canvas:
  - A fresh node id (matches the existing naming scheme used for activity adds).
  - A default label of the node type's display name.
  - Default field values: `switch` → empty `cases: []`; `map` → empty ctxKey strings + empty `bodyEntryNodeId` / `bodyExitNodeId`; `join` → empty `sourceMapNodeId`, `strategy: "all"`; `childWorkflow` → `workflowRef: { type: "library", workflowId: "" }`; `pollUntil` → empty `activityType`, `interval: "30s"`; `humanGate` → empty `signal.name`, `timeout: "1h"`, `onTimeout: "fail"`.
  - Position-calculated by the same logic the activity adds use.

### FR-5: Canvas rendering for control-flow nodes

- The canvas (`WorkflowEditorCanvas.tsx`) must render each control-flow node with a visually distinct shape:
  - `switch` — diamond (matches the existing `GraphVisualization.tsx` switch shape; port the look).
  - `map` / `join` — rectangle with a fan-out / fan-in icon overlay.
  - `pollUntil` / `humanGate` / `childWorkflow` — rectangle with the type's icon.
- Each renders selectable / draggable / connectable identically to activity nodes.
- Validation badges (the red node badges added in commit `c8dc5cc7`) must also surface on control-flow nodes.

### FR-6: Validation surfacing for control-flow nodes

- The existing debounced `validateGraphConfig` already covers the new node shapes (no schema change needed). Confirm by exercising the round-trip — invalid switch cases / orphan join references should already light up the validation drawer.
- If any validator gap is found, raise it as a follow-up (do not patch the validator inside this feature unless trivial).

---

## Non-Functional Requirements

### NFR-1: Type safety

- All new TypeScript code uses precise types. No `any`. Per-type forms accept the narrowed node type (e.g. `SwitchNodeSettings` takes `SwitchNode`, not `GraphNode`).
- `onChange` callbacks accept the narrowed shape.

### NFR-2: Mantine consistency

- All form controls use Mantine components (matches the existing V2 editor).
- Use `Stack`, `Group`, `Divider` to organise; reuse the visual spacing of `NodeSettingsPanel` and `JsonSchemaForm` (gap="sm", `Title order={5}` for section headers).

### NFR-3: Tests

- Each primitive (FR-1a/b/c) has a React-Testing-Library test exercising add / remove / change behaviour.
- Per-type forms (FR-2a–f) have a smoke test that mounts the form against a representative seeded node and confirms an edit propagates to `onChange` with the expected mutation.
- `NodeSettingsPanel` integration test that verifies the right per-type form mounts when a non-activity node is selected.

### NFR-4: Save round-trip

- For each new node type, the create-edit-save-reload round-trip is exercised manually (per the cadence preference: only ping Alex when there's something interactive to play with — the milestone here is the entire feature complete, not per-form).

---

## Files to create or modify

**New**:
- `apps/frontend/src/features/workflow-builder/graph-widgets/NodePicker.tsx`
- `apps/frontend/src/features/workflow-builder/graph-widgets/EdgePicker.tsx`
- `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx`
- `apps/frontend/src/features/workflow-builder/graph-widgets/index.ts`
- `apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.tsx`
- `apps/frontend/src/features/workflow-builder/settings/control-flow/MapNodeSettings.tsx`
- `apps/frontend/src/features/workflow-builder/settings/control-flow/JoinNodeSettings.tsx`
- `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx`
- `apps/frontend/src/features/workflow-builder/settings/control-flow/PollUntilNodeSettings.tsx`
- `apps/frontend/src/features/workflow-builder/settings/control-flow/HumanGateNodeSettings.tsx`
- `apps/frontend/src/features/workflow-builder/settings/control-flow/index.ts`
- Corresponding `*.test.tsx` files

**Modify**:
- `apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx` — wire per-type forms in place of the current stub.
- `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx` — add "Flow Control" section + add-handlers.
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` — render per-type shapes for control-flow nodes.
- `docs-md/workflow-builder/SESSION_HANDOFF.md` — update "Known limitations" once shipped.

---

## Acceptance Criteria

1. From `/workflows/create-v2`, a workflow author can add one of each of the six control-flow node types from the palette, edit every field of each in the settings panel using only the new forms, connect them up, save, reload, and verify the saved DTO matches the configured state.
2. The `ConditionExpressionEditor` correctly round-trips a 3-level-deep nested expression like `AND(OR(EQ(ctx.a, 5), NOT(IS-NULL(ctx.b))), CONTAINS(ctx.c, "x"))`.
3. `validateGraphConfig` surfaces errors for malformed configurations (e.g. switch with no cases, join pointing at a non-map node) via the existing red badges + drawer.
4. All new React-Testing-Library tests pass.
5. Type-check passes (`npx tsc --noEmit` in `apps/frontend`).
6. Biome formatting clean.
