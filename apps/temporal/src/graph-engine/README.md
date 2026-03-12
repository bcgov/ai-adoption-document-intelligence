# Graph Engine (`apps/temporal/src/graph-engine`)

This folder contains the runtime execution engine for the generic DAG-based `graphWorkflow` in Temporal.

At a high level:
- `graph-workflow.ts` is the Temporal workflow entrypoint (queries, signals, validation, pre-execution hooks).
- `graph-engine/*` is the execution core that interprets a validated graph and runs nodes.
- Activities are resolved by type string via the worker's activity registration.

---

## Where It Fits in the System

End-to-end flow:
1. Backend receives OCR request and loads a workflow config for the document.
2. Backend starts Temporal workflow type `graphWorkflow` with:
   - `graph` (the DAG config),
   - `initialCtx` (document-specific runtime values),
   - `configHash`,
   - `runnerVersion`.
3. Temporal worker runs `graphWorkflow` from `apps/temporal/src/graph-workflow.ts`.
4. `graphWorkflow` validates config, initializes status/query/signal handlers, then calls `runGraphExecution(...)`.
5. `runGraphExecution(...)` executes the graph until completion/cancellation/failure.
6. Activities called by node executors run in the same worker process via Temporal activity registration.

Relevant integration files:
- Backend start path:
  - `apps/backend-services/src/ocr/ocr.service.ts`
  - `apps/backend-services/src/temporal/temporal-client.service.ts`
  - `apps/backend-services/src/temporal/workflow-types.ts`
- Temporal worker/workflow:
  - `apps/temporal/src/worker.ts`
  - `apps/temporal/src/graph-workflow.ts`
  - `apps/temporal/src/activity-registry.ts`
  - `apps/temporal/src/activity-types.ts`

---

## Engine Responsibilities

The graph engine is responsible for runtime execution semantics, not authoring-time validation:
- initialize runtime context from config defaults + input context,
- compute ready nodes according to graph dependencies and branch selections,
- execute ready nodes in deterministic batches (alphabetical sort),
- apply node-type-specific behavior (`activity`, `switch`, `map`, `join`, `pollUntil`, `humanGate`, `childWorkflow`),
- enforce node error policies (`fail`, `skip`, `fallback`),
- track status and expose enough state for workflow queries.

Authoring-time and defensive schema validation live outside this folder (graph schema validator files).

---

## Module Map

- `graph-runner.ts`
  - Main execution loop (`runGraphExecution`).
  - Cancellation checks (`immediate` before each batch, `graceful` after each batch).
  - Executes a batch of ready nodes in parallel.

- `graph-algorithms.ts`
  - `computeTopologicalOrder`: cycle detection using Kahn's algorithm over `normal` edges.
  - `computeReadySet`: chooses nodes whose relevant incoming dependencies are satisfied.
  - `computeReadySetForSubgraph`: scoped variant used by `map` branch execution.

- `node-executors.ts`
  - Node dispatch and concrete handlers.
  - Includes `executeBranchSubgraph` for `map` fan-out branch execution.

- `context-utils.ts`
  - Context initialization and read/write helpers.
  - Dot notation support plus namespace aliases:
    - `doc.*` -> `documentMetadata.*`
    - `segment.*` -> `currentSegment.*`

- `error-handling.ts`
  - Error extraction and policy-driven node error handling.
  - Poll timeout helper for `pollUntil`.

- `runner-utils.ts`
  - Concurrency-limited async execution helper.
  - Duration parser used by polling behavior.

- `execution-state.ts`
  - Shared mutable state contract used by the workflow entrypoint and engine.

---

## Execution Algorithm

`runGraphExecution(input, state)` runs in these phases:

1. **Prepare state**
   - Save `configHash` and `runnerVersion` into state (used by child workflows).
   - Build `ctx` from graph defaults overlaid by `initialCtx`.

2. **Structural guard**
   - Call topological sort to detect cycles (fails fast if cyclic).

