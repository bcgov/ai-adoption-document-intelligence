# US-170: `dyn.run` Temporal activity — `deno-runner` HTTP client

**As a** worker engineer wiring the dynamic-node execution path,
**I want** a single Temporal activity `dyn.run` that delegates to the `deno-runner` HTTP service with the right permission flags + ambient env vars + I/O wiring,
**So that** every dynamic node in every workflow executes through one tested boundary that surfaces failures as the typed errors from US-168 — and the worker process never has Deno on its host.

## Acceptance Criteria

- [ ] **Scenario 1**: Activity declared + registered alongside static activities
    - **Given** `apps/temporal/src/dynamic-nodes/dyn-run.activity.ts`
    - **When** the file is read after the change
    - **Then** it exports `async function dynRun(args: { slug, versionId, parameters, inputCtx, groupId, workflowRunId }): Promise<Record<string, unknown>>`
    - **And** the worker's activity registration in `apps/temporal/src/worker.ts` (or equivalent) registers `"dyn.run": dynRun`
    - **And** the activity body NEVER imports `node:child_process` — all Deno work goes through the runner

- [ ] **Scenario 2**: Permission flags computed + included in runner request
    - **Given** an invocation where `signature.allowNet = ["api.example.com"]` and `DYNAMIC_NODE_ALLOW_NET = "api.example.com,api.mistral.ai"` and the API_BASE_URL host is `localhost:3002`
    - **When** the activity composes the runner request
    - **Then** the request body's `allowNet` array is `["api.example.com", "localhost:3002"]` (intersected global + signature, plus API base host)
    - **And** the request does NOT request `--allow-read`, `--allow-write`, `--allow-run`, `--allow-ffi`, `--allow-sys`
    - **And** the runner enforces these flags when spawning the subprocess (per US-186)

- [ ] **Scenario 3**: Ambient env vars passed in the runner request body
    - **Given** the same invocation
    - **When** the activity composes the runner request
    - **Then** the request body's `ambientEnv` is exactly `{ AI_DI_API_BASE_URL, AI_DI_API_KEY, AI_DI_GROUP_ID, AI_DI_WORKFLOW_RUN_ID }` sourced from worker config + activity arguments
    - **And** NO other env vars from the worker's `process.env` are forwarded

- [ ] **Scenario 4**: HTTP call to the runner with proper timeouts
    - **Given** the runner request body
    - **When** the activity POSTs to `${DENO_RUNNER_URL}/execute`
    - **Then** the HTTP client uses `AbortSignal.timeout(signature.timeoutMs + 5000)` (slightly higher than the runner's own timeout so the runner fires first)
    - **And** the request body includes `{ script, inputCtx, parameters, allowNet, ambientEnv, timeoutMs: signature.timeoutMs ?? 60_000, maxMemoryMB: signature.maxMemoryMB ?? 256 }`
    - **And** on the runner's `timedOut: true` response, throws `DynamicNodeTimeoutError { slug, versionId, timeoutMs }`

- [ ] **Scenario 5**: Runner failures mapped to typed errors
    - **Given** the runner response
    - **When** the activity parses it
    - **Then** `exitCode != 0` → throws `DynamicNodeRuntimeError { exitCode, stderrTail: last 2 KB of response.stderr }`
    - **And** runner returns `{ stdoutTooLarge: true }` → throws `DynamicNodeStdoutTooLargeError { capBytes: 5242880 }`
    - **And** runner unreachable (network error / 5xx response) → throws a runtime error mapped to "deno runner unavailable" in `NodeRunStatus.errorMessage`

- [ ] **Scenario 6**: Output structural check + parse errors
    - **Given** a runner response with `exitCode: 0` and stdout `{"tables": [...]}` and a signature declaring `outputs: { tables: ... }`
    - **When** the activity validates the output
    - **Then** `JSON.parse(response.stdout)` succeeds and the parsed object is returned
    - **And** missing-declared-port throws `DynamicNodeOutputShapeError { slug, versionId, missingPorts: ["tables"] }`
    - **And** non-JSON stdout throws `DynamicNodeOutputInvalidJsonError { slug, versionId, stdoutHead: first 500 chars }`

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/temporal/src/dynamic-nodes/dyn-run.activity.ts` — new file
- `apps/temporal/src/dynamic-nodes/deno-runner.client.ts` — small typed HTTP client wrapping `/execute` (mirror of the backend's client from US-164)
- `apps/temporal/src/worker.ts` (or equivalent worker bootstrap) — register the activity
- `apps/temporal/src/dynamic-nodes/index.ts` — barrel re-export

## Technical notes

- The worker NEVER spawns Deno directly. All Deno work happens inside the `deno-runner` container deployed via US-186. The worker is a thin HTTP client.
- `DENO_RUNNER_URL` env var configures the runner endpoint (default `http://deno-runner:9090` in compose / cluster; `http://localhost:9090` in pure-local dev when running outside compose). Wire this into the worker's config alongside `AI_DI_BACKEND_URL_FOR_WORKER`.
- The activity's input `{ slug, versionId, parameters, inputCtx, groupId, workflowRunId }` is what the executor (US-171) passes. The activity reads `signature` + `allowNet` + `script` from `versionCache` (US-169) using `versionId`.
- API_BASE_URL host (`AI_DI_API_BASE_URL`) comes from a worker-config env var. Document the env var name in the worker README.
- `AI_DI_API_KEY` is the calling group's existing `x-api-key` value — propagated from the executor's invocation context. In 6.0 this is sourced from the original `/runs` request's `x-api-key` header, captured at workflow start and threaded through to `dynRun`.
- The 5-second HTTP client timeout buffer over the runner's own timeout guards against the runner being slow to return a `timedOut: true` response — the runner SHOULD return promptly when it kills the subprocess, but the buffer prevents an indefinite worker hang.
- After landing: no Vite restart (Temporal-only).
