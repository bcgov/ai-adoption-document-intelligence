# US-170: `dyn.run` Temporal activity — Deno subprocess runner

**As a** worker engineer wiring the dynamic-node execution path,
**I want** a single Temporal activity `dyn.run` that spawns a Deno subprocess with the right permission flags + ambient env vars + I/O wiring,
**So that** every dynamic node in every workflow executes through one tested boundary that surfaces failures as the typed errors from US-168.

## Acceptance Criteria

- [ ] **Scenario 1**: Activity declared + registered alongside static activities
    - **Given** `apps/temporal/src/dynamic-nodes/dyn-run.activity.ts`
    - **When** the file is read after the change
    - **Then** it exports `async function dynRun(args: { slug, versionId, parameters, inputCtx, groupId, workflowRunId }): Promise<Record<string, unknown>>`
    - **And** the worker's activity registration in `apps/temporal/src/worker.ts` (or equivalent) registers `"dyn.run": dynRun`

- [ ] **Scenario 2**: Deno permission flags computed correctly
    - **Given** an invocation where `signature.allowNet = ["api.example.com"]` and `DYNAMIC_NODE_ALLOW_NET = "api.example.com,api.mistral.ai"` and the API_BASE_URL host is `localhost:3002`
    - **When** the activity computes flags
    - **Then** the spawn arguments are `["run", "--allow-net=api.example.com,localhost:3002", "--allow-env=AI_DI_API_BASE_URL,AI_DI_API_KEY,AI_DI_GROUP_ID,AI_DI_WORKFLOW_RUN_ID", "--no-prompt", "--v8-flags=--max-old-space-size=256", tempPath]`
    - **And** `--allow-read`, `--allow-write`, `--allow-run`, `--allow-ffi`, `--allow-sys` are NOT present

- [ ] **Scenario 3**: Ambient env vars injected into subprocess
    - **Given** the same invocation
    - **When** the subprocess is spawned
    - **Then** the subprocess's environment contains exactly `AI_DI_API_BASE_URL`, `AI_DI_API_KEY`, `AI_DI_GROUP_ID`, `AI_DI_WORKFLOW_RUN_ID` — sourced from backend config + activity arguments
    - **And** NO other env vars from the worker's `process.env` leak through (spawn `env: { ...ambient }` not `env: { ...process.env, ...ambient }`)

- [ ] **Scenario 4**: stdin/stdout/stderr wired per the design
    - **Given** the spawn
    - **When** the subprocess runs
    - **Then** the activity writes `JSON.stringify({ inputCtx, parameters }) + "\n"` to stdin and immediately ends stdin
    - **And** the activity buffers stdout (cap 5 MB → `DynamicNodeStdoutTooLargeError`) and stderr (no cap during run)
    - **And** on stdout-too-large the subprocess is SIGKILLed before the cap is exceeded

- [ ] **Scenario 5**: Timeout SIGKILLs the subprocess + throws `DynamicNodeTimeoutError`
    - **Given** a script that sleeps longer than `signature.timeoutMs ?? 60000`
    - **When** the timeout fires
    - **Then** the activity kills the subprocess and throws `DynamicNodeTimeoutError { slug, versionId, timeoutMs }`
    - **And** no partial output is written to the cache

- [ ] **Scenario 6**: Output structural check + parse errors
    - **Given** a subprocess that exits 0 with stdout `{"tables": [...]}` and a signature declaring `outputs: { tables: ... }`
    - **When** the activity validates the output
    - **Then** the parsed object is returned as the activity's result
    - **And** missing-declared-port throws `DynamicNodeOutputShapeError { slug, versionId, missingPorts: ["tables"] }`
    - **And** non-JSON stdout throws `DynamicNodeOutputInvalidJsonError { slug, versionId, stdoutHead: first 500 chars }`

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/temporal/src/dynamic-nodes/dyn-run.activity.ts` — new file
- `apps/temporal/src/worker.ts` (or equivalent worker bootstrap) — register the activity
- `apps/temporal/src/dynamic-nodes/index.ts` — barrel re-export

## Technical notes

- Spawn via `node:child_process.spawn("deno", argv, { env, stdio: ["pipe", "pipe", "pipe"] })`. Use `AbortController` for the timeout — wired into the spawn options.
- The activity's input `{ slug, versionId, parameters, inputCtx, groupId, workflowRunId }` is what the executor (US-171) passes. The activity reads `signature` + `allowNet` from `versionCache` (US-169) using `versionId`.
- API_BASE_URL host comes from a backend config / env shared with the worker (not the Temporal client config). Document the env var name (e.g. `AI_DI_BACKEND_URL_FOR_WORKER`) in the worker README.
- `AI_DI_API_KEY` is the calling group's existing `x-api-key` value — propagated from the executor's invocation context. In 6.0 this is sourced from the original `/runs` request's `x-api-key` header, captured at workflow start and threaded through to `dynRun`.
- After landing: no Vite restart (Temporal-only).
