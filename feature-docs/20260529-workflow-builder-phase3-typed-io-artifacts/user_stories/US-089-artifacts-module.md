# US-089: `artifacts.ts` — `ArtifactKind` union + provenance interfaces

**As a** shared-package consumer (backend, temporal, frontend),
**I want** a single canonical declaration of the typed-I/O vocabulary,
**So that** every surface (handle renderer, picker, validator, future dynamic-node bridge) reads the same string-literal kind names.

## Acceptance Criteria

- [ ] **Scenario 1**: `ArtifactKind` string-literal union exists
    - **Given** `packages/graph-workflow/src/types/artifacts.ts` (new file)
    - **When** the file is read
    - **Then** it exports a `type ArtifactKind` union containing exactly: `"Artifact"`, `"Document"`, `"MultiPageDocument"`, `"SinglePageDocument"`, `"Segment"`, `"Segment<Text>"`, `"Segment<Table>"`, `"Segment<Figure>"`, `"Segment<Form>"`, `"Segment<KeyValue>"`, `"Segment<Signature>"`, `"Segment<Header>"`, `"OcrResult"`, `"OcrFields"`, `"OcrTable"`, `"Classification"`, `"ValidationResult"`, `"Reference"`
    - **And** a top-level JSDoc explains "Flat string-literal union per TYPED_IO_DESIGN.md §1 — parameterised entries are enumerated, not structural."

- [ ] **Scenario 2**: `ArrayKind` helper type for cardinality
    - **Given** the same file
    - **When** read
    - **Then** it exports `type ArrayKind = ` ``` `${ArtifactKind}[]` ``` (template-literal type)
    - **And** a `type KindRef = ArtifactKind | ArrayKind` alias used everywhere `kind?` is declared

- [ ] **Scenario 3**: `Segment` provenance interface exported
    - **Given** the same file
    - **When** read
    - **Then** it exports `interface Segment` matching TYPED_IO_DESIGN.md §1: `parentDocId: string`, `pageRange?: { start: number; end: number }`, `polygon?: { x: number; y: number }[]`, `kind?: "Text" \| "Table" \| ...`, `confidence?: number`, `blobKey?: string`

- [ ] **Scenario 4**: Barrel re-export from package root
    - **Given** `packages/graph-workflow/src/types/index.ts` (new) and `packages/graph-workflow/src/index.ts` (existing)
    - **When** the package barrel is read
    - **Then** `ArtifactKind`, `ArrayKind`, `KindRef`, and `Segment` are all re-exported
    - **And** `npm run build` in `packages/graph-workflow/` succeeds

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/types/artifacts.ts` — new
- `packages/graph-workflow/src/types/index.ts` — new barrel
- `packages/graph-workflow/src/index.ts` — re-export the new types module
- `packages/graph-workflow/src/types/artifacts.test.ts` — minimal smoke test asserting the union has the expected member count

## Technical notes

- This is types-only — no runtime exports yet. The registry (US-090) is the first runtime artifact.
- The package's Zod v4 (`zod/v4`) does not need to know about `ArtifactKind` — Phase 3 keeps `kind` outside Zod schemas; it's metadata on `PortDescriptor` / `CtxDeclaration` / `LibraryPortDescriptor`.
