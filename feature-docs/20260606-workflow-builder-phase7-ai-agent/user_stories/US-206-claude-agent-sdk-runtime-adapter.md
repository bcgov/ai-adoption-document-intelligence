# US-206: `ClaudeAgentSDKRuntime` adapter + SSE stream parser

**As a** frontend engineer bridging the backend SSE protocol to assistant-ui,
**I want** a custom runtime adapter that consumes the L11 SSE event stream and exposes assistant-ui's expected `ThreadMessage[]` reactive shape,
**So that** assistant-ui's `Thread` primitive can render our backend's events without any wire-protocol coupling.

## Acceptance Criteria

- [ ] **Scenario 1**: `sse-stream-parser.ts` decodes one event per frame
    - **Given** `apps/frontend/src/features/workflow-builder/agent-chat/runtime/sse-stream-parser.ts`
    - **When** read after the change
    - **Then** it exports `parseSseStream(response: Response, signal: AbortSignal): AsyncIterable<SseEvent>`
    - **And** the parser reads the response body chunk-by-chunk, splits on `\n\n`, decodes `event: <type>\ndata: <json>\n\n` frames, yields typed `SseEvent` objects
    - **And** the parser respects `signal.aborted` — closes the underlying reader cleanly when aborted

- [ ] **Scenario 2**: `SseEvent` discriminated union types defined
    - **Given** `runtime/sse-event.types.ts`
    - **When** read after the change
    - **Then** it exports `type SseEvent = TextDeltaEvent | ToolCallStartEvent | ToolCallCompleteEvent | ToolCallErrorEvent | AgentDoneEvent | AgentErrorEvent` matching backend L11 shapes verbatim
    - **And** every event has a literal-typed `type` discriminant

- [ ] **Scenario 3**: `ClaudeAgentSDKRuntime` builds assistant-ui's `ThreadMessage[]` state
    - **Given** `runtime/ClaudeAgentSDKRuntime.ts`
    - **When** read after the change
    - **Then** it exports a `useClaudeAgentSDKRuntime()` hook returning the shape assistant-ui's `AssistantRuntimeProvider` accepts (per assistant-ui's `useExternalStoreRuntime` API or equivalent custom-runtime hook)
    - **And** the runtime exposes: `messages: ThreadMessage[]`, `isRunning: boolean`, `onNew(message)`, `onCancel()`
    - **And** `messages` is a reducer-driven array that grows on each SSE event (text-deltas append to the last assistant text part; tool-call events become custom `tool-call` parts)

- [ ] **Scenario 4**: Tool-call parts carry the full input + output for `AgentToolCallCard` rendering
    - **Given** the adapter
    - **When** a `tool-call-complete` event arrives
    - **Then** the corresponding `ThreadMessage` part is `{ type: 'tool-call', toolCallId, toolName, args: input, result: output }`
    - **And** if the tool errored, the part is `{ type: 'tool-call', toolCallId, toolName, args: input, error }` (no `result`)
    - **And** the adapter prefers the most recent `tool-call-complete` for a given `toolCallId` when there's an in-flight `tool-call-start` followed by `tool-call-complete`

- [ ] **Scenario 5**: Unit tests cover parser + runtime
    - **Given** `sse-stream-parser.spec.ts` + `ClaudeAgentSDKRuntime.spec.ts`
    - **When** run via `npm test`
    - **Then** parser tests cover: single-event frame, multi-event frame (one fetch chunk with two events), partial-event frame (split across chunks), abort cancels the read
    - **And** runtime tests cover: text-delta concatenation, tool-call-start → tool-call-complete pairing, tool-call-error rendering, agent-error event closes the stream + sets `isRunning: false`

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/runtime/sse-stream-parser.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/runtime/sse-stream-parser.spec.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/runtime/sse-event.types.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/runtime/ClaudeAgentSDKRuntime.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/runtime/ClaudeAgentSDKRuntime.spec.ts` — new

## Technical notes

- Per L11 + L43 + L44 in REQUIREMENTS.md.
- Depends on US-205 (assistant-ui installed).
- assistant-ui's docs describe two custom-runtime APIs: `useExternalStoreRuntime` (recommended for non-AI-SDK backends) and `useLocalRuntime`. Pick `useExternalStoreRuntime` because we're driving the state from SSE events, not local promises.
- File-drop / queued-files logic is OUT of scope for this story — composer file drop lands in Milestone E.
- Mid-stream navigation logic is OUT of scope — lands in Milestone E (US-216).
