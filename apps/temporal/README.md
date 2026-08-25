# Temporal Graph Workflow Worker

Temporal worker application for executing graph-defined document workflows.

## What Runs Here

- Workflow type: `graphWorkflow` (`src/graph-workflow.ts`)
- DAG execution engine: `src/graph-engine/*`
- Activities: `src/activities/*` (registered through `src/activity-registry.ts`)

Backend starts executions through:
- `apps/backend-services/src/temporal/temporal-client.service.ts`

## Setup

```bash
npm install
npm run db:generate
npm run build
```

Start worker:

```bash
npm run dev
```

or

```bash
npm start
```

## Common Scripts

- `npm run build`
- `npm run dev`
- `npm run start`
- `npm run test`
- `npm run type-check`

## Testing Scope

- Graph workflow integration: `src/graph-workflow.test.ts`
- Graph engine unit tests: `src/graph-engine/*.test.ts`
- Validator/expression tests
- Activity tests: `src/activities/*.test.ts`
- Dynamic-node tests: `src/dynamic-nodes/*.test.ts` (US-168 → US-172)

### Integration tests against the `deno-runner` sidecar

The Phase 6 `dyn.run` activity is a thin HTTP client to the `deno-runner`
container; its end-to-end tests live in
`src/dynamic-nodes/dyn-run.activity.integration.test.ts` (US-172) and run
against a live runner. **Before `npm test` start the runner:**

```bash
docker compose -f deployments/local/docker-compose.deno.yml up -d
```

The suite is opt-in: it runs only when `RUN_INTEGRATION=1` is set (and
reports as skipped otherwise). When opted in, an unreachable runner FAILS
the suite loudly rather than passing silently — a missing dependency must
surface.

## Dynamic-node runtime dependencies

The Phase 6 dynamic-node execution path delegates every Deno invocation
to the **`deno-runner`** HTTP service. The worker process NEVER spawns
Deno locally.

| Env var | Default | Purpose |
|---|---|---|
| `DENO_RUNNER_URL` | `http://localhost:9099` (local dev), `http://deno-runner:9090` (compose / OpenShift) | Base URL for the `dyn.run` activity's HTTP calls. |
| `AI_DI_API_BASE_URL` | `http://localhost:3002` | Sourced from worker config; injected into the Deno subprocess as ambient env so dynamic-node scripts can call back into the platform. Its host is auto-granted in the subprocess's `--allow-net` allow-list. |
| `DYNAMIC_NODE_ALLOW_NET` | (empty) | Comma-separated host allow-list intersected with each dynamic node's `@allowNet` signature tag at activity time. |

The `AI_DI_API_KEY` ambient env var is NOT a worker env and carries no
long-lived credential: for every invocation the `dyn.run` activity mints a
short-lived internal token (an `internal_token` row scoped to the group
owning the running workflow, 120 s TTL, only its SHA-256 hash stored) and
injects the raw value as `AI_DI_API_KEY`. The backend accepts it on the
`x-internal-token` header, so a script can only ever act as its own group.
The row is deleted when the invocation ends; expiry plus the backend's
hourly sweep clean up anything left behind. The `AI_DI_GROUP_ID` and
`AI_DI_WORKFLOW_RUN_ID` ambient vars are sourced from
`GraphWorkflowInput.groupId` and `workflowInfo().workflowId`
respectively.

## Static Assets

### `osd.traineddata`

This file is Tesseract's **Orientation and Script Detection** trained model, required by the `document.normalizeOrientation` activity. It must be present in `apps/temporal/` at runtime.

Without it, `createWorker("osd", OEM.TESSERACT_ONLY)` will fail when the activity attempts to detect page rotation. Tesseract.js can download language data at runtime, but committing this file avoids network dependency in containers and local dev.

**Do not delete this file.**


