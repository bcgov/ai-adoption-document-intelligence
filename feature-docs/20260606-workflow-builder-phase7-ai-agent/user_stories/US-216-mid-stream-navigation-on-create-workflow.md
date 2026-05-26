# US-216: Mid-stream navigation on agent `createWorkflow`

**As a** frontend engineer covering the "no workflow open yet" case,
**I want** the runtime adapter to call `useNavigate('/workflows/create-v2?id=<new>')` when the agent's first `createWorkflow` lands during a conversation,
**So that** the user is automatically taken to the new workflow's editor mid-stream and the rest of the agent's edits land on a visible canvas.

## Acceptance Criteria

- [ ] **Scenario 1**: Navigation fires on `createWorkflow` tool-call-complete
    - **Given** the runtime subscribed to tool-call events (US-215)
    - **When** a `createWorkflow` tool-call-complete event arrives
    - **Then** the chat drawer's effect calls `navigate('/workflows/create-v2?id=' + event.output.workflow.id)`
    - **And** the navigation happens ONLY ONCE per conversation (if the agent creates a second workflow in the same conversation, we don't re-navigate)
    - **And** the navigation uses React Router's `useNavigate()` (not `window.location` — preserves SPA state)

- [ ] **Scenario 2**: Drawer state survives the navigation
    - **Given** the drawer mounted at the app layout root (US-207)
    - **When** the route changes mid-stream
    - **Then** the drawer stays open
    - **And** the SSE stream continues uninterrupted (the underlying `fetch` lives in the runtime adapter, not in the route component)
    - **And** subsequent tool-call events continue to arrive + render

- [ ] **Scenario 3**: Conversation rebinds to the new workflow
    - **Given** an unbound conversation (no `workflowId`) that just got bound by `createWorkflow` (US-198)
    - **When** the navigation completes
    - **Then** the route's `id` query param matches the conversation's `workflowId`
    - **And** the workflow-scoped queries (`['workflow', id]`, `['workflow', id, 'run-spec']`) refetch for the new id

- [ ] **Scenario 4**: User-on-different-route case respected
    - **Given** the user opened the drawer on `/templates` (a non-workflow route)
    - **When** the agent calls `createWorkflow` mid-stream
    - **Then** the user IS navigated to the new workflow's editor (matches the design — the chat is the primary UX)
    - **And** the new-workflow-id is set on the conversation row
    - **And** the test asserts the navigation happens even from non-workflow routes

- [ ] **Scenario 5**: Smoke + unit tests
    - **Given** `AgentChatDrawer.spec.tsx` extended
    - **When** run via `npm test` (with a mocked router)
    - **Then** tests cover: navigation fires on createWorkflow event, navigation does NOT fire twice within one conversation, navigation works from any starting route, drawer stays open through navigation, conversation rebinding updates the store's `workflowId`

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatDrawer.tsx` — add the navigation effect
- `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatDrawer.spec.tsx` — extend

## Technical notes

- Per L48 in REQUIREMENTS.md.
- The "once per conversation" guard: store a `navigatedForConversation` flag in `agentChatStore` keyed by conversationId.
- Depends on US-215 (tool-call subscribe API).
