# US-035: Scheduled & Nightly Runs

**As a** user,
**I want to** schedule benchmark runs on a cron-style schedule,
**So that** nightly regression benchmarks run automatically to catch regressions early.

## Acceptance Criteria
- [ ] **Scenario 1**: Create a schedule for a benchmark definition
    - **Given** a benchmark definition exists
    - **When** a schedule is created with a cron expression (e.g., `0 2 * * *` for 2 AM daily)
    - **Then** a Temporal schedule is created that triggers `benchmarkRunWorkflow` at the specified interval

- [ ] **Scenario 2**: Schedule uses Temporal schedules API
    - **Given** the scheduling system
    - **When** a schedule is created
    - **Then** the schedule is managed via Temporal's built-in Schedules feature, not a custom scheduler

- [ ] **Scenario 3**: List schedules
    - **Given** schedules exist for benchmark definitions
    - **When** the user views the schedules list
    - **Then** all active schedules are displayed with cron expression, next run time, last run time, and associated definition name

- [ ] **Scenario 4**: Delete a schedule
    - **Given** an active schedule exists
    - **When** the user deletes the schedule
    - **Then** the Temporal schedule is removed and no further runs are triggered

- [ ] **Scenario 5**: Schedule configuration on definition
    - **Given** the benchmark definition UI
    - **When** the user configures a definition
    - **Then** an optional schedule section allows setting a cron expression for automated runs

- [ ] **Scenario 6**: Scheduled runs are tracked like manual runs
    - **Given** a scheduled benchmark run executes
    - **When** the run completes
    - **Then** the BenchmarkRun record is created and tracked the same as manually triggered runs, with a tag indicating it was schedule-triggered

- [ ] **Scenario 7**: Schedule UI for create/delete
    - **Given** the benchmarking UI
    - **When** the user navigates to schedule management
    - **Then** a UI allows creating schedules (definition selection + cron expression) and deleting existing schedules

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Uses Temporal Schedules API (`ScheduleClient.create()`, `ScheduleHandle.delete()`)
- Cron expressions validated before schedule creation
- Schedule metadata stored on the BenchmarkDefinition or as a separate entity
- See Requirements Section 12.3 (Cost Controls -- scheduled runs), Section 1.3 (Phase 1.5 scope)
- Backend: extend `apps/backend-services/src/benchmark/benchmark.service.ts` with schedule operations
- Frontend: `apps/frontend/src/components/benchmarking/ScheduleManagement.tsx`
- Tests: `apps/backend-services/src/benchmark/benchmark.service.spec.ts`
