# US-154: `RunRow` + replay flow + `activeRunId` management for historical runs

**As a** user browsing past runs in the Run history drawer,
**I want** each row to show status + version + timestamp + input summary, AND a Replay button that loads that historical run's state onto the canvas,
**So that** I can revisit any past execution as if it had just finished — status badges, active-edge state, and per-node previews all rendered from the historical cache.

## Acceptance Criteria

- [ ] **Scenario 1**: `RunRow` component layout
    - **Given** `apps/frontend/src/features/workflow-builder/run-history/RunRow.tsx` (new file)
    - **When** read
    - **Then** it renders one row per `RunSummaryDto`: status badge (small colored dot — matches the NodeStatusBadge palette), version pin (`v3 — head` or `v2`), start timestamp (formatted as relative + absolute on hover), `inputCtxSummary` chip (truncated K/V list — first 2 keys), Replay button
    - **And** the row uses Mantine `<Paper p="sm" withBorder>` styling

- [ ] **Scenario 2**: Replay button click flow
    - **Given** the user clicks Replay on a row
    - **When** the click handler fires
    - **Then** it calls `setActiveRunId(runId)` AND `setIsReplay(true)` on `RunStateContext` (US-138)
    - **And** the Run history drawer closes
    - **And** a "Replay mode" indicator chip appears in the top bar with a small "Clear" button

- [ ] **Scenario 3**: Canvas enters replay mode
    - **Given** `activeRunId` is set with `isReplay: true`
    - **When** the canvas re-renders
    - **Then** `useNodeStatuses(workflowId, runId, { active: false })` fires once and surfaces the historical map
    - **And** every `<PreviewWidget>` fetches with the `runId` parameter so it scopes to that run's cache rows
    - **And** status badges render the frozen-in-time historical state; active edges are NOT animated (no longer "active")

- [ ] **Scenario 4**: "Clear" replay restores live mode
    - **Given** Replay mode is active
    - **When** the user clicks the "Clear" button in the top-bar indicator
    - **Then** `setActiveRunId(null)` AND `setIsReplay(false)` fire
    - **And** the canvas returns to its design-only state — badges absent, no preview widgets
    - **And** if the user then clicks Try, a new live run begins (not affecting historical data)

- [ ] **Scenario 5**: Editing parameters in Replay mode is allowed but flagged
    - **Given** Replay mode is active
    - **When** the user opens a node's settings panel and edits a parameter
    - **Then** the edit is allowed (no read-only lock)
    - **And** a small inline warning appears at the top of the settings panel: "Editing in replay mode — changes will not affect the displayed historical preview. Save + Try to see new results."
    - **And** the replay indicator stays in the top bar until explicitly cleared

- [ ] **Scenario 6**: Component test
    - **Given** `apps/frontend/src/features/workflow-builder/run-history/RunRow.test.tsx`
    - **When** tests run
    - **Then** at least 5 cases pass: status badge colour matches status, version pin shows "head" for head version, replay click sets activeRunId + isReplay, clear restores live mode, edit in replay shows warning

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/run-history/RunRow.tsx` — implementation
- `apps/frontend/src/features/workflow-builder/run-history/RunRow.test.tsx` — tests
- `apps/frontend/src/features/workflow-builder/run/RunStateContext.tsx` (US-138) — add `isReplay` + `setIsReplay`
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` — render the top-bar "Replay mode" indicator
- `apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx` — render the in-replay edit warning when `isReplay === true`

## Technical notes

- The status-badge palette + version-pin format match Phase 2 Track 3's existing patterns — reuse the same Mantine `<Badge>` variants.
- The "first 2 keys" cap on `inputCtxSummary` keeps the row compact. Hovering the chip shows the full summary (first 4 keys, per US-150 §4) in a Mantine `<Tooltip multiline w={400}>`.
- The relative-timestamp format ("2 hours ago") uses date-fns's `formatDistanceToNow` if it's already a dep, else Mantine's `<Tooltip label={isoTimestamp}>` over an absolute timestamp string.
- After landing: no Vite restart (frontend-only).
