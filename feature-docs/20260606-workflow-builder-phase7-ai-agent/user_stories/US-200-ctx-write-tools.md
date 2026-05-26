# US-200: Ctx write tools — `declareCtx` + `setCtxKind`

**As a** backend engineer giving the agent ctx-declaration authority,
**I want** two write tools that declare new ctx keys (with optional kind / isInput / isOutput) and update a ctx key's typed kind,
**So that** the agent can build typed Phase 3 workflows from scratch without manual ctx-key editing.

## Acceptance Criteria

- [ ] **Scenario 1**: `declareCtx` tool registered
    - **Given** `apps/backend-services/src/agent/tools/workflow.tools.ts`
    - **When** read after the change
    - **Then** it registers `declareCtx` with `inputSchema: z.object({ workflowId: z.string(), key: z.string().min(1), kind: z.string().optional(), isInput: z.boolean().optional(), isOutput: z.boolean().optional(), description: z.string().optional() })`
    - **And** the handler reads the workflow, sets `config.ctx[input.key] = { kind?, isInput?, isOutput?, description? }`, writes back
    - **And** rejects with `{ ok: false, error: { code: 'duplicate-ctx-key' } }` if the key already exists

- [ ] **Scenario 2**: `setCtxKind` tool registered
    - **Given** the same file
    - **When** read after the change
    - **Then** it registers `setCtxKind` with `inputSchema: z.object({ workflowId: z.string(), key: z.string(), kind: z.string() })`
    - **And** the handler updates `config.ctx[input.key].kind` and writes back
    - **And** rejects with `{ ok: false, error: { code: 'not-found' } }` if the ctx key doesn't exist

- [ ] **Scenario 3**: Phase 3 kind validation propagates
    - **Given** an unknown kind value passed to either tool
    - **When** the handler runs
    - **Then** the validator error from Phase 3 (`Unknown ArtifactKind: <kind>`) surfaces as `{ ok: false, error: { code: 'validation', message, body: { errors } } }`
    - **And** the agent reads `error.body.errors[0].message` for the unknown-kind detail

- [ ] **Scenario 4**: `setCtxKind` triggering downstream binding-walk errors
    - **Given** a workflow where node N has an input binding reading from ctx key K
    - **And** node N's input port expects kind `OcrResult`
    - **When** the agent calls `setCtxKind({ key: K, kind: 'Document' })`
    - **Then** the handler runs the write; binding-walk fires; the error response carries the Phase 3 wording `"Input port \`...\` (OcrResult) on node \`N\` reads from ctx key \`K\`, written by ..."`
    - **And** the test asserts the exact wording in `error.body.errors[0].message`

- [ ] **Scenario 5**: Unit tests cover both tools
    - **Given** `workflow.tools.spec.ts` extended
    - **When** run via `npm test`
    - **Then** tests cover: declareCtx happy path, declareCtx duplicate rejection, declareCtx with kind + isInput sets both, setCtxKind happy path, setCtxKind on missing key returns not-found, setCtxKind triggers binding-walk error per Scenario 4

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/tools/workflow.tools.ts` — extend with two ctx tools
- `apps/backend-services/src/agent/tools/workflow.tools.spec.ts` — extend

## Technical notes

- Per L36 in REQUIREMENTS.md.
- Depends on US-199 (read-modify-write pattern established).
- Phase 3 kind validation runs through the existing `validateGraphConfig` path; these tools don't re-implement validation.
- The agent uses these tools when composing source-API workflows where Phase 8 isInput is also a path — declareCtx covers both.
