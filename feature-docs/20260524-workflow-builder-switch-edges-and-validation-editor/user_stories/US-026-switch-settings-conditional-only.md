# US-026: `SwitchNodeSettings` per-case and default pickers filter to `conditional` edges

**As a** workflow author editing a switch's cases,
**I want** the edge dropdown to show only conditional edges originating at
this switch,
**So that** I can't bind a case to a `normal` edge by mistake.

## Acceptance Criteria

- [x] **Scenario 1**: Per-case `EdgePicker` receives the conditional filter
    - **Given** a rendered `SwitchNodeSettings` with one case row
    - **When** the case row's `EdgePicker` is inspected
    - **Then** it is invoked with `edgeTypes={["conditional"]}` (verified via the same testing pattern used elsewhere — assert on Props if a stub, or open the dropdown and check option visibility)

- [x] **Scenario 2**: Default-edge `EdgePicker` receives the same filter
    - **Given** a rendered `SwitchNodeSettings`
    - **When** the default-edge picker is inspected
    - **Then** it is invoked with `edgeTypes={["conditional"]}`

- [x] **Scenario 3**: Loading the `multi-page-report-workflow.json` template populates all four pickers
    - **Given** a `SwitchNodeSettings` mounted with the `segmentRouter` switch and the template's edges (4 conditional edges from `segmentRouter`)
    - **When** the panel renders
    - **Then** each of the three case rows' `EdgePicker` has a selected value (`edge-to-monthly-report`, `edge-to-pay-stub`, `edge-to-bank-record`)
    - **And** the default picker has `edge-to-unknown` selected

- [x] **Scenario 4**: A `normal` edge from the switch is excluded
    - **Given** a switch with one `conditional` and one `normal` edge sourced at it
    - **When** the case row's picker dropdown is opened
    - **Then** only the conditional edge appears as an option

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Pass the `edgeTypes={["conditional"]}` prop from US-022 into both
  picker call sites in `SwitchNodeSettings.tsx`.
- This story is a thin wire-up + test update; no new logic.
- TDD: extend `SwitchNodeSettings.test.tsx` per the four scenarios.

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.tsx`
- `apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.test.tsx`
