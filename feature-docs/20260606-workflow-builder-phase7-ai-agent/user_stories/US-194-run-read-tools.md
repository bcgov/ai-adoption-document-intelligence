# US-194: Run read tools — `getRunSpec` + `getNodeStatuses` + `getPreviewCache` + `listRunHistory`

**As a** backend engineer giving the agent feedback channels,
**I want** four read-only tools that surface a workflow's run spec, per-node statuses, per-node preview cache, and run history,
**So that** the agent can read EVERY Phase 4 substrate signal it needs to evaluate whether a run reached the user's goal.

## Acceptance Criteria

- [ ] **Scenario 1**: `getRunSpec` tool registered
    - **Given** `apps/backend-services/src/agent/tools/run.tools.ts`
    - **When** read after the change
    - **Then** it registers `getRunSpec` with `inputSchema: z.object({ workflowId: z.string() })`
    - **And** the handler resolves `ctx.services.runs.getRunSpec(input.workflowId)` and returns the shape produced by the existing `GET /api/workflows/:id/run-spec` endpoint (Phase 8 Milestone B)
    - **And** the response includes `inputSchema`, `uploadSpec?`, and any source-derived spec entries — verbatim from the existing service

- [ ] **Scenario 2**: `getNodeStatuses` tool registered
    - **Given** the same file
    - **When** read after the change
    - **Then** it registers `getNodeStatuses` with `inputSchema: z.object({ workflowId: z.string(), runId: z.string() })`
    - **And** the handler returns the array of `NodeRunStatus` records for the given run (matches Phase 4's existing status endpoint)
    - **And** each record includes `nodeId`, `status` (`pending` / `running` / `succeeded` / `failed`), `errorMessage?` (2 KB truncation already applied upstream), `startedAt?`, `completedAt?`

- [ ] **Scenario 3**: `getPreviewCache` tool registered
    - **Given** the same file
    - **When** read after the change
    - **Then** it registers `getPreviewCache` with `inputSchema: z.object({ workflowId: z.string(), runId: z.string(), nodeId: z.string() })`
    - **And** the handler returns the cached output JSON for the given node + run
    - **And** returns `{ ok: false, error: { code: 'not-found', message: 'No preview cached for this node yet' } }` if the run hasn't reached that node OR caching is disabled for that node

- [ ] **Scenario 4**: `listRunHistory` tool registered
    - **Given** the same file
    - **When** read after the change
    - **Then** it registers `listRunHistory` with `inputSchema: z.object({ workflowId: z.string(), limit: z.number().optional() })`
    - **And** the handler resolves `ctx.services.runs.listForWorkflow({ workflowId, limit: input.limit ?? 20 })` returning `[{ runId, status, startedAt, completedAt?, initialCtx? }]`
    - **And** sorted by `startedAt` descending

- [ ] **Scenario 5**: Tools self-register + unit tests
    - **Given** `agent.module.ts` + `run.tools.spec.ts`
    - **When** read / run after the change
    - **Then** the tool file is imported in `OnModuleInit` (side-effect)
    - **And** `ToolRegistry.getAll()` contains 4 new entries after init
    - **And** spec tests cover each handler's happy path, not-found / wrong-group rejection, group isolation
    - **And** `getPreviewCache` test covers the "no preview yet" case (run still in flight)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/tools/run.tools.ts` — new (read tools only; `startRun` write tool lands in Milestone C)
- `apps/backend-services/src/agent/tools/run.tools.spec.ts` — new
- `apps/backend-services/src/agent/agent.module.ts` — import the tool file

## Technical notes

- Per L35 in REQUIREMENTS.md.
- These tools close the read-side coverage for Milestone B — total registry size after this story = 11 tools (3 catalog + 4 workflow/dynamic-node/source read + 4 run read).
- Phase 4 supplies all underlying services; this story is pure tool-binding.
- `getPreviewCache` is the most-called read tool in the iteration loop — agent polls it per-node after every `startRun`.
