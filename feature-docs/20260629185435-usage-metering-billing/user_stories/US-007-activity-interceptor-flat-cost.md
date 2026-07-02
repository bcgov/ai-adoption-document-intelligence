# US-007: Temporal Activity Interceptor for Flat-Cost Billing

**As a** billing system,
**I want to** automatically record a UsageEvent for every successfully completed flat-cost Temporal activity without modifying existing activity code,
**So that** activity billing is enforced uniformly across all workflows.

## Acceptance Criteria

- [x] **Scenario 1**: Interceptor is registered in the OCR worker
    - **Given** the `ocrWorker` in `apps/temporal/src/worker.ts`
    - **When** the worker is created
    - **Then** the `ActivityInboundCallsInterceptor` is registered via `Worker.create({ interceptors: { activityInbound: [...] } })`

- [x] **Scenario 2**: Interceptor is registered in the benchmark worker
    - **Given** the `benchmarkWorker` in `apps/temporal/src/worker.ts`
    - **When** the worker is created
    - **Then** the same `ActivityInboundCallsInterceptor` is registered in the benchmark worker's interceptors

- [x] **Scenario 3**: Completed flat-cost activity records a UsageEvent with correct units
    - **Given** an activity with `cost_type = "flat"` and `units = 10` in the active rate version, and the activity completes successfully
    - **When** the interceptor's `execute(input, next)` fires after `await next(input)` returns
    - **Then** a `UsageEvent` with `event_type = "activity_completed"`, `activity_name`, `units_consumed = 10`, and `metered_quantity = null` is recorded via the usage event write service

- [x] **Scenario 4**: Failed activity does not record a UsageEvent
    - **Given** an activity that throws an error during execution
    - **When** `await next(input)` throws in the interceptor
    - **Then** no `UsageEvent` is recorded for that activity execution

- [x] **Scenario 5**: Activity not in the active rate version records zero units
    - **Given** an activity whose name has no entry in the active rate version's `activity_costs`
    - **When** the interceptor fires after successful completion
    - **Then** no `UsageEvent` is recorded (0-unit events are skipped to avoid table noise)

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The interceptor must only charge **after** `await next(input)` resolves successfully (not before, not on failure)
- `ActivityInboundCallsInterceptor` from `@temporalio/worker` v1.10.0 is confirmed available in this repo
- The interceptor needs access to the active rate version and the usage event write service — inject via closure or DI-compatible factory
- Per-page activity handling (`cost_type = "per_page"`) is covered in US-008; this story covers flat-cost activities only
- The `activity_name` recorded on the event is the Temporal activity function name (matching the key in `rate_versions.json` `activity_costs`)
