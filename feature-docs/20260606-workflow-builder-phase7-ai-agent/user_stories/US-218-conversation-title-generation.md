# US-218: Conversation title generation via side `query()` call

**As a** backend engineer making conversations recognisable in the list,
**I want** a side SDK call on the first user message of a conversation that generates a 3-6 word title and stores it on `ChatConversation.title`,
**So that** the chat drawer's conversation switcher shows meaningful titles instead of "Untitled".

## Acceptance Criteria

- [x] **Scenario 1**: `TitleGenerator` service helper
    - **Given** `apps/backend-services/src/agent/title-generator.ts`
    - **When** read after the change
    - **Then** it exports `generateTitle(firstUserMessage: string, env: AgentEnv): Promise<string>` that calls the SDK with `{ prompt: "Generate a 3-6 word title for this workflow-building request: <message>", options: { model: env.AGENT_MODEL, mcpServers: undefined, allowedTools: [], maxTurns: 1, maxOutputTokens: 50 } }`
    - **And** the function returns the trimmed first-line of the SDK's text output
    - **And** if the SDK call fails or returns empty, returns `null` (NOT throws)

- [x] **Scenario 2**: `AgentService.runChat()` triggers title gen on first user message
    - **Given** the service
    - **When** running a chat turn AND `conversation.title === null` AND this is the first user message in the conversation
    - **Then** the service fires `generateTitle(message, env)` in the background (Promise.then(), don't await it before continuing the main stream)
    - **And** on success, persists the title via `ChatConversationRepository.updateTitle(conversationId, title)`
    - **And** emits a synthetic SSE event `{ type: 'conversation-meta', title }` so the frontend can update its display

- [x] **Scenario 3**: Title visible in the conversation list endpoint
    - **Given** a conversation with `title` populated
    - **When** `GET /api/agent/conversations` runs
    - **Then** `items[*].title` is the generated string
    - **And** `null` for conversations whose first message hasn't completed yet OR where the side call failed

- [x] **Scenario 4**: Failure isolation — title gen failure doesn't break the chat
    - **Given** an Anthropic API rate-limit on the side call
    - **When** the title side call fails
    - **Then** the main chat stream proceeds normally
    - **And** the conversation row's `title` stays null
    - **And** a `console.warn` is logged backend-side (no SecretValue printed)

- [x] **Scenario 5**: Unit tests cover title gen + integration
    - **Given** `title-generator.spec.ts` + extended `agent.service.spec.ts`
    - **When** run via `npm test`
    - **Then** tests cover: title generated for typical first message, title is trimmed + lowercased to first-line, failure returns null (no throw), service fires title gen on first message only (not on subsequent messages), title persists to DB, conversation-meta event emitted

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/title-generator.ts` — new
- `apps/backend-services/src/agent/title-generator.spec.ts` — new
- `apps/backend-services/src/agent/agent.service.ts` — extend to fire title gen on first message
- `apps/backend-services/src/agent/agent.service.spec.ts` — extend
- `apps/backend-services/src/agent/event-translator.ts` — extend to emit `conversation-meta` event type
- `apps/frontend/src/features/workflow-builder/agent-chat/runtime/sse-event.types.ts` — add `ConversationMetaEvent`

## Technical notes

- Per L52 in REQUIREMENTS.md.
- The side call passes `mcpServers: undefined` + `allowedTools: []` so the title generator has zero tools — it can only emit text.
- Cost is minimal — one ~50-token call per conversation, only on first message.
