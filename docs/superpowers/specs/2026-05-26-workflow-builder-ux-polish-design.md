# Workflow Builder V2 — UX polish pass

**Date**: 2026-05-26
**Status**: design — awaiting user review
**Scope**: visual + interaction defects in the visual workflow editor at `/workflows/create-v2` and `/workflows/:id/edit-v2`. No schema or persisted-data changes.

## Goal

Close six independently-reported defects on the visual editor in one coordinated pass so the editor feels consistent again before further feature work lands.

## Non-goals

- Typed I/O / artifact-kind design changes — pills move location but kind colors and data come from the existing `ARTIFACT_REGISTRY`.
- Schema changes to `GraphWorkflowConfig` or template JSON files (`docs-md/graph-workflows/templates/*.json`). The fixes are rendering-time only.
- Mobile / touch drag-and-drop. Keyboard accessibility for drag remains via the existing click-to-add path.
- Migrating the old `GraphVisualization.tsx` JSON editor — V2 is the target surface.

---

## 1. Top bar reorganisation

### Problem

The header in [`WorkflowEditorV2Page.tsx:760-941`](../../apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx) renders the title/subtitle `<Stack>` next to a single `<Group>` containing ~15 widgets (Name + Description text inputs, Validation badge, Auto-arrange, Simplified-view switch, Group selected, Settings, Save, History, Run history, Run this workflow, Try, Save as library, Form preview, Replay indicator). The right-hand group wraps and pushes the title into a thin strip on the left, and the controls have no visible hierarchy.

### Approach: three zones + Mantine `<Menu>` overflow

Replace the existing top-level `<Group justify="space-between">` with three logical zones:

- **Left zone** — title (`Title order={5}`) + counts (`Text size="xs" c="dimmed"`). Identical content to today; just stops collapsing.
- **Center zone** — Name + Description `TextInput`s (each 200-280px). Kept inline because users edit them mid-task.
- **Right zone** — primary cluster + overflow menu, in this order:
  1. `TopBarReplayIndicator` (renders nothing unless `isReplay` is true).
  2. `ValidationButton` (existing component, kept as-is).
  3. `Save` (primary, filled).
  4. `Try` (filled blue, only when `tryButtonVisible`).
  5. `Run this workflow` (light, disabled when no `workflowId`).
  6. Mantine `<Menu>` button labelled "More" with `IconDots`. Contents (in order):
     - **History** (disabled tooltip "Save the workflow first" when no workflowId)
     - **Run history** (same disabled tooltip)
     - **Save as library** (disabled when `nodeCount === 0`)
     - **Auto-arrange** (disabled when `nodeCount === 0`)
     - **Group selected** (disabled when `selectedNodeIds.length < 2`)
     - **Simplified view** — `<Menu.Item>` with a leading checkmark when on; clicking toggles `simplifiedView`
     - **Workflow settings** (opens `WorkflowSettingsDrawer`)
     - **Form preview** (`component="a"`, `target="_blank"`)

Disabled Menu items keep a `title` attribute carrying the existing tooltip text.

### Files touched

- [`apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`](../../apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx) — header markup (`<Group>` around line 760-941). All button handlers stay; only their location moves.
- New: tests for the Menu's enabled/disabled item states.

### Tests

- Snapshot of the rebuilt header.
- Vitest: `Menu` opens on click, contains the expected eight items in order, items get the right `disabled` flag for empty-canvas / no-workflow / fewer-than-2-selected states.
- Existing `data-testid="save-button" | "run-this-workflow-button" | "try-button" | "history-button" | "run-history-button" | "save-as-library-button" | "auto-arrange-button" | "group-selected-btn" | "simplified-view-toggle"` testids must still resolve — they're consumed by other tests. Reattach them to the Menu items where the buttons moved.

---

## 2. Type pills under the node

### Problem

