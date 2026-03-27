# US-017: Temporal workflow for agentic feedback loop

**As a** system,
**I want** the end-to-end agentic loop implemented as a Temporal workflow (or a Temporal schedule that starts such a workflow) that fetches HITL data, runs the AI recommendation pipeline, runs the workflow modification utility, starts the benchmark run with workflow override, waits for completion, reads the baseline comparison, and conditionally replaces the workflow,
**So that** the loop is durable, visible, and can wait for the benchmark run to complete before deciding on replacement.

## Acceptance Criteria
- [ ] **Scenario 1**: Loop implemented as Temporal workflow
    - **Given** the loop steps: HITL fetch → AI recommendation → workflow modification → start benchmark run (with override) → wait for run completion → read comparison → conditional replacement
    - **When** the loop is executed
    - **Then** it runs as a Temporal workflow (or is triggered by a Temporal schedule); each step may be one or more activities

- [ ] **Scenario 2**: Activities for each major step
    - **Given** the workflow
    - **When** it runs
    - **Then** it uses activities (or child workflows) for: fetching aggregated HITL data (Feature 008), calling the AI recommendation pipeline (Feature 008), running the workflow modification utility and persisting the new version (Feature 008), starting the benchmark run (with workflow override), waiting for run completion, reading the baseline comparison from the run record, and performing replacement when appropriate (US-016)

- [ ] **Scenario 3**: End-to-end documented
    - **Given** the implementation
    - **When** a developer or operator runs or debugs the loop
    - **Then** the end-to-end flow is documented: HITL data in → AI recommendation → workflow modification → start candidate run → wait → read comparison → conditional replacement

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Feature 008A Step 2. Depends on Feature 008 (US-007 through US-013) and 008A US-015, US-016.
