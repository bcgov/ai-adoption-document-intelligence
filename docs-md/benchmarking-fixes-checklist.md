# Benchmarking System: UI State & Routing Fixes

Checklist of bugs and improvements for the benchmarking system frontend, covering stale UI state after mutations, missing auto-refresh, and incorrect navigation routing.

---

## Stale UI State After Starting a Run

### 1. [x] Benchmark definition does not reflect immutable state after starting a run
**Area:** Frontend — `DefinitionDetailView.tsx`
**Problem:** After clicking "Start Run", the definition still shows as mutable (edit button visible, no "Immutable" badge). The user must manually refresh the page to see the updated immutable state. The `handleStartRun` function navigates to the run page but does not invalidate the definition query cache.
**Expected:** After a run is started, the definition should immediately reflect its immutable state — the edit button should disappear and the "Immutable" badge should appear — without requiring a page refresh. Either invalidate the definition query after `startRun` resolves, or optimistically update the cached definition.
**Key file:** `apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx` — `handleStartRun` at line ~98

### 2. [x] Dataset version still shows as editable after starting a benchmark run
**Area:** Frontend — `DatasetDetailPage.tsx`
**Problem:** After starting a benchmark run that freezes the dataset version, the version status badge still shows "Editable" (green) instead of "Frozen" (lock icon). Upload and freeze actions remain enabled. The user must refresh the page to see the frozen state.
**Expected:** After a benchmark run is started (which freezes the dataset version), the dataset version UI should immediately update to show "Frozen" status with the lock icon, and disable upload/freeze/delete actions — without requiring a page refresh. Invalidate the dataset version query cache when a run is started.
**Key file:** `apps/frontend/src/features/benchmarking/pages/DatasetDetailPage.tsx` — version status badge at line ~344

---

## Auto-Refresh & Polling

### 3. [x] Recent runs table on project page does not auto-update run status
**Area:** Frontend — `ProjectDetailPage.tsx`, `useRuns.ts`
**Problem:** The "Recent Runs" table on the project detail page does not automatically refresh when runs transition from "processing" to "completed" status. The `useRuns` hook (used at line ~90) does not enable polling/`refetchInterval`, unlike `useRun` which supports polling for non-terminal states on the run detail page.
**Expected:** The recent runs table should automatically poll for status updates while any run is in a non-terminal state (pending/running). Once all visible runs reach a terminal state (completed/failed), polling should stop. Consider adding a `refetchInterval` to the `useRuns` hook similar to the pattern in `useRun`.
**Key file:** `apps/frontend/src/features/benchmarking/hooks/useRuns.ts` — `useRuns` hook at line ~68 (compare with `useRun` polling at line ~116)

---

## Feature Additions & Removals

### 4. [x] Add ability to edit dataset version name when not frozen
**Area:** Frontend — `DatasetDetailPage.tsx`
**Problem:** Dataset version names can only be set during creation (via the "Version name" text input in the new version dialog). There is no way to edit the name of an existing version that is still in an editable (non-frozen) state.
**Expected:** When a dataset version is not frozen, the user should be able to edit its name inline or via a dialog. Once the version is frozen, the name should become read-only. This requires both a frontend UI element and a backend API endpoint to update the version name.
**Key file:** `apps/frontend/src/features/benchmarking/pages/DatasetDetailPage.tsx` — version table name column at line ~339

### 5. [x] Remove "Use production queue" feature
**Area:** Frontend — `CreateDefinitionDialog.tsx`
**Problem:** The "Use Production Queue" radio group (with tooltip and two options) in the create/edit definition dialog is no longer needed and should be removed.
**Expected:** Remove the `useProductionQueue` state variable, the Radio.Group UI (lines ~383-404), and the `useProductionQueue` field from the `runtimeSettings` object passed to the API. Verify no backend code depends on this field and clean up accordingly.
**Key file:** `apps/frontend/src/features/benchmarking/components/CreateDefinitionDialog.tsx` — `useProductionQueue` state at line ~76, Radio.Group at lines ~383-404, runtimeSettings at lines ~173-177

---

## Navigation & Routing

### 6. [x] HITL approve action navigates to wrong review queue during ground truth review
**Area:** Frontend — `ReviewWorkspacePage.tsx`
**Problem:** When reviewing documents in the benchmarking ground truth HITL flow (URL: `/benchmarking/datasets/:id/versions/:versionId/review/:sessionId`), clicking "Approve" always navigates to `/review` (the primary HITL queue) instead of returning to the benchmarking dataset review queue at `/benchmarking/datasets/:id/versions/:versionId/review`. The `handleApprove` function at line ~280 has a hardcoded `navigate("/review")`.
**Expected:** After approving a document in the ground truth review flow, the user should be navigated back to the benchmarking dataset review queue (`/benchmarking/datasets/:id/versions/:versionId/review`), not the primary `/review` page. The `handleApprove` function needs to detect the context (benchmarking vs. primary HITL) and navigate accordingly, likely by checking the current URL path or passing a return-URL parameter.
**Key file:** `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx` — `handleApprove` at line ~272, hardcoded `navigate("/review")` at line ~280

---

## Key Files Reference

| Area | Files |
|------|-------|
| Definition Detail | `apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx` |
| Definition Dialog | `apps/frontend/src/features/benchmarking/components/CreateDefinitionDialog.tsx` |
| Project Detail | `apps/frontend/src/features/benchmarking/pages/ProjectDetailPage.tsx` |
| Runs Hook | `apps/frontend/src/features/benchmarking/hooks/useRuns.ts` |
| Dataset Detail | `apps/frontend/src/features/benchmarking/pages/DatasetDetailPage.tsx` |
| Dataset Review Queue | `apps/frontend/src/features/benchmarking/pages/DatasetReviewQueuePage.tsx` |
| Review Workspace (HITL) | `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx` |
| App Routing | `apps/frontend/src/App.tsx` |
