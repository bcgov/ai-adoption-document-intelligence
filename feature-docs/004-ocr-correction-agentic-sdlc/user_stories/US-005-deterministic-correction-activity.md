# US-005: Third deterministic correction activity (e.g. trim/normalize)

**As a** workflow author,
**I want to** have at least one additional deterministic correction activity (e.g. trim/normalize whitespace, normalize digits/dates) operating on the full OCR result shape,
**So that** I can compose multiple correction types in a workflow with the same input/output conventions.

## Acceptance Criteria
- [ ] **Scenario 1**: Full OCR result contract
    - **Given** an activity node with inputs bound to the full OCR result and optional parameters (e.g. field types to which it applies)
    - **When** the activity runs
    - **Then** it returns a corrected OCR result and optional change metadata, with the same input/output conventions as the spellcheck and character-confusion activities

- [ ] **Scenario 2**: Deterministic behavior
    - **Given** the same inputs and parameters
    - **When** the activity runs multiple times
    - **Then** the output is identical (suitable for Temporal workflows)

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
- Step 2; “at least one other” per requirements Section 3–4. Examples: trim/normalize whitespace, normalize digits/dates.
