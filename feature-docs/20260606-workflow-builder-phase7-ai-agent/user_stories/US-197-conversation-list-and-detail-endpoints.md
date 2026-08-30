# US-197: `GET /api/agent/conversations` + `GET /api/agent/conversations/:id` endpoints

**As a** backend engineer + frontend drawer client,
**I want** two read endpoints that list a user's conversations (optionally filtered by workflow) and load one conversation's full message history,
**So that** the chat drawer can populate its conversation switcher and replay prior chat history on reopen.

## Acceptance Criteria

- [x] **Scenario 1**: `GET /api/agent/conversations` lists per-user-private conversations
    - **Given** `agent.controller.ts`
    - **When** read after the change
    - **Then** the controller defines `GET /api/agent/conversations` with optional query param `workflowId?: string`
    - **And** the handler resolves caller's `userId` + `groupId` and calls `ChatConversationRepository.listForUser({ groupId, createdBy: userId, workflowId })`
    - **And** returns 200 `AgentConversationListResponseDto { items: AgentConversationListItemDto[] }` sorted by `lastMessageAt` desc
    - **And** each item carries `{ id, workflowId, model, title, messageCount, lastMessageAt, createdAt }`
    - **And** another user's conversations are NOT returned (per-user-private per L10)

- [x] **Scenario 2**: `GET /api/agent/conversations/:id` returns full message history
    - **Given** the controller
    - **When** the endpoint is hit with a valid id
    - **Then** the handler calls `findByIdForUser(id, userId)` — returns 404 if not owned by the caller
    - **And** returns 200 `AgentConversationDetailResponseDto { conversation: AgentConversationDto, messages: AgentMessageDto[] }`
    - **And** `messages` is sorted by `createdAt` ascending
    - **And** `AgentMessageDto.content` carries the hydrated JSON event log (text + tool-call entries) — the same shape the runtime adapter consumes on reopen

- [x] **Scenario 3**: Full Swagger DTOs defined
    - **Given** `apps/backend-services/src/agent/dto/`
    - **When** read after the change
    - **Then** the new DTOs `AgentConversationListResponseDto`, `AgentConversationListItemDto`, `AgentConversationDetailResponseDto`, `AgentConversationDto`, `AgentMessageDto`, `AgentToolCallDto`, `AgentToolErrorDto` all exist
    - **And** every field has `@ApiProperty()` decorators per CLAUDE.md
    - **And** the list endpoint uses `@ApiOkResponse({ type: AgentConversationListResponseDto })` (per CLAUDE.md guidance against generic `@ApiResponse`)

- [x] **Scenario 4**: Cross-user access returns 404
    - **Given** two users (A and B) each with one conversation, both in the same group
    - **When** user A calls `GET /api/agent/conversations/<B's id>`
    - **Then** the response is 404 (NOT 403 — leaks less info)
    - **And** the test asserts the 404 even though the conversation exists in the DB

- [x] **Scenario 5**: Empty-state behaviour
    - **Given** a user with no conversations
    - **When** they call `GET /api/agent/conversations`
    - **Then** the response is 200 with `{ items: [] }` (not 404, not empty body)
    - **And** the controller test covers this case explicitly

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/agent.controller.ts` — add two endpoints
- `apps/backend-services/src/agent/agent.controller.spec.ts` — extend with new tests
- `apps/backend-services/src/agent/dto/agent-conversation-list-response.dto.ts` — new
- `apps/backend-services/src/agent/dto/agent-conversation-list-item.dto.ts` — new
- `apps/backend-services/src/agent/dto/agent-conversation-detail-response.dto.ts` — new
- `apps/backend-services/src/agent/dto/agent-conversation.dto.ts` — new
- `apps/backend-services/src/agent/dto/agent-message.dto.ts` — new
- `apps/backend-services/src/agent/dto/agent-tool-call.dto.ts` — new
- `apps/backend-services/src/agent/dto/agent-tool-error.dto.ts` — new

## Technical notes

- Per L10 + L27 + L28 + L31 in REQUIREMENTS.md.
- Closes Milestone B.
- DTOs are intentionally split into one file per class per CLAUDE.md DTO-class convention.
- Group + user resolution flows from the existing `x-api-key` middleware — no new auth surface.
