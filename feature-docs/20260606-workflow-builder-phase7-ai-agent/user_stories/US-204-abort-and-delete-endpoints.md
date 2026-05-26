# US-204: Abort endpoint + DELETE conversation endpoint + cancellation flag map

**As a** backend engineer giving users the eject button,
**I want** a backend-side `Map<conversationId, AbortController>` plus two endpoints — POST abort and DELETE conversation — with the SSE handler checking the flag between SDK turns,
**So that** a user clicking Abort actually stops the loop and a user clicking Delete removes their conversation cleanly.

## Acceptance Criteria

- [ ] **Scenario 1**: `AbortFlagMap` singleton tracks in-flight streams
    - **Given** `apps/backend-services/src/agent/abort-flag-map.ts`
    - **When** read after the change
    - **Then** it exports an `AbortFlagMap` Injectable with `register(conversationId): AbortSignal`, `signal(conversationId)`, `abort(conversationId)`, `clear(conversationId)`
    - **And** `register` is idempotent (re-registering the same id while still in-flight throws — only one stream per conversation at a time)
    - **And** `clear` is called from `AgentService` after the stream completes or errors (cleanup)

- [ ] **Scenario 2**: `AgentService.runChat()` checks the abort signal between SDK turns
    - **Given** `agent.service.ts`
    - **When** read after the change
    - **Then** the implementation registers an `AbortSignal` at stream start via `AbortFlagMap.register`
    - **And** between each SDK iteration boundary (e.g. before invoking the next `query()` step), it checks `signal.aborted` and short-circuits the loop if set, emitting one `agent-error` event with `{ code: 'aborted-by-user', message: '...' }` then closing
    - **And** the assistant `ChatMessage` for the in-flight turn is written with whatever text + tool-calls landed so far (partial state preserved)

- [ ] **Scenario 3**: `POST /api/agent/conversations/:id/abort` endpoint
    - **Given** `agent.controller.ts`
    - **When** read after the change
    - **Then** the endpoint resolves the caller, validates ownership of the conversation via `findByIdForUser`, calls `AbortFlagMap.abort(id)`, returns 200 `{ ok: true }`
    - **And** is idempotent (calling abort when no stream is in flight returns 200 anyway)
    - **And** returns 404 if conversation doesn't exist OR caller doesn't own it

- [ ] **Scenario 4**: `DELETE /api/agent/conversations/:id` endpoint
    - **Given** the controller
    - **When** read after the change
    - **Then** the endpoint validates ownership + calls `ChatConversationRepository.hardDelete(id)` + returns 204
    - **And** the cascade defined in US-188 removes all `ChatMessage` rows automatically
    - **And** if a stream is in flight for that conversation, `AbortFlagMap.abort(id)` fires before the delete

- [ ] **Scenario 5**: Unit + smoke tests
    - **Given** extended `agent.controller.spec.ts` + `agent.service.spec.ts` + new `abort-flag-map.spec.ts`
    - **When** run via `npm test`
    - **Then** tests cover: abort flag short-circuits SDK loop, abort endpoint is idempotent, abort returns 404 on cross-user access, DELETE cascades to messages, DELETE aborts in-flight stream, double-stream registration throws

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/abort-flag-map.ts` — new
- `apps/backend-services/src/agent/abort-flag-map.spec.ts` — new
- `apps/backend-services/src/agent/agent.service.ts` — wire abort signal
- `apps/backend-services/src/agent/agent.controller.ts` — add two endpoints + Swagger
- `apps/backend-services/src/agent/agent.controller.spec.ts` — extend
- `apps/backend-services/src/agent/dto/` — minimal new DTO for the abort response if needed

## Technical notes

- Per L29 + L30 + L50 in REQUIREMENTS.md.
- Closes Milestone C — backend is now fully autonomous + abortable + deletable.
- The abort flag map is an in-memory singleton — does NOT survive backend restarts. That's intentional: if the backend restarts mid-stream, the SDK call dies anyway.
- Per L51, no concurrency lock on the underlying workflow — abort just stops the agent from continuing to issue tool calls.
