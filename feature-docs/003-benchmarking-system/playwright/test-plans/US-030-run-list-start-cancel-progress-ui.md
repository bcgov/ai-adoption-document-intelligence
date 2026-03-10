# Test Plan: US-030 - Run List, Start/Cancel, Progress UI

**Source**: `user-stories/US-030-run-list-start-cancel-progress-ui.md`
**Requirement Section**: Section 10.1 (Phase 1 -- Run UI)
**Priority**: High

## User Story
**As a** user,
**I want to** start, cancel, and track benchmark runs through the UI,
**So that** I can execute benchmarks and monitor their progress in real time.

## Acceptance Criteria
- Run list page within project
- Start run button
- Cancel run button
- Cancel button is hidden for non-running runs
- Progress tracking via polling
- Status badges with color coding
- Link to Temporal execution
- Re-run action

## Test Scenarios

### Scenario 1: Run List Display
- **Type**: Happy Path
- **Priority**: High

**Given**: Project has multiple benchmark runs with various statuses
**When**: User views the project detail page
**Then**:
- Run list table is displayed with columns: status badge, definition name, start time, duration/elapsed time, headline metrics (if completed), action links
- Runs are ordered by start time (most recent first)
- Status badges are color-coded appropriately
- All run data is readable

**Affected Pages**: Project detail page
**Data Requirements**: Project with 5+ runs in different states
**Prerequisites**: User logged in, project with runs exists

### Scenario 2: Start Run from Definition Detail
- **Type**: Happy Path
- **Priority**: High

**Given**: User is viewing a benchmark definition detail page
**When**: User clicks the "Start Run" button
**Then**:
- POST request to `/api/benchmark/projects/{id}/definitions/{defId}/runs` is sent
- Success notification appears
- User is navigated to the run detail page `/benchmarking/projects/{id}/runs/{runId}`
- Run status is initially `pending` or `running`

**Affected Pages**: Definition detail page, Run detail page
**Data Requirements**: Valid definition with all required configs
**Prerequisites**: User logged in, definition exists

### Scenario 3: Start Run from Definition List
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User is viewing the definition list in project detail
**When**: User clicks "Start Run" action on a definition row
**Then**:
- Run is initiated
- Success notification appears
- Run appears in the run list with `pending` status
- User can navigate to the new run's detail page

**Affected Pages**: Project detail page
**Data Requirements**: Valid definition
**Prerequisites**: User logged in

### Scenario 4: Cancel Running Benchmark
- **Type**: Happy Path
- **Priority**: High

**Given**: Benchmark run is in `running` status
**When**: User clicks the "Cancel" button on run detail page
**Then**:
- Confirmation dialog appears: "Are you sure you want to cancel this run?"
- After confirmation, POST to `/api/benchmark/projects/{id}/runs/{runId}/cancel` is sent
- Run status updates to `cancelled`
- "Cancel" button is replaced with status indicator
- Success notification appears

**Affected Pages**: Run detail page
**Data Requirements**: Running benchmark run
**Prerequisites**: User logged in, run in running state

### Scenario 5: Cancel Button Hidden for Completed Runs
- **Type**: Happy Path
- **Priority**: High

**Given**: Benchmark run has status `completed`, `failed`, or `cancelled`
**When**: Run detail page is rendered
**Then**:
- "Cancel" button is not visible
- Status badge shows final state
- Other actions (Re-run, View in MLflow) are available
- UI clearly indicates run is terminal

**Affected Pages**: Run detail page
**Data Requirements**: Runs in terminal states
**Prerequisites**: User logged in

### Scenario 6: Progress Polling for Running Run
- **Type**: Happy Path
- **Priority**: High

**Given**: Benchmark run is in `running` status
**When**: User is viewing the run detail page
**Then**:
- Page polls `/api/benchmark/projects/{id}/runs/{runId}` every 5 seconds
- Status updates automatically when changed
- Progress indicators update (if available)
- Polling stops when run reaches terminal state (`completed`, `failed`, `cancelled`)
- No infinite polling or memory leaks

**Affected Pages**: Run detail page
**Data Requirements**: Long-running benchmark (or simulated delays)
**Prerequisites**: User logged in

### Scenario 7: Status Badge Color Coding
- **Type**: Happy Path
- **Priority**: High

**Given**: Run list contains runs with all possible statuses
**When**: Run list is rendered
**Then**:
- Status badges display correct colors:
  - `pending`: blue
  - `running`: amber/orange with animated indicator
  - `completed`: green
  - `failed`: red
  - `cancelled`: gray
- Colors meet accessibility contrast requirements
- Animated indicator for running status is visible

**Affected Pages**: Project detail page (run list), Run detail page
**Data Requirements**: Runs in all status states
**Prerequisites**: User logged in

### Scenario 8: Link to Temporal UI
- **Type**: Happy Path
- **Priority**: High

