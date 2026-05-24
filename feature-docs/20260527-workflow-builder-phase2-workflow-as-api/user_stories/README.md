NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user stories files are located in `./` (this folder).

Read both the requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

## Milestone A — Shared schema + types (US-065)

| File | Title |
|---|---|
| [US-065-ctx-declaration-is-input-flag.md](./US-065-ctx-declaration-is-input-flag.md) | Add optional `isInput?: boolean` to `CtxDeclaration` in `@ai-di/graph-workflow` |

## Milestone B — Backend run-spec + run endpoints (US-066 to US-069)

| File | Title |
|---|---|
| [US-066-temporal-client-optional-document-id.md](./US-066-temporal-client-optional-document-id.md) | Refactor `TemporalClientService.startGraphWorkflow()` to accept optional `documentId` |
| [US-067-run-spec-endpoint.md](./US-067-run-spec-endpoint.md) | `GET /api/workflows/:id/run-spec` returns `{ triggerUrl, inputSchema, authNotes, sampleCurl }` |
| [US-068-input-schema-derivation.md](./US-068-input-schema-derivation.md) | Input-schema derivation: library `metadata.inputs[]` vs regular ctx `isInput: true` |
| [US-069-runs-endpoint.md](./US-069-runs-endpoint.md) | `POST /api/workflows/:id/runs` triggers a workflow run via the refactored temporal client |

## Milestone C — Frontend Run drawer (US-070 to US-073)

| File | Title |
|---|---|
| [US-070-workflow-settings-is-input-checkbox.md](./US-070-workflow-settings-is-input-checkbox.md) | `WorkflowSettingsDrawer` adds an `isInput` checkbox per ctx row |
| [US-071-run-workflow-drawer-component.md](./US-071-run-workflow-drawer-component.md) | `RunWorkflowDrawer` renders trigger URL, input schema, sample curl, auth notes |
| [US-072-run-workflow-drawer-paste-and-run.md](./US-072-run-workflow-drawer-paste-and-run.md) | Paste-JSON-and-run textarea + Run button POSTs to `/api/workflows/:id/runs` |
| [US-073-run-this-workflow-top-bar-button.md](./US-073-run-this-workflow-top-bar-button.md) | "Run this workflow" top-bar button in `WorkflowEditorV2Page` opens the drawer |

## Milestone D — Workflow list `kind` filter (US-074)

| File | Title |
|---|---|
| [US-074-workflow-list-kind-filter.md](./US-074-workflow-list-kind-filter.md) | `WorkflowListPage` adds a SegmentedControl (All / Workflows / Libraries) |

## Milestone E — End-to-end verification (US-075)

| File | Title |
|---|---|
| [US-075-end-to-end-run-panel-verification.md](./US-075-end-to-end-run-panel-verification.md) | Playwright walkthrough: Run panel for regular + library, paste-and-run, list filter |

## Suggested Implementation Order (by dependency)

Track 2 has a clean dependency chain: shared schema → backend
endpoints → frontend drawer + filter → verification.

### Phase 1 — schema
- [x] **US-065** (CtxDeclaration `isInput?` flag in `@ai-di/graph-workflow`)

### Phase 2 — backend
- [x] **US-066** (TemporalClientService accepts optional documentId)
- [x] **US-067** (GET `/api/workflows/:id/run-spec` endpoint shell + DTOs)
- [x] **US-068** (input-schema derivation logic; pure-function unit tests)
- [x] **US-069** (POST `/api/workflows/:id/runs` endpoint + DTOs + integration)

### Phase 3 — frontend
- [x] **US-070** (`WorkflowSettingsDrawer` `isInput` checkbox)
- [x] **US-071** (`RunWorkflowDrawer` static content: URL + schema + curl)
- [x] **US-072** (`RunWorkflowDrawer` paste-and-run wiring)
- [x] **US-073** ("Run this workflow" top-bar button in `WorkflowEditorV2Page`)
- [x] **US-074** (`WorkflowListPage` kind filter SegmentedControl)

### Phase 4 — verification
- [ ] **US-075** (end-to-end Playwright walkthrough; screenshots in `/tmp/wb-phase2-track2-verify/`)

> Phase 1 must land + Vite restart before Phase 3 starts (because the
> frontend imports the new `CtxDeclaration.isInput` field). Phase 2
> must land before Phase 3's run wiring (`US-072`) so the drawer's
> paste-and-run path has a real backend. US-068 is the only pure
> testable unit in Phase 2 and should be implemented test-first
> (TDD).
