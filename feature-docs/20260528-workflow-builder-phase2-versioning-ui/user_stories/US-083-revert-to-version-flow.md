# US-083: Revert-to-version confirmation modal + canvas reload on success

**As a** workflow author wanting to roll back to an earlier version,
**I want** clicking "Revert to this version" to confirm my intent and
then load the reverted head into the canvas,
**So that** I don't accidentally discard unsaved work and so the
editor reflects reality after the revert.

## Acceptance Criteria

- [ ] **Scenario 1**: Confirm modal warns + revert posts on confirm
    - **Given** a non-head row in `VersionHistoryDrawer`
    - **When** the user clicks "Revert to this version"
    - **Then** Mantine `modals.openConfirmModal` opens with body text "Reverting will replace the current head with v{n}, created {timestamp}. Any unsaved canvas changes will be discarded. Continue?"
    - **And** confirming calls `useRevertWorkflowHead().mutateAsync({ lineageId, workflowVersionId })`
    - **And** cancelling closes the modal with no network call

- [ ] **Scenario 2**: Success — canvas reloads with the reverted config
    - **Given** `useRevertWorkflowHead` resolves successfully
    - **When** the mutation completes
    - **Then** the `useWorkflow(lineageId)` query is invalidated (already done by the hook)
    - **And** the editor's loaded canvas state is replaced with the new head's config (via the existing `useEffect` that syncs `workflow.config` → canvas state)
    - **And** the `VersionHistoryDrawer` closes
    - **And** a green Mantine notification fires with title `"Reverted to v{n}"`

- [ ] **Scenario 3**: Error — alert with the response message
    - **Given** the mutation rejects with an error message
    - **When** the mutation completes
    - **Then** a red Mantine notification (or in-drawer `<Alert>`) fires with the error message
    - **And** the drawer remains open so the user can retry

- [ ] **Scenario 4**: Vitest coverage
    - **Given** the wired-up drawer + revert handler
    - **When** `npm test` runs
    - **Then** tests cover: confirm-modal opens with the expected copy, confirm calls the mutation with the right args, success closes the drawer + fires notification, error keeps the drawer open

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/versioning/VersionHistoryDrawer.tsx` — wire the Revert button to open the confirm modal + call the mutation
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` — verify the existing `useWorkflow` → canvas-state effect picks up the new head config after invalidation (no change expected; add coverage if missing)
- `apps/frontend/src/features/workflow-builder/versioning/__tests__/VersionHistoryDrawer.test.tsx` — scenarios 1–3

## Notes

- The "unsaved canvas changes" copy is informational; the editor doesn't currently expose an "isDirty" signal. Adding that signal is filed for a later pass — for now the warning is honest regardless.
- Mantine `modals.openConfirmModal` requires `<ModalsProvider>` to be mounted (it already is at app root per existing modals usage).
