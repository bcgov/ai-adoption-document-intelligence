# US-030: Run List, Start/Cancel, Progress UI

**As a** user,
**I want to** start, cancel, and track benchmark runs through the UI,
**So that** I can execute benchmarks and monitor their progress in real time.

## Acceptance Criteria
- [ ] **Scenario 1**: Run list page within project
    - **Given** a project with benchmark runs
    - **When** the user views the project detail page
    - **Then** a run list is displayed with columns: status badge, definition name, start time, duration (or elapsed time if running), headline metrics (if completed), and action links

- [ ] **Scenario 2**: Start run button
    - **Given** the user is viewing a benchmark definition detail page
    - **When** the user clicks the "Start Run" button
    - **Then** a new benchmark run is started via `POST /api/benchmark/projects/:id/definitions/:defId/runs`, and the user is navigated to the run detail page

- [ ] **Scenario 3**: Cancel run button
    - **Given** a benchmark run is in `running` status
    - **When** the user clicks the "Cancel" button
    - **Then** the cancellation is sent via `POST /api/benchmark/projects/:id/runs/:runId/cancel`, and the run status updates to `cancelled`

- [ ] **Scenario 4**: Cancel button is hidden for non-running runs
    - **Given** a benchmark run with status `completed`, `failed`, or `cancelled`
    - **When** the run detail page is rendered
    - **Then** the cancel button is not displayed

- [ ] **Scenario 5**: Progress tracking via polling
    - **Given** a benchmark run is in `pending` or `running` status
    - **When** the run detail page is displayed
    - **Then** the page polls `GET /api/benchmark/projects/:id/runs/:runId` at regular intervals to update the status, and stops polling once the run reaches a terminal state

- [ ] **Scenario 6**: Status badges with color coding
    - **Given** runs with different statuses
    - **When** the run list is rendered
    - **Then** status badges are color-coded: pending (blue), running (amber/animated), completed (green), failed (red), cancelled (gray)

- [ ] **Scenario 7**: Link to Temporal execution
    - **Given** a benchmark run with a `temporalWorkflowId`
    - **When** the run detail page is displayed
    - **Then** a clickable link is provided to the Temporal UI (port 8088) for the specific workflow execution

- [ ] **Scenario 8**: Re-run action
    - **Given** a completed or failed benchmark run
    - **When** the user clicks the "Re-run" button
    - **Then** a new benchmark run is started from the same definition with the same configuration

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Files: `apps/frontend/src/pages/benchmarking/RunListPage.tsx`, `apps/frontend/src/pages/benchmarking/RunDetailPage.tsx`
- Polling interval: 5 seconds for running status, stops at terminal state
- Temporal UI link format: `http://localhost:8088/namespaces/default/workflows/{temporalWorkflowId}`
- See Requirements Section 10.1 (Phase 1 -- Run UI)
