# US-090: `artifact-registry.ts` — runtime registry + `registerArtifactKind`

**As a** UI renderer (handle dot, type pill, picker, "Kind" Select),
**I want** a runtime lookup mapping every `ArtifactKind` to its display name + colour + base-kind pointer,
**So that** the canvas colour rule, the picker labels, and Phase 6's dynamic-node registration all share one source of truth.

## Acceptance Criteria

- [x] **Scenario 1**: Registry exports a frozen map for all v1 kinds
    - **Given** `packages/graph-workflow/src/types/artifact-registry.ts` (new file)
    - **When** the file is read
    - **Then** it exports `const ARTIFACT_REGISTRY: Readonly<Record<ArtifactKind, ArtifactKindMeta>>`
    - **And** `interface ArtifactKindMeta { displayName: string; color: string; baseKind?: ArtifactKind; isArray: false }` is declared
    - **And** every `ArtifactKind` from US-089's union has exactly one entry
    - **And** the entries match TYPED_IO_DESIGN.md §4 palette: Document family → blue, Segment family → green, OcrResult family → violet, Classification + ValidationResult → amber, Reference → teal, Artifact → gray
    - **And** `baseKind` follows the hierarchy in TYPED_IO_DESIGN.md §1 (e.g. `MultiPageDocument.baseKind === "Document"`, `Segment<Table>.baseKind === "Segment"`, `Document.baseKind === "Artifact"`)

- [x] **Scenario 2**: `displayName` is human-readable
    - **Given** the registry
    - **When** read
    - **Then** `"MultiPageDocument"` → displayName `"Multi-page document"`, `"Segment<Table>"` → `"Segment (Table)"`, `"OcrFields"` → `"OCR fields"`, etc.
    - **And** the casing/spacing is consistent (sentence case, no camelCase leaking into UI labels)

- [x] **Scenario 3**: `registerArtifactKind` accepts new entries with a declared base
    - **Given** an `export function registerArtifactKind(kind: string, meta: ArtifactKindMeta): void`
    - **When** called with `("CustomDocType", { displayName: "Custom doc", color: "indigo", baseKind: "Document", isArray: false })`
    - **Then** subsequent `getArtifactKindMeta("CustomDocType")` returns the new meta
    - **And** subtype checks (US-091) walk the new entry's `baseKind` pointer
    - **And** registering a kind whose `baseKind` is not already in the registry throws `Error("baseKind \"<x>\" not found in registry")`
    - **And** registering a kind whose name already exists throws `Error("kind \"<x>\" already registered")` (no silent overwrite)

- [x] **Scenario 4**: `getArtifactKindMeta` returns undefined for unknown kinds
    - **Given** the registry exports `getArtifactKindMeta(kind: string): ArtifactKindMeta | undefined`
    - **When** called with `"NotARealKind"`
    - **Then** returns `undefined`
    - **And** callers (validator, renderer) handle `undefined` as wildcard `Artifact` (per TYPED_IO_DESIGN.md §3)

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/types/artifact-registry.ts` — new
- `packages/graph-workflow/src/types/artifact-registry.test.ts` — unit tests covering: every v1 kind has an entry; baseKind chain is connected (no orphans); registerArtifactKind happy/error paths
- `packages/graph-workflow/src/types/index.ts` — re-export `ARTIFACT_REGISTRY`, `ArtifactKindMeta`, `registerArtifactKind`, `getArtifactKindMeta`
- `packages/graph-workflow/src/index.ts` — re-export through the package barrel

## Technical notes

- Colour values are Mantine-compatible strings (`"blue"`, `"green"`, etc.) — the frontend handle renderer translates these via Mantine theme; the package stays UI-framework-agnostic by emitting names not hex codes.
- `isArray: false` is set on every registry entry; cardinality is encoded into the kind string ("Document[]"), not the registry entry — see US-091 for how `isAssignable` parses arrays.
