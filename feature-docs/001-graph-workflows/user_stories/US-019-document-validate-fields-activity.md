# US-019: Implement Cross-Document Field Validation Activity

**As a** developer,
**I want to** have a `document.validateFields` Temporal activity that compares fields between a primary document and attached documents,
**So that** multi-page workflows can validate consistency across related documents before storing results.

## Acceptance Criteria
- [ ] **Scenario 1**: Validation checks multiple fields
    - **Given** a set of validation rules with multiple field mappings
    - **When** the validation activity runs
    - **Then** each configured field comparison is executed and recorded in the results

- [ ] **Scenario 2**: Primary vs attachment field matching
    - **Given** a primary document field value and corresponding attachment field values
    - **When** the validation activity compares them
    - **Then** the result indicates match or mismatch per field

- [ ] **Scenario 3**: Missing field handling
    - **Given** a required field is missing on the primary document or attachments
    - **When** validation runs
    - **Then** the result includes a failure reason for the missing field

- [ ] **Scenario 4**: Output is stored via downstream storeResults node
    - **Given** the validation activity completes
    - **When** the output is written to `ctx.validationResults`
    - **Then** the downstream `storeResults` activity can read and persist it

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/activities/document-validate-fields.ts` (or added to an existing activities file)
- Registered in the activity registry as `document.validateFields`
- The multi-page workflow example in Section 4.5 shows this as the validation step
- Input includes `processedSegments` (array) and `documentId` (string)
- Output includes `validationResults` (object) written to `ctx.validationResults`
- Validation rules define field mappings between the primary document and attachments
- Tests should verify matching, mismatching, and missing-field outcomes
