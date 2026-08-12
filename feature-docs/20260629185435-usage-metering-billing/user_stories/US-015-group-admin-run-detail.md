# US-015: Group Admin Per-Run Cost Detail

**As a** group admin,
**I want to** view the full cost breakdown of a specific workflow run by its execution ID,
**So that** I can understand exactly which activities drove the cost of a particular document processing job.

## Acceptance Criteria

- [ ] **Scenario 1**: Per-run detail returns all UsageEvents for the workflow execution
    - **Given** a `workflow_execution_id` for a completed workflow run
    - **When** a group admin requests the per-run cost detail for that execution
    - **Then** all `UsageEvent` rows for that `workflow_execution_id` are returned, including the `workflow_started`, all `activity_completed`, and the terminal (`workflow_completed` / `workflow_failed` / `workflow_cancelled`) events

- [ ] **Scenario 2**: Each event in the detail includes unit cost and dollar value
    - **Given** the per-run detail response
    - **When** the group admin inspects individual activity events
    - **Then** each `activity_completed` event shows `activity_name`, `units_consumed`, the computed dollar value (`units_consumed × rate_version.unit_cost_dollars`), `metered_quantity` (for per-page activities), and `created_at`

- [ ] **Scenario 3**: Run detail shows the estimated cost vs actual cost
    - **Given** a workflow that has a `workflow_started` event with `estimated_units` and a `workflow_completed` event with `total_units_consumed`
    - **When** the per-run detail is returned
    - **Then** both `estimated_units` (from the start event) and `total_units_consumed` (from the completion event) are surfaced, allowing the group admin to see estimate accuracy

- [ ] **Scenario 4**: Group admin cannot access run details for other groups
    - **Given** a `workflow_execution_id` that belongs to group B
    - **When** a group admin authenticated to group A requests that run's detail
    - **Then** the request is rejected with HTTP 403

## Priority
- [x] Medium (Should Have)

## Technical Notes / Assumptions
- Endpoint: `GET /api/groups/:groupId/usage/runs/:workflowExecutionId`
- Authorization: the authenticated user must belong to the requested `groupId`, and the run must belong to that group
- Dollar value per event is computed at query time: `units_consumed × rate_version.unit_cost_dollars` (join to `RateVersion` table using `rate_version_id`)
- The `workflow_started` event's `estimated_units` field is the pre-flight estimate from US-004
