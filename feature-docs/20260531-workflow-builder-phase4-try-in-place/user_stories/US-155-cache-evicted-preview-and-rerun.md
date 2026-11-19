# US-155: Cache-evicted preview state with "Re-run" button

**As a** user replaying an old run whose cache rows have been TTL-evicted,
**I want** the preview pane to show a clear "Cache evicted — Re-run to repopulate" Alert with a Re-run button that starts a fresh Try using the historical `initialCtx`,
**So that** I'm not left staring at a blank preview without recourse.

## Acceptance Criteria

- [x] **Scenario 1**: Cache-evicted Alert component
    - **Given** `apps/frontend/src/features/workflow-builder/preview/CacheEvictedAlert.tsx` (new file)
    - **When** read
    - **Then** it exports `function CacheEvictedAlert({ workflowId, runId, onRerun }: ...)`
    - **And** renders a small `<Alert color="red" variant="light" icon={<IconAlertCircle />}>` with text "Preview unavailable — cache evicted. Re-run to repopulate."
    - **And** below the text, a `<Button size="xs" variant="filled" onClick={onRerun}>Re-run</Button>`

- [x] **Scenario 2**: Dispatch shell routes to evicted Alert when `data === null AND runId !== undefined`
    - **Given** `PreviewWidget` (US-141)
    - **When** `useActivityOutputPreview` returns `data: null` for a query with `runId` set (i.e., scoped query found no row)
    - **Then** `<CacheEvictedAlert workflowId={...} runId={runId} onRerun={...} />` renders
    - **And** when `runId` is undefined (default-latest mode) AND `data: null`, the dispatch shell renders nothing (the node hasn't run yet)

- [x] **Scenario 3**: Re-run button fetches historical `initialCtx` + starts fresh Try
    - **Given** the Re-run button click
    - **When** the handler fires
    - **Then** it calls `apiClient.getInputCtx(workflowId, runId)` (US-151's endpoint)
    - **And** on success, calls `POST /runs` with `{ initialCtx }` to start a fresh Try
    - **And** on the new Try's `workflowId` response, sets `activeRunId` AND `setIsReplay(false)` (live mode for the new run)
    - **And** closes the replay-mode indicator in the top bar

- [x] **Scenario 4**: Loading state on Re-run
    - **Given** the user clicks Re-run
    - **When** the input-ctx fetch is in flight
    - **Then** the Re-run button shows a `<Loader size="xs" />` and is disabled
    - **And** the surrounding Alert text changes to "Re-running..."

- [x] **Scenario 5**: Error handling on Re-run
    - **Given** the input-ctx fetch returns 404 ("input not available — run too old or never captured")
    - **When** the error surfaces
    - **Then** the Alert text changes to "Re-run unavailable — historical input has been retention-cleaned" and the button is disabled
    - **And** a "Close" link clears the indicator and returns to normal evicted Alert state

- [x] **Scenario 6**: Component test
    - **Given** `apps/frontend/src/features/workflow-builder/preview/CacheEvictedAlert.test.tsx`
    - **When** tests run
    - **Then** at least 4 cases pass: Alert renders with Re-run button, click fetches input-ctx + POSTs /runs, loading state shows Loader, 404 path shows retention-cleaned message

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/preview/CacheEvictedAlert.tsx` — implementation
- `apps/frontend/src/features/workflow-builder/preview/CacheEvictedAlert.test.tsx` — tests
- `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx` (US-141) — extend dispatch to route to CacheEvictedAlert when conditions match
- `apps/frontend/src/data/services/api.service.ts` — add `getInputCtx(workflowId, runId)` method

## Technical notes

- This Alert is the user-visible recovery path for the TTL-eviction case. Without it, evicted runs would show silently-empty previews and confuse the user about what happened.
- The Re-run is a NEW Try, not a "replay with re-populate" — Phase 4 doesn't have a partial-cache-fill mechanism. The new Try runs the workflow end-to-end, populating fresh cache rows for the current TTL window.
- The "Close" link (Scenario 5) doesn't dismiss the Alert across re-renders; it sets a transient flag in component state. Re-rendering the same node will re-evaluate `data === null` and re-render the Alert. Acceptable for 4.0.
- Closes Milestone F. After this lands, the Phase 4 surface is feature-complete; Milestone G (US-156) verifies end-to-end.
- After landing: no Vite restart (frontend-only).
