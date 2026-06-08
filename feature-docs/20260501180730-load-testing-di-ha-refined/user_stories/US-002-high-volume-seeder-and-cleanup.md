# US-002: High-volume seeder and cleanup workflow

**As a** developer running performance tests,
**I want to** generate and clean up large synthetic `documents` datasets via CLI,
**So that** I can reproduce load conditions safely and repeatedly.

## Acceptance Criteria
- [x] **Scenario 1**: Seeder supports required flags
    - **Given** I run the seed command
    - **When** I pass `--count`, `--group-id`, `--batch-size`, `--dry-run`, or `--delete-by-prefix`
    - **Then** the command applies each option as documented.

- [x] **Scenario 2**: Group validation blocks unsafe inserts
    - **Given** I provide a non-existent group id
    - **When** I execute a non-dry-run insert
    - **Then** the seeder fails before writing rows and returns a clear error.

- [x] **Scenario 3**: Bulk insert path is used for throughput
    - **Given** I request large row counts
    - **When** the seeder inserts data
    - **Then** it uses batched SQL bulk insertion (not row-by-row ORM writes).

- [x] **Scenario 4**: Cleanup removes only generated rows
    - **Given** generated rows use a deterministic id prefix
    - **When** I run cleanup (`--delete-by-prefix`)
    - **Then** only prefixed synthetic rows in the target group are deleted.

- [x] **Scenario 5**: Seeder emits operational progress
    - **Given** a long-running insert
    - **When** execution is in progress
    - **Then** the command prints progress and a completion summary with inserted counts.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Synthetic rows target read/list pressure testing, not end-to-end OCR realism.
- Default count should be safe for local use.
