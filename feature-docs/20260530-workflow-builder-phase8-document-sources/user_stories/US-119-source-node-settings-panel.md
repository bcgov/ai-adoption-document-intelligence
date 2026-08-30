# US-119: `SourceNodeSettings` panel + `NodeSettingsPanel` dispatch

**As a** workflow author who selected a source node,
**I want** the right-rail settings panel to render a header + the source's parametersSchema-driven form,
**So that** I can configure the source's behaviour using the same schema-driven UX that activity nodes already have.

## Acceptance Criteria

- [x] **Scenario 1**: Dispatch routes source nodes to `SourceNodeSettings`
    - **Given** `apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx` (the dispatch shell)
    - **When** the selected node's `type === "source"`
    - **Then** the panel renders `<SourceNodeSettings node={selectedNode as SourceNode} />`
    - **And** the existing branches for `activity` / group / control-flow nodes are unchanged

- [x] **Scenario 2**: Header surfaces displayName + description + icon
    - **Given** `apps/frontend/src/features/workflow-builder/sources/SourceNodeSettings.tsx` (new)
    - **When** the panel renders for a `source.api` node
    - **Then** the header shows the catalog entry's `displayName` ("API endpoint"), `description`, and the resolved Tabler icon
    - **And** when the user-authored `node.label` differs from the displayName, the label renders below the displayName as a subtitle

- [x] **Scenario 3**: Body renders `JsonSchemaForm` against `parametersSchema`
    - **Given** the same panel for a `source.upload` node
    - **When** the body renders
    - **Then** the existing `JsonSchemaForm` component receives the catalog entry's `parametersSchema` converted via `z.toJSONSchema(parametersSchema)` AND the current `node.parameters` as initial values
    - **And** rendering matches activity-node-settings parity (same form components, same x-widget dispatch)
    - **And** changes to fields fire the existing `onChange` callback that mutates `node.parameters` through the canvas state-management layer

- [x] **Scenario 4**: Source.api fields[] x-widget routes to FieldListEditor (forward reference to US-120)
    - **Given** a source.api node rendered via this panel
    - **When** the `parametersSchema` includes `fields` with `x-widget: "field-list-editor"`
    - **Then** the JsonSchemaForm dispatches that field to the `FieldListEditor` registered widget (US-120)
    - **And** until US-120 lands, the field falls back to the default array-renderer behaviour (a vitest in this story can assert the dispatch wiring; rich-editor behaviour is verified in US-120)

- [x] **Scenario 5**: Frontend vitest coverage
    - **Given** `apps/frontend/src/features/workflow-builder/sources/SourceNodeSettings.test.tsx` (new)
    - **When** the test runs against fixtures for both subtypes (source.api with empty fields, source.upload with defaults)
    - **Then** the header content is asserted (displayName + icon + label override)
    - **And** the form body renders with the correct number of fields per subtype (source.api: 2 fields — `fields[]` + `authNotes?`; source.upload: 3 fields — `allowedMimeTypes?` + `maxFileSizeMB?` + `ctxKey?`)
    - **And** simulating a field change updates the node's parameters via the onChange path
    - **And** the existing NodeSettingsPanel dispatch tests still pass

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/sources/SourceNodeSettings.tsx` — new
- `apps/frontend/src/features/workflow-builder/sources/SourceNodeSettings.test.tsx` — new
- `apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx` — add the `source` branch to the dispatch

## Technical notes

- **The "Test upload" button is NOT in this story.** It lands in US-124 (SourceUploadButton). This story builds the panel WITHOUT the button so US-119 can land before US-114 (the upload endpoint) is fully wired up.
- Reuse the existing `JsonSchemaForm` wholesale. Don't fork it — the source catalog entries' parametersSchemas are designed to be valid inputs to the same renderer that activity catalogs already use.
- The icon resolution uses `source-catalog-utils.ts`'s `resolveSourceIcon` (US-118). The color (Mantine theme color) drives a small accent strip — match whatever activity-node-settings panels do today, don't reinvent.
- This story can land in PARALLEL with US-117 + US-118 — all three depend on the catalog entries (US-115/116) but are independent of each other.
