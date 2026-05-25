# US-129: `compute-input-hash.ts` — consumed-input hash

**As a** worker decorator computing the cache key for a node about to execute,
**I want** a `computeInputHash(node, ctx)` helper that collects the ctx values consumed by the node's input port bindings and produces a stable SHA-256 hash,
**So that** any change in an upstream node's output (which flows into this node's ctx-key reads) automatically invalidates this node's cache row.

## Acceptance Criteria

- [ ] **Scenario 1**: Collect ctx values for each port binding
    - **Given** `packages/graph-workflow/src/cache/compute-input-hash.ts`
    - **When** the new file is read
    - **Then** it exports `function computeInputHash(node: GraphNode, ctx: Record<string, unknown>): string`
    - **And** for `node.inputs = [{ port: "doc", ctxKey: "documentUrl" }, { port: "rules", ctxKey: "validationRules" }]` and `ctx = { documentUrl: "...", validationRules: [...], unrelated: 1 }`, the helper builds `{ doc: ctx.documentUrl, rules: ctx.validationRules }` — ignoring `ctx.unrelated`

- [ ] **Scenario 2**: Empty / absent `node.inputs` returns the empty-object hash
    - **Given** a node with no `inputs` or `inputs: []`
    - **When** `computeInputHash(node, ctx)` is called
    - **Then** the result is `sha256("{}")` — the canonical empty-hash sentinel
    - **And** different nodes with no inputs all share this hash (their cache keys are differentiated by `nodeId` + `configHash` only)

- [ ] **Scenario 3**: Document / Segment ctx values are content-hashed via `hashArtifact`
    - **Given** a node whose binding reads a Document-shaped ctx value
    - **When** the helper builds the consumed map
    - **Then** the Document is normalised via `hashArtifact()` (US-128) BEFORE the outer `stableJson` runs
    - **And** the consumed map's hashed shape uses the artifact's content hash as the value — so two ctx slots referencing the same content produce the same inputHash regardless of presigned URL differences

- [ ] **Scenario 4**: Primitive ctx values pass through `stableJson` directly
    - **Given** a node whose binding reads a primitive value (string, number, boolean)
    - **When** the helper runs
    - **Then** the value appears in the consumed map verbatim (no `hashArtifact` normalisation)
    - **And** the final hash is `sha256(stableJson({ [port]: ctx[ctxKey], ... }))` — straightforward chain through US-127's helper

- [ ] **Scenario 5**: Missing ctx key produces a stable sentinel
    - **Given** a node whose binding references a `ctxKey` not present in `ctx` (legitimate during graph mid-edit OR for optional inputs)
    - **When** the helper runs
    - **Then** the missing slot is recorded as `null` in the consumed map (NOT `undefined`, which `stableJson` would omit)
    - **And** two nodes both missing the same ctxKey produce the same hash

- [ ] **Scenario 6**: Unit tests + barrel re-export
    - **Given** `packages/graph-workflow/src/cache/compute-input-hash.test.ts`
    - **When** tests run
    - **Then** at least 7 cases pass covering: empty inputs, single primitive input, multiple bindings, Document-content normalisation, missing ctxKey, port order independence (two bindings in different declared order produce the same hash — sorted by port name in the consumed map), and the unrelated-ctx-keys-don't-leak case

## Priority
- [ ] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/cache/compute-input-hash.ts` — implementation
- `packages/graph-workflow/src/cache/compute-input-hash.test.ts` — vitest unit tests
- `packages/graph-workflow/src/index.ts` — barrel re-export

## Technical notes

- `GraphNode` is imported from `../types`; `PortBinding` shape is `{ port: string, ctxKey: string }` (Phase 1A schema).
- Implementation: iterate `node.inputs ?? []`, build `consumed[binding.port] = hashArtifact-or-passthrough(ctx[binding.ctxKey])`, then hash `stableJson(consumed)`. Use the artifact normaliser path when the value's shape matches a known artifact; otherwise pass through the primitive path.
- Source nodes (Phase 8) have no `inputs[]` — they hash to the empty-object sentinel, which is correct: their "inputs" (the inbound API body or uploaded file) are captured at workflow start via a different path (the source-merge step writes their cache row's `inputHash` from the payload, not from `computeInputHash`).
- After landing: **ask Alex to restart Vite** (new runtime export).
