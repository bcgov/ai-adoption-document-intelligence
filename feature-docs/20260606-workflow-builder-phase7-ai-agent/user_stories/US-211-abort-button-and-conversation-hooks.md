# US-211: `AgentAbortButton` + conversation list/history TanStack hooks

**As a** frontend engineer giving users abort + history,
**I want** an abort button in the chat header AND TanStack hooks that list per-user conversations + load one conversation's full history,
**So that** users can cancel in-flight runs and reopen the drawer to replay prior chat.

## Acceptance Criteria

- [x] **Scenario 1**: `AgentAbortButton` component
    - **Given** `agent-chat/header/AgentAbortButton.tsx`
    - **When** read after the change
    - **Then** the button renders only while a stream is in flight (`runtime.isRunning === true`)
    - **And** clicking it calls `useAgentChatSend.abort()` (which fires `AbortController.abort()` + POSTs `/api/agent/conversations/:id/abort`)
    - **And** the runtime emits a synthetic `agent-error` with `{ code: 'aborted-by-user' }` so the chat shows an "Aborted" pill via `AgentErrorMessage`

- [x] **Scenario 2**: `useAgentConversations` TanStack query
    - **Given** `useAgentConversations.ts`
    - **When** read after the change
    - **Then** it wraps `GET /api/agent/conversations` (with optional `workflowId` filter), keyed by `['agent', 'conversations', workflowId]`
    - **And** returns `{ data: AgentConversationListItem[] }` sorted by `lastMessageAt` desc

- [x] **Scenario 3**: `useAgentConversation` TanStack query
    - **Given** `useAgentConversation.ts`
    - **When** read after the change
    - **Then** it wraps `GET /api/agent/conversations/:id`, keyed by `['agent', 'conversation', id]`
    - **And** returns `{ data: { conversation, messages } }`
    - **And** is skip-enabled when `id` is null (no fetch when no conversation is open)

- [x] **Scenario 4**: Drawer reopen replays history into the runtime
    - **Given** a closed drawer with a `conversationId` set in the store
    - **When** the drawer opens
    - **Then** the runtime hydrates from `useAgentConversation(conversationId).data.messages`
    - **And** the Thread renders the prior text + tool-call cards exactly as they were
    - **And** assistant-ui's Thread does NOT replay them as in-flight streams (already-complete state)

- [x] **Scenario 5**: Hooks + abort button tests
    - **Given** spec files for each
    - **When** run via `npm test`
    - **Then** tests cover: abort button hidden when not streaming, abort button click triggers send.abort, useAgentConversations returns sorted list, useAgentConversation skip-enabled with null id, history hydration on drawer reopen
    - **And** smoke test: open drawer → send msg → close drawer → reopen → history still there

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/header/AgentAbortButton.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/header/AgentAbortButton.spec.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/useAgentConversations.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/useAgentConversations.spec.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/useAgentConversation.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/useAgentConversation.spec.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/header/AgentChatHeader.tsx` — wire `AgentAbortButton` into the header slot from US-207
- `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatDrawer.tsx` — wire `useAgentConversation` history hydration

## Technical notes

- Per L27 + L28 + L50 in REQUIREMENTS.md.
- Closes Milestone D — read-only chat conversation is fully working in a browser end-to-end with abort + history reload.
- Conversation switcher (UI element to flip between conversations attached to a workflow) lands in Milestone F (US-223).
