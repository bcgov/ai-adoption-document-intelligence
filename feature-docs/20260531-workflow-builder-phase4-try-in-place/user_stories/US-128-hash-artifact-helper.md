# US-128: `hash-artifact.ts` content-addressable artifact hash helper

**As a** cache-layer consumer (worker decorator + backend preview-cache endpoint),
**I want** a `hashArtifact(value)` helper that normalises Documents and Segments to their content-addressable keys BEFORE hashing,
**So that** two ctx values referencing the same underlying content (same blob, same segment region) produce the same hash even when their presigned URLs differ.

## Acceptance Criteria

- [ ] **Scenario 1**: Document → `blob.storage_key` normalisation
    - **Given** `packages/graph-workflow/src/cache/hash-artifact.ts`
    - **When** the new file is read
    - **Then** it exports `function hashArtifact(value: unknown): string`
    - **And** for a Document-shaped object `{ url: "https://...?token=A", blobKey: "abc/def.pdf", ... }`, `hashArtifact(v)` returns `sha256("Document:abc/def.pdf")` — URL ignored, blobKey is the content identifier

- [ ] **Scenario 2**: Segment → `parentDocId + pageRange + polygon` normalisation
    - **Given** the helper
    - **When** called with a Segment-shaped object `{ parentDocId: "doc-7", pageRange: { start: 2, end: 5 }, polygon: [{ x: 0, y: 0 }, ...], kind: "Text" }`
    - **Then** it returns `sha256("Segment:doc-7:2-5:" + stableJson(polygon))` — region identifiers replace URL-style identity
    - **And** the `kind` and `confidence` fields are NOT part of the hash (they're metadata, not identity)

- [ ] **Scenario 3**: Arrays of artifacts hash element-wise
    - **Given** an array of Segments
    - **When** `hashArtifact([seg1, seg2])` is called
    - **Then** the result is `sha256("[" + hashArtifact(seg1) + "," + hashArtifact(seg2) + "]")` — order preserved

- [ ] **Scenario 4**: Non-artifact values fall through to `stableJson` + sha256
    - **Given** the helper
    - **When** called with a primitive (string, number, boolean) or a plain object lacking artifact shape markers
    - **Then** it returns `sha256(stableJson(value))` — i.e., the standard hash path

- [ ] **Scenario 5**: Artifact shape detection is strict
    - **Given** the helper
    - **When** called with an object that has `blobKey` but is missing other Document markers (e.g., just `{ blobKey: "x" }`)
    - **Then** it falls through to `stableJson` — the ambiguous case is not silently re-coerced to a Document hash
    - **And** the same applies for partial Segment shapes (missing `parentDocId` OR `polygon`)

- [ ] **Scenario 6**: Unit tests + barrel re-export
    - **Given** `packages/graph-workflow/src/cache/hash-artifact.test.ts`
    - **When** tests run
    - **Then** at least 10 cases pass covering the Document path, the Segment path, the array path, the primitive path, partial-shape rejection, and the empty-array edge case
    - **And** `hashArtifact` is re-exported from the package barrel

## Priority
- [ ] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/cache/hash-artifact.ts` — implementation
- `packages/graph-workflow/src/cache/hash-artifact.test.ts` — vitest unit tests
- `packages/graph-workflow/src/index.ts` — barrel re-export

## Technical notes

- The `sha256` primitive is from Node's `crypto` module (`createHash("sha256").update(s).digest("hex")`). Workers (Node-side) and the backend (Node-side) both have access.
- Phase 3's artifact taxonomy ([TYPED_IO_DESIGN.md](../../docs-md/workflow-builder/TYPED_IO_DESIGN.md) §1) names `Document` and `Segment` as the two shapes with content-addressable identity. `OcrResult` / `Classification` / `Reference` etc. are value types and use the primitive path.
- Detection markers for a Document: has `blobKey: string` AND (has `url: string` OR has `mimeType: string`). For a Segment: has `parentDocId: string` AND has `polygon: Array`.
- This story is pure-functional — no I/O. The blob's storage key is already in the ctx value (set by `file.prepare`-like activities); the helper doesn't fetch anything.
- After landing: **ask Alex to restart Vite** (new runtime export).
