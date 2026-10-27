# US-219: `claudeSessionId` lifecycle — capture + resume + replay-fallback

**As a** backend engineer making conversations resumable across drawer reopens,
**I want** capture of the SDK's `sessionId` on the first turn, `resume:` on subsequent turns, and a replay-fallback when the session ID is rejected,
**So that** users see the same conversation across browser reopens AND we recover gracefully when the SDK's session store evicts an ID.

## Acceptance Criteria

- [x] **Scenario 1**: Capture `sessionId` from the SDK's first turn
    - **Given** `AgentService.runChat()`
    - **When** an initial `SDK.query()` call returns its `sessionId` (either via an event or the return value)
    - **Then** the translator emits a `session-bound` event AND `ChatConversationRepository.updateClaudeSessionId(id, claudeSessionId)` persists the value
    - **And** the value is set once per conversation — subsequent updates are no-ops

- [x] **Scenario 2**: Resume on subsequent turns
    - **Given** a conversation with `claudeSessionId` populated
    - **When** the next user message arrives
    - **Then** `AgentService.runChat()` calls `SDK.query({ ..., options: { resume: conversation.claudeSessionId } })`
    - **And** the SDK does NOT re-send the conversation history (the SDK reads it from its own session store)
    - **And** the new user message's text is the only thing passed in `prompt`

- [x] **Scenario 3**: Replay-fallback on session-not-found
    - **Given** a conversation with a stale `claudeSessionId`
    - **When** the SDK rejects the resume with a "session not found" error
    - **Then** the service catches the error, builds a single priming `system` prompt that summarises the conversation's prior `ChatMessage` rows, and re-invokes `SDK.query({ prompt: newUserMessage, options: { systemPrompt: priming, ... — NO resume } })`
    - **And** the new session's id replaces the stale one
    - **And** the user observes no failure — the next turn proceeds normally

- [x] **Scenario 4**: Priming summary is bounded
    - **Given** a very long conversation (e.g. 80 messages)
    - **When** the replay-fallback fires
    - **Then** the priming text is at most ~4 KB (truncated with "[... earlier turns truncated ...]" if needed)
    - **And** the most recent N turns are preserved verbatim (N = whatever fits in the budget)
    - **And** unit tests cover the truncation logic explicitly

- [x] **Scenario 5**: Tests cover all three states
    - **Given** extended `agent.service.spec.ts`
    - **When** run via `npm test`
    - **Then** tests cover: first turn captures sessionId + persists, second turn passes resume, fallback fires on session-not-found + builds priming + retries, fallback handles truncation correctly, no infinite loop on repeated session-not-found errors (max 1 retry)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/agent.service.ts` — extend with session lifecycle
- `apps/backend-services/src/agent/agent.service.spec.ts` — extend
- `apps/backend-services/src/agent/event-translator.ts` — emit `session-bound` event
- `apps/backend-services/src/agent/session-priming.ts` — new helper for building priming text
- `apps/backend-services/src/agent/session-priming.spec.ts` — new

## Technical notes

- Per L39 in REQUIREMENTS.md.
- The Claude SDK persists sessions to `~/.claude/projects/` by default — verify that this path is writable in the backend container.
- The `session-bound` event fires once per conversation; the frontend can use it to update the conversation row's id displayed in the URL or store (optional UX nicety, not required for this story).
