# US-002: Create the Activity Type Registry

**As a** developer,
**I want to** have an activity registry that maps activity type strings to their Temporal activity implementations,
**So that** the graph runner can dynamically resolve and invoke activities referenced in graph definitions without hardcoded dispatch logic.

## Acceptance Criteria
- [ ] **Scenario 1**: Registry maps all existing activity types
    - **Given** the activity registry table in Section 5.5
    - **When** the registry is created
    - **Then** all 12 activity types are registered: `document.updateStatus`, `file.prepare`, `azureOcr.submit`, `azureOcr.poll`, `azureOcr.extract`, `ocr.cleanup`, `ocr.checkConfidence`, `ocr.storeResults`, `document.storeRejection`, `document.split`, `document.classify`, `sdpr.aggregate`

- [ ] **Scenario 2**: Each registry entry includes required metadata
    - **Given** the `ActivityRegistryEntry` interface in Section 5.5
    - **When** a registry entry is inspected
    - **Then** it contains `activityType`, `activityFn`, `defaultTimeout`, and `defaultRetry` fields

- [ ] **Scenario 3**: Unknown activity types are detectable
    - **Given** a graph node references an `activityType` not in the registry
    - **When** the registry is queried for that type
    - **Then** the lookup returns undefined or throws a typed error indicating the activity was not found

- [ ] **Scenario 4**: Registry constant is available for validation
    - **Given** the `ACTIVITY_REGISTRY` constant in Section 9.5
    - **When** the backend validator needs to check activity types
    - **Then** a shared constant with activity type keys and descriptions is importable by both the backend validator and the Temporal worker

- [ ] **Scenario 5**: Existing activities are correctly mapped
    - **Given** the mapping table (e.g., `azureOcr.submit` maps to `submitToAzureOCR`)
    - **When** the registry resolves `azureOcr.submit`
    - **Then** the returned `activityFn` references the existing `submitToAzureOCR` activity implementation

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/activity-registry.ts`
- The registry is append-only in patch/minor versions per Section 12.4
- New activities (`document.split`, `document.classify`, `sdpr.aggregate`) will be implemented in separate stories (US-017, US-018, US-019) and wired into the registry
- The existing activity functions must be refactored to conform to the registry pattern (accepting resolved input objects from port bindings)
- Tests should verify all registered activity types resolve to valid functions
