NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user story files are located in `./` (this folder).

Read both the requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

**Numbering note:** Phase 4 closed at US-156 (Try-in-Place + Caching + Per-Node Previews). Phase 6 numbering continues from US-157.

## Milestone A — Shared package: signature DSL parser + types + ambient kinds (US-157 to US-161) -- HIGH priority

| File | Title |
|---|---|
| [US-157-dynamic-node-shared-types.md](./US-157-dynamic-node-shared-types.md) | Shared types + `ParseError` shape |
| [US-158-parse-signature-jsdoc-stage.md](./US-158-parse-signature-jsdoc-stage.md) | `parseDynamicNodeSignature` — JSDoc-parse stage |
| [US-159-signature-semantics-and-entry-assembly.md](./US-159-signature-semantics-and-entry-assembly.md) | Signature semantics validation + derived `ActivityCatalogEntry` assembly |
| [US-160-ambient-kinds-subpath-export.md](./US-160-ambient-kinds-subpath-export.md) | Ambient `@ai-di/graph-workflow/kinds` subpath export |
| [US-161-catalog-entry-extension-and-barrel.md](./US-161-catalog-entry-extension-and-barrel.md) | `ActivityCatalogEntry` Phase-6 extension fields + final shared-package barrel |

## Milestone B0 — `deno-runner` HTTP sidecar service (prerequisite for Milestones B + C) (US-186) -- HIGH priority

| File | Title |
|---|---|
| [US-186-deno-runner-service.md](./US-186-deno-runner-service.md) | `deno-runner` HTTP sidecar service — image + docker-compose + OpenShift kustomize |

## Milestone B — Backend: Prisma model + repository + publish endpoints (US-162 to US-167) -- HIGH priority

| File | Title |
|---|---|
| [US-162-prisma-models-and-migration.md](./US-162-prisma-models-and-migration.md) | `DynamicNode` + `DynamicNodeVersion` Prisma models + migration |
| [US-163-dynamic-node-repository.md](./US-163-dynamic-node-repository.md) | `DynamicNodeRepository` |
| [US-164-publish-validation-pipeline-service.md](./US-164-publish-validation-pipeline-service.md) | `DynamicNodesService` publish-time validation pipeline (parser + `deno check` + allowlist) |
| [US-165-post-dynamic-node-endpoint.md](./US-165-post-dynamic-node-endpoint.md) | `POST /api/dynamic-nodes` endpoint + full Swagger DTOs |
| [US-166-put-dynamic-node-endpoint.md](./US-166-put-dynamic-node-endpoint.md) | `PUT /api/dynamic-nodes/:slug` endpoint (publish new version) |
| [US-167-list-detail-delete-endpoints.md](./US-167-list-detail-delete-endpoints.md) | `GET list` + `GET detail` + `DELETE` dynamic-node endpoints |

## Milestone C — Temporal: dyn.run activity + Deno subprocess runner + executor resolution (US-168 to US-172) -- HIGH priority

| File | Title |
|---|---|
| [US-168-error-class-hierarchy.md](./US-168-error-class-hierarchy.md) | Dynamic-node error class hierarchy (7 typed errors) |
| [US-169-subprocess-harness-and-version-cache.md](./US-169-subprocess-harness-and-version-cache.md) | Subprocess harness + version-cache LRU |
| [US-170-dyn-run-activity.md](./US-170-dyn-run-activity.md) | `dyn.run` Temporal activity — Deno subprocess runner |
| [US-171-executor-version-resolution.md](./US-171-executor-version-resolution.md) | Executor-side version resolution in `graph-workflow.ts` |
| [US-172-real-deno-activity-tests.md](./US-172-real-deno-activity-tests.md) | Real-Deno `dyn.run` activity tests + worker README updates |

## Milestone D — Catalog merge + binding-walk extension (US-173 to US-175) -- HIGH priority

| File | Title |
|---|---|
| [US-173-activity-catalog-merge-endpoint.md](./US-173-activity-catalog-merge-endpoint.md) | `GET /api/activity-catalog` extension — merge static + group dynamic nodes |
| [US-174-validate-graph-config-adapter-extension.md](./US-174-validate-graph-config-adapter-extension.md) | `validateGraphConfig` adapter extension for binding-walk with dynamic nodes |
| [US-175-use-activity-catalog-hot-reload.md](./US-175-use-activity-catalog-hot-reload.md) | `useActivityCatalog` hook hot-reload + invalidation on publish |

## Milestone E — Frontend: DynamicNodeEditor component (US-176 to US-179) -- HIGH priority

