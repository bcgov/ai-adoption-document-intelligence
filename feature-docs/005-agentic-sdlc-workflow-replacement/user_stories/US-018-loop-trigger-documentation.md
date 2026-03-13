# US-018: Document loop trigger (on-demand, schedule, or event)

**As a** operator or developer,
**I want** the trigger for the agentic feedback loop to be documented (on-demand, schedule, or event),
**So that** the loop can be run in a predictable way (e.g. manual start, cron, or on HITL batch complete).

## Acceptance Criteria
- [ ] **Scenario 1**: Trigger documented
    - **Given** the Temporal workflow for the agentic loop (US-017)
    - **When** a reader consults the documentation
    - **Then** the chosen trigger(s) are documented: e.g. on-demand (API or signal), Temporal schedule (cron), or event-driven (e.g. HITL batch completed)

- [ ] **Scenario 2**: At least one trigger implementable
    - **Given** the implementation
    - **When** the feature is delivered
    - **Then** at least one trigger is implementable (e.g. on-demand or manual start); additional triggers may be added later

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Feature 005 Step 2. May be satisfied by a subsection in the same doc as US-017 or in the step-02-feedback-loop doc.
