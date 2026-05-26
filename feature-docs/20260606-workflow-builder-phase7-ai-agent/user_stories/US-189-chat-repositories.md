# US-189: `ChatConversationRepository` + `ChatMessageRepository` with real-DB tests

**As a** backend engineer persisting agent state,
**I want** typed repository classes for conversations and messages with real-DB unit tests,
**So that** the agent service and SSE controller have one well-tested seam between Prisma and the domain code.

## Acceptance Criteria

- [x] **Scenario 1**: `ChatConversationRepository` exposes the expected method surface
    - **Given** `apps/backend-services/src/agent/chat-conversation.repository.ts`
    - **When** read after the change
    - **Then** the class exposes: `create({ workflowId?, groupId, createdBy, model })`, `findById(id)`, `findByIdForUser(id, createdBy)`, `listForUser({ groupId, createdBy, workflowId? })`, `updateClaudeSessionId(id, claudeSessionId)`, `updateTitle(id, title)`, `touchLastMessageAt(id)`, `hardDelete(id)`
    - **And** every method returns a Promise of a typed `ChatConversation` (or `null` / `void` where appropriate)

- [x] **Scenario 2**: `ChatMessageRepository` exposes the expected method surface
    - **Given** `apps/backend-services/src/agent/chat-message.repository.ts`
    - **When** read after the change
    - **Then** the class exposes: `create({ conversationId, role, content, inputTokens?, outputTokens? })`, `listForConversation(conversationId)` (sorted by `createdAt ASC`), `countForConversation(conversationId)`

- [x] **Scenario 3**: Real-DB unit tests for both repositories
    - **Given** new spec files `chat-conversation.repository.spec.ts` + `chat-message.repository.spec.ts`
    - **When** run via `npm test` against the dev DB
    - **Then** they cover: create + roundtrip, `findByIdForUser` filters by `createdBy`, `listForUser` filters by `groupId` + optional `workflowId`, `updateClaudeSessionId` is idempotent on re-call, `hardDelete` cascades to messages, `touchLastMessageAt` updates the column
    - **And** tests follow CLAUDE.md — real DB, not mocked Prisma

- [x] **Scenario 4**: `findByIdForUser` returns null for cross-user lookups
    - **Given** two conversations, one created by user A and one by user B
    - **When** user A calls `findByIdForUser(conversationB.id, userA.id)`
    - **Then** the result is `null`
    - **And** the test asserts the row is NOT returned even though it exists in the table (enforces per-user-private visibility per L10)

- [x] **Scenario 5**: Repositories are exported from `agent.module.ts` for DI
    - **Given** `agent.module.ts`
    - **When** read after the change
    - **Then** both repositories are listed under `providers` and `exports`
    - **And** they are constructable via Nest DI (their dependency on `PrismaService` resolves)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/chat-conversation.repository.ts` — new
- `apps/backend-services/src/agent/chat-conversation.repository.spec.ts` — new
- `apps/backend-services/src/agent/chat-message.repository.ts` — new
- `apps/backend-services/src/agent/chat-message.repository.spec.ts` — new
- `apps/backend-services/src/agent/agent.module.ts` — register providers

## Technical notes

- Per L10 + L23 + L24 + L33 in REQUIREMENTS.md.
- Depends on US-188 (Prisma models).
- Real-DB unit tests per CLAUDE.md — no mocked Prisma.
- `createdBy` is the user ID from the authenticated principal; controller pulls it from the existing `x-api-key` middleware's resolved user/group context.
