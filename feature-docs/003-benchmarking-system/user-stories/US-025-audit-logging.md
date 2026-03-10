# US-025: Audit Logging

**As a** developer,
**I want to** have an audit logging service that records benchmark-related events,
**So that** there is a complete audit trail of dataset operations, benchmark runs, and configuration changes.

## Acceptance Criteria
- [ ] **Scenario 1**: Log dataset creation events
    - **Given** a new dataset is created
    - **When** the creation succeeds
    - **Then** a BenchmarkAuditLog entry is recorded with action `dataset_created`, the user ID, entity type `Dataset`, entity ID, and timestamp

- [ ] **Scenario 2**: Log version publishing events
    - **Given** a dataset version is published
    - **When** the status transitions to `published`
    - **Then** a BenchmarkAuditLog entry is recorded with action `version_published`, including the version ID and dataset ID in metadata

- [ ] **Scenario 3**: Log run start events
    - **Given** a benchmark run is started
    - **When** the run transitions to `running` status
    - **Then** a BenchmarkAuditLog entry is recorded with action `run_started`, including the definition ID and project ID in metadata

- [ ] **Scenario 4**: Log run completion events
    - **Given** a benchmark run completes (success or failure)
    - **When** the run transitions to `completed` or `failed` status
    - **Then** a BenchmarkAuditLog entry is recorded with action `run_completed`, including the final status and summary metrics in metadata

- [ ] **Scenario 5**: Log baseline promotion events
    - **Given** a benchmark run is promoted to baseline (Phase 1.5)
    - **When** the `isBaseline` flag is set to `true`
    - **Then** a BenchmarkAuditLog entry is recorded with action `baseline_promoted`, including the run ID and project ID

- [ ] **Scenario 6**: Log artifact deletion events
    - **Given** artifacts are deleted (e.g., via retention policy)
    - **When** the deletion occurs
    - **Then** a BenchmarkAuditLog entry is recorded with action `artifact_deleted`, including the artifact count and run ID

- [ ] **Scenario 7**: Audit log service is injectable
    - **Given** NestJS dependency injection
    - **When** the AuditLogService is registered
    - **Then** it can be injected into DatasetService and BenchmarkService for use throughout the benchmark module

- [ ] **Scenario 8**: Audit log entries are queryable
    - **Given** multiple audit log entries exist
    - **When** audit logs are queried by entity type, entity ID, action, or date range
    - **Then** the matching entries are returned in chronological order

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/backend-services/src/benchmark/audit-log.service.ts`
- Uses the BenchmarkAuditLog Prisma model from US-002
- AuditAction enum: `dataset_created`, `version_published`, `run_started`, `run_completed`, `baseline_promoted`, `artifact_deleted`
- Metadata field is JSONB for flexible event-specific data
- See Requirements Section 8.4 (Audit Logging)
- Tests: `apps/backend-services/src/benchmark/audit-log.service.spec.ts`
