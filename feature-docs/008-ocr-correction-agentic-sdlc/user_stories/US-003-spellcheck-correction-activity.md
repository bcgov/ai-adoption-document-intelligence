# US-003: Spellcheck correction activity (full OCR shape)

**As a** workflow author,
**I want to** have a spellcheck correction activity that operates on the full OCR result shape,
**So that** I can add spellcheck as a standalone node in a graph workflow with configurable scope (e.g. field keys, document type).

## Acceptance Criteria
- [ ] **Scenario 1**: Full OCR result in, corrected OCR result out
    - **Given** an activity node with inputs bound to the full OCR result (e.g. keyValuePairs, documents) and optional parameters (language, field scope)
    - **When** the spellcheck activity runs
    - **Then** it returns a corrected OCR result and a list of changes (e.g. word → correction) for HITL/audit

- [ ] **Scenario 2**: Real implementation
    - **Given** the activity implementation
    - **When** it is invoked
    - **Then** it uses an existing spellcheck library or API; no placeholder implementations

- [ ] **Scenario 3**: Registered and documented
    - **Given** the activity is implemented
    - **When** the feature is complete
    - **Then** it is registered in the activity registry (Temporal + backend) and documented in `/docs`

- [ ] **Scenario 4**: Tests
    - **Given** the activity
    - **When** tests run
    - **Then** the activity is covered by unit tests

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Step 2; tools operate on full OCR result shape per requirements Section 3–4.
- Follow ADDING_GRAPH_NODES_AND_ACTIVITIES.md for registration (activity-registry.ts, activity-types.ts, backend activity-registry.ts).
