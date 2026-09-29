# US-195: `WorkflowMcpServer` factory + minimal event translator (text + done + error)

**As a** backend engineer bridging the registry to the SDK,
**I want** a `createWorkflowMcpServer(registry, ctx)` factory that produces the SDK-shaped MCP server, plus a translator that decodes the SDK's stream events into our stable SSE wire shape for text-deltas, agent-done, and agent-error,
**So that** the SDK's `query()` call has a working tool surface AND the SSE controller can emit consistent typed events to the frontend.

## Acceptance Criteria

- [x] **Scenario 1**: `WorkflowMcpServer` factory wires the registry into the SDK shape
    - **Given** `apps/backend-services/src/agent/mcp-server.ts`
    - **When** read after the change
    - **Then** it exports `createWorkflowMcpServer(registry: ToolRegistry, ctx: McpContext): SdkMcpServer`
    - **And** internally it calls `createSdkMcpServer({ name: 'workflow', tools })` from `@anthropic-ai/claude-agent-sdk` where `tools` is built by mapping `registry.getAll()` to the SDK's expected `{ name, description, inputSchema: zodSchema, handler: (input) => registry handler bound with ctx }` shape
    - **And** the SDK-exposed name becomes `mcp__workflow__<toolName>` automatically (per the SDK's MCP server naming rules)

- [x] **Scenario 2**: Tool handler binding captures `ctx` correctly
    - **Given** the factory
    - **When** the SDK calls a tool through the returned MCP server
    - **Then** the handler receives the original `input` (validated against `inputSchema`)
    - **And** the `ctx` parameter is the one passed when the factory was invoked (per-request context)
    - **And** handler errors are caught + converted to `{ ok: false, error: { code: 'handler-error', message } }` so the SDK sees a valid tool result not a thrown exception

- [x] **Scenario 3**: `EventTranslator` decodes text-delta + agent-done + agent-error
    - **Given** `apps/backend-services/src/agent/event-translator.ts`
    - **When** read after the change
    - **Then** it exports `EventTranslator` with `translate(sdkEvent): SseEvent[]` mapping:
        - SDK text-delta events → `{ type: 'text-delta', delta: string }`
        - SDK turn-complete with usage → `{ type: 'agent-done', usage: { inputTokens, outputTokens, totalTokens }, finishReason }`
        - SDK errors → `{ type: 'agent-error', code, message }`
    - **And** tool-call events are stubbed (return `[]` for now — full handling in US-203)
    - **And** unit tests cover each shape

- [x] **Scenario 4**: Translator buffers text-deltas for DB persistence
    - **Given** the translator
    - **When** multiple text-delta events fire within one assistant turn
    - **Then** the translator exposes `flushTurnText(): string` returning the merged text since the last flush
    - **And** the controller (US-196) calls `flushTurnText()` once per `agent-done` event to write the merged text into a single `ChatMessage.content`

- [x] **Scenario 5**: Factory + translator unit tests pass
    - **Given** `mcp-server.spec.ts` + `event-translator.spec.ts`
    - **When** run via `npm test`
    - **Then** factory tests cover: empty registry produces an MCP server with zero tools, registry with N tools produces an MCP server with N tools, handler errors are caught, ctx is correctly bound
    - **And** translator tests cover: text-delta concatenation, agent-done event shape, agent-error event shape, ignore-tool-calls-for-now behaviour

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/mcp-server.ts` — new
- `apps/backend-services/src/agent/mcp-server.spec.ts` — new
- `apps/backend-services/src/agent/event-translator.ts` — new
- `apps/backend-services/src/agent/event-translator.spec.ts` — new

## Technical notes

- Per L11 + L32 + L34 + L38 in REQUIREMENTS.md.
- Depends on US-190 (registry) + US-192/193/194 (registered tools).
- Tool-call event handling is stubbed in this story so the read-only SSE endpoint (US-196) can ship in Milestone B; full tool-call event handling lands in US-203 with write tools.
- The SDK exposes tools as `mcp__workflow__<name>` automatically — the factory passes the bare name in the registry, the SDK prefixes.