3. **Main batch loop**
   - Compute ready set.
   - Sort ready node IDs alphabetically (deterministic batch order).
   - Execute all ready nodes concurrently with `Promise.all`.
   - Each node transitions through status updates (`running` -> `completed` / `failed` / `skipped`).

4. **Stop conditions**
   - No ready nodes -> workflow completes.
   - Immediate cancellation -> return `cancelled` before scheduling next batch.
   - Graceful cancellation -> return `cancelled` after current batch finishes.

Important nuance:
- Not all nodes are expected to complete in every run. Branches excluded by `switch` selection are intentionally not executed.

---

## Ready-Set Semantics

Readiness is branch-aware:
- `normal` edges are implicitly active if the source completed.
- For nodes that set an explicit selected edge (`switch`, fallback paths), only that selected edge is treated as active from that source.
- A candidate node is ready when:
  - it has at least one satisfied incoming edge, and
  - all relevant upstream sources that could still execute have completed.

This allows merge nodes after conditional branches to proceed when non-selected branches are unreachable.

---

## Node Type Semantics

### `activity`
- Validates `activityType` against workflow-safe registered constants.
- Resolves `inputs` from `ctx`, merges with static `parameters`.
- Calls activity through `proxyActivities`.
- Writes declared `outputs` back to `ctx`.

### `switch`
- Evaluates cases in order.
- Stores selected edge in `state.selectedEdges`.
- Does not mutate `ctx` directly.

### `map` + `join`
- `map` reads a collection from context and executes a branch subgraph per item.
- Branch contexts are isolated shallow copies of parent context plus item/index bindings.
- Parallelism is limited by `maxConcurrency` (default unbounded).
- Results are stored by map node ID and consumed by `join`.
- `join` currently supports strategy `all`; `any` is not implemented and fails fast.

### `pollUntil`
- Repeatedly invokes an activity and evaluates a condition over current context.
- Supports `initialDelay`, `interval`, `maxAttempts`, and optional overall timeout.
- Fails with non-retryable `POLL_TIMEOUT` on limit/timeout.

### `humanGate`
- Waits for a Temporal signal named by node config.
- On signal, writes payload to mapped outputs (or `<nodeId>Payload` if no outputs).
- If payload contains `approved: false`, fails with `HUMAN_GATE_REJECTED`.
- Timeout behavior controlled by `onTimeout` (`continue`, `fallback`, `fail`).

### `childWorkflow`
- Uses inline graph config or loads one via `getWorkflowGraphConfig` activity.
- Executes child `graphWorkflow` with inherited `configHash` and `runnerVersion`.
- Maps parent context to child input/output via port mappings.

---

## Error Handling Model

On node failure, engine captures normalized error details in `state.lastError` and applies `errorPolicy.onError`:
- `fail` (default): node marked failed, error rethrown.
- `skip`: node marked skipped and considered completed.
- `fallback`: requires a valid `error` edge from this node; engine selects that edge and continues.

If `retryable: false` on node error policy, failures are rethrown as non-retryable `ApplicationFailure`.

---

## Determinism and Operational Notes

- Ready node IDs are sorted alphabetically before execution to keep stable scheduling across runs.
- Topological cycle check uses only `normal` edges.
- Workflow-level observability/control is implemented in `graph-workflow.ts` via:
  - query: `getStatus`
  - query: `getProgress`
  - signal: `cancel` (`graceful` / `immediate`)
- A pre-execution hook in `graph-workflow.ts` updates document status before node execution begins.

---

## Testing Surface

Current tests covering this engine live in:
- `apps/temporal/src/graph-engine/graph-algorithms.test.ts`
- `apps/temporal/src/graph-engine/context-utils.test.ts`
- `apps/temporal/src/graph-engine/runner-utils.test.ts`
- `apps/temporal/src/graph-workflow.test.ts` (integration-level workflow behavior)

