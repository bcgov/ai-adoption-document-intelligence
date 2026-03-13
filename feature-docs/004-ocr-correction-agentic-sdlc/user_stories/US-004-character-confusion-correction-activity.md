# US-004: Character-confusion correction activity (full OCR shape)

**As a** workflow author,
**I want to** have a character-confusion correction activity that operates on the full OCR result shape with optional confusion-map override,
**So that** I can add character-confusion correction as a standalone node (e.g. reusing or extending `fixCharacterConfusion` from enrichment-rules).

## Acceptance Criteria
- [ ] **Scenario 1**: Full OCR result in, corrected OCR result out
    - **Given** an activity node with inputs bound to the full OCR result and optional parameters (confusion map override, field types)
    - **When** the character-confusion activity runs
    - **Then** it returns a corrected OCR result and change metadata, applying character-level corrections (e.g. 0/O, 1/l, 5/S) aligned with existing `fixCharacterConfusion` behavior

- [ ] **Scenario 2**: Optional confusion-map override
    - **Given** the activity accepts an optional confusion-map parameter (e.g. from confusion matrix data)
    - **When** a custom map is provided
    - **Then** the activity uses it instead of or in addition to the default CONFUSION_MAP

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
- Step 2; extend or reuse `fixCharacterConfusion` in `apps/temporal/src/activities/enrichment-rules.ts`.
- Full OCR result shape (keyValuePairs, documents); month-name protection for date fields per existing logic.
