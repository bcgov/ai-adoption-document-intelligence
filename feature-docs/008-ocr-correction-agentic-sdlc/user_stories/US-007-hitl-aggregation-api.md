# US-007: HITL aggregation API or query for correction data

**As a** pipeline or activity,
**I want to** query aggregated HITL correction data (field_key, original_value, corrected_value, action) for a time window or document type,
**So that** the AI recommendation pipeline can consume per-field correction pairs, not only high-level analytics counts.

## Acceptance Criteria
- [ ] **Scenario 1**: Aggregated correction list
    - **Given** filters (e.g. startDate, endDate, document type or modelId)
    - **When** the aggregation is invoked (API endpoint, service method, or activity)
    - **Then** it returns a list of correction records with at least field_key, original_value, corrected_value, action (e.g. corrected, flagged)

- [ ] **Scenario 2**: Data source
    - **Given** FieldCorrection and ReviewSession data in the database
    - **When** the aggregation runs
    - **Then** it reads from the existing Prisma models (e.g. FieldCorrection) with the appropriate filters and shape; it does not return only counts as getReviewAnalytics does

- [ ] **Scenario 3**: Documented
    - **Given** the aggregation path is implemented
    - **When** a developer integrates the AI pipeline
    - **Then** the API or activity contract and filters are documented

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Step 3; requirements Section 5. Existing getReviewAnalytics and per-session APIs do not expose per-field original/corrected pairs. See docs/HITL_ARCHITECTURE.md and ReviewDbService.
