# US-213: `useSourceUploadForChat` + file-drop target resolution

**As a** frontend engineer wiring queued files to `source.upload` nodes,
**I want** a mutation hook that uploads a file to an existing source-upload node id via Phase 8's endpoint, AND a target-resolver that picks the right `sourceNodeId` from the current workflow's graph,
**So that** queued files have a destination once the workflow has a source.upload node.

## Acceptance Criteria

- [ ] **Scenario 1**: `useSourceUploadForChat` mutation
    - **Given** `agent-chat/composer/useSourceUploadForChat.ts`
    - **When** read after the change
    - **Then** it exports a TanStack mutation hook posting `multipart/form-data` to `POST /api/sources/:sourceNodeId/upload` (Phase 8's endpoint)
    - **And** the mutation accepts `{ workflowId, sourceNodeId, file: File }` + returns `{ filename, sizeBytes }` on success
    - **And** errors propagate as `ApiError` with the same shape Phase 8 already uses

- [ ] **Scenario 2**: `resolveDropTarget` derives the target node id
    - **Given** `agent-chat/composer/resolveDropTarget.ts`
    - **When** called with `(workflow: Workflow | null)`
    - **Then** it returns one of: `{ kind: 'existing-node', sourceNodeId }`, `{ kind: 'needs-source-node', workflowExists: boolean }`, `{ kind: 'no-workflow' }` per the four cases in L47
    - **And** "existing-node" resolves when there's at least one `source.upload` node (pick the first in `config.nodes` order per L47.b)
    - **And** "needs-source-node" resolves when a workflow exists but has zero source.upload nodes
    - **And** "no-workflow" resolves when `workflow` is null

- [ ] **Scenario 3**: Drop handler dispatches via the resolver
    - **Given** the file-drop event with files
    - **When** files are dropped + the drop handler invokes `resolveDropTarget(currentWorkflow)`
    - **Then** for `existing-node`: the file uploads immediately via `useSourceUploadForChat`, then the queue entry is marked uploaded (visual: green checkmark on the pill)
    - **And** for `needs-source-node` and `no-workflow`: the files stay queued (per US-212) — upload happens after the agent's `addNode` lands (US-214)

- [ ] **Scenario 4**: Successful upload adds a system-style message to the chat
    - **Given** an upload that resolved + completed via `existing-node`
    - **When** the mutation succeeds
    - **Then** a synthetic `system` chat message is appended to the runtime: `"User attached <filename> to source node '<sourceNodeName>'"`
    - **And** this synthetic message is NOT sent to the backend — it's a UI-only annotation so the user can see what happened
    - **And** the next outbound `useAgentChatSend.send()` call's request body includes `attachments: [{ filename, mimeType, size, sourceNodeId }]` so the backend agent loop knows the file is now reachable

- [ ] **Scenario 5**: Tests for both pieces
    - **Given** spec files for the resolver + the upload mutation
    - **When** run via `npm test`
    - **Then** tests cover: resolver returns `existing-node` for graph with one source.upload, returns first node when multiple, returns `needs-source-node` for graph with no source.upload, returns `no-workflow` for null input, upload mutation fires multipart with correct sourceNodeId, error propagation matches Phase 8's ApiError shape

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/composer/useSourceUploadForChat.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/composer/useSourceUploadForChat.spec.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/composer/resolveDropTarget.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/composer/resolveDropTarget.spec.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/composer/FileDropZone.tsx` — wire the resolver + immediate-upload path

## Technical notes

- Per L7 + L19 + L46 + L47 in REQUIREMENTS.md.
- This story handles the easy case (workflow has source.upload). The harder cases (need to create source.upload first; no workflow at all) require listening for the agent's `addNode` / `createWorkflow` events to know when to drain — that's US-214 + US-216.
- Phase 8's upload endpoint accepts multipart only; we use `FormData` in the mutation.
