# US-171: Executor-side version resolution in `graph-workflow.ts`

**As a** worker engineer wiring dynamic-node dispatch,
**I want** the graph executor to resolve `dyn.<slug>` + optional `dynamicNodeVersion` to an immutable `versionId` BEFORE invoking the `dyn.run` activity,
**So that** Phase 4's cache decorator naturally keys cache rows by `versionId` (no decorator changes) and republishing automatically invalidates head-pinned consumer caches.

## Acceptance Criteria

- [ ] **Scenario 1**: Executor detects `dyn.*` node types
    - **Given** `apps/temporal/src/workflows/graph-workflow.ts` (the per-node execute loop)
    - **When** the loop encounters a node whose `type.startsWith("dyn.")`
    - **Then** it branches into the dynamic-node resolution path (this story) BEFORE invoking the normal activity proxy
    - **And** non-`dyn.*` nodes go through the existing path unchanged

- [ ] **Scenario 2**: Lineage lookup by `(groupId, slug)` with deletion check
    - **Given** a node `type: "dyn.my-node"` in a workflow whose group is `groupId`
    - **When** the executor resolves the lineage
    - **Then** it queries `DynamicNode` by `(groupId, slug="my-node")` via a new Temporal activity `dynamicNode.resolveLineage` (kept short for cache-decorator independence)
    - **And** if the lineage's `deletedAt` is set, the activity throws `DynamicNodeDeletedError { slug }`
    - **And** if no row matches, the activity throws `DynamicNodeDeletedError` (same error class — "doesn't exist" and "soft-deleted" are indistinguishable to the workflow per the 404-vs-403 convention)

- [ ] **Scenario 3**: Version resolution (pinned vs head)
    - **Given** the lineage exists and is not deleted
    - **When** the node has `dynamicNodeVersion: 3`
    - **Then** the activity resolves `DynamicNodeVersion.findFirst({ dynamicNodeId, versionNumber: 3 })` and returns its `id`
    - **And** if no such version exists, throws `DynamicNodeVersionNotFoundError { slug, version: 3 }`
    - **And** when `dynamicNodeVersion` is undefined, the activity returns `DynamicNode.headVersionId`
    - **And** if head is null (shouldn't happen in 6.0 since no per-version delete), throws `DynamicNodeHeadMissingError { slug }`

- [ ] **Scenario 4**: Resolved `versionId` threads through to `dyn.run`
    - **Given** the lineage resolves to `versionId = "ck123..."`
    - **When** the executor invokes the activity
    - **Then** `dyn.run` is called with `{ slug, versionId, parameters: node.parameters, inputCtx: <consumed ctx slice>, groupId, workflowRunId }`
    - **And** Phase 4's cache decorator's `configHash` (over node.parameters + versionId + node id chain) naturally varies by `versionId` — republish → new versionId → cache miss → fresh execution

- [ ] **Scenario 5**: Executor + activity tests
    - **Given** `graph-workflow.test.ts` (or its existing equivalent)
    - **When** the suite runs
    - **Then** tests pass for: workflow with a `dyn.my-node` node executes through the resolution path; soft-deleted lineage causes a `DynamicNodeDeletedError`-flavored `NodeRunStatus.errorMessage`; pinned version threads through; head version threads through; head pointer change is picked up by the NEXT execution without restart

- [ ] **Scenario 6**: New `dynamicNode.resolveLineage` activity registered
    - **Given** the worker bootstrap
    - **When** activities are registered
    - **Then** the new short activity `dynamicNode.resolveLineage` is registered alongside `dyn.run`
    - **And** the activity is `nonCacheable: true` (lineage resolution must always re-read from DB to pick up head changes; cache would defeat the point)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/temporal/src/workflows/graph-workflow.ts` — extend per-node execute loop with the dyn.* branch
- `apps/temporal/src/dynamic-nodes/resolve-lineage.activity.ts` — new short activity
- `apps/temporal/src/worker.ts` (or equivalent) — register the new activity
- `apps/temporal/src/workflows/graph-workflow.test.ts` (or equivalent) — extend tests

## Technical notes

- Per Temporal's workflow determinism, the executor (running inside the workflow context) cannot do DB I/O directly — it must proxy through an activity. Hence the new `dynamicNode.resolveLineage` activity. Keep that activity's body trivial (one query, one decision tree).
- The cache decorator from Phase 4 hashes `(node.parameters, upstream chain, node id, versionId)` — versionId is included naturally because it's part of the `dyn.run` activity's input parameters which feed into `configHash`. Verify this works without decorator changes; if not, file a small follow-on.
- The `groupId` is available to the workflow via the existing workflow-start memo (Temporal search attribute set at workflow start).
- After landing: no Vite restart (Temporal + backend, no frontend).
