# US-147: "Upload & Try" extension to `SourceUploadButton`

**As a** user iterating on a `source.upload` workflow,
**I want** the existing "Test upload" button (Phase 8 US-124) to become "Upload & Try" — the same upload flow but it ALSO sets `activeRunId` on the canvas so the canvas comes alive with status badges + previews,
**So that** uploading a file IS the Try trigger for source.upload workflows.

## Acceptance Criteria

- [ ] **Scenario 1**: Button label + tooltip update
    - **Given** `apps/frontend/src/features/workflow-builder/sources/SourceUploadButton.tsx` (Phase 8)
    - **When** read after the change
    - **Then** the button label reads "Upload & Try"
    - **And** the disabled-state tooltip (Phase 8: "Save the workflow first") is unchanged
    - **And** the icon (Phase 8: IconUpload) is unchanged

- [ ] **Scenario 2**: Successful upload sets `activeRunId` in canvas state
    - **Given** the user picks a file and the upload mutation (US-122's `useSourceUpload`) resolves with the extended response `{ [ctxKey]: ..., runId, workflowVersionId }` (US-146)
    - **When** the response is received
    - **Then** the button calls a setter exposed by `WorkflowEditorV2Page` (via React context or a prop): `setActiveRunId(runId)`
    - **And** the existing success Alert + CopyButton (Phase 8 US-124) keeps rendering — the new wiring is additive

- [ ] **Scenario 3**: Polling loops start automatically
    - **Given** `activeRunId` is now set in `RunStateContext` (US-138)
    - **When** the canvas re-renders
    - **Then** `useNodeStatuses` (US-137) starts polling on the new runId
    - **And** every node renderer's `<PreviewWidget>` (US-141) starts fetching preview cache data
    - **And** the user sees status badges + active-edge animation + preview widgets light up in execution order

- [ ] **Scenario 4**: Cancel-on-new-Try is server-side; UI just sets the new runId
    - **Given** a prior Try is still running (its `activeRunId` is set, polling is active)
    - **When** the user clicks Upload & Try again
    - **Then** the backend cancels the prior run via US-146's helper (server-side)
    - **And** the new upload's `runId` overwrites `activeRunId` in canvas state
    - **And** the canvas refocuses on the new run — the cancelled prior run's status badges freeze (their last polled state remains until cleared)

- [ ] **Scenario 5**: Error handling preserved
    - **Given** the upload mutation fails (413, MIME mismatch, network error)
    - **When** the error is surfaced
    - **Then** the existing red Alert from Phase 8 US-124 renders verbatim
    - **And** `activeRunId` is NOT modified (no Try triggers when upload itself fails)
    - **And** prior in-flight Trys (if any) continue uninterrupted on the canvas

- [ ] **Scenario 6**: Component test
    - **Given** `apps/frontend/src/features/workflow-builder/sources/SourceUploadButton.test.tsx`
    - **When** tests run
    - **Then** at least 3 cases pass: successful upload triggers `setActiveRunId(runId)`, failed upload does not modify `activeRunId`, button label reads "Upload & Try"

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/sources/SourceUploadButton.tsx` — extend onClick handler + rename label
- `apps/frontend/src/features/workflow-builder/sources/SourceUploadButton.test.tsx` — new tests
- `apps/frontend/src/features/workflow-builder/data/useSourceUpload.ts` (Phase 8 US-122) — update response type to include `runId` + `workflowVersionId` per US-146
- `apps/frontend/src/features/workflow-builder/run/RunStateContext.tsx` (US-138) — expose `setActiveRunId` in the context value

## Technical notes

- This story coordinates with US-138's `RunStateContext` — the context now exposes both `activeRunId` (read) and `setActiveRunId` (write).
- The Phase 8 US-124 CopyButton still copies the uploaded URL; that's an independent affordance.
- For the (rare) case where the upload succeeds but the workflow start fails on the backend (e.g., quota error), the response carries `runId: null` (or omits the field) — the frontend treats it as "uploaded but no run kicked off" and shows a yellow Alert.
- After landing: no Vite restart (frontend-only).
