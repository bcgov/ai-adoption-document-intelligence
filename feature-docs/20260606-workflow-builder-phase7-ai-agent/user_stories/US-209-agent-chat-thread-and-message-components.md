# US-209: `AgentChatThread` + text + tool-call + error message components

**As a** frontend engineer rendering chat content,
**I want** assistant-ui's `Thread` primitive mounted with our runtime, plus three message-renderer components for text turns, tool-call cards, and error cards,
**So that** the drawer body shows real conversation content with collapsed-by-default tool-call cards that expand to JSON detail.

## Acceptance Criteria

- [x] **Scenario 1**: `AgentChatThread` mounts assistant-ui's `Thread`
    - **Given** `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatThread.tsx`
    - **When** read after the change
    - **Then** the component wraps an `<AssistantRuntimeProvider runtime={runtime}>` around assistant-ui's `<Thread>` primitive
    - **And** `runtime` comes from `useClaudeAgentSDKRuntime()` (US-206)
    - **And** the Thread renders inside the drawer body in place of the placeholder from US-207

- [x] **Scenario 2**: `AgentTextMessage` renders user + assistant text
    - **Given** `messages/AgentTextMessage.tsx`
    - **When** read after the change
    - **Then** it renders a Mantine `<Box>` styled per role: user (right-aligned, primary tint), assistant (left-aligned, neutral tint)
    - **And** markdown is rendered via the existing project's markdown component (or `react-markdown` with safe defaults — confirm which is already in use)
    - **And** assistant text supports streaming (renders progressively as `text-delta` events arrive)

- [x] **Scenario 3**: `AgentToolCallCard` renders collapsed + expanded states
    - **Given** `messages/AgentToolCallCard.tsx`
    - **When** read after the change
    - **Then** the card shows: tool icon + tool name + status pill + chevron toggle in the header
    - **And** collapsed body (default): one-line summary derived from tool name + key input fields (e.g. `addNode → document.classify connected to upload1`)
    - **And** expanded body: two `<Monaco editor readOnly>` blocks side-by-side — input JSON / output JSON (or "running…" if no output yet)
    - **And** status pill colors: green for ok, red for error, gray + spinner for running

- [x] **Scenario 4**: `AgentErrorMessage` renders fatal agent errors
    - **Given** `messages/AgentErrorMessage.tsx`
    - **When** read after the change
    - **Then** the component renders a red Mantine `<Alert>` showing the error message
    - **And** if `code === 'aborted-by-user'`, the alert text reads "Aborted" with a distinct neutral color (not red)
    - **And** the runtime adapter renders this for any `agent-error` event

- [x] **Scenario 5**: Component tests cover all three renderers
    - **Given** spec files alongside each component
    - **When** run via `npm test`
    - **Then** tests cover: text message renders for both roles, streaming text appends, tool-call card collapse/expand toggles work, tool-call card color reflects status, tool-call card error state expanded by default, error message renders for code 'aborted-by-user' differently

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatThread.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatThread.spec.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/AgentTextMessage.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/AgentTextMessage.spec.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/AgentToolCallCard.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/AgentToolCallCard.spec.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/AgentErrorMessage.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/AgentErrorMessage.spec.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatDrawer.tsx` — swap placeholder for `<AgentChatThread>`

## Technical notes

- Per L14 + L43 + L45 in REQUIREMENTS.md.
- Structured `error.body` rendering (e.g. dynamic-node ParseError list, binding-walk error highlighting) lands in Milestone F (US-221 / US-222) — basic error-message coverage in this story is "show the message + code in a red alert".
- The summary-text derivation per tool name uses a small lookup table at `messages/tool-summaries.ts` — extend as new tools land.
