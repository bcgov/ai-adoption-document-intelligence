# US-055: Extend `GraphMetadata` with optional `kind`, `inputs[]`, `outputs[]` + `LibraryPortDescriptor` type

**As a** workflow author saving a workflow as a library,
**I want** the workflow's `GraphWorkflowConfig.metadata` to carry the
library discriminator + declared inputs/outputs,
**So that** the in-flight config + the persisted JSON encode the
library signature consistently and the frontend picker can read it
back.

## Acceptance Criteria

- [ ] **Scenario 1**: `LibraryPortDescriptor` is exported
    - **Given** `packages/graph-workflow/src/types.ts`
    - **When** the file is read
    - **Then** a `LibraryPortDescriptor` interface is exported with shape `{ label: string; path: string; type: "string" | "number" | "boolean" | "object" | "array" }`

- [ ] **Scenario 2**: `GraphMetadata` carries the three new optional fields
    - **Given** the updated `GraphMetadata` interface
    - **When** TypeScript checks it
    - **Then** `kind?: "workflow" | "library"`, `inputs?: LibraryPortDescriptor[]`, and `outputs?: LibraryPortDescriptor[]` are all present as optional fields

- [ ] **Scenario 3**: Existing workflow configs remain valid
    - **Given** any existing template JSON in `docs-md/graph-workflows/templates/`
    - **When** the JSON is loaded against the new type
    - **Then** TypeScript accepts it without modification (all new fields are optional)
    - **And** `metadata.kind` being absent is interpreted as `"workflow"` at the consumer (no runtime default written)

- [ ] **Scenario 4**: The package's existing tests still pass
    - **Given** the change to `types.ts`
    - **When** `npm test` is run in `packages/graph-workflow/`
    - **Then** all existing test suites continue to pass

- [ ] **Scenario 5**: The package builds cleanly
    - **Given** the type extension
    - **When** `npm run build` is run in the package
    - **Then** build succeeds with no errors

## Priority
- [ ] High (Must Have)

## Files modified

- `packages/graph-workflow/src/types.ts` — add `LibraryPortDescriptor` and extend `GraphMetadata`
- `packages/graph-workflow/src/index.ts` (if re-exports are explicit) — export `LibraryPortDescriptor`
