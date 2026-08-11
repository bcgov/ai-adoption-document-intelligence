# US-006: Workflow Lifecycle Event Recording

**As a** billing system,
**I want to** record UsageEvents at the start and end of every workflow run,
**So that** each run's full lifecycle — estimated cost, final cost, and terminal state — is captured in the audit log.

## Acceptance Criteria

- [x] **Scenario 1**: workflow_started event recorded after successful Temporal submission
    - **Given** a workflow submission that passes the pre-flight cap check
    - **When** the workflow is successfully submitted to Temporal
    - **Then** a `UsageEvent` with `event_type = "workflow_started"` is recorded containing `group_id`, `workflow_execution_id`, `estimated_units`, and `rate_version_id`

- [x] **Scenario 2**: workflow_completed event recorded with total actual cost
    - **Given** a workflow that has reached the `completed` terminal state
    - **When** the workflow completion is detected
    - **Then** a `UsageEvent` with `event_type = "workflow_completed"` is recorded containing `group_id`, `workflow_execution_id`, `total_units_consumed` (sum of all `activity_completed` events for this run), and `rate_version_id`

- [x] **Scenario 3**: workflow_failed event records only units from completed activities
    - **Given** a workflow that fails partway through after some activities completed successfully
    - **When** the workflow failure is detected
    - **Then** a `UsageEvent` with `event_type = "workflow_failed"` is recorded with `total_units_consumed` equal to the sum of only the completed activity events — activities that did not execute are not charged

- [x] **Scenario 4**: workflow_cancelled event is recorded on cancellation
    - **Given** a workflow that is cancelled before completing
    - **When** the cancellation is detected
    - **Then** a `UsageEvent` with `event_type = "workflow_cancelled"` is recorded; activities that had already completed are still charged

- [x] **Scenario 5**: Each lifecycle event references the active rate_version_id at the time of the event
    - **Given** a rate version change between workflow start and completion
    - **When** the workflow_completed event is recorded
    - **Then** the `rate_version_id` on the completion event is the rate version active at completion time, which may differ from the rate version on the `workflow_started` event

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- `workflow_started` events do NOT increment `UsagePeriodSummary` — they record an estimate only; actual spend comes from `activity_completed` events
- The `total_units_consumed` on completion events is computed by summing existing `UsageEvent` rows for the `workflow_execution_id` where `event_type = "activity_completed"`
- Workflow terminal state detection: listen to Temporal workflow signals or use the backend's existing workflow status tracking mechanisms
- `estimated_units` on the start event is the output of the max-flow estimator from US-004
