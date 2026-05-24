# US-110: Binding-walk integration — source nodes as kind-bearing ctx producers

**As a** workflow author,
**I want** Phase 3's binding-walk validator to recognise source-node outputs as typed ctx producers,
**So that** typing mismatches between a source's declared field kinds and a downstream consumer's port kind surface as the same save-time errors as any other producer/consumer mismatch.

## Acceptance Criteria

- [ ] **Scenario 1**: `source.api` `fields[]` enumerated as ctx producers
    - **Given** `packages/graph-workflow/src/validator/validator.ts` (the binding-walk pass introduced in Phase 3 / US-093)
    - **When** the walker enumerates ctx-key producers for a graph containing a `source.api` node
    - **Then** each entry in the source's `parameters.fields[]` contributes a `(node: <source.api.id>, port: "<fieldName>", kind: <field.kind | "Artifact">)` producer record
    - **And** the producer kind is `"Artifact"` when the field omits `kind?`

- [ ] **Scenario 2**: `source.upload`'s configured `ctxKey` enumerated as a Document producer
    - **Given** the same walker
    - **When** the walker enumerates ctx-key producers for a graph containing a `source.upload` node
    - **Then** the source contributes `(node: <source.upload.id>, port: "<ctxKey>", kind: "Document")` — where `ctxKey` is `parameters.ctxKey ?? "documentUrl"`

- [ ] **Scenario 3**: Mismatched source field → consumer port surfaces standard binding-walk error
    - **Given** a graph with a `source.api` whose field `pages` declares `kind: "Segment[]"` and a downstream `document.classify` whose `segment` input port has `kind: "Segment"` (single, not array) — both binding the ctx key `pages`
    - **When** `validateGraphConfig` runs
    - **Then** it emits a `GraphValidationError` anchored to `document.classify.segment` with the same wording as Phase 3's binding-walk error: `"Input port \`segment\` (Segment) on node \`<classify.id>\` reads from ctx key \`pages\`, written by node \`<source.id>\` (Segment[]) — Segment[] not assignable to Segment"`

- [ ] **Scenario 4**: Tests use synthetic catalog entries until Milestone C lands
    - **Given** the validator's binding-walk tests
    - **When** new test cases for Scenarios 1–3 are added
    - **Then** they fabricate `SourceCatalogEntry` test fixtures (mirrors the synthetic-fixture pattern used by US-093's tests before Phase 3 catalog fan-out)
    - **And** the new tests assert the producer enumeration + the cross-kind error wording verbatim

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/validator/validator.ts` — extend the binding-walk producer enumeration to include source nodes
- `packages/graph-workflow/src/validator/validator-binding-walk.test.ts` (existing from Phase 3) — add the 4 scenarios

## Technical notes

- The Phase 3 binding-walk pass (US-093) already accepts three sources of producer kinds: activity `PortDescriptor.kind?`, `CtxDeclaration.kind?`, `LibraryPortDescriptor.kind?`. This story adds a FOURTH: source-node outputs derived from the source catalog entry's `deriveOutputSchema` + per-field `kind?` (for source.api) or the catalog entry's `outputKind` (for source.upload).
- Resolution: the walker calls `getSourceCatalogEntry(sourceNode.sourceType)`; for source.api, it walks `sourceNode.parameters.fields[]` directly (each field's `name` IS the produced ctx key); for source.upload, it reads `sourceNode.parameters.ctxKey ?? "documentUrl"` and uses `entry.outputKind`.
- The walker treats source-node ctx producers identically to any other producer once resolved. No new error shape — same `GraphValidationError`.
- This story is "binding-walk only" — the existing L17 structural rules from US-109 still run first; if a `SourceNode` is structurally invalid, this pass short-circuits for that source.
