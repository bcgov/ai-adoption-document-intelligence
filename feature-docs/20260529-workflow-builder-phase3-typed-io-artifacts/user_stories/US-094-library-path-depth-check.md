# US-094: Library `metadata.inputs[].path` depth-check in `validateGraphConfig`

**As a** library publisher,
**I want** the validator to reject a library save when an `inputs[].path` or `outputs[].path` doesn't resolve to a real ctx key / output binding source in the graph,
**So that** I don't ship a library whose declared signature points at something the graph doesn't actually expose.

## Acceptance Criteria

- [ ] **Scenario 1**: Path resolving to a declared ctx key passes
    - **Given** a library workflow whose `metadata.ctx.documentUrl` exists, and `metadata.inputs: [{ label: "Document URL", path: "ctx.documentUrl", type: "string" }]`
    - **When** `validateGraphConfig` runs
    - **Then** no error is emitted for the input
    - **And** the same passes for `path` referencing an output of an existing node (e.g. `nodes.classify.outputs.segmentType` style — match whatever path syntax Phase 2 Track 1 settled on)

- [ ] **Scenario 2**: Path referencing a non-existent ctx key fails
    - **Given** `metadata.inputs: [{ label: "Foo", path: "ctx.fooThatDoesntExist", type: "string" }]` and no `metadata.ctx.fooThatDoesntExist` declared
    - **When** validated
    - **Then** an error is emitted with `severity: "error"`, anchored to the workflow root (no `nodeId` — or `nodeId: null` matching whatever Phase 1A's root-error convention is)
    - **And** `message` matches: `"Library input \`Foo\` path \`ctx.fooThatDoesntExist\` does not resolve to a declared ctx key or node output in this graph"`

- [ ] **Scenario 3**: Path referencing a node output that doesn't exist fails
    - **Given** `metadata.outputs: [{ label: "Result", path: "nodes.missingNode.outputs.x", type: "object" }]` with no node id `missingNode` in the graph
    - **When** validated
    - **Then** an error analogous to Scenario 2 surfaces, naming the missing node + the offending `path`

- [ ] **Scenario 4**: Pre-Phase-3 libraries without `inputs[]` / `outputs[]` continue to validate cleanly
    - **Given** a regular (non-library) workflow OR a library workflow with `metadata.inputs: []` / `metadata.outputs: []`
    - **When** validated
    - **Then** no depth-check errors fire (nothing to check)
    - **And** existing Phase 2 Track 1 tests around library schemas remain green

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/validator/validator.ts` — add depth-check pass (sibling to US-093's binding-walk; iterates `metadata.inputs[]` + `metadata.outputs[]` against the graph's ctx keys + node ids)
- `packages/graph-workflow/src/validator/validator.test.ts` — new cases per scenarios 1-3 + a smoke case asserting Scenario 4

## Technical notes

- This is the Phase 2 follow-up explicitly filed for Phase 3 (per REQUIREMENTS.md §3.2 D14).
- Path syntax follows whatever Phase 2 Track 1 settled on — re-read `feature-docs/20260526-workflow-builder-phase2-library-workflows/REQUIREMENTS.md` if unclear before implementing.
- Errors anchored to the workflow root (not a specific node) match the existing Phase 1A convention for graph-level errors (e.g. missing required ctx entries). Use the same shape.
- This check fires regardless of whether `kind` is declared on the descriptor — the path-resolution failure is orthogonal to the kind-mismatch error from US-093.
