# US-203: Auto-mode wiring + full tool-call event translation

**As a** backend engineer turning on auto-mode + structured tool-call streaming,
**I want** `AgentService` to pass `permissionMode: 'bypassPermissions'` + max-turns + max-output-tokens, and the event translator to fully decode tool-call-start / tool-call-complete / tool-call-error events with DB buffering,
**So that** the agent runs autonomously and the chat surface receives structured tool-call cards in real time.

## Acceptance Criteria

- [x] **Scenario 1**: `permissionMode: 'bypassPermissions'` wired into `SDK.query()`
    - **Given** `agent.service.ts`
    - **When** read after the change
    - **Then** the `SDK.query()` options object includes `permissionMode: 'bypassPermissions'`
    - **And** every write tool from US-198 → US-202 executes without prompting
    - **And** `maxTurns: env.AGENT_MAX_TURNS` + `maxOutputTokens: env.AGENT_MAX_OUTPUT_TOKENS` from US-187's `AgentEnv` are passed

- [x] **Scenario 2**: Translator decodes `tool-call-start` + `tool-call-complete` + `tool-call-error` events
    - **Given** `event-translator.ts`
    - **When** read after the change
    - **Then** SDK tool-call events map to:
        - `{ type: 'tool-call-start', id, name, input: <partial> }` on first tool-call event
        - `{ type: 'tool-call-complete', id, input, output }` when the SDK completes the tool round-trip
        - `{ type: 'tool-call-error', id, error: { code, message, body? } }` when the handler returned `{ ok: false }`
    - **And** unit tests cover each event shape

- [x] **Scenario 3**: Tool-call records persisted to `ChatMessage.content`
    - **Given** the translator buffering tool-call pairs
    - **When** an assistant turn completes (SDK emits `agent-done`)
    - **Then** the assistant `ChatMessage.content` JSON contains both the merged text AND structured `tool_calls: [{ id, name, input, output | error }]` entries in order
    - **And** the DB shape matches the `AgentMessageDto` shape so reopening the conversation produces an identical UI

- [x] **Scenario 4**: Context-compression env var read by SDK options
    - **Given** the SDK supporting context-compression configuration
    - **When** `agent.service.ts` calls `SDK.query()`
    - **Then** options include the SDK's context-compression threshold derived from `env.AGENT_CONTEXT_COMPRESSION_THRESHOLD`
    - **And** if the SDK version doesn't yet expose this option name, the service exposes a clearly-named adapter that maps the env var to whatever the SDK exposes (and a TODO comment + tracking link is left for the version mismatch case)

- [x] **Scenario 5**: End-to-end smoke with a write tool
    - **Given** a backend running with the full registry
    - **When** a curl-driven SSE request reads "create a workflow named X and add a document.classify node"
    - **Then** the SSE stream emits `tool-call-start` + `tool-call-complete` events for both `createWorkflow` and `addNode` without any approval prompt
    - **And** the resulting workflow exists in the DB after the stream closes
    - **And** the assistant's `ChatMessage` row contains both tool-call records

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/agent.service.ts` — wire auto-mode + max-turns + max-output-tokens + compression
- `apps/backend-services/src/agent/agent.service.spec.ts` — extend
- `apps/backend-services/src/agent/event-translator.ts` — extend to handle tool-call events
- `apps/backend-services/src/agent/event-translator.spec.ts` — extend

## Technical notes

- Per L8 + L9 + L38 in REQUIREMENTS.md.
- This story flips the autonomous loop ON. Until this story, write tools were defined but the SDK's permission gates blocked them from running in `query()`.
- Tool-call DB buffering matters for L10's "reopen drawer = replay history" requirement (US-211/F).
