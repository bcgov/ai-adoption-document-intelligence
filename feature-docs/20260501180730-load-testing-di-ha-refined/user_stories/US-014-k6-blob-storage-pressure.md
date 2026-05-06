# US-014: k6 blob and object storage pressure scenarios

**As a** platform engineer,
**I want to** exercise read/write paths that stress blob/object storage through the platform APIs,
**So that** storage latency, throughput, and backend limits are visible under load.

## Acceptance Criteria
- [x] **Scenario 1**: Scenario covers representative binary traffic
    - **Given** multipart upload, download, or other blob-backed API routes exposed by the backend
    - **When** k6 runs the scenario
    - **Then** requests carry configurable payload sizes without document-specific content.

- [x] **Scenario 2**: Storage backend assumptions documented
    - **Given** filesystem vs Azure (or other) blob providers
    - **When** operators configure the run
    - **Then** docs state required env (`BLOB_STORAGE_PROVIDER`, credentials, bucket) and cleanup of uploaded objects.

- [x] **Scenario 3**: Summary and thresholds
    - **Given** FR-5 artifact conventions
    - **When** the run completes
    - **Then** summary JSON is written under `tools/load-testing/results/` (or a documented subfolder) with documented thresholds guidance.

- [x] **Scenario 4**: Safety and teardown
    - **Given** disposable environment rules (FR-11/FR-12)
    - **When** the scenario finishes or aborts
    - **Then** documentation includes explicit deletion or prefix-scoped cleanup steps for generated blobs.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Implements FR-13 item 2 (blob / object storage pressure). Coordinate with US-017 if payload sizing is shared.
