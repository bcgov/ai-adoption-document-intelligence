# US-196: `AgentService` orchestrator + `POST /api/agent/chat` SSE endpoint (read-only)

**As a** backend engineer wiring the chat surface end-to-end,
**I want** `AgentService.runChat()` that calls `SDK.query()` with the read-tool registry, plus a NestJS `@Sse` controller endpoint that streams the translated events,
**So that** the frontend can hit a single endpoint and stream a working agent conversation (read-only in this story).

## Acceptance Criteria

- [ ] **Scenario 1**: `AgentService.runChat()` orchestrates one chat turn
    - **Given** `apps/backend-services/src/agent/agent.service.ts`
    - **When** read after the change
    - **Then** it exposes `runChat({ conversationId, workflowId, message, userId, groupId }): Observable<SseEvent>`
    - **And** the implementation: (1) loads or creates the `ChatConversation`, (2) writes the user `ChatMessage` row, (3) builds `McpContext`, (4) calls `SDK.query({ prompt: message, options: { model, systemPrompt: loadWorkflowBuilderPrompt(), mcpServers: { workflow: createWorkflowMcpServer(registry, ctx) }, allowedTools: ['mcp__workflow__*'], maxTurns, maxOutputTokens } })` — note: NO `permissionMode: 'bypassPermissions'` in this story (write tools land in US-203)
    - **And** streams the SDK's events through `EventTranslator` to the Observable
    - **And** on `agent-done` writes the assistant `ChatMessage` row with merged text + usage

- [ ] **Scenario 2**: `POST /api/agent/chat` controller endpoint exists
    - **Given** `apps/backend-services/src/agent/agent.controller.ts`
    - **When** read after the change
    - **Then** the controller defines `POST /api/agent/chat` with `@Sse()`
    - **And** the handler signature accepts `@Body() body: AgentChatRequestDto` + resolves the authenticated principal to extract `userId` + `groupId`
    - **And** the controller pipes `AgentService.runChat(...)` through to the SSE stream
    - **And** each Observable emission becomes one `event: <type>\ndata: <json>\n\n` SSE frame

- [ ] **Scenario 3**: `AgentChatRequestDto` defined with full Swagger
    - **Given** `apps/backend-services/src/agent/dto/agent-chat-request.dto.ts`
    - **When** read after the change
    - **Then** the DTO carries `conversationId?: string`, `workflowId?: string`, `message: string` (min length 1), and `attachments?: AgentChatRequestAttachmentDto[]`
    - **And** each field has `@ApiProperty()` decorators with type, nullability, and example values
    - **And** the controller uses `@ApiOperation()` describing the SSE event shape per L11 (text-delta / agent-done / agent-error events for this story; tool-call events added in US-203)

- [ ] **Scenario 4**: Read-only end-to-end smoke
    - **Given** a backend running locally with `ANTHROPIC_API_KEY` set + a workflow seeded in the DB
    - **When** `curl -N -H "x-api-key: <key>" -X POST http://localhost:3002/api/agent/chat -d '{"message": "list activity catalog"}'`
    - **Then** the response is `text/event-stream`
    - **And** at least one `text-delta` event arrives
    - **And** at least one `tool-call-complete`-shaped raw SDK event fires the `listActivityCatalog` handler (verifiable in service logs) — though the translator returns `[]` for tool calls in this story per US-195
    - **And** one `agent-done` event arrives carrying usage

- [ ] **Scenario 5**: Service unit tests with a mocked SDK
    - **Given** `agent.service.spec.ts`
    - **When** run via `npm test`
    - **Then** tests cover: conversation creation when `conversationId` omitted, conversation reuse when `conversationId` provided, user message persisted before SDK call, assistant message persisted on `agent-done`, error event when SDK throws
    - **And** the mocked SDK emits a scripted event stream — tests do NOT hit the real Anthropic API

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/agent.service.ts` — new
- `apps/backend-services/src/agent/agent.service.spec.ts` — new
- `apps/backend-services/src/agent/agent.controller.ts` — new
- `apps/backend-services/src/agent/agent.controller.spec.ts` — new
- `apps/backend-services/src/agent/dto/agent-chat-request.dto.ts` — new
- `apps/backend-services/src/agent/dto/agent-chat-request-attachment.dto.ts` — new
- `apps/backend-services/src/agent/agent.module.ts` — register controller + service

## Technical notes

- Per L11 + L26 + L31 in REQUIREMENTS.md.
- Depends on US-189 (repositories), US-190 (registry), US-191 (prompt), US-195 (factory + translator).
- The SDK's `query()` function returns an async iterable; service code consumes it and translates events on the fly.
- This story is the first verifiable surface for Alex — Milestone B verification per REQUIREMENTS.md §6.
