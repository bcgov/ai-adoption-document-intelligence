NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user stories files are located in `./` (this folder).

Read both the requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

## Milestone A — Shared schema (US-076) -- HIGH priority

| File | Title |
|---|---|
| [US-076-child-workflow-library-version-field.md](./US-076-child-workflow-library-version-field.md) | Extend `ChildWorkflowNode.workflowRef.library` with optional `version?: number` |

## Milestone B — Backend (US-077 to US-080) -- HIGH priority

| File | Title |
|---|---|
| [US-077-run-spec-version-query-param.md](./US-077-run-spec-version-query-param.md) | Extend `GET /api/workflows/:id/run-spec` with optional `?workflowVersionId=` query param |
| [US-078-runs-validates-selected-version.md](./US-078-runs-validates-selected-version.md) | `POST /api/workflows/:id/runs` validates `initialCtx` against the selected version's schema |
| [US-079-get-version-by-id-endpoint.md](./US-079-get-version-by-id-endpoint.md) | `GET /api/workflows/:id/versions/:versionId` returns the full `WorkflowInfo` for a specific version |
| [US-080-child-workflow-executor-honors-version.md](./US-080-child-workflow-executor-honors-version.md) | `childWorkflow` node executor honors `workflowRef.library.version` at runtime |

## Milestone C — Frontend version history (US-081 to US-084) -- HIGH priority

| File | Title |
|---|---|
| [US-081-history-top-bar-button-and-hook.md](./US-081-history-top-bar-button-and-hook.md) | Add "History" top-bar button in `WorkflowEditorV2Page` + `useWorkflowVersion` hook |
| [US-082-version-history-drawer.md](./US-082-version-history-drawer.md) | `VersionHistoryDrawer` renders newest-first list with head badge and action buttons |
| [US-083-revert-to-version-flow.md](./US-083-revert-to-version-flow.md) | Revert-to-version confirmation modal + canvas reload on success |
| [US-084-compare-to-head-modal.md](./US-084-compare-to-head-modal.md) | Compare-to-head modal — two side-by-side read-only `JsonInput` blocks |

## Milestone D — Frontend Run drawer per-version (US-085) -- HIGH priority

| File | Title |
|---|---|
| [US-085-run-drawer-version-selector.md](./US-085-run-drawer-version-selector.md) | `RunWorkflowDrawer` "Version" Select wires per-version run-spec refetch + sends `workflowVersionId` in body |

## Milestone E — Library version-pin UI (US-086 to US-087) -- HIGH priority

| File | Title |
|---|---|
| [US-086-library-picker-version-select.md](./US-086-library-picker-version-select.md) | `LibraryPickerModal` "Version" Select returns `{ workflowId, version? }` |
| [US-087-child-workflow-settings-version-badge.md](./US-087-child-workflow-settings-version-badge.md) | `ChildWorkflowNodeSettings` signature summary shows pinned version badge + "Change version" button |

## Milestone F — End-to-end verification (US-088) -- HIGH priority

| File | Title |
|---|---|
| [US-088-end-to-end-verification.md](./US-088-end-to-end-verification.md) | End-to-end Playwright walkthrough — versioning UI |

## Suggested Implementation Order (by dependency chain)

Track 3 has two parallel front-end branches (History UI vs Library
pinning UI) sharing one shared-schema + backend foundation. The
ordering below sequences them to minimize Vite-restart pauses
(US-076's shared-package change is the single Vite restart point).

### Phase 1 — shared schema (Vite-restart point after)
- [x] **US-076** (`workflowRef.library.version?` in `@ai-di/graph-workflow`)

### Phase 2 — backend (can land in parallel with Phase 1; can ship even before Vite restart)
- [ ] **US-077** (extend `/run-spec` with `?workflowVersionId=`)
- [ ] **US-078** (`/runs` validates against the selected version)
- [ ] **US-079** (`GET /:id/versions/:versionId` endpoint)
- [ ] **US-080** (childWorkflow executor honors `version` at runtime)

### Phase 3 — frontend history drawer (depends on US-079 for compare; everything else is local)
- [ ] **US-081** ("History" top-bar button + `useWorkflowVersion` hook)
- [ ] **US-082** (`VersionHistoryDrawer` list + head badge + buttons)
- [ ] **US-083** (revert confirm + canvas reload)
- [ ] **US-084** (compare-to-head modal)

### Phase 4 — frontend Run drawer per-version (depends on US-077)
- [ ] **US-085** (Run drawer Version Select wiring)

### Phase 5 — frontend library pinning (depends on US-076 + Vite restart)
- [ ] **US-086** (`LibraryPickerModal` Version Select returns `{ workflowId, version? }`)
- [ ] **US-087** (`ChildWorkflowNodeSettings` version badge + change-version button)

### Phase 6 — end-to-end verification
- [ ] **US-088** (Playwright walkthrough; screenshots in `/tmp/wb-phase2-track3-verify/`)

> US-076 ships first so that Phase 2 backend work and Phase 5
> frontend work can both reference the new schema. After US-076
> lands, ask Alex to restart Vite — Vite's pre-bundle of
> `@ai-di/graph-workflow` goes stale otherwise.
>
> Phase 3 (history drawer) is independent of Phase 5 (library
> pinning) and can run in parallel if multiple sub-agents are
> available.
>
> US-088 must be the last story checked off — it verifies the
> integrated whole.
