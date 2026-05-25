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

- [ ] **Scenario 2**: `deno check` subprocess returns structured `ParseError`s
    - **Given** a script that parses cleanly but has a TS type error
    - **When** the service writes the script + the ambient `kinds.d.ts` to a temp directory and runs `deno check <tempScript>`
    - **Then** Deno's stderr (line-anchored already) is parsed into `[{ stage: "ts-check", line, column, message }]`
    - **And** Deno's exit code 0 means no errors; non-zero means errors that surface as the structured list

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

- [ ] **Scenario 5**: `DENO_UNAVAILABLE` surfaced at service startup
    - **Given** the backend host has no `deno` binary on PATH
    - **When** the service is constructed at app boot
    - **Then** a startup health check (or first publish attempt) returns `500` with `{ code: "DENO_UNAVAILABLE", message }`
    - **And** the README updates (per the Requirements §7) document Deno as an ops dependency

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
- `apps/backend-services/README.md` — note Deno as an ops dependency
- `apps/temporal/README.md` — note Deno as a worker-runtime dependency (referenced in advance of US-170)

## Technical notes

- Subprocess runner: `child_process.spawnSync("deno", ["check", tempPath], { stdio: ["ignore", "pipe", "pipe"] })`. Stderr parsing splits on newlines and matches `error: ... at file:///<tempPath>:<line>:<column>` via regex.
- Use `os.tmpdir()` for the temp script + `kinds.d.ts`. Clean up after the subprocess exits.
- Read `DYNAMIC_NODE_ALLOW_NET` from `process.env` at service-construction time. Empty / unset = empty allowlist (everything outside the API_BASE_URL host gets rejected).
- The service handles the create-vs-update routing — controllers stay thin.
- After landing: no Vite restart (backend-only).
