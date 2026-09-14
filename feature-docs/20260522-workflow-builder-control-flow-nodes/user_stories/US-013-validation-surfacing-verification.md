# US-013: Verify validation surfacing for control-flow nodes

**As a** workflow author,
**I want to** see clear validation errors when I misconfigure a control-flow node,
**So that** I catch problems in the editor rather than at workflow execution time.

## Acceptance Criteria

- [x] **Scenario 1**: A switch node with no cases lights up the validation drawer
    - **Given** a switch node is added but has `cases: []` and no `defaultEdge`
    - **When** the debounced validator runs
    - **Then** a red badge appears on the switch node and the validation drawer lists the error

- [x] **Scenario 2**: A join node whose `sourceMapNodeId` points to a non-map (or missing) node lights up the validation drawer
    - **Given** a join node with `sourceMapNodeId` set to an activity node's id (or a deleted id)
    - **When** the validator runs
    - **Then** a red badge appears on the join node and the validation drawer lists the error

- [x] **Scenario 3**: A PollUntil with an invalid `interval` lights up the validation drawer
    - **Given** a pollUntil node with `interval: "not-a-duration"`
    - **When** the validator runs
    - **Then** a red badge appears on the node and the validation drawer lists the error
    - **GAP (filed as follow-up)**: the shared `validateGraphConfig` does not currently validate Temporal-duration grammar on `pollUntil.interval` (or `initialDelay` / `timeout` / `humanGate.timeout`). The frontend `PollUntilNodeSettings` form does show an inline error via `apps/frontend/src/features/workflow-builder/settings/control-flow/duration-validation.ts`, but invalid durations are never surfaced in the canvas red badges or the validation drawer. See SESSION_HANDOFF.md "Known limitations" for the follow-up. The new test `packages/graph-workflow/src/validator/validator.test.ts` (`US-013 Scenario 3`) pins the current behaviour so the fix can flip the expectation in one place.

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Verification-only story — the existing debounced `validateGraphConfig` should already cover these shapes (commit `c8dc5cc7` wired the drawer). If a gap is discovered (e.g. validator doesn't surface a particular control-flow misconfiguration), raise it as a follow-up; do not patch the validator inside this feature unless trivial.
- Update `docs-md/workflow-builder/SESSION_HANDOFF.md` "Known limitations" section to remove the now-resolved item "The settings panel renders `n.type !== 'activity'` nodes (the control-flow ones) with a stub. Control-flow nodes can be saved via the JSON editor; cannot yet be added via the visual editor."
