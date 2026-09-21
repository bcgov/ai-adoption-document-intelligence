# US-210: `AgentComposer` (text-only) + `useAgentChatSend` SSE mutation hook

**As a** frontend engineer wiring the send path,
**I want** assistant-ui's `Composer` primitive mounted with text-only input plus a TanStack mutation hook that opens the SSE stream against `/api/agent/chat` and threads events into the runtime,
**So that** a user can type a message + send it + see the agent respond in real time.

## Acceptance Criteria

- [x] **Scenario 1**: `AgentComposer` mounts assistant-ui's `Composer`
    - **Given** `apps/frontend/src/features/workflow-builder/agent-chat/composer/AgentComposer.tsx`
    - **When** read after the change
    - **Then** the component renders assistant-ui's `<Composer>` primitive bound to the runtime from US-206
    - **And** the composer is text-only (Enter sends; Shift+Enter inserts newline) — file drop lands in Milestone E
    - **And** the composer is disabled while a stream is in flight (`runtime.isRunning === true`)

- [x] **Scenario 2**: `useAgentChatSend` opens an SSE stream against `/api/agent/chat`
    - **Given** `apps/frontend/src/features/workflow-builder/agent-chat/useAgentChatSend.ts`
    - **When** read after the change
    - **Then** it exports `useAgentChatSend()` returning a `{ send(message: string), abort() }` API
    - **And** `send` opens a `fetch('/api/agent/chat', { method: 'POST', body: JSON.stringify({ conversationId, workflowId, message }), signal })` with `Content-Type: application/json`
    - **And** the response body is consumed via `parseSseStream` from US-206; each event is threaded into the runtime adapter

- [x] **Scenario 3**: Conversation + workflow scope flows from drawer state
    - **Given** `agentChatStore` extended with `conversationId?: string` + `workflowId?: string`
    - **When** `useAgentChatSend` builds the request body
    - **Then** it reads both fields from the store
    - **And** if no `conversationId`, the backend creates one + returns its id (in the first event's metadata); the hook captures it + updates the store
    - **And** if no `workflowId`, the hook reads the current route's workflow id from `useParams()` or equivalent; if the route has none, the field stays undefined

- [x] **Scenario 4**: Stream lifecycle + error handling
    - **Given** the hook
    - **When** the SSE stream emits an `agent-error` event
    - **Then** the runtime adapter renders it via `AgentErrorMessage`
    - **And** the hook marks the stream as ended (`runtime.isRunning = false`)
    - **And** the composer re-enables for the next message

- [x] **Scenario 5**: Mutation + composer tests
    - **Given** `useAgentChatSend.spec.ts` + `AgentComposer.spec.tsx`
    - **When** run via `npm test` against a mock `fetch`
    - **Then** tests cover: send opens fetch with expected body, SSE events thread into runtime, Enter sends, Shift+Enter inserts newline, composer disabled while running, conversationId captured from first event, agent-error sets isRunning false

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/composer/AgentComposer.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/composer/AgentComposer.spec.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/useAgentChatSend.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/useAgentChatSend.spec.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/state/agentChatStore.ts` — extend with `conversationId` + `workflowId` + setters

## Technical notes

- Per L46 in REQUIREMENTS.md.
- Depends on US-205 (assistant-ui installed), US-206 (runtime + SSE parser), US-207 (drawer + store).
- Mid-stream creation of a new conversation: the backend creates the row if `conversationId` is omitted in the request body; the SSE stream's first event carries `conversationMetadata: { id }` and the hook captures it.
- This story makes the chat actually usable for the first time — Milestone D verification surface (read-only chat conversation working in a browser).
