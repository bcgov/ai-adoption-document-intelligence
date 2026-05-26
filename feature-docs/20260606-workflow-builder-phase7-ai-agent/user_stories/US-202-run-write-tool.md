# US-202: Run write tool — `startRun`

**As a** backend engineer giving the agent the ability to test workflows,
**I want** a write tool that calls the existing `RunsService.start` and returns a `runId` immediately,
**So that** the agent's iteration loop can fire a run + poll `getNodeStatuses` / `getPreviewCache` to evaluate results.

## Acceptance Criteria

- [ ] **Scenario 1**: `startRun` tool registered
    - **Given** `apps/backend-services/src/agent/tools/run.tools.ts`
    - **When** read after the change
    - **Then** it registers `startRun` with `inputSchema: z.object({ workflowId: z.string(), initialCtx: z.record(z.string(), z.any()).optional() })`
    - **And** the handler calls `ctx.services.runs.start({ workflowId: input.workflowId, initialCtx: input.initialCtx ?? {} })` (same path as the existing `POST /api/workflows/:id/runs`)
    - **And** returns `{ ok: true, data: { runId: string, startedAt: string } }` immediately — the run continues asynchronously through Temporal

- [ ] **Scenario 2**: Source-derived workflows don't require `initialCtx`
    - **Given** a workflow whose entry node is `source.upload` with a file already attached
    - **When** `startRun` is called with `{ workflowId, initialCtx: undefined }`
    - **Then** the handler calls `RunsService.start` without `initialCtx`
    - **And** the existing source-derivation logic from Phase 8 fills the ctx from the source node's output
    - **And** the test asserts the run starts successfully

- [ ] **Scenario 3**: Missing required input surfaces as structured error
    - **Given** a workflow that requires `initialCtx.foo` (via `isInput` or `source.api`)
    - **When** `startRun` is called without that field
    - **Then** the existing Phase 8 / Phase 2 Track 2 validation rejects
    - **And** the tool result is `{ ok: false, error: { code: 'validation', message, body: { errors } } }`

- [ ] **Scenario 4**: Tool not registered until Milestone C completes
    - **Given** the tool registry at boot
    - **When** the backend boots after this story
    - **Then** `ToolRegistry.getAll()` contains `startRun` (plus all read tools from Milestone B + all write tools from US-198/199/200/201)
    - **And** total registry size is 15 (3 catalog + 4 workflow/dn/source read + 4 run read - 1 run read because startRun is new + … recompute)
    - **And** the SDK's `allowedTools: ['mcp__workflow__*']` permits it

- [ ] **Scenario 5**: Unit tests cover `startRun`
    - **Given** `run.tools.spec.ts` extended
    - **When** run via `npm test`
    - **Then** tests cover: happy path returns runId, source-upload workflow runs without initialCtx, validation error propagation, cross-group workflow rejected

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/tools/run.tools.ts` — extend with `startRun`
- `apps/backend-services/src/agent/tools/run.tools.spec.ts` — extend

## Technical notes

- Per L36 in REQUIREMENTS.md.
- `startRun` doesn't wait for the run to complete — it returns the `runId` and the agent polls via `getNodeStatuses` + `getPreviewCache` (US-194).
- For workflows whose source is `source.upload`, the agent should have verified via `listSourceUploadAttachments` (US-193) that a file is attached before calling `startRun`.