| File | Title |
|---|---|
| [US-176-dynamic-node-editor-shell-and-hooks.md](./US-176-dynamic-node-editor-shell-and-hooks.md) | `DynamicNodeEditor` shell + TanStack hooks |
| [US-177-code-pane-monaco-and-live-parse.md](./US-177-code-pane-monaco-and-live-parse.md) | `CodePane` — Monaco editor + boilerplate + live signature parse strip + publish-time error markers |
| [US-178-signature-preview-pane.md](./US-178-signature-preview-pane.md) | `SignaturePreviewPane` — derived signature card |
| [US-179-version-history-pane.md](./US-179-version-history-pane.md) | `VersionHistoryPane` — version list + view modal + revert |

## Milestone F — Frontend: management page + in-situ mounts + canvas integration (US-180 to US-184) -- HIGH priority

| File | Title |
|---|---|
| [US-180-dynamic-nodes-list-page.md](./US-180-dynamic-nodes-list-page.md) | `/dynamic-nodes` management page — list view |
| [US-181-dynamic-nodes-new-and-edit-pages-and-nav.md](./US-181-dynamic-nodes-new-and-edit-pages-and-nav.md) | `/dynamic-nodes/new` + `/dynamic-nodes/:slug` pages + top-bar nav link |
| [US-182-palette-custom-section-and-new-button.md](./US-182-palette-custom-section-and-new-button.md) | Activity palette "Custom" section + "+ New custom node" button |
| [US-183-canvas-dyn-pill-deleted-badge-and-context-menu.md](./US-183-canvas-dyn-pill-deleted-badge-and-context-menu.md) | Canvas DYN pill + "Deleted" badge + right-click "Edit script" in-situ modal |
| [US-184-settings-panel-for-dynamic-nodes.md](./US-184-settings-panel-for-dynamic-nodes.md) | `NodeSettingsPanel` dispatch + `DynamicNodeSettings` body for `dyn.*` nodes |

## Milestone G — End-to-end verification (US-185) -- HIGH priority

| File | Title |
|---|---|
| [US-185-end-to-end-playwright-verification.md](./US-185-end-to-end-playwright-verification.md) | End-to-end Playwright walkthrough — Phase 6 dynamic nodes |

## Suggested Implementation Order (by dependency chain)

Phase 6 has a clear linear backbone (shared package parser + types → backend persistence + publish endpoints → Temporal `dyn.run` activity + executor resolution → catalog merge + binding-walk → frontend editor component → frontend mounts + canvas integration → verification). The dependency chain is mostly sequential across milestones; within milestones, several stories can land in parallel after their shared foundation lands.

**Vite-restart points (per the workflow-builder cadence):**
- After Milestone A closes (US-161): the package introduces new runtime exports (`parseDynamicNodeSignature`, types, `kinds` subpath) — ask Alex to restart Vite.
- No further Vite restarts needed for Milestones B → F (backend + frontend changes only consume existing exports).

### Phase 1 — Shared package (Milestone A — Vite-restart point after US-161)
- [x] **US-157** (shared types + `ParseError` shape) — pure types; foundation for the parser + downstream DTOs
- [x] **US-158** (`parseDynamicNodeSignature` JSDoc-parse stage) — depends on US-157; extracts the JSDoc block
- [x] **US-159** (signature semantics + derived entry assembly) — depends on US-158; closes the parser
- [x] **US-160** (ambient `@ai-di/graph-workflow/kinds` subpath export) — independent of US-157/158/159; can land in parallel
- [x] **US-161** (catalog entry extension + final barrel) — depends on US-157 + US-158 + US-159 + US-160; closes Milestone A

### Phase 1.5 — `deno-runner` infrastructure (Milestone B0 — prerequisite for Phase 2 + Phase 3)
- [x] **US-186** (`deno-runner` HTTP sidecar service — image + docker-compose + OpenShift kustomize) — independent of Milestone A's shared-package work; can land in parallel. Required before US-164 (publish-time `deno check`) and US-170 (`dyn.run` HTTP client) can be implemented. ✅ Shipped in commit `f7395b49`.

### Phase 2 — Backend: persistence + publish endpoints (Milestone B — depends on Phase 1 + Phase 1.5)
- [x] **US-162** (Prisma models + migration) — foundation; everything in Milestone B depends on it
- [x] **US-163** (`DynamicNodeRepository`) — depends on US-162
- [x] **US-164** (publish-time validation pipeline service — parser + `deno-runner /check` + allowlist) — depends on US-161 (parser) + US-163 (repo) + US-186 (deno-runner running)
- [x] **US-165** (`POST /api/dynamic-nodes` + Swagger DTOs) — depends on US-164
- [x] **US-166** (`PUT /api/dynamic-nodes/:slug` + Swagger DTOs) — depends on US-164; can land in parallel with US-165
- [x] **US-167** (`GET list` + `GET detail` + `DELETE` + Swagger DTOs) — depends on US-163; can land in parallel with US-165/166

