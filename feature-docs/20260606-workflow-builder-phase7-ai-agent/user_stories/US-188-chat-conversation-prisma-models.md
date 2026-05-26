# US-188: `ChatConversation` + `ChatMessage` Prisma models + migration

**As a** backend engineer persisting agent conversations,
**I want** dedicated Prisma models for chat conversations and messages with the right indexes and cascade behaviour,
**So that** the SSE controller, repositories, and event translator can persist + read chat history without per-call schema decisions.

## Acceptance Criteria

- [ ] **Scenario 1**: `ChatConversation` model added to `prisma/schema.prisma`
    - **Given** `apps/backend-services/prisma/schema.prisma`
    - **When** read after the change
    - **Then** it declares a `ChatConversation` model with columns `id (cuid)`, `workflowId (String?)`, `groupId (String)`, `createdBy (String)`, `claudeSessionId (String?)`, `model (String)`, `title (String?)`, `createdAt (DateTime @default(now()))`, `lastMessageAt (DateTime @default(now()))`
    - **And** relations: `workflow Workflow? @relation(fields: [workflowId], references: [id], onDelete: SetNull)`, `group Group @relation(fields: [groupId], references: [id])`
    - **And** indexes: `@@index([workflowId])`, `@@index([groupId, createdBy])`
    - **And** maps to `chat_conversation` table via `@@map`

- [ ] **Scenario 2**: `ChatMessage` model added to `prisma/schema.prisma`
    - **Given** the schema
    - **When** read after the change
    - **Then** it declares a `ChatMessage` model with columns `id (cuid)`, `conversationId (String)`, `role (String)`, `content (Json)`, `inputTokens (Int?)`, `outputTokens (Int?)`, `createdAt (DateTime @default(now()))`
    - **And** relation `conversation ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)`
    - **And** index `@@index([conversationId, createdAt])`
    - **And** maps to `chat_message` table

- [ ] **Scenario 3**: Migration generated + applied via `npm run db:generate`
    - **Given** the schema change
    - **When** `npm run db:generate` runs from `apps/backend-services`
    - **Then** a new migration directory under `prisma/migrations/<timestamp>_add_chat_conversation_and_chat_message/` exists
    - **And** the generated Prisma client copies into `apps/backend-services/src/` and `apps/temporal/src/` per the project convention
    - **And** `npx prisma migrate dev` applies cleanly to the local dev DB

- [ ] **Scenario 4**: `Workflow` model gains the inverse relation
    - **Given** the schema
    - **When** read after the change
    - **Then** `Workflow` has `chatConversations ChatConversation[]` added
    - **And** the inverse relation typechecks (no circular reference errors)

- [ ] **Scenario 5**: Cascade-delete behaviour verified at the schema level
    - **Given** the schema
    - **When** running `npx prisma format` and reading the result
    - **Then** `ChatMessage.conversation` declares `onDelete: Cascade`
    - **And** `ChatConversation.workflow` declares `onDelete: SetNull` so deleting a workflow nulls the chat's `workflowId` (chat outlives the workflow it was created against)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/prisma/schema.prisma` — add two models + inverse relation on `Workflow`
- `apps/backend-services/prisma/migrations/<timestamp>_add_chat_conversation_and_chat_message/migration.sql` — generated
- `apps/backend-services/src/` + `apps/temporal/src/` — regenerated Prisma client outputs

## Technical notes

- Per L23 + L24 in REQUIREMENTS.md.
- This story unblocks US-189 (repositories), US-196 (SSE controller), US-197 (list/detail endpoints).
- Use `npm run db:generate` per CLAUDE.md — it's the special script that writes models into both backend and temporal.
- No runtime code in this story — schema only. Repositories land in US-189.
