# US-106: `SourceNode` type variant + `NodeType` union extension

**As a** shared-package consumer (backend, temporal, frontend),
**I want** a typed `SourceNode` variant in the `GraphNode` discriminated union,
**So that** source nodes participate in the graph schema with full type safety end-to-end.

## Acceptance Criteria

- [ ] **Scenario 1**: `NodeType` union extended with `"source"`
    - **Given** `packages/graph-workflow/src/types.ts`
    - **When** the file is read
    - **Then** `NodeType` includes `"source"` alongside the existing seven (`activity` / `switch` / `map` / `join` / `childWorkflow` / `pollUntil` / `humanGate`)
    - **And** a JSDoc on the extension cross-references DOCUMENT_SOURCES_DESIGN.md §1 ("new source node TYPE")

- [ ] **Scenario 2**: `SourceNode` interface shape
    - **Given** the same file
    - **When** read
    - **Then** it exports `interface SourceNode extends GraphNodeBase` with fields: `type: "source"`, `sourceType: string`, `parameters?: Record<string, unknown>`
    - **And** JSDoc on `sourceType` reads "Subtype id resolved against the source catalog (SOURCE_CATALOG); e.g. \"source.api\" or \"source.upload\""

- [ ] **Scenario 3**: `SourceNode` joins the `GraphNode` discriminated union
    - **Given** the existing `export type GraphNode = ActivityNode | SwitchNode | …`
    - **When** read after the change
    - **Then** `SourceNode` is appended: `… | SourceNode`
    - **And** narrowing on `node.type === "source"` resolves to `SourceNode` (TS exhaustiveness still complete)

- [ ] **Scenario 4**: Package barrel re-export + build green
    - **Given** `packages/graph-workflow/src/index.ts`
    - **When** the package is built
    - **Then** `SourceNode` is re-exported from the package barrel
    - **And** `npm run build` in `packages/graph-workflow/` succeeds
    - **And** existing types tests pass unchanged

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/types.ts` — extend `NodeType` union + add `SourceNode` interface + extend `GraphNode` discriminated union
- `packages/graph-workflow/src/types.test.ts` (if exists, otherwise none) — smoke test asserting the union member count

## Technical notes

- This story is types-only; the source catalog scaffold (US-108) is the first runtime artifact in Phase 8.
- The `sourceType` field stays generic `string` here — it gets narrowed via `getSourceCatalogEntry(sourceType)` returning `SourceCatalogEntry | undefined` (US-108).
- `SourceNode.inputs` intentionally inherits from `GraphNodeBase.inputs?: PortBinding[]` (optional). The validator (US-109) enforces empty/absent at save time rather than baking the invariant into the type — keeps the discriminated union ergonomic for incremental graph-edit operations.
- This story unlocks every downstream Phase 8 work item. Build the package after merging; **ask Alex to restart Vite** (runtime exports from Milestone A — see US-108).