`NodeTypePill` is rendered inside `NodeHandles` ([`WorkflowEditorCanvas.tsx:465-526`](../../apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx)) absolutely positioned with `left: -14, translate(-100%, -50%)` (input side) and `right: -14, translate(100%, -50%)` (output side). At the default 240px node spacing, the pill on a selected node visually overlaps the neighbour to the left or right.

### Approach: single anchor under the node, shown on selection

Replace the two side anchors with a single anchor below the node body:

- One container, positioned `top: 100%; left: 50%; transform: translate(-50%, 6px); pointer-events: none; z-index: 10`.
- A new component `<NodeTypePillRow>` renders inside it. Two visual shapes:
  - **Single-port both sides**: one inline row `<inputKind> → <outputKind>` using two `<Badge>`s separated by a `→` glyph; each badge coloured by the kind's `ARTIFACT_REGISTRY` family.
  - **Multi-port (either side has >1)**: vertical `<Stack gap={2}>` of `<Badge>`s with prefix `in: portName: KIND` / `out: portName: KIND`, matching today's multi-port content.
- Visibility rules unchanged: hidden unless `selected`; when every port is untyped (no kind signals), nothing renders.

`NodeTypePill` keeps its existing `data-testid="node-type-pill-input"` / `data-pill-direction="input|output"` attributes so existing tests continue to find them — the difference is they're inside a single container with `data-pill-anchor="under"`.

### Files touched

- [`apps/frontend/src/features/workflow-builder/canvas/NodeTypePill.tsx`](../../apps/frontend/src/features/workflow-builder/canvas/NodeTypePill.tsx) — extend with the combined-row variant.
- [`apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`](../../apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx) — `NodeHandles` (line 394-537), `ActivityNodeRenderer`, `ControlFlowRectangleRenderer`, `SwitchNodeRenderer`: replace the two side anchors with one underneath. The diamond renderer's preview-overlay anchor at `top: 100%` needs to coexist — pill anchor sits above the preview (offset 6px) and the preview is shifted by a further `pillRowHeight + 8px` when selected.

### Tests

- `WorkflowEditorCanvas.type-pill.test.tsx` — extend with: on select, pill anchor is `data-pill-anchor="under"`; multi-port produces stacked rows; single-port produces the arrow-row variant.
- Update tests that assert `data-pill-anchor="input"` / `"output"`.

---

## 3. Drag-from-palette

### Problem

Activity and control-flow palette rows are click-to-add only ([`ActivityPalette.tsx`](../../apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx)). Source and dynamic rows already set a `application/x-workflow-palette` drag payload but the canvas has no `onDrop` handler. So drag attempts fall through to xyflow which does nothing, and the user is told to click — but clicks place the node at a stagger position, often far from where the user expected it.

### Approach: extend the drag payload, wire `onDrop` on the canvas

**Palette side** — add `draggable + onDragStart` to activity and control-flow rows. Unified payload schema written to `application/x-workflow-palette`:

```ts
type PaletteDragPayload =
  | { kind: "activity"; activityType: string }
  | { kind: "controlFlow"; type: ControlFlowNodeType }
  | { kind: "source"; sourceType: string }
  | { kind: "dynamic"; slug: string; activityType: string };
```

Existing source/dynamic payloads remain backwards-compatible (same `kind` discriminators).

**Canvas side** — add `onDrop` + `onDragOver` to the wrapper around `<WorkflowEditorCanvas>` in `WorkflowEditorV2Page.tsx`:

```ts
onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
onDrop: (e) => {
  const raw = e.dataTransfer.getData("application/x-workflow-palette");
  if (!raw) return;
  const payload = JSON.parse(raw) as PaletteDragPayload;
  const position = reactFlowRef.current?.screenToFlowPosition({
    x: e.clientX, y: e.clientY,
  });
  if (!position) return;
  // route to existing addX with position override
}
```

**addX handlers** — currently each `addActivity / addControlFlowNode / addSource / addDynamicNode` hardcodes `x = 80 + offsetIndex * 240, y = 100 + (offsetIndex % 3) * 140`. Extract to a `defaultStaggerPosition(config)` helper. Each `addX` accepts an optional `position?: {x: number; y: number}` argument; when supplied, it's used verbatim. Click-to-add omits the argument and gets stagger; drag-to-add supplies the drop coords.

