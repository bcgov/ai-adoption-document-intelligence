# US-221: `ParseError[]` rendering in `AgentToolCallCard` for dynamic-node publish failures

**As a** frontend engineer making dynamic-node failures readable in chat,
**I want** the `AgentToolCallCard` to detect `error.code === 'dynamic-node-publish'` and render the structured `ParseError[]` body with line / column / stage / message in a styled list,
**So that** the user can see exactly what the agent saw + understand why the agent is about to revise the script.

## Acceptance Criteria

- [x] **Scenario 1**: `ParseErrorList` sub-component
    - **Given** `messages/error-renderers/ParseErrorList.tsx`
    - **When** read after the change
    - **Then** it renders a Mantine `<List>` where each item shows: stage pill (jsdoc-parse / signature-semantics / ts-check / allowlist) + `line N col M` chip + message
    - **And** items without line/column show no chip
    - **And** the list is rendered in a red-bordered Mantine `<Alert>`

- [x] **Scenario 2**: `AgentToolCallCard` dispatches to `ParseErrorList` on the right error code
    - **Given** the card receiving a tool-call-error part with `error.code === 'dynamic-node-publish'` and `error.body.errors: ParseError[]`
    - **When** the card renders in expanded state
    - **Then** the error region shows `<ParseErrorList errors={error.body.errors} />` BELOW the input-JSON Monaco block
    - **And** for any other error code, the existing generic error rendering applies (red message + JSON body)

- [x] **Scenario 3**: First parse error highlighted by default
    - **Given** the error list rendered
    - **When** the user views the card
    - **Then** the first item in the list is visually emphasised (slight background tint or a leading arrow icon) so the eye lands there first
    - **And** subsequent items render normally

- [x] **Scenario 4**: Card shows "Revising…" indicator after the error
    - **Given** an error card in expanded state
    - **When** the agent's NEXT tool call is `publishDynamicNode` again within the same turn (i.e. the agent is revising)
    - **Then** a subtle "Agent is revising the script…" footer renders below the error list
    - **And** when the next publishDynamicNode SUCCEEDS, the indicator clears + a small "Revised + republished as v<N>" success line appears

- [x] **Scenario 5**: Component tests
    - **Given** `ParseErrorList.spec.tsx` + extended `AgentToolCallCard.spec.tsx`
    - **When** run via `npm test`
    - **Then** tests cover: parse errors render with line/column, errors without line/column render without chips, first error emphasised, non-parse-error codes use generic renderer, revising footer appears when next call is publishDynamicNode, success line appears after a republish

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/messages/error-renderers/ParseErrorList.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/error-renderers/ParseErrorList.spec.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/AgentToolCallCard.tsx` — dispatch on `error.code`
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/AgentToolCallCard.spec.tsx` — extend

## Technical notes

- Per L14 + L18 + L40 in REQUIREMENTS.md.
- Depends on US-201 (publishDynamicNode tool returning ParseError[] in error.body).
- This is the visual surface for the dynamic-node escape hatch — gives the user confidence the agent is fixing the right thing.
