# US-223: Conversation switcher panel in drawer header

**As a** user who's run multiple chat conversations on a workflow,
**I want** a collapsible panel below the chat header showing recent conversations attached to the current workflow,
**So that** I can switch back to prior conversations without losing my current context.

## Acceptance Criteria

- [x] **Scenario 1**: `ConversationSwitcher` component
    - **Given** `agent-chat/header/ConversationSwitcher.tsx`
    - **When** read after the change
    - **Then** it renders a Mantine `<Collapse>` panel below `AgentChatHeader` showing a list of conversations for the current workflow
    - **And** the panel is open / closed via a chevron toggle in the header
    - **And** each list item shows: title (or "Untitled" if null) + last-message-at relative timestamp (e.g. "2h ago") + message count

- [x] **Scenario 2**: Switching loads the selected conversation
    - **Given** the panel showing multiple conversations
    - **When** a user clicks a different conversation
    - **Then** `agentChatStore.setConversationId(newId)` fires
    - **And** the Thread re-hydrates from `useAgentConversation(newId)` history
    - **And** the panel auto-collapses after the switch

- [x] **Scenario 3**: "New conversation" button in the panel
    - **Given** the panel
    - **When** a user clicks "+ New conversation"
    - **Then** `agentChatStore.setConversationId(null)` fires (unbinds the current conversation)
    - **And** the Thread clears
    - **And** the next user message creates a fresh conversation on the backend (per US-196)

- [x] **Scenario 4**: Conversation list filters by current workflow
    - **Given** the panel showing the list
    - **When** the current route is `/workflows/create-v2?id=<X>`
    - **Then** the list shows ONLY conversations whose `workflowId === X`
    - **And** if the route has no workflow id, the list shows unbound conversations (`workflowId === null`)
    - **And** the data comes from `useAgentConversations({ workflowId })`

- [x] **Scenario 5**: Tests + Delete affordance
    - **Given** the panel + a delete button on each row
    - **When** the delete is clicked
    - **Then** a confirm modal shows; on confirm, `DELETE /api/agent/conversations/:id` fires (via US-204)
    - **And** the list invalidates + the row disappears
    - **And** if the deleted conversation was the active one, the active conversation unbinds (clears Thread)
    - **And** tests cover: switch loads, new-conversation clears, filtering by workflowId, delete confirms + removes

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/header/ConversationSwitcher.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/header/ConversationSwitcher.spec.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/header/AgentChatHeader.tsx` — embed the switcher panel + chevron toggle
- `apps/frontend/src/features/workflow-builder/agent-chat/useAgentConversationDelete.ts` — new mutation hook

## Technical notes

- Per L27 + L30 + L52 in REQUIREMENTS.md.
- Closes Milestone F.
- The "Untitled" fallback handles conversations whose first message's title-gen call (US-218) failed or hasn't completed yet.
