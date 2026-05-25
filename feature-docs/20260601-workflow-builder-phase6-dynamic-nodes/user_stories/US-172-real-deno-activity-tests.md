# US-172: Real-Deno `dyn.run` activity tests + worker README updates

**As a** worker engineer closing Milestone C,
**I want** integration tests that spawn a real Deno subprocess covering every error class + the happy path,
**So that** the failure-feedback surface the Phase 7 agent depends on is verified end-to-end before frontend wire-up.

## Acceptance Criteria

- [ ] **Scenario 1**: Test suite spawns real Deno + verifies success path
    - **Given** `apps/temporal/src/dynamic-nodes/dyn-run.activity.spec.ts` + a `deno` binary available on PATH
    - **When** the test "success — uppercase URL" runs against a real DynamicNodeVersion row with a small uppercase script
    - **Then** the activity returns `{ uppercased: { url: "FOO.PDF" } }` and stderr is empty
    - **And** the test passes without mocking child_process

- [ ] **Scenario 2**: Timeout test
    - **Given** a script that sleeps 70 s and a signature `timeoutMs: 1000`
    - **When** the activity is invoked
    - **Then** it throws `DynamicNodeTimeoutError { slug, versionId, timeoutMs: 1000 }` within ~1.5 s
    - **And** the Deno subprocess is reaped (no orphan in `ps`)

- [ ] **Scenario 3**: Stdout-too-large test
    - **Given** a script that writes 6 MB to stdout
    - **When** the activity is invoked
    - **Then** it throws `DynamicNodeStdoutTooLargeError { slug, versionId, capBytes: 5242880, actualBytes >= 5242880 }`
    - **And** the subprocess is SIGKILLed before exhausting memory

- [ ] **Scenario 4**: Runtime + invalid-JSON tests
    - **Given** a script that throws inside the function body, AND a script that writes `not json` to stdout
    - **When** each is invoked
    - **Then** the thrown error throws `DynamicNodeRuntimeError { exitCode != 0, stderrTail: <text including the stack> }`
    - **And** the non-JSON-stdout case throws `DynamicNodeOutputInvalidJsonError { stdoutHead: "not json" }`

- [ ] **Scenario 5**: Missing-declared-port test
    - **Given** a script with signature `outputs: { result: ... }` whose function returns `{}` (missing `result`)
    - **When** the activity is invoked
    - **Then** it throws `DynamicNodeOutputShapeError { slug, versionId, missingPorts: ["result"] }`

- [ ] **Scenario 6**: Ambient env vars assertion
    - **Given** a script that returns `{ env: { ...Deno.env.toObject() } }` (with `outputs: { env: { kind: "Artifact" } }` and `@allowEnv` enabled by the activity at execution time)
    - **When** the activity is invoked
    - **Then** the returned `env` contains exactly `AI_DI_API_BASE_URL`, `AI_DI_API_KEY`, `AI_DI_GROUP_ID`, `AI_DI_WORKFLOW_RUN_ID` and nothing else from the worker's `process.env`

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/temporal/src/dynamic-nodes/dyn-run.activity.spec.ts` — new test file
- `apps/temporal/README.md` — document Deno as a runtime dependency + add a test-prerequisites section
- `apps/backend-services/README.md` — same note (since `deno check` is required for the publish endpoints in US-164)

## Technical notes

- Tests use a real Postgres DB (per CLAUDE.md no-mock policy) + a real Deno binary. CI must have Deno installed. Document this prerequisite in the README + (separately, out of scope) update the CI Docker image.
- Each test creates its own DynamicNode + DynamicNodeVersion fixture rows, runs the activity, and cleans up. Tests pass with the actual `child_process.spawn` — no harness mocks.
- This story closes Milestone C. After landing US-168 → US-172, the Temporal side is complete; Milestone D wires the catalog merge so the rest of the system sees the new entries.
- After landing: no Vite restart (Temporal-only).
