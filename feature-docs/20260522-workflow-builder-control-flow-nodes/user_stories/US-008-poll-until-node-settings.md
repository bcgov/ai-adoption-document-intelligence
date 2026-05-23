# US-008: PollUntilNodeSettings form

**As a** workflow author,
**I want to** configure a PollUntil node — which activity to invoke, termination condition, interval and limits,
**So that** I can author polling loops in the visual editor.

## Acceptance Criteria

- [ ] **Scenario 1**: `activityType` is a Select populated from `ACTIVITY_CATALOG`
    - **Given** the catalog has 41 entries
    - **When** the user opens the `activityType` Select
    - **Then** all 41 activity types appear (grouped by category) and selection updates the field via `onConfigChange`

- [ ] **Scenario 2**: When `activityType` is chosen, `JsonSchemaForm` renders for `parameters`
    - **Given** the user has selected `azure.classify.poll` as the activity type
    - **When** the form re-renders
    - **Then** `JsonSchemaForm` renders the chosen activity's `parametersSchema` and edits propagate to the node's `parameters` field via `onConfigChange`

- [ ] **Scenario 3**: `condition` uses `ConditionExpressionEditor`
    - **Given** a `PollUntilNode` with no condition is selected
    - **When** the user authors `equals(ctx.status, "completed")`
    - **Then** `onConfigChange` fires with the equivalent `ConditionExpression`

- [ ] **Scenario 4**: `interval` is a `TextInput` validated as a Temporal duration
    - **Given** the user types `"30s"`, then `"abc"`, then `"5m"`
    - **When** each value is committed
    - **Then** the first and third are accepted; the second triggers an inline validation error and is not propagated via `onConfigChange`

- [ ] **Scenario 5**: Optional fields `maxAttempts`, `initialDelay`, `timeout`
    - **Given** a `PollUntilNode` is selected
    - **When** the user populates `maxAttempts: 10`, `initialDelay: "5s"`, `timeout: "10m"` and clears each
    - **Then** `onConfigChange` correctly toggles each between set and `undefined`, with duration-format validation applied to the two duration fields

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Lives at `apps/frontend/src/features/workflow-builder/settings/control-flow/PollUntilNodeSettings.tsx`.
- Consumes US-003 (ConditionExpressionEditor) and the existing `JsonSchemaForm`.
- Receives the narrowed `PollUntilNode` type.
- Temporal duration regex shared with `HumanGateNodeSettings` (US-009) — extract to a small util if duplicated.
- Accompanied by a smoke test.
