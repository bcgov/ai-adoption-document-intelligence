# US-117: `SourceNodeRenderer` — canvas custom-node for source nodes

**As a** workflow author looking at the canvas,
**I want** source nodes to render with no input handle and a single typed output handle,
**So that** the visual model immediately communicates "this is the edge to the outside world" and the Phase 3 typed-I/O signal is honoured.

## Acceptance Criteria

- [x] **Scenario 1**: No input handle on the left side
    - **Given** a `SourceNode` rendered via the new `SourceNodeRenderer` xyflow custom-node
    - **When** the rendered DOM is inspected
    - **Then** there is NO `Handle` component with `type="target"` on the left side of the node
    - **And** no incoming-wire affordance is interactive on the source's left edge

- [x] **Scenario 2**: Single output handle coloured per `outputKind`
    - **Given** the same renderer for a `source.upload` node (catalog `outputKind: "Document"`)
    - **When** the node is rendered
    - **Then** the right-side output handle's dot is coloured blue (Document family per Phase 3 palette)
    - **And** for `source.api` (`outputKind: "Artifact"`), the handle is gray
    - **And** hovering the handle shows tooltip text matching the kind literal verbatim ("Document" or "Artifact")

- [x] **Scenario 3**: Phase 3 type pill renders on selection
    - **Given** the same renderer
    - **When** the user selects the source node on the canvas
    - **Then** Phase 3's type-pill component renders next to the output handle: source.api shows a single-line `"ARTIFACT"` pill with a small footnote `"see Settings → Fields for typed field-level kinds"`; source.upload shows `"DOCUMENT"`
    - **And** the pill disappears when the node is deselected

- [x] **Scenario 4**: Label, icon, color sourced from catalog entry via `source-catalog-utils`
    - **Given** the catalog entries from US-115/116 and `source-catalog-utils.ts` (US-118)
    - **When** the renderer reads the source's `sourceType` and looks up the entry
    - **Then** the rendered header shows `displayName` ("API endpoint" / "File upload"), `iconHint` resolved to a Tabler icon component, and `colorHint` resolved to a Mantine theme color
    - **And** the user-authored `label` (from `SourceNode.label`) appears below the displayName if it differs

- [x] **Scenario 5**: Registered in `WorkflowEditorCanvas` `nodeTypes`
    - **Given** `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
    - **When** read after the change
    - **Then** the xyflow `nodeTypes` map includes `source: SourceNodeRenderer`
    - **And** existing entries for `activity` / `switch` / `map` / `join` / `childWorkflow` / `pollUntil` / `humanGate` / group-chip nodes are untouched

- [x] **Scenario 6**: Frontend vitest coverage
    - **Given** `apps/frontend/src/features/workflow-builder/sources/SourceNodeRenderer.test.tsx` (new)
    - **When** the test suite runs
    - **Then** it covers Scenarios 1–4 explicitly (no input handle, output handle colour for both subtypes, pill render on selection, header reads from catalog)
    - **And** the frontend full vitest suite stays green

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/sources/SourceNodeRenderer.tsx` — new
- `apps/frontend/src/features/workflow-builder/sources/SourceNodeRenderer.test.tsx` — new
- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` — register `source: SourceNodeRenderer` in `nodeTypes`

## Technical notes

- Reuse the Phase 3 handle-colour helper (e.g. `getKindColor(kind)` from US-095's implementation) — don't reintroduce a parallel palette.
- The type pill is the Phase 3 component (whatever US-096 named it — likely `NodeTypePill`). Pass it the source's outputKind via the same protocol activities use.
- The "source.api footnote" is a small `<Text size="xs" c="dimmed">` under the pill body, NOT a separate component. The footnote text references "Settings → Fields" not "Fields" alone to make the navigation clear.
- This story can land in PARALLEL with US-118 (palette section) and US-119 (settings panel) — they don't depend on each other; all three depend on the catalog entries (US-115/116).
- xyflow node-component contract: the `data` prop the renderer receives includes the full `SourceNode` (id/type/label/sourceType/parameters). The renderer should NOT mutate this — settings changes flow through the existing onChange/Zustand path.
