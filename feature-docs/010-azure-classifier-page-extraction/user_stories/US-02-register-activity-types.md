# US-02: Register azureClassify Activity Types

**As a** Temporal Worker,
**I want to** have `azureClassify.submit` and `azureClassify.poll` registered as valid activity types,
**So that** graph workflow nodes can reference these activity type strings and the worker can dispatch them correctly.

## Acceptance Criteria
- [ ] **Scenario 1**: Activity types appear in the registered list
    - **Given** the `REGISTERED_ACTIVITY_TYPES` array in `activity-types.ts`
    - **When** it is inspected
    - **Then** it contains both `"azureClassify.submit"` and `"azureClassify.poll"`

- [ ] **Scenario 2**: Activity functions are registered in the registry
    - **Given** the activity registry in `activity-registry.ts`
    - **When** a graph workflow node with `activityType: "azureClassify.submit"` is executed
    - **Then** the `azureClassifySubmit` function is invoked

- [ ] **Scenario 3**: Activity functions are exported from the activities barrel
    - **Given** `apps/temporal/src/activities.ts`
    - **When** it is inspected
    - **Then** both `azureClassifySubmit` and `azureClassifyPoll` are exported

- [ ] **Scenario 4**: Existing activity registry test still passes
    - **Given** the `activity-registry.test.ts` file
    - **When** tests are run
    - **Then** both new activity types appear in the registry test assertions and all tests pass

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Add entries to `REGISTERED_ACTIVITY_TYPES` in `apps/temporal/src/activity-types.ts`.
- Add registry entries in `apps/temporal/src/activity-registry.ts` following the existing pattern (object with `activityType` and `activityFn`).
- Export both functions from `apps/temporal/src/activities.ts`.
- Update `activity-registry.test.ts` to include the two new type strings.