**Given**: Benchmark run has a `temporalWorkflowId`
**When**: Run detail page is displayed
**Then**:
- Clickable link to Temporal UI is visible
- Link format: `http://localhost:8088/namespaces/default/workflows/{temporalWorkflowId}`
- Link opens in new tab
- Link is labeled clearly: "View in Temporal UI"

**Affected Pages**: Run detail page
**Data Requirements**: Run with Temporal workflow ID
**Prerequisites**: User logged in, Temporal UI accessible

### Scenario 9: Re-run Completed Benchmark
- **Type**: Happy Path
- **Priority**: High

**Given**: Completed or failed benchmark run exists
**When**: User clicks the "Re-run" button
**Then**:
- Confirmation dialog appears (optional)
- New run is started from the same definition
- User is navigated to the new run's detail page
- New run has fresh run ID and timestamps
- Original run remains unchanged

**Affected Pages**: Run detail page
**Data Requirements**: Completed/failed run
**Prerequisites**: User logged in

### Scenario 10: Elapsed Time Updates for Running Run
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Benchmark run is in `running` status with known `startedAt` time
**When**: Run detail page is displayed
**Then**:
- Elapsed time is displayed and updates in real-time (e.g., "Running for 2m 15s")
- Time format is human-readable
- Time updates even between polling intervals (client-side calculation)

**Affected Pages**: Run detail page
**Data Requirements**: Running benchmark
**Prerequisites**: User logged in

### Scenario 11: Duration Display for Completed Run
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Benchmark run has `completed` status with `startedAt` and `completedAt`
**When**: Run detail page is rendered
**Then**:
- Total duration is displayed (e.g., "Duration: 5m 42s")
- Format is human-readable (minutes and seconds, or hours if long)
- Duration is static (not updating)

**Affected Pages**: Run detail page
**Data Requirements**: Completed run with timestamps
**Prerequisites**: User logged in

### Scenario 12: Navigate Between Runs
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User is viewing a run detail page and multiple runs exist
**When**: User clicks "Back to Runs" or navigates via breadcrumbs
**Then**:
- User returns to run list
- Run list shows updated statuses
- User can select another run to view

**Affected Pages**: Run detail page, Project detail page
**Data Requirements**: Multiple runs
**Prerequisites**: User logged in

### Scenario 13: Empty Run List
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Project has no runs yet
**When**: User views the project detail page
**Then**:
- Empty state message is displayed in run section
- Message prompts: "No runs yet. Create a definition and start your first run."
- Link/button to create definition is visible

**Affected Pages**: Project detail page
**Data Requirements**: Project with no runs
**Prerequisites**: User logged in

### Scenario 14: Handle Run Start Failure
- **Type**: Error Case
- **Priority**: High

**Given**: User attempts to start a run
**When**: API returns error (e.g., 500, validation error)
**Then**:
- Error notification displays with error message
- User remains on current page
- No run is created
- User can retry the action

**Affected Pages**: Definition detail page
**Data Requirements**: Simulated API error
**Prerequisites**: User logged in

### Scenario 15: Handle Cancel Failure
- **Type**: Error Case
- **Priority**: Medium

**Given**: User attempts to cancel a running benchmark
**When**: API returns error or run cannot be cancelled
**Then**:
- Error notification displays
- Run status remains `running`
- "Cancel" button remains available for retry
- User is informed why cancellation failed

**Affected Pages**: Run detail page
**Data Requirements**: Simulated cancel failure
**Prerequisites**: User logged in

### Scenario 16: Pending to Running Transition
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Run starts in `pending` status
**When**: Temporal workflow begins execution
**Then**:
- Status automatically updates to `running` via polling
- Status badge changes color from blue to amber
- Elapsed time counter begins
- UI reflects the transition smoothly

**Affected Pages**: Run detail page
**Data Requirements**: Run transitioning from pending to running
**Prerequisites**: User logged in, Temporal worker processing

### Scenario 17: Headline Metrics in Run List
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Completed runs have aggregated metrics
**When**: Run list is displayed
**Then**:
- Key metrics are shown in the list (e.g., "F1: 0.95", "Accuracy: 92%")
- Metrics are concise (2-3 key metrics max)
- Failed runs show error indicator instead of metrics
- Pending/running runs show "—" or empty metric cells

**Affected Pages**: Project detail page (run list)
**Data Requirements**: Completed runs with metrics
**Prerequisites**: User logged in

## Coverage Analysis
- ✅ Happy path covered (start, cancel, polling, status transitions)
- ✅ Edge cases covered (empty list, terminal states)
- ✅ Error handling covered (API errors, cancel failures)
- ✅ Real-time updates covered (polling, elapsed time)
- ⚠️ Missing: Network connectivity loss during polling
- ⚠️ Missing: Very long-running benchmarks (hours)
- ⚠️ Missing: Concurrent run cancellation attempts
