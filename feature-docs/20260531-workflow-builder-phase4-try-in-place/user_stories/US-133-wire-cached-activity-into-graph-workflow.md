# US-133: Wire `executeCachedActivity` into `graph-workflow.ts` per-node dispatch

**As a** workflow run executing on the Temporal worker,
**I want** every per-node activity invocation in `apps/temporal/src/workflows/graph-workflow.ts` routed through the `executeCachedActivity` decorator,
**So that** cache reads/writes happen automatically for every node without each activity having to be cache-aware.

## Acceptance Criteria

- [ ] **Scenario 1**: Activity dispatch swap
    - **Given** the current `graph-workflow.ts` per-node activity-dispatch helper (the existing function that maps `node.activityType` → activity proxy + calls it)
    - **When** the file is read after the change
    - **Then** the call site is wrapped: `const { cacheHit } = await executeCachedActivity(node, ctx, workflowLineageId, () => activityProxy[activityType](node, ctx))`
    - **And** the workflow's `nodeStatuses` map (US-135 lands the map; this story coordinates with it via a small status-update callback OR a sentinel passed via the `cacheHit` return)

- [ ] **Scenario 2**: `workflowLineageId` plumbed through from workflow input
    - **Given** the workflow's input arguments (which already include `workflowId` and `version`)
    - **When** the workflow starts
    - **Then** `workflowLineageId` is read from the start-of-workflow `getWorkflowGraphConfig` call (which already resolves lineage and version per Phase 2 Track 3) and held in workflow-local state for the duration
    - **And** every `executeCachedActivity` call passes the same value

- [ ] **Scenario 3**: Source-node ctx-merge writes its own cache row at workflow start
    - **Given** a workflow starting with a source node (Phase 8)
    - **When** the worker performs the ctx-merge step (capturing the inbound API body or upload result into `initialCtx`)
    - **Then** the worker writes a cache row for the source node: `(workflowLineageId, sourceNodeId, configHash=sha256(stableJson(sourceNode.parameters ?? {})), inputHash=sha256(stableJson(initialCtx)), outputCtx=initialCtx, outputKind=sourceCatalogEntry.outputKind)`
    - **And** downstream nodes then see the source's "output" in ctx the same way they would a regular activity's output

- [ ] **Scenario 4**: Non-activity node types are unchanged
    - **Given** control-flow node types (`switch`, `map`, `join`, `childWorkflow`, `pollUntil`, `humanGate`)
    - **When** the workflow executes them
    - **Then** their existing execution path is unchanged — `executeCachedActivity` only wraps the `activity` and `source` node types
    - **And** TS exhaustiveness on the node-type discriminator is preserved (no missing case)

- [ ] **Scenario 5**: Temporal + backend test-suites green
    - **Given** the workflow change
    - **When** `npm test` runs in `apps/temporal` AND `apps/backend-services`
    - **Then** existing Phase 1A → Phase 8 tests pass unchanged
    - **And** at least 2 new tests cover: (a) workflow execution writes a cache row after each activity, (b) workflow execution short-circuits on a pre-populated cache row

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/temporal/src/workflows/graph-workflow.ts` — wire the decorator into per-node dispatch + add source-node ctx-merge cache write
- `apps/temporal/src/workflows/graph-workflow.spec.ts` (if exists; otherwise integration coverage via the existing Temporal harness) — new cache-write + cache-hit cases

## Technical notes

- This story is the load-bearing wiring step. Until it lands, the worker decorator (US-132) is dead code — no production caching happens.
- The source-node ctx-merge cache write (Scenario 3) is the half of L16 that runs in the workflow. The other half (the `outputKind` annotation in the cache row) reads from the source catalog entry — already exported by Phase 8.
- `workflowLineageId` is per-org, so cache rows automatically inherit org-scoped tenancy without explicit org-id plumbing.
- After landing: **ask Alex to restart Vite** is not needed for this story (apps/temporal change only). Backend doesn't need a restart either (Prisma-only).
