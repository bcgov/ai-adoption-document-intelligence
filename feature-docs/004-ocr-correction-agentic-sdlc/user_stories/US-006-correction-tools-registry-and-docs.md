# US-006: Register OCR correction tools and document in graph workflow

**As a** developer,
**I want to** have all three OCR correction activities (spellcheck, character-confusion, third deterministic) registered in both Temporal and backend activity registries and documented as graph nodes,
**So that** they can be used in graph workflow definitions and validated at save time.

## Acceptance Criteria
- [ ] **Scenario 1**: Temporal registry
    - **Given** the three correction activities (US-003, US-004, US-005)
    - **When** the Temporal worker starts
    - **Then** each activity type is present in `apps/temporal/src/activity-registry.ts` and in `activity-types.ts` (REGISTERED_ACTIVITY_TYPES)

- [ ] **Scenario 2**: Backend registry
    - **Given** the three correction activities
    - **When** a workflow config is saved with an activity node referencing one of them
    - **Then** the backend validator in `apps/backend-services/src/workflow/activity-registry.ts` accepts the activity type

- [ ] **Scenario 3**: Documented as graph nodes
    - **Given** the correction tools
    - **When** a reader consults `/docs`
    - **Then** spellcheck and at least one other correction node are documented as available activities (or nodes) in the graph workflow engine per ADDING_GRAPH_NODES_AND_ACTIVITIES.md

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Depends on US-003, US-004, US-005. Step 2 completion.
