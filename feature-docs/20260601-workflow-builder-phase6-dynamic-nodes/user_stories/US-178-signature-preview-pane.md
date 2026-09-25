# US-178: `SignaturePreviewPane` — derived signature card

**As a** dynamic-node author,
**I want** a side pane that renders my parsed signature as a structured card (name, description, ports with kind dots, parameters, allowNet chips, deterministic flag, DYN pill),
**So that** I see at a glance what catalog entry my script will produce — without leaving the editor or guessing how the canvas will render the node.

## Acceptance Criteria

- [x] **Scenario 1**: New `SignaturePreviewPane.tsx` consumes the live parse result
    - **Given** `apps/frontend/src/features/workflow-builder/dynamic-nodes/SignaturePreviewPane.tsx`
    - **When** the component receives `signature: DynamicNodeSignature | null` as a prop (passed in by `DynamicNodeEditor` from the live parse)
    - **Then** if signature is null the pane shows a gray "No signature yet — write a `@workflow-node` JSDoc header" placeholder
    - **And** if signature is non-null the pane renders the structured card per the next scenarios

- [x] **Scenario 2**: Card header — name + description + DYN pill + deterministic flag
    - **Given** a valid signature
    - **When** the card renders
    - **Then** the header shows the slug + description + a small `<Badge size="xs" variant="filled" color="grape">DYN</Badge>` pill
    - **And** if `deterministic: true` it shows a small "Deterministic (cached)" badge; otherwise "Non-deterministic (not cached)"

- [x] **Scenario 3**: Inputs + outputs tables with Phase 3 kind dots
    - **Given** the signature's `inputs` and `outputs` arrays
    - **When** the card renders
    - **Then** each port renders as: `<kind-color-dot> port-name : KindName` (using the Phase 3 kind palette from existing `catalog-utils.ts`)
    - **And** required inputs show a "required" badge; optional inputs do not

- [x] **Scenario 4**: Parameters block uses the existing `JsonSchemaForm` in read-only mode
    - **Given** the signature's `paramsSchema`
    - **When** the card renders
    - **Then** it mounts `<JsonSchemaForm schema={signature.paramsSchema} readOnly />` so the parameters preview matches exactly what the canvas settings panel will render
    - **And** if `paramsSchema` declares no properties, the parameters block is hidden

- [x] **Scenario 5**: `allowNet` chips
    - **Given** the signature's `allowNet` array
    - **When** the card renders
    - **Then** each host renders as a `<Chip readOnly>` (or `<Badge>`) labelled with the host
    - **And** if `allowNet` is empty the section is hidden

- [x] **Scenario 6**: Tests cover empty + populated states
    - **Given** `SignaturePreviewPane.spec.tsx`
    - **When** the test suite runs
    - **Then** tests pass for: null signature renders placeholder; populated signature renders all five sections; deterministic flag toggles the badge; kind dots use the Phase 3 colors; readOnly JsonSchemaForm renders parameter previews

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/dynamic-nodes/SignaturePreviewPane.tsx` — new file
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/SignaturePreviewPane.spec.tsx` — new test
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/DynamicNodeEditor.tsx` — wire the pane to consume the live-parse result

## Technical notes

- Reuse `catalog-utils.ts` (`resolveKindColor`, `getActivityCatalogEntry` style helpers) where possible — the preview pane should be visually consistent with the canvas.
- The pane is pure presentation — no fetching, no mutations. All data flows from the editor's live parse result.
- `JsonSchemaForm` already supports `readOnly` (used by VersionHistoryDrawer's diff modal in Phase 2 Track 3) — pass through.
- After landing: no Vite restart (frontend-only).
