# US-135: `getNodeStatusesQuery` Temporal query handler + `nodeStatuses` map

**As a** canvas polling for live run state,
**I want** the workflow definition in `graph-workflow.ts` to maintain a per-node status map AND expose it via a `getNodeStatusesQuery` Temporal query handler,
**So that** the backend can read point-in-time status without race conditions or eventual-consistency lag.

## Acceptance Criteria

- [x] **Scenario 1**: `NodeRunStatus` type + query definition
    - **Given** `apps/temporal/src/workflows/graph-workflow-queries.ts` (new file)
    - **When** read
    - **Then** it exports `interface NodeRunStatus { status: "pending" | "running" | "succeeded" | "failed" | "skipped"; startedAt?: string; endedAt?: string; errorMessage?: string; cacheHit?: { configHash: string; inputHash: string } }`
    - **And** it exports `const getNodeStatusesQuery = defineQuery<Record<string, NodeRunStatus>>("getNodeStatuses")` (from `@temporalio/workflow`)

- [x] **Scenario 2**: Workflow body maintains `nodeStatuses` map
    - **Given** `apps/temporal/src/workflows/graph-workflow.ts`
    - **When** read after the change
    - **Then** the workflow body declares `const nodeStatuses: Record<string, NodeRunStatus> = {}` at the top
    - **And** before each node execution: `nodeStatuses[node.id] = { status: "running", startedAt: new Date().toISOString() }`
    - **And** on success (from US-133's `executeCachedActivity` returning `{ cacheHit: false }`): `nodeStatuses[node.id] = { status: "succeeded", startedAt: prevStartedAt, endedAt: new Date().toISOString() }`
    - **And** on cache hit (`{ cacheHit: true }`): `nodeStatuses[node.id] = { status: "skipped", startedAt: prevStartedAt, endedAt: new Date().toISOString(), cacheHit: { configHash, inputHash } }`

- [x] **Scenario 3**: Failure path records error message
    - **Given** a node whose underlying activity throws
    - **When** the workflow catches the error
    - **Then** `nodeStatuses[node.id] = { status: "failed", startedAt: ..., endedAt: ..., errorMessage: error.message }` BEFORE the error propagates up
    - **And** the existing fallback-policy / error-handling chain is unchanged (the status update is added, not replaced)

- [x] **Scenario 4**: Query handler returns the map
    - **Given** the workflow start
    - **When** the workflow body runs
    - **Then** `setHandler(getNodeStatusesQuery, () => nodeStatuses)` is called once near the start of the workflow body (so the handler is registered before any activity runs)

- [x] **Scenario 5**: Untouched nodes stay absent from the map
    - **Given** a graph with branches the workflow doesn't take (e.g., a `switch` selects case A; case B's downstream nodes never execute)
    - **When** the canvas polls
    - **Then** untouched node ids are absent from the returned map
    - **And** the canvas treats absent ≡ pending (US-138 covers the frontend half)

- [x] **Scenario 6**: Temporal-side test for the query handler
    - **Given** `apps/temporal/src/workflows/graph-workflow.spec.ts`
    - **When** tests run
    - **Then** at least 2 new cases pass: (a) execute a 3-node workflow, query mid-execution, assert nodes 1+2 are "running"/"succeeded" and node 3 is absent; (b) execute a workflow with a cache-hit on node 1, assert its status is "skipped" with `cacheHit` populated

## Implementation notes

- Files are named without the `workflows/` directory prefix from the story (the actual workflow lives at `apps/temporal/src/graph-workflow.ts`, not `apps/temporal/src/workflows/graph-workflow.ts`). Test framework is Jest with `.test.ts` extension, not `.spec.ts`.
- Scenario 6 case (b) cache-hit is tested at the graph-runner level (`apps/temporal/src/graph-engine/graph-runner.node-run-statuses.test.ts`) rather than via the in-VM `TestWorkflowEnvironment`, because `executeCachedActivity` calls `sha256Hex` which depends on `TextEncoder`, and `TextEncoder` is not defined in Temporal's workflow sandbox isolate. The same Jest-mock pattern as `graph-runner.cache-integration.test.ts` (mocks `@temporalio/workflow` so the runner exits the workflow VM) is used. Scenarios 3 + 5 are likewise tested at the runner level — completed-workflow queries against a `runUntil`-drained worker hang because replay needs a live worker.
- The in-VM `graph-workflow.test.ts` covers Scenario 6 case (a): a 3-node linear workflow where the first activity gates node A, the third activity gates node C; mid-execution query returns `a: succeeded, b: succeeded, c: running` (also exercising Scenarios 2 + 4 + 5).

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/temporal/src/workflows/graph-workflow-queries.ts` — new file (`NodeRunStatus` + `getNodeStatusesQuery`)
- `apps/temporal/src/workflows/graph-workflow.ts` — extend with the status map + handler + per-node updates
- `apps/temporal/src/workflows/graph-workflow.spec.ts` — new tests
- Re-exports from `apps/temporal/src/workflows/index.ts` if applicable

## Technical notes

- `defineQuery` + `setHandler` come from `@temporalio/workflow` — the standard Temporal SDK primitives. No new dependency.
- The query handler MUST be installed in the workflow body, not in an activity — query handlers live on the workflow execution.
- The handler is read-only (returns a snapshot of the in-memory map). Temporal handles serialisation to JSON for the client.
- This story coordinates with US-133's `executeCachedActivity` — that decorator returns `{ cacheHit }`, which this story consumes to drive the "skipped" vs "succeeded" status flip.
- No frontend or shared-package change here — purely workflow-side.