### Phase 3 — Temporal: dyn.run activity + executor resolution (Milestone C — depends on Phase 1 + Phase 1.5 + Phase 2)
- [x] **US-168** (error class hierarchy — 7 typed errors) — independent of US-169/170/171; foundation for them
- [x] **US-169** (subprocess harness + version-cache LRU) — independent of US-168/170/171; foundation for US-170. NOTE: the subprocess-harness lives inside the deno-runner image (US-186) — this story builds the worker-side cache only
- [x] **US-170** (`dyn.run` activity — `deno-runner` HTTP client) — depends on US-168 + US-169 + US-162 (DB) + US-186 (deno-runner running)
- [x] **US-171** (executor-side version resolution in `graph-workflow.ts`) — depends on US-168 (errors) + US-162 (DB); independent of US-169/170
- [x] **US-172** (real `deno-runner` activity tests + README updates) — depends on US-170 + US-171; closes Milestone C

### Phase 4 — Catalog merge + binding-walk (Milestone D — depends on Phase 2)
- [x] **US-173** (`GET /api/activity-catalog` extension — merge + group cache) — depends on US-167 (list endpoint surface); also unblocks US-175
- [x] **US-174** (`validateGraphConfig` adapter extension for binding-walk) — depends on US-167 + US-161 (types); can land in parallel with US-173
- [x] **US-175** (`useActivityCatalog` hook hot-reload + invalidation) — depends on US-173

### Phase 5 — Frontend: DynamicNodeEditor component (Milestone E — depends on Phase 1 + Phase 2 + Phase 4)
- [x] **US-176** (`DynamicNodeEditor` shell + 4 TanStack hooks) — foundation for the pane stories
- [x] **US-177** (`CodePane` — Monaco + boilerplate + live parse + markers) — depends on US-176 + US-161 (shared parser via package)
- [x] **US-178** (`SignaturePreviewPane` — derived signature card) — depends on US-176; can land in parallel with US-177/179
- [x] **US-179** (`VersionHistoryPane` — list + view + revert) — depends on US-176; can land in parallel with US-177/178; closes Milestone E

### Phase 6 — Frontend mounts + canvas integration (Milestone F — depends on Phase 5)
- [x] **US-180** (`/dynamic-nodes` management page list view) — depends on US-176 (hooks); independent of US-181-184
- [x] **US-181** (`/dynamic-nodes/new` + `/dynamic-nodes/:slug` pages + top-bar nav) — depends on US-176-179 (editor + panes complete) + US-180 (list page exists to navigate back to)
- [x] **US-182** (palette "Custom" section + "+ New custom node" button) — depends on US-175 (catalog hook sees dynamic) + US-176 (modal mount target)
- [x] **US-183** (canvas DYN pill + Deleted badge + right-click Edit script) — depends on US-175 (catalog hook) + US-176 (modal mount); can land in parallel with US-182
- [x] **US-184** (`NodeSettingsPanel` dispatch + `DynamicNodeSettings` body) — depends on US-175 (catalog) + US-176-179 (editor); CLICK-AND-PLAY MILESTONE after this closes

### Phase 7 — End-to-end verification (Milestone G)
- [ ] **US-185** (Playwright walkthrough — Phase 6 dynamic nodes; screenshots in `/tmp/wb-phase6-verify/`)

> US-157 → US-161 ship first (`packages/graph-workflow` introduces new `dynamic-nodes/` exports + `kinds/` subpath + `ActivityCatalogEntry` extension); after merging US-161 ask Alex to restart Vite — pre-bundle of `@ai-di/graph-workflow` goes stale otherwise.
>
> Milestones B + C have NO further package changes — no additional Vite restart needed.
>
> Milestone D's US-175 wires the existing hook to consume the merged catalog. After this lands the canvas + palette + binding-walk all see dynamic nodes — but until Milestone F mounts the editor, nothing user-triggerable on the canvas changes yet. You can verify via curl + checking `/api/activity-catalog`.
>
> Milestone E (US-176 → US-179) builds the editor component in isolation — testable in jest/RTL but not yet mounted in any route. Milestone F mounts it.
>
> Milestone F closes the click-and-play loop. US-184 is the last story before verification — after it lands, Alex can iterate on a dynamic node end-to-end without touching the JSON editor.
>
> US-185 must be the last story checked off — it verifies the integrated whole and produces the SESSION_HANDOFF closeout notes.
