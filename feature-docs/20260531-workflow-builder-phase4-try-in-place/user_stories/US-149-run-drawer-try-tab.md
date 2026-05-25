# US-149: `RunWorkflowDrawer` "Try" tab

**As a** user clicking the new in-canvas "Try" button (US-148),
**I want** a "Try" tab inside the Run drawer that uses the same JsonInput as the existing "Run" tab but submits with different semantics (closes drawer immediately + sets `activeRunId` on the canvas),
**So that** I have a single Run drawer that serves both API-validation use cases (Run tab — unchanged) and canvas-iteration use cases (Try tab — new).

## Acceptance Criteria

- [ ] **Scenario 1**: Two tabs inside the drawer
    - **Given** `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx`
    - **When** read after the change
    - **Then** the drawer's content is wrapped in a Mantine `<Tabs defaultValue={openMode}>` with two tab panels: "Try" + "Run"
    - **And** the `openMode` prop accepts `"try" | "run"` and controls which tab is initially active
    - **And** the existing "Run" tab content is moved into its `<Tabs.Panel value="run">` verbatim

- [ ] **Scenario 2**: Try tab — same JsonInput, different submit
    - **Given** the Try tab is active
    - **When** the user pastes a body and clicks the primary action button
    - **Then** the button label reads "Try" (vs "Run" on the Run tab)
    - **And** the click handler: (a) calls `cancelInFlightTriesForLineage` indirectly via the existing `POST /runs` endpoint behavior (handled by the server when the endpoint detects the request is via the Try path — see Technical notes), (b) POSTs to `POST /runs` with the body, (c) on success, calls `setActiveRunId(response.workflowId)`, (d) closes the drawer
    - **And** no inline workflowId result is shown (the canvas now is the result surface)

- [ ] **Scenario 3**: Run tab — unchanged
    - **Given** the Run tab is active
    - **When** the user pastes a body and clicks Run
    - **Then** the existing Phase 2 Track 2 behaviour is preserved: drawer stays open, success Alert + workflowId render inline, no `activeRunId` is set
    - **And** the API-validation use case is unaffected by Phase 4

- [ ] **Scenario 4**: Upload tab integration (for source.upload workflows)
    - **Given** the workflow has BOTH source.upload AND source.api (mixed scenario)
    - **When** the drawer opens
    - **Then** the layout is: Tabs at the top (Try / Run) + a separate "Upload source" section below the tabs (the existing US-123 Upload Dropzone)
    - **And** the Upload Dropzone keeps its existing "Run" submit semantics (drop file → upload-then-run chain); the new Try semantics apply ONLY to the JsonInput tabs

- [ ] **Scenario 5**: Drawer closes-on-Try-success behaviour
    - **Given** a Try is submitted from the Try tab
    - **When** `POST /runs` resolves successfully
    - **Then** the drawer's onClose fires AND `setActiveRunId(workflowId)` is called BEFORE the close (so the canvas's polling loops start before the user sees the drawer disappear)
    - **And** if the POST fails, the drawer stays open with a red Alert error (mirror of the Run tab's error handling)

- [ ] **Scenario 6**: Component test
    - **Given** `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.test.tsx`
    - **When** tests run
    - **Then** at least 4 cases pass: openMode="try" pre-selects Try tab, openMode="run" pre-selects Run tab, Try submit closes drawer + sets activeRunId, Run submit keeps drawer open + does not set activeRunId

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx` — refactor to two-tab layout
- `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.test.tsx` — new tests
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` — pass `openMode` to `<RunWorkflowDrawer>` based on which button opened it (Run button → "run", Try button (US-148) → "try")

## Technical notes

- For cancel-on-new-Try: the simplest path is to have `POST /runs` ALWAYS call `cancelInFlightTriesForLineage` before starting the new run (regardless of whether it came from Try or Run). This matches Phase 4's "fast iteration" mental model — even external API callers benefit from auto-cancelling stuck runs. Alternative: a query parameter `?cancelInFlight=true` from the Try path only. Implementer's call; the lock is "Try cancels", and the simpler always-cancel path is recommended.
- The Run tab's existing inline-workflowId display is the API-validation feature. Keep it. Phase 4's Try flow uses the canvas as the result surface.
- Closes Milestone E. After this lands, end-to-end click-and-play is live: pick a workflow, click Try (or Upload & Try on source.upload), watch the canvas come alive.
- After landing: no Vite restart (frontend-only).
