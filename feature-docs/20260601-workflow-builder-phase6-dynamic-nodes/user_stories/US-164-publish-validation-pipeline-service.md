# US-164: `DynamicNodesService` publish-time validation pipeline (parser + `deno check` + allowlist)

**As a** backend engineer building the publish flow,
**I want** a service that orchestrates the four publish-time validation stages (jsdoc-parse → signature-semantics → ts-check → allowlist) and persists on success,
**So that** the `POST` / `PUT` controllers (US-165/US-166) delegate the entire publish flow to one tested boundary that emits structured `ParseError[]` the Phase 7 agent can revise from.

## Acceptance Criteria

- [ ] **Scenario 1**: Service orchestrates the four stages in order
    - **Given** a `script: string` input
    - **When** `dynamicNodesService.publish({ groupId, slug?, script, mode: "create" | "update", actorUserId? })` is called
    - **Then** the service runs in strict order: (1) `parseDynamicNodeSignature(script)` from the shared package, (2) signature semantics check (already inside the parser per US-159), (3) `deno check` via subprocess (this story), (4) allowlist intersection (this story)
    - **And** the first stage producing errors short-circuits — subsequent stages do NOT run

- [ ] **Scenario 2**: `deno check` via the `deno-runner` HTTP service returns structured `ParseError`s
    - **Given** a script that parses cleanly but has a TS type error
    - **When** the service POSTs `{ script }` to `${DENO_RUNNER_URL}/check`
    - **Then** the runner returns `{ ok: false, errors: [{ line, column, message }] }`
    - **And** the service wraps each into `{ stage: "ts-check", line, column, message }`
    - **And** the backend NEVER spawns Deno directly (no `child_process.spawn("deno", ...)` anywhere in `apps/backend-services`)

- [ ] **Scenario 3**: Allowlist intersection rejects out-of-allowlist hosts
    - **Given** a script with `@allowNet ["api.landingai.com", "evil.example.com"]` and a backend env `DYNAMIC_NODE_ALLOW_NET="api.landingai.com,api.mistral.ai"`
    - **When** the allowlist stage runs
    - **Then** `evil.example.com` is rejected with `{ stage: "allowlist", rejectedHost: "evil.example.com", message: "Host not in global allowlist" }`
    - **And** `api.landingai.com` passes through to persistence

- [ ] **Scenario 4**: On success, service delegates to repository
    - **Given** all four stages passed
    - **When** the service persists
    - **Then** for `mode: "create"` it calls `repository.createWithFirstVersion(...)` with the parsed signature + script + allowNet + deterministic; for `mode: "update"` it calls `repository.publishNewVersion(...)`
    - **And** the persisted version's row contains the script verbatim and the JSON-serialized `DynamicNodeSignature` in `signature`
    - **And** the service returns `{ slug, version, signature, errors: [] }`

- [ ] **Scenario 5**: `DENO_RUNNER_UNAVAILABLE` surfaced when the runner is unreachable
    - **Given** the `deno-runner` service is down or `DENO_RUNNER_URL` is unset
    - **When** the service attempts the `/check` call
    - **Then** the publish endpoint returns 503 with `{ code: "DENO_RUNNER_UNAVAILABLE", message }`
    - **And** the README updates document the `deno-runner` service as an ops dependency (deployed via the kustomize stack per US-186)

- [ ] **Scenario 6**: Unit tests cover every stage path
    - **Given** `dynamic-nodes.service.spec.ts`
    - **When** the suite runs
    - **Then** it covers: jsdoc-parse failure short-circuits, signature-semantics failure short-circuits, ts-check failure, allowlist rejection, full success path for create + update, and `DENO_UNAVAILABLE` detection

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.service.ts` — new file
- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.service.spec.ts` — new file
- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.module.ts` — register the service
- `apps/backend-services/src/dynamic-nodes/deno-runner.client.ts` — small typed HTTP client wrapping `/execute` + `/check` + `/health`
- `apps/backend-services/README.md` — document `deno-runner` as an ops dependency (depends on US-186)
- `apps/temporal/README.md` — same note (the worker also depends on the runner; deeper detail in US-170)

## Technical notes

- The Deno binary is NOT on the backend host. All Deno invocations go through the `deno-runner` HTTP service deployed per US-186. The service exposes `POST /check` for type-checking + `POST /execute` for runtime execution.
- `DENO_RUNNER_URL` env var configures the runner endpoint (default `http://deno-runner:9090` in compose / cluster; `http://localhost:9090` in pure-local dev when running outside compose).
- The new `deno-runner.client.ts` is a small typed HTTP client (uses Node's `fetch`) wrapping the three runner endpoints. Per-call timeout = `timeoutMs + 5000` ms so the runner's own timeout fires first.
- Read `DYNAMIC_NODE_ALLOW_NET` from `process.env` at service-construction time. Empty / unset = empty allowlist (everything outside the API_BASE_URL host gets rejected).
- The service handles the create-vs-update routing — controllers stay thin.
- After landing: no Vite restart (backend-only).
