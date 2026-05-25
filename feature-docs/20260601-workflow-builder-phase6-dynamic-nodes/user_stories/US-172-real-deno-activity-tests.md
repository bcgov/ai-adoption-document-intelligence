# US-172: `dyn.run` activity integration tests against the running `deno-runner` service

**As a** worker engineer closing Milestone C,
**I want** integration tests that exercise the real `deno-runner` container covering every error class + the happy path,
**So that** the failure-feedback surface the Phase 7 agent depends on is verified end-to-end (worker → runner → Deno subprocess) before frontend wire-up.

## Acceptance Criteria

- [x] **Scenario 1**: Test suite calls a running `deno-runner` + verifies success path
    - **Given** `apps/temporal/src/dynamic-nodes/dyn-run.activity.spec.ts` + a `deno-runner` container reachable at `DENO_RUNNER_URL` (started via `docker compose -f deployments/local/docker-compose.deno.yml up -d`)
    - **When** the test "success — uppercase URL" runs against a real DynamicNodeVersion row with a small uppercase script
    - **Then** the activity returns `{ uppercased: { url: "FOO.PDF" } }`
    - **And** the test passes WITHOUT mocking the HTTP client — the runner container actually runs Deno

- [x] **Scenario 2**: Timeout test
    - **Given** a script that sleeps 70 s and a signature `timeoutMs: 1000`
    - **When** the activity is invoked
    - **Then** it throws `DynamicNodeTimeoutError { slug, versionId, timeoutMs: 1000 }` within ~1.5 s
    - **And** the runner container has no orphan Deno processes after the test (verify via `docker exec deno-runner ps` or runner-side cleanup logging)

- [x] **Scenario 3**: Stdout-too-large test
    - **Given** a script that writes 6 MB to stdout
    - **When** the activity is invoked
    - **Then** it throws `DynamicNodeStdoutTooLargeError { slug, versionId, capBytes: 5242880 }`
    - **And** the runner enforces the cap server-side (SIGKILLs the subprocess before exhausting container memory)

- [x] **Scenario 4**: Runtime + invalid-JSON tests
    - **Given** a script that throws inside the function body, AND a script that writes `not json` to stdout
    - **When** each is invoked
    - **Then** the thrown error throws `DynamicNodeRuntimeError { exitCode != 0, stderrTail: <text including the stack> }`
    - **And** the non-JSON-stdout case throws `DynamicNodeOutputInvalidJsonError { stdoutHead: "not json" }`

- [x] **Scenario 5**: Missing-declared-port + runner-unreachable tests
    - **Given** a script with signature `outputs: { result: ... }` whose function returns `{}` (missing `result`), AND a separate test that points `DENO_RUNNER_URL` at a closed port
    - **When** each is invoked
    - **Then** the missing-port test throws `DynamicNodeOutputShapeError { slug, versionId, missingPorts: ["result"] }`
    - **And** the runner-unreachable test surfaces a runtime error mapped to "deno runner unavailable" in `NodeRunStatus.errorMessage` (covers the runner-down-in-prod failure mode)

- [x] **Scenario 6**: Ambient env vars assertion
    - **Given** a script that returns `{ env: { ...Deno.env.toObject() } }` (with `outputs: { env: { kind: "Artifact" } }`)
    - **When** the activity is invoked through the runner
    - **Then** the returned `env` contains exactly `AI_DI_API_BASE_URL`, `AI_DI_API_KEY`, `AI_DI_GROUP_ID`, `AI_DI_WORKFLOW_RUN_ID` and nothing else — proving the runner is enforcing `--allow-env` restrictedly

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/temporal/src/dynamic-nodes/dyn-run.activity.spec.ts` — new test file
- `apps/temporal/README.md` — document the `deno-runner` service as a runtime dependency + add a test-prerequisites section ("run `docker compose -f deployments/local/docker-compose.deno.yml up -d` before `npm test`")
- `apps/backend-services/README.md` — same note for the publish-endpoint tests (US-164)

## Technical notes

- Tests use a real Postgres DB (per CLAUDE.md no-mock policy) + a real `deno-runner` container reachable via `DENO_RUNNER_URL`. CI must spin up the runner container as part of the test stack — document this prerequisite in the README.
- Each test creates its own DynamicNode + DynamicNodeVersion fixture rows, runs the activity, and cleans up. Tests pass with the actual HTTP client — no client mocks.
- The runner-unreachable test (Scenario 5) deliberately points at a closed port to verify the activity's error mapping. This is the cheapest way to test the "deno-runner unavailable" path; mocking the client would defeat the integration-test discipline.
- This story closes Milestone C. After landing US-168 → US-172, the Temporal side is complete; Milestone D wires the catalog merge so the rest of the system sees the new entries.
- After landing: no Vite restart (Temporal-only).
