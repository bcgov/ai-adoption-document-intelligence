# US-215: TanStack invalidator table + wire to runtime adapter for canvas live reactivity

**As a** frontend engineer making the canvas reflect agent edits live,
**I want** a per-tool-name invalidator table that maps each write tool to the TanStack query keys to invalidate, plus a runtime-event subscriber that calls the invalidator on every `tool-call-complete` event,
**So that** the workflow canvas re-renders within one tick of each agent write without manual refresh.

## Acceptance Criteria

- [x] **Scenario 1**: `invalidator-table.ts` declares the per-tool invalidation keys
    - **Given** `agent-chat/runtime/invalidator-table.ts`
    - **When** read after the change
    - **Then** it exports a `Record<string, (workflowId: string, queryClient: QueryClient) => void>` mapping each write tool name to the right invalidator calls
    - **And** entries match L49 exactly: `addNode` / `setNodeParameters` / `connectNodes` / `deleteNode` / `setEntryNode` / `declareCtx` / `setCtxKind` / `updateWorkflowMetadata` invalidate `['workflow', workflowId]`; `setEntryNode` also invalidates `['workflow', workflowId, 'run-spec']`; `publishDynamicNode` / `updateDynamicNode` / `deleteDynamicNode` invalidate `['activity-catalog']` + `['dynamic-node-list']`

- [x] **Scenario 2**: Runtime subscribes to tool-call-complete events
    - **Given** `ClaudeAgentSDKRuntime.ts` (extended)
    - **When** read after the change
    - **Then** the runtime exposes a `subscribeToToolCalls(handler)` API or accepts an injected `onToolCallComplete` callback at construction
    - **And** the chat drawer wires it: `useEffect(() => runtime.subscribeToToolCalls((event) => { invalidatorTable[event.name]?.(workflowId, queryClient) }))`

- [x] **Scenario 3**: `createWorkflow` invalidates the workflow LIST + binds the conversation
    - **Given** a `createWorkflow` tool-call-complete event
    - **When** the invalidator runs
    - **Then** the workflow list query `['workflows']` is invalidated so the v2 editor's sidebar (or wherever workflow lists render) refreshes
    - **And** the conversation row's `workflowId` is updated by the backend per US-198 — the frontend re-reads the conversation to pick this up (separate from invalidation)

- [x] **Scenario 4**: Live canvas smoke test
    - **Given** a canvas mounted at `/workflows/create-v2?id=<X>` + the chat drawer open in the same workflow scope
    - **When** the agent fires `addNode({ workflowId: X, node: ... })` via the SSE stream
    - **Then** the SSE `tool-call-complete` event reaches the runtime + fires the invalidator
    - **And** TanStack refetches `['workflow', X]` + the canvas re-renders within one tick (≤ 100 ms in practice)
    - **And** the new node is visible on the canvas without manual refresh

- [x] **Scenario 5**: Tests cover invalidator table + subscription
    - **Given** `invalidator-table.spec.ts` + extended `ClaudeAgentSDKRuntime.spec.ts`
    - **When** run via `npm test`
    - **Then** tests cover: each write tool's invalidator calls `queryClient.invalidateQueries` with the expected keys, subscribe hook fires on every tool-call-complete, unsubscribing on unmount stops further calls, unknown tool names are silently ignored (no throw)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/runtime/invalidator-table.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/runtime/invalidator-table.spec.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/runtime/ClaudeAgentSDKRuntime.ts` — extend with subscribe API
- `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatDrawer.tsx` — wire the invalidator subscription

## Technical notes

- Per L15 + L49 in REQUIREMENTS.md.
- This story enables the canvas to be agent-controllable — without it, the canvas would only refresh on manual page reload after agent edits.
- Phase 8 source-upload uploads are already covered by Phase 8's own invalidation — no new invalidator entry needed for `listSourceUploadAttachments`.
