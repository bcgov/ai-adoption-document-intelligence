# US-118: "Sources" palette section + `source-catalog-utils`

**As a** workflow author dragging nodes from the left rail,
**I want** a dedicated "Sources" section above the existing activity categories,
**So that** source nodes are discoverable as a first-class concept rather than buried inside activities.

## Acceptance Criteria

- [x] **Scenario 1**: `source-catalog-utils.ts` icon + color resolvers
    - **Given** `apps/frontend/src/features/workflow-builder/sources/source-catalog-utils.ts` (new file)
    - **When** read
    - **Then** it exports `resolveSourceIcon(iconHint?: string): IconComponent | undefined` matching the pattern of the existing `catalog-utils.ts` `resolveIcon` helper (Tabler icons for known hints, undefined for unknown)
    - **And** it exports `resolveSourceColor(colorHint?: string): MantineColor | undefined` matching the pattern of `catalog-utils.ts`
    - **And** smoke tests assert the 8.0 hint strings (`"cloud-upload"`, `"file-upload"`) resolve to real icons; unknown hints return undefined

- [x] **Scenario 2**: "Sources" section above activity categories in `ActivityPalette`
    - **Given** `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx`
    - **When** read after the change
    - **Then** a new "Sources" section renders ABOVE the existing categorised activity rows
    - **And** the section header style matches existing palette section headers (same Mantine `<Text>` / `<Group>` styling)

- [x] **Scenario 3**: Section lists `source.api` + `source.upload`
    - **Given** the palette rendered
    - **When** `SOURCE_CATALOG` contains the two 8.0 entries (US-115 + US-116)
    - **Then** the Sources section shows two rows: "API endpoint" (cloud-upload icon, indigo accent) and "File upload" (file-upload icon, blue accent)
    - **And** each row's tooltip surfaces the catalog entry's `description`

- [x] **Scenario 4**: Dragging a source entry creates a `SourceNode`
    - **Given** the Sources section rendered
    - **When** the user drags the "API endpoint" row onto the canvas
    - **Then** a new `SourceNode` is created with `type: "source"`, `sourceType: "source.api"`, `parameters: <subtypeDefaults from parametersSchema>`
    - **And** the existing palette-to-canvas drop machinery (xyflow drag + drop) places the node at the cursor position
    - **And** dragging "File upload" creates a `source.upload` node analogously

- [x] **Scenario 5**: Frontend vitest coverage
    - **Given** the new utils file and palette extension
    - **When** the test suite runs
    - **Then** `source-catalog-utils.test.ts` covers the resolver edge cases
    - **And** an `ActivityPalette` test asserts the Sources section renders with the expected two rows
    - **And** the existing palette tests still pass

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/sources/source-catalog-utils.ts` — new
- `apps/frontend/src/features/workflow-builder/sources/source-catalog-utils.test.ts` — new
- `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx` — add the Sources section ABOVE the existing categorised rendering

## Technical notes

- Resolver pattern mirrors the existing `apps/frontend/src/features/workflow-builder/catalog-utils.ts` exactly — keep the API surface identical so future contributors don't need to remember two conventions.
- The drag-to-canvas creation path uses the existing `onDrop` handler in `WorkflowEditorCanvas`. The handler dispatches on the dropped item's `category` — extend it to handle `"source"` (looks up `getSourceCatalogEntry`, builds a default `SourceNode`).
- Default parameters: call `entry.parametersSchema.parse({})` to fill in `.default()` values from the Zod schema. For source.api, this gives `parameters: { fields: [] }` (an empty fields list — user adds them in the settings panel).
- The Sources section should be present even when the catalog is empty (defensive — though after US-115/116 land it always has 2 entries). When empty, the section header still renders with a `"No source types available"` placeholder.