### Files touched

- [`apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx`](../../apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx) — add `draggable + onDragStart` to activity rows (inside the `entries.map`) and to `<ControlFlowPaletteRow>`.
- [`apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`](../../apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx) — extract `defaultStaggerPosition` helper near `makeNodeId`; extend each `addX` to accept an optional position; wire `onDrop`/`onDragOver` on the `<Box>` wrapper at line 1050.

### Tests

- Vitest: drag payload is JSON, has the right discriminator + identifier.
- Drop handler calls the matching `addX` with the position from `screenToFlowPosition`.
- Click-to-add path still uses stagger (regression).

---

## 4. Hover-extend popover fixes

### 4a. Popover doesn't scroll

`<ScrollArea style={{ maxHeight: 360 }} type="auto">` inside `Popover.Dropdown` doesn't get a definite height ([`HoverExtendPopover.tsx:197`](../../apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx)). Without one, the inner `<Stack>` grows past the limit and the scrollbar never engages.

**Fix**: change to Mantine's `h={360}` (definite height); also set `mah="calc(100vh - 120px)"` on `Popover.Dropdown` so the dropdown can't push the ScrollArea past the viewport on small windows.

### 4b. New node lands on top of existing connected node

[`place-extended-node.ts`](../../apps/frontend/src/features/workflow-builder/canvas/place-extended-node.ts) unconditionally returns `sourcePos + {dx:280, dy:0}`. When the source already has a downstream target at that point (e.g. a switch's first case wired up), hover-extending from the source drops the new node on top of the existing one.

**Fix**: replace with `findNextFreePosition(config, sourceNodeId, options)` that:

1. Resolves the source node's `metadata.position` as the anchor.
2. Reads all existing downstream targets of the source via `config.edges.filter(e => e.source === sourceNodeId)`.
3. Computes the base candidate as `{x: anchor.x + dx, y: anchor.y + dy}` (default `dx=280, dy=0`).
4. Scans `config.nodes` for any node whose position lies within a 200×100 collision box around the candidate. If a collision exists, steps `y` by ±140px alternating outward (`+140, -140, +280, -280, …`) until no collision is found within a reasonable bound (e.g. 8 steps) — falls back to `anchor.y + (existingTargetCount + 1) * 140` if the bounded search fails.
5. Returns the chosen position.

For switch nodes specifically, the helper places the new node below the lowest existing outgoing-edge target (one stagger step further), matching how users typically lay out branches.

### Files touched

- [`apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx`](../../apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx) — `ScrollArea` and `Popover.Dropdown` size props.
- [`apps/frontend/src/features/workflow-builder/canvas/place-extended-node.ts`](../../apps/frontend/src/features/workflow-builder/canvas/place-extended-node.ts) — extend `nextNodePosition` into `findNextFreePosition(config, sourceNodeId, options)`. Keep the original `nextNodePosition` signature as a thin wrapper for any non-collision callers (search for usages first; if none, replace outright).
- Caller in `WorkflowEditorCanvas.tsx` that invokes `nextNodePosition` for hover-extend — switch to the collision-aware helper.

### Tests

- `place-extended-node.test.ts` — table-driven cases: empty canvas → no shift; one collision → step down; switch with 3 existing targets → places below all of them; collision search hits bound → uses the fallback formula.
- `HoverExtendPopover` test renders with > 360px of entries and confirms the ScrollArea is the scroll container.

---

## 5. Switch node — "Branch by condition" duplicated + misplaced

### Problem

[`SwitchNodeRenderer` in WorkflowEditorCanvas.tsx:880-892](../../apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx) prints both `data.label` (bold, set to "Branch by condition" by the skeleton at [`palette/control-flow-skeletons.ts:55`](../../apps/frontend/src/features/workflow-builder/palette/control-flow-skeletons.ts)) and `hints.displayName` (dimmed, also "Branch by condition" from [`control-flow-visual-hints.ts:52`](../../apps/frontend/src/features/workflow-builder/control-flow-visual-hints.ts)). The text appears twice. Additionally the diamond is a 140×140 box with a rotated visual layer covering only the inscribed square (~99×99), so two lines of "Branch by condition" overflow and appear shifted toward the right corner.

### Approach

1. **Remove the dimmed subtitle from `SwitchNodeRenderer`**. The diamond shape + yellow accent already signal "this is a switch"; printing the type label dimmed below is redundant. (Other control-flow rectangles keep their subtitle because the type isn't obvious from the rectangle shape.)
2. **Bump the diamond to 180×180** (was 140×140). Inscribed square grows from ~99 → ~127, comfortable for a two-line wrap.
3. **Allow label wrap**: change the `<span>{data.label}</span>` line to a `<div>` with `wordBreak: "break-word"; textAlign: "center"; maxWidth: 110px` so long labels wrap to two lines instead of overflowing.
4. **Constrain content layer to the inscribed square** by setting `maxWidth: 127px; maxHeight: 127px` on the upright content div. Stops content from visually escaping the diamond edges when labels grow.

Default skeleton label remains "Branch by condition" — bigger diamond fits it on two lines.

### Files touched

- [`apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`](../../apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx) — `SwitchNodeRenderer` (lines 817-930). Update auto-layout if the wider footprint affects spacing.
- [`apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts`](../../apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts) — verify the switch's dagre node-size config matches the new 180×180.

### Tests

- `WorkflowEditorCanvas.test.tsx` — switch renderer no longer renders the dimmed subtitle. The diamond visual layer has the new dimensions. Long labels wrap to two lines.

---

## 6. Map body auto-grouping

### Problem

In the Multi-Page Report template ([`docs-md/graph-workflows/templates/multi-page-report-workflow.json`](../../docs-md/graph-workflows/templates/multi-page-report-workflow.json)), `processSegments` is a `map` node whose body is described by `bodyEntryNodeId: "segmentRouter"` + `bodyExitNodeId: "passthrough"`. The body nodes (`segmentRouter`, `monthlyReportOcr`, `payStubOcr`, `bankRecordOcr`, `unknownDocOcr`, `passthrough`) are wired to each other but **not** to the map node — that linkage is implicit through the `bodyEntry/Exit` ids. xyflow sees them as a second disjoint graph.

The legacy `GraphVisualization.tsx` (lines 652-1041) had explicit map-container rendering. V2 didn't port it.

### Approach: synthesise a derived `nodeGroup` per map body at render time

Add a pure helper `synthesizeMapBodyGroups(config): GraphWorkflowConfig['nodeGroups']` that:

1. Walks `config.nodes` and selects entries where `type === "map"` and both `bodyEntryNodeId` and `bodyExitNodeId` are set.
2. For each map, BFS the `config.edges` graph starting at `bodyEntryNodeId`, collecting visited node ids until it terminates at `bodyExitNodeId` or runs out of reachable nodes. The visited set is the body.
3. Produces a synthetic group entry:
   ```ts
   {
     [`__map_body_${mapNodeId}`]: {
       label: `${mapNode.label} · body`,
       description: `Body of map node "${mapNode.label}"`,
       icon: "scissors", // or matching map icon
       color: "#22c55e",
       nodeIds: [...bodyNodeIds],
       synthetic: true,
       mapNodeId,
     }
   }
   ```

The output is merged with `config.nodeGroups` (synthetic groups never override user-named ones; collisions on `nodeIds` are resolved by **excluding nodes already in a user-named group** to preserve the user's grouping intent).

### Where synthesis runs

In the canvas projection layer ([`WorkflowEditorCanvas.tsx`](../../apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx) — find the existing place where `config.nodeGroups` is read for projection), the merged `nodeGroups` value is computed via `useMemo(() => mergeGroups(config.nodeGroups, synthesizeMapBodyGroups(config)), [config])` and passed downstream.

**No persistence**. Save handlers in `WorkflowEditorV2Page.tsx` continue to use `config` directly, which still has the original (unmodified) `nodeGroups`. Synthesis is purely a render-time projection. Templates load → render shows the group → save writes the original template's `nodeGroups` back without the synthetic entries.

### Group renderer adjustments

The existing group renderer / `GroupNodeSettings` shouldn't allow rename/ungroup on synthetic groups:

- `GroupNodeSettings` checks the `synthetic` flag on the group; if true, hides the rename input and delete/ungroup button, replacing them with explanatory text: "This group reflects the body of the `<mapLabel>` map node and updates automatically when the map is edited."
- "Group selected" (`createGroupFromSelection` in [`group/create-group.ts`](../../apps/frontend/src/features/workflow-builder/group/create-group.ts)) skips nodes that are members of a synthetic body group (silent skip + toast warning "Skipped N node(s) inside a map body — those are grouped automatically").
- Simplified view collapses synthetic groups the same as user-named groups (no special-case needed since they appear in the same `nodeGroups` map).

### Files touched

- New: `apps/frontend/src/features/workflow-builder/canvas/map-body-groups.ts` — `synthesizeMapBodyGroups(config)` + `mergeGroups(user, synthetic)` helpers.
- [`apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`](../../apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx) — replace direct `config.nodeGroups` reads in the projection pipeline with the merged value.
- [`apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx`](../../apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx) — reads `group.synthetic` and disables rename/delete; substitutes the explanatory text for synthetic groups.
- [`apps/frontend/src/features/workflow-builder/group/create-group.ts`](../../apps/frontend/src/features/workflow-builder/group/create-group.ts) — filter out body-group members before merging.
- Type addition: extend the local `NodeGroup` view-model type (not the persisted Zod schema) with optional `synthetic?: true; mapNodeId?: string`.

### Tests

- `map-body-groups.test.ts` — synthesises one group per map with `bodyEntryNodeId/bodyExitNodeId`; traversal correctly collects all reachable body nodes; missing `bodyEntry/Exit` skips synthesis; merging with user-named groups respects user intent (no overlap).
- `WorkflowEditorCanvas.test.tsx` — load the Multi-Page Report template, assert one synthetic group is projected with the expected 6 nodes.
- `GroupNodeSettings.test.tsx` — synthetic group hides rename + delete; user-named group keeps them.
- `create-group.test.ts` — selection that includes a body-group member silently excludes it from the new group.

---

## Cross-cutting concerns

### Performance

- `synthesizeMapBodyGroups` runs on every config change. Guard with `useMemo`. With ≤30 nodes (typical workflow), traversal is O(n+e), negligible.
- Drop handler creates one node per drop; the `defaultStaggerPosition` helper only matters in the click-to-add fallback.

### Accessibility

- Click-to-add path remains (drag is additive, not replacement).
- Mantine `<Menu>` provides keyboard navigation out of the box.

### Backwards compatibility

- No schema changes. All persisted JSON (`config` shape, template files, library workflows) stays bit-identical.
- Existing `data-testid`s preserved. Tests in CI continue to pass.

### Rollout

Single PR onto `feature/visual-workflow-builder`. The six fixes are small enough to ship together; splitting them risks the top-bar reshuffle landing without the pill relocation, leaving the editor in an awkward intermediate state.

---

## Implementation order (for the follow-up plan)

When `writing-plans` decomposes this, suggested ordering — earlier items unblock later visual verification:

1. **Branch by condition fix** (§5) — smallest, isolated.
2. **Pills under node** (§2) — isolated visual.
3. **Hover popover fixes** (§4) — isolated.
4. **Map body auto-grouping** (§6) — enables visual verification of the Multi-Page Report template.
5. **Drag-from-palette** (§3) — additive, doesn't break click-to-add.
6. **Top bar reorganisation** (§1) — biggest user-facing surface change; lands last so the rest is verified.
