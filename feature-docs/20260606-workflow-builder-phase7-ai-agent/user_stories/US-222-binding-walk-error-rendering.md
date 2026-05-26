# US-222: Binding-walk error rendering in `AgentToolCallCard`

**As a** frontend engineer surfacing Phase 3 typed-I/O errors,
**I want** the `AgentToolCallCard` to detect Phase 3 binding-walk errors and render them with the offending ctx key + node id visually highlighted,
**So that** when the agent's `connectNodes` / `setCtxKind` produces a binding error, the user can see exactly which port + ctx are mismatched.

## Acceptance Criteria

- [ ] **Scenario 1**: `BindingWalkErrorList` sub-component
    - **Given** `messages/error-renderers/BindingWalkErrorList.tsx`
    - **When** read after the change
    - **Then** it renders each error in a red-bordered Mantine `<Card>` with a structured layout:
        - Top row: "Port `<port>` on node `<id>`"
        - Middle row: `<consumerKind>` expected ← `<producerKind>` provided
        - Bottom row: "from ctx key `<ctxKey>` written by node `<producerId>`"
    - **And** kinds + ctx key + node ids are rendered as Mantine `<Code>` so they stand out

- [ ] **Scenario 2**: Detect binding-walk errors from the message format
    - **Given** an error with `code === 'validation'` AND `body.errors` containing strings matching the Phase 3 binding-walk format ("Input port `...` (<Kind>) on node `...` reads from ctx key `...` written by node `...` (<Kind>) — <Kind> not assignable to <Kind>")
    - **When** the card renders
    - **Then** the card dispatches to `<BindingWalkErrorList />` with the parsed errors
    - **And** errors that don't match the binding-walk format fall back to the generic renderer

- [ ] **Scenario 3**: Parser extracts the structured fields from the Phase 3 string
    - **Given** `messages/error-renderers/parseBindingWalkError.ts`
    - **When** called with the Phase 3 error string
    - **Then** it returns `{ port, consumerKind, nodeId, ctxKey, producerNodeId, producerKind } | null`
    - **And** returns null for non-matching strings
    - **And** unit tests cover the exact Phase 3 wording (positive + negative cases)

- [ ] **Scenario 4**: Auto-revise indicator
    - **Given** a binding-walk error card in expanded state
    - **When** the agent's NEXT tool call within the same turn is `setCtxKind`, `connectNodes`, or `addNode`
    - **Then** a "Agent is adjusting bindings…" footer renders
    - **And** the indicator clears on success of the next bind / connect / addNode

- [ ] **Scenario 5**: Component + parser tests
    - **Given** spec files for the parser + the list
    - **When** run via `npm test`
    - **Then** tests cover: parser extracts fields for the exact Phase 3 string, parser returns null for malformed strings, list renders structured layout, multiple errors render as separate cards, the auto-revise indicator behaviour

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/messages/error-renderers/BindingWalkErrorList.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/error-renderers/BindingWalkErrorList.spec.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/error-renderers/parseBindingWalkError.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/error-renderers/parseBindingWalkError.spec.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/AgentToolCallCard.tsx` — dispatch on parse-match

## Technical notes

- Per L18 in REQUIREMENTS.md.
- The exact Phase 3 wording the parser targets is from Phase 3 Milestone B (US-093): ``Input port `<port>` (<consumerKind>) on node `<id>` reads from ctx key `<ctx>`, written by node `<producer>` (<producerKind>) — <producerKind> not assignable to <consumerKind>``.
- The parser is regex-based + tolerant to surrounding whitespace; tests cover edge cases.
