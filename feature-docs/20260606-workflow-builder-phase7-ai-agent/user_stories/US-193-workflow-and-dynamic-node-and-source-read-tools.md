# US-193: Workflow + dynamic-node + source-attachment read tools

**As a** backend engineer wiring the agent's introspection surface,
**I want** read-only tools for `getWorkflow`, `listDynamicNodes`, `getDynamicNode`, and the new `listSourceUploadAttachments`,
**So that** the agent can inspect a workflow's current shape, the group's dynamic-node lineages, and whether the user has actually attached a file before calling `startRun`.

## Acceptance Criteria

- [ ] **Scenario 1**: `getWorkflow` tool registered
    - **Given** `apps/backend-services/src/agent/tools/workflow.tools.ts`
    - **When** read after the change
    - **Then** it self-registers `getWorkflow` with `inputSchema: z.object({ id: z.string() })`
    - **And** the handler resolves `ctx.services.workflows.findById(input.id)` and returns `{ ok: true, data: { workflow: WorkflowDto } }`
    - **And** returns `{ ok: false, error: { code: 'not-found', message: '...' } }` if the workflow doesn't exist OR is in a different group

- [ ] **Scenario 2**: `listDynamicNodes` + `getDynamicNode` tools registered
    - **Given** `apps/backend-services/src/agent/tools/dynamic-node.tools.ts`
    - **When** read after the change
    - **Then** `listDynamicNodes` has empty input schema + handler `ctx.services.dynamicNodes.listForGroup(ctx.groupId)`
    - **And** `getDynamicNode` has `inputSchema: z.object({ slug: z.string(), version: z.number().optional() })` + handler returns the lineage detail including all versions and the head pointer
    - **And** both return shape-compatible payloads to the existing `GET /api/dynamic-nodes` and `GET /api/dynamic-nodes/:slug` endpoints

- [ ] **Scenario 3**: `listSourceUploadAttachments` tool registered + new service method
    - **Given** `apps/backend-services/src/agent/tools/source.tools.ts` + a new method on `SourceUploadService`
    - **When** read after the change
    - **Then** the tool registers with `inputSchema: z.object({ workflowId: z.string(), sourceNodeId: z.string() })`
    - **And** the new `SourceUploadService.listAttachmentsForSourceNode(workflowId, sourceNodeId)` reads the blob-storage key prefix where Phase 8's upload endpoint writes, returning `{ items: { filename: string, mimeType: string, sizeBytes: number, uploadedAt: string }[] }`
    - **And** the tool handler returns `{ ok: true, data }` on success or `{ ok: false, error: { code: 'not-found' } }` if the source node doesn't exist on that workflow

- [ ] **Scenario 4**: Tools self-register via `AgentModule.onModuleInit`
    - **Given** `agent.module.ts`
    - **When** read after the change
    - **Then** the three new tool files are imported in `OnModuleInit` (side-effect)
    - **And** `ToolRegistry.getAll()` contains the 4 new entries (`getWorkflow`, `listDynamicNodes`, `getDynamicNode`, `listSourceUploadAttachments`) after init

- [ ] **Scenario 5**: Unit tests for each tool handler
    - **Given** spec files alongside each tool file + `SourceUploadService.listAttachmentsForSourceNode.spec.ts`
    - **When** run via `npm test`
    - **Then** they cover: happy paths, not-found / wrong-group rejections, `listSourceUploadAttachments` returns empty array when no uploads exist (not an error), `listSourceUploadAttachments` returns entries when uploads exist (use existing Phase 8 upload mechanism to seed)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/tools/workflow.tools.ts` — new (only `getWorkflow` in this story; write tools land in Milestone C)
- `apps/backend-services/src/agent/tools/workflow.tools.spec.ts` — new
- `apps/backend-services/src/agent/tools/dynamic-node.tools.ts` — new (only read tools)
- `apps/backend-services/src/agent/tools/dynamic-node.tools.spec.ts` — new
- `apps/backend-services/src/agent/tools/source.tools.ts` — new
- `apps/backend-services/src/agent/tools/source.tools.spec.ts` — new
- `apps/backend-services/src/source-upload/source-upload.service.ts` — add `listAttachmentsForSourceNode` method
- `apps/backend-services/src/source-upload/source-upload.service.spec.ts` — extend with new test cases
- `apps/backend-services/src/agent/agent.module.ts` — import the three new tool files

## Technical notes

- Per L19 + L35 in REQUIREMENTS.md.
- Depends on US-190 + US-192.
- `listSourceUploadAttachments` is the one truly NEW service method in Phase 7 — every other read tool wraps an existing service. The blob-storage prefix already exists from Phase 8 Milestone B; just expose a list operation on it.
- Source node membership in a workflow is verified by reading `workflow.config.nodes` and finding a node with `type === 'source.upload' && id === sourceNodeId`.
