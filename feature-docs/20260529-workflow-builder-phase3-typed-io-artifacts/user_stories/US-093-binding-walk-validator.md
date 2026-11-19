# US-093: Binding-walk type-check pass in `validateGraphConfig`

**As a** workflow author saving a graph with typed ctx bindings,
**I want** the backend to catch kind mismatches at save time, anchored to the consumer port,
**So that** I see a precise error before the workflow tries to run with incompatible data.

## Acceptance Criteria

- [x] **Scenario 1**: Producer → consumer kind mismatch surfaces a `GraphValidationError`
    - **Given** a workflow with two nodes where node A's output port has `kind: "Document"` writing ctx key `docRef`, and node B's input port has `kind: "Segment"` reading the same ctx key
    - **When** `validateGraphConfig` runs (e.g. from `POST /api/workflows` save or `POST /api/workflows/:id/runs` validation path)
    - **Then** an error is emitted with `severity: "error"`, `nodeId: <B's id>`, `port: <consumer port name>`
    - **And** `message` matches: `"Input port \`<cport>\` (Segment) on node \`<B>\` reads from ctx key \`docRef\`, written by node \`<A>\` (Document) — Document not assignable to Segment"`
    - **And** the existing Phase 1A red node badge + error drawer surface this error against node B (visual confirmation deferred to Milestone G)

- [x] **Scenario 2**: Multi-producer mismatch — every producer must be assignable
    - **Given** a switch with two branches; branch 1's node A writes `kind: "Document"` to ctx `out`, branch 2's node B writes `kind: "Reference"` to ctx `out`; downstream consumer C reads `out` with `kind: "Document"`
    - **When** validated
    - **Then** an error anchors to consumer C's port, naming the offending producer B and its kind ("Reference not assignable to Document")
    - **And** A's contribution does NOT emit an error (it's assignable to itself)
    - **And** the error message includes the offending producer's node id + the consumer's node id (so the user can find both surfaces)

- [x] **Scenario 3**: Kind resolves through all three sources interchangeably
    - **Given** three workflows: (a) producer is an activity output with `PortDescriptor.kind: "Document"`; (b) producer is a manually-declared `CtxDeclaration.kind: "Document"` (workflow entry-point input); (c) producer is a library `LibraryPortDescriptor.kind: "Document"` on a `childWorkflow` node
    - **When** each is validated against a consumer expecting `"Segment"`
    - **Then** all three produce the same kind-mismatch error
    - **And** when the consumer expects `"Document"` instead, all three pass silently
    - **And** the resolution helper `resolvePortKind(node, portName, direction, graph)` consults the three sources in order: activity catalog `PortDescriptor.kind` → `CtxDeclaration.kind` → `LibraryPortDescriptor.kind`

- [x] **Scenario 4**: Missing kind on either side defaults to `Artifact` wildcard
    - **Given** a producer port with no `kind` declared (legacy entry) writing ctx `x`, and a consumer port with `kind: "Document"`
    - **When** validated
    - **Then** NO error is emitted (producer treated as `Artifact`; `isAssignable("Artifact", "Document")` is `false` — wait, this is the wildcard case: the consumer's typed expectation does NOT make the legacy producer surface an error, because legacy producers are unannotated and writing into a typed slot is permitted as a wildcard via the `undefined`-collapses-to-`Artifact` rule from US-091 Scenario 4)
    - **And** symmetrically, a typed producer + untyped consumer (consumer's `kind` is undefined) also passes — undefined consumer = wildcard accepts anything
    - **And** the binding-walk only surfaces an error when BOTH sides declare a `kind` AND `isAssignable(producerKind, consumerKind)` is `false`

- [x] **Scenario 5**: Cleanly typed graph passes
    - **Given** a graph using the Phase 3 exemplars (e.g. `document.split` → `Segment[]` ctx key → `document.classify` input with `kind: "Segment"`)
    - **When** validated
    - **Then** no kind errors are emitted
    - **And** the existing Phase 1A validation passes (ports bound, schemas valid, etc.)

- [x] **Scenario 6**: Backend test suite stays green
    - **Given** the new pass + the new tests
    - **When** `npm test` runs in `apps/backend-services/` and `packages/graph-workflow/`
    - **Then** both succeed
    - **And** the package validator test count grows by at least 5 new cases covering scenarios 1-5
    - **And** existing Phase 2 validation tests (library schemas, switch cases, durations) remain green

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/validator/validator.ts` — add binding-walk pass; introduce `resolvePortKind` helper
- `packages/graph-workflow/src/validator/validator.test.ts` — new cases per scenarios 1-5
- `apps/backend-services/src/workflow/workflow.service.spec.ts` (if applicable) — regression test that a kind mismatch surfaces through the existing save endpoint as a 400 with the right error shape

## Technical notes

- The walker iterates over ctx keys, not edges. Build a `Map<ctxKey, { producers: Array<{ node, port, kind }>, consumers: Array<{ node, port, kind }> }>` by scanning every node's `inputs[]` + `outputs[]` bindings.
- "Bindings" come from the existing `PortBinding { port, ctxKey }` shape — already wired through `node.inputs[]` / `node.outputs[]`.
- Use `isAssignable(undefined, anything) === true` and `isAssignable(anything, undefined) === true` per US-091 Scenario 4 — keep the call sites simple.
- The walker MUST not change wire-validation behaviour; wires stay execution-order arrows per Model A.
- Error format matches the existing `GraphValidationError` shape used by Phase 1A's error drawer. No new error shape.
