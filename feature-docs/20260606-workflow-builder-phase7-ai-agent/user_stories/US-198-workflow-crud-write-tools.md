# US-198: Workflow CRUD write tools — `createWorkflow` + `updateWorkflowMetadata`

**As a** backend engineer giving the agent workflow-creation authority,
**I want** two write tools that map to existing workflow create + metadata-update endpoints,
**So that** the agent can spin up new workflows and rename / re-describe them without touching the graph.

## Acceptance Criteria

- [ ] **Scenario 1**: `createWorkflow` tool registered
    - **Given** `apps/backend-services/src/agent/tools/workflow.tools.ts`
    - **When** read after the change
    - **Then** it registers `createWorkflow` with `inputSchema: z.object({ name: z.string().min(1), description: z.string().optional(), isLibrary: z.boolean().optional() })`
    - **And** the handler calls `ctx.services.workflows.create({ name: input.name, description: input.description, isLibrary: input.isLibrary ?? false, groupId: ctx.groupId, createdBy: ctx.userId })`
    - **And** returns `{ ok: true, data: { workflow: { id, name, description, isLibrary } } }`

- [ ] **Scenario 2**: `updateWorkflowMetadata` tool registered
    - **Given** the same file
    - **When** read after the change
    - **Then** it registers `updateWorkflowMetadata` with `inputSchema: z.object({ id: z.string(), name: z.string().optional(), description: z.string().optional(), ctx: z.record(z.string(), z.any()).optional(), inputs: z.array(z.any()).optional(), outputs: z.array(z.any()).optional(), entryNodeId: z.string().nullable().optional() })`
    - **And** the handler performs read-modify-write on the workflow: reads current `config`, replaces only the provided metadata fields, writes via existing `WorkflowsService.update`
    - **And** rejects with `{ ok: false, error: { code: 'not-found' } }` if id is in a different group

- [ ] **Scenario 3**: Validation errors propagate as structured tool errors
    - **Given** an update that fails Phase 1 / Phase 3 validation (e.g. `entryNodeId` references a non-existent node)
    - **When** the handler runs
    - **Then** the returned `ToolResult` is `{ ok: false, error: { code: 'validation', message: '...', body: { errors: [...] } } }`
    - **And** the agent (per system prompt) reads `error.body.errors` rather than `error.message` first

- [ ] **Scenario 4**: Conversation `workflowId` is bound on first `createWorkflow` success
    - **Given** a conversation with `workflowId: null`
    - **When** the agent calls `createWorkflow` successfully during this conversation
    - **Then** the handler (via `ctx`) writes the new workflow id onto `ChatConversation.workflowId`
    - **And** subsequent tools in the same conversation can default `workflowId` to the bound one if needed (decided per tool)

- [ ] **Scenario 5**: Unit tests for both handlers
    - **Given** `workflow.tools.spec.ts` extended with new test cases
    - **When** run via `npm test`
    - **Then** they cover: createWorkflow happy path + binds conversation, updateWorkflowMetadata partial update preserves untouched fields, validation error propagation, cross-group rejection, group-isolation enforcement

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/tools/workflow.tools.ts` — extend with two write tools
- `apps/backend-services/src/agent/tools/workflow.tools.spec.ts` — extend
- `apps/backend-services/src/agent/tool-registry.ts` — extend `McpContext` if needed to expose `ChatConversationRepository` for the binding

## Technical notes

- Per L36 in REQUIREMENTS.md.
- Depends on US-193 (read tool surface already in `workflow.tools.ts`).
- Auto-mode wiring (`bypassPermissions`) lands in US-203 — until then, these tools won't actually execute through the SDK because `permissionMode` defaults to "default" which prompts. The tools themselves still work when called directly in unit tests.
