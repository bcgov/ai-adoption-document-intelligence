# US-220: Token-usage capture per assistant turn

**As a** backend engineer tracking conversation cost over time,
**I want** the event translator to read `usage: { inputTokens, outputTokens }` from each `agent-done` SDK event and persist the counts onto the assistant `ChatMessage` row,
**So that** future cost-aggregation features (deferred to 7.x) have the raw data they need.

## Acceptance Criteria

- [x] **Scenario 1**: Translator extracts usage from `agent-done` events
    - **Given** `event-translator.ts`
    - **When** an `agent-done` SDK event arrives carrying `usage: { inputTokens, outputTokens }`
    - **Then** the translator's output `AgentDoneEvent` carries `usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }`
    - **And** if the SDK doesn't provide usage on that event, the translator emits `{ inputTokens: null, outputTokens: null, totalTokens: null }` (don't fabricate)

- [x] **Scenario 2**: `AgentService.runChat()` persists usage to the assistant message row
    - **Given** the service flushing the assistant message at turn end
    - **When** the `agent-done` event arrives
    - **Then** `ChatMessageRepository.create({ ..., inputTokens, outputTokens })` writes the values to the new columns
    - **And** if `usage` is null, the columns store NULL

- [x] **Scenario 3**: Conversation detail endpoint exposes usage
    - **Given** `GET /api/agent/conversations/:id`
    - **When** the endpoint returns messages
    - **Then** each `AgentMessageDto` carries `inputTokens?: number, outputTokens?: number`
    - **And** the DTO + Swagger declare them as optional

- [x] **Scenario 4**: No frontend rendering of usage in 7.0
    - **Given** the frontend Thread / ToolCallCard / TextMessage components
    - **When** read after this story
    - **Then** no UI surfaces token usage to the user (deferred to 7.x per L53)
    - **And** the data is present in the DTOs but not displayed
    - **And** a code comment in `agent-chat/AgentChatThread.tsx` notes the deferred surfacing

- [x] **Scenario 5**: Tests cover capture + persistence
    - **Given** extended `event-translator.spec.ts` + `agent.service.spec.ts`
    - **When** run via `npm test`
    - **Then** tests cover: translator extracts usage from agent-done, translator returns null for missing usage, repository write captures inputTokens + outputTokens, DTO carries values when present, DTO omits values when null

## Priority
- [ ] Medium (Should Have)

## Files modified / created

- `apps/backend-services/src/agent/event-translator.ts` — extend
- `apps/backend-services/src/agent/event-translator.spec.ts` — extend
- `apps/backend-services/src/agent/agent.service.ts` — pass usage to repository create
- `apps/backend-services/src/agent/dto/agent-message.dto.ts` — add optional usage fields

## Technical notes

- Per L53 in REQUIREMENTS.md.
- Aggregation queries (e.g. total spend per workflow per month) are computable via SQL after this story lands.
- This is the only story in Milestone F marked Medium — everything else is High.
