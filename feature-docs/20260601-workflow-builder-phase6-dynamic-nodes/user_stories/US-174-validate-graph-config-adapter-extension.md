# US-174: `validateGraphConfig` adapter extension for binding-walk with dynamic nodes

**As a** backend engineer ensuring typed I/O continues to enforce port-kind compatibility,
**I want** the existing `validateGraphConfig` catalog adapter to load the workflow's group's dynamic nodes before binding-walk runs,
**So that** kind mismatches at workflow save time produce the same Phase 3 error wording for dynamic nodes as for static activities.

## Acceptance Criteria

- [ ] **Scenario 1**: Adapter loads group dynamic nodes asynchronously
    - **Given** the existing `validateGraphConfig` entrypoint (from Phase 1B catalog adoption)
    - **When** validation runs for a workflow with `groupId`
    - **Then** before the binding-walk pass starts, the adapter loads the group's non-deleted dynamic nodes (head versions) via the same path US-173 uses
    - **And** the adapter exposes a unified `getEntry(type)` that resolves both `static-catalog` types and `dyn.*` types

- [ ] **Scenario 2**: Binding-walk error wording unchanged for dynamic nodes
    - **Given** a workflow with a `dyn.uppercase-doc` node (outputs Document) feeding a `dyn.classify-segment` consumer (expects Segment)
    - **When** the workflow is saved (or `validateGraphConfig` is called directly)
    - **Then** the error is `"Input port \`segment\` (Segment) on node \`classify1\` reads from ctx key \`docOut\`, written by node \`uppercase1\` (Document) — Document not assignable to Segment"`
    - **And** the exact wording from Phase 3 US-093 is preserved — same `validateBindings` walker, just resolved through the merged catalog

- [ ] **Scenario 3**: Cross-mix mismatches detected
    - **Given** a workflow wiring a static `document.split` (outputs Segment[]) to a `dyn.process-segments` consumer (expects Document)
    - **When** validation runs
    - **Then** the error surfaces with the standard Phase 3 wording — proving the merge resolves both flavors uniformly

- [ ] **Scenario 4**: Version-pin honored in validation
    - **Given** a workflow with a node pinned to `dyn.my-node` `dynamicNodeVersion: 3` whose v3 declares Segment in/out, AND head (v5) declares Document in/out
    - **When** validation runs at save time
    - **Then** the adapter uses v3's signature (the pinned version) for the kind lookup, NOT head's
    - **And** if the consumer's port expects Segment, validation passes (head's change is irrelevant to the pinned node)

- [ ] **Scenario 5**: Unit + integration tests
    - **Given** `validateGraphConfig`'s test suite + a new `dynamic-node-binding-walk.spec.ts`
    - **When** the suites run
    - **Then** tests pass for: dynamic→dynamic mismatch, static→dynamic mismatch, dynamic→static mismatch, version-pin uses the pinned signature, soft-deleted lineage causes a validator error `"Workflow references deleted dynamic node 'dyn.<slug>'"`

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflows/validate-graph-config.ts` (or wherever the adapter lives) — extend with the dynamic-node load step
- `apps/backend-services/src/workflows/dynamic-node-binding-walk.spec.ts` — new test file
- `packages/graph-workflow/src/validator/` — no changes (the `validateBindings` walker already takes a catalog adapter)

## Technical notes

- The validator's catalog adapter from Phase 1B closeout already accepts an injectable catalog map. This story extends the construction of that map at the backend boundary; the walker stays pure.
- Soft-deleted lineage detection: when the workflow references a `dyn.<slug>` and the group's dynamic nodes don't include that slug (because soft-deleted), the validator emits the deletion error — separate from binding-walk's kind-mismatch errors.
- Async loading: the validator becomes async at the adapter-construction layer. If the walker itself becomes async, that's a bigger refactor — try to keep the walker sync by pre-loading dynamic nodes up front.
- After landing: no Vite restart (backend-only).
