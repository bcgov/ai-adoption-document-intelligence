# US-009: HumanGateNodeSettings form

**As a** workflow author,
**I want to** configure a HumanGate node — signal name, timeout, on-timeout behaviour, and optional fallback edge,
**So that** I can pause a workflow for human approval in the visual editor.

## Acceptance Criteria

- [ ] **Scenario 1**: `signal.name` is a required `TextInput`
    - **Given** a `HumanGateNode` is selected
    - **When** the user types a signal name
    - **Then** `onConfigChange` fires with `signal.name` updated; an empty value shows an inline required-field error

- [ ] **Scenario 2**: `signal.payloadSchema` shows a read-only JSON preview with an "advanced" hint
    - **Given** the node has a non-empty `signal.payloadSchema`
    - **When** the form renders
    - **Then** the schema is shown as read-only JSON and an advisory hint indicates schema authoring is not yet supported in V2

- [ ] **Scenario 3**: `timeout` is a required `TextInput` validated as a Temporal duration
    - **Given** the user types `"1h"`, then `""`, then `"abc"`
    - **When** each is committed
    - **Then** `"1h"` is accepted via `onConfigChange`; the empty and invalid values trigger inline errors and are not propagated

- [ ] **Scenario 4**: `onTimeout` is a SegmentedControl with `fail` / `continue` / `fallback`
    - **Given** `onTimeout === "fail"` initially
    - **When** the user clicks each segment in turn
    - **Then** `onConfigChange` fires with the matching value each time

- [ ] **Scenario 5**: `fallbackEdgeId` appears only when `onTimeout === "fallback"`
    - **Given** the node is selected with `onTimeout === "fail"`
    - **When** the user changes `onTimeout` to `fallback`
    - **Then** an `EdgePicker` for `fallbackEdgeId` appears (scoped to edges from this node), and switching `onTimeout` back to `fail` or `continue` hides it again

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Lives at `apps/frontend/src/features/workflow-builder/settings/control-flow/HumanGateNodeSettings.tsx`.
- Consumes US-002 (EdgePicker).
- Receives the narrowed `HumanGateNode` type.
- Temporal duration regex shared with `PollUntilNodeSettings` (US-008).
- Accompanied by a smoke test.
