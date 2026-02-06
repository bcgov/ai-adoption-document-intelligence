# US-019: Implement SDPR Aggregate Report Activity

**As a** developer,
**I want to** have an `sdpr.aggregate` Temporal activity that consolidates processed segments into an aggregated SDPR report,
**So that** the SDPR multi-page workflow can produce a final consolidated report from individually OCR'd and classified document segments.

## Acceptance Criteria
- [ ] **Scenario 1**: All processed segments are aggregated
    - **Given** an array of `processedSegments` from the join node, each containing OCR results and classification data
    - **When** the aggregate activity runs
    - **Then** a consolidated report object is produced combining data from all segments

- [ ] **Scenario 2**: Segments are ordered by segment index
    - **Given** processed segments that may arrive in non-sequential order due to parallel processing
    - **When** aggregation occurs
    - **Then** segments are ordered by their `segmentIndex` in the final report

- [ ] **Scenario 3**: Document associations are maintained
    - **Given** the `documentId` is provided as input
    - **When** the aggregated report is produced
    - **Then** the report includes the parent document ID for database association

- [ ] **Scenario 4**: Output is stored via downstream storeResults node
    - **Given** the aggregate activity completes
    - **When** the output is written to `ctx.aggregatedReport`
    - **Then** the downstream `storeResults` activity can read and persist it

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/activities/sdpr-aggregate.ts` (or added to an existing activities file)
- Registered in the activity registry as `sdpr.aggregate`
- The SDPR workflow example in Section 4.5 shows this as the final aggregation step
- Input includes `processedSegments` (array) and `documentId` (string)
- Output includes `report` (object) written to `ctx.aggregatedReport`
- The specific aggregation logic will depend on SDPR report structure requirements
- Tests should verify segments are correctly ordered and combined
