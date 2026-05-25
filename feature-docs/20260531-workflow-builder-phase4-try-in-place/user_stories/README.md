NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user story files are located in `./` (this folder).

Read both the requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

**Numbering note:** Phase 8 closed at US-125 (document sources as nodes). Phase 4 numbering continues from US-126.

## Milestone A — Cache schema + shared hash helpers (US-126 to US-130) -- HIGH priority

| File | Title |
|---|---|
| [US-126-activity-output-cache-prisma-model.md](./US-126-activity-output-cache-prisma-model.md) | `ActivityOutputCache` Prisma model + migration |
| [US-127-stable-json-helper.md](./US-127-stable-json-helper.md) | `stable-json.ts` canonical JSON helper |
| [US-128-hash-artifact-helper.md](./US-128-hash-artifact-helper.md) | `hash-artifact.ts` content-addressable artifact hash helper |
| [US-129-compute-input-hash-helper.md](./US-129-compute-input-hash-helper.md) | `compute-input-hash.ts` — consumed-input hash |
| [US-130-noncacheable-flag-and-repository.md](./US-130-noncacheable-flag-and-repository.md) | `ActivityCatalogEntry.nonCacheable?` flag + `ActivityOutputCacheRepository` |

## Milestone B — Worker decorator + catalog opt-out sweep + GC (US-131 to US-134) -- HIGH priority

| File | Title |
|---|---|
| [US-131-cache-proxy-temporal-activities.md](./US-131-cache-proxy-temporal-activities.md) | Cache proxy Temporal activities — `findFresh` + `upsert` |
| [US-132-worker-cache-decorator.md](./US-132-worker-cache-decorator.md) | `executeCachedActivity` — worker decorator |
| [US-133-wire-cached-activity-into-graph-workflow.md](./US-133-wire-cached-activity-into-graph-workflow.md) | Wire `executeCachedActivity` into `graph-workflow.ts` per-node dispatch |
| [US-134-catalog-noncacheable-sweep-and-gc.md](./US-134-catalog-noncacheable-sweep-and-gc.md) | Catalog `nonCacheable: true` sweep + `activityOutputCache.gc` activity |

## Milestone C — Status query handler + status endpoint + node badges + active-edge (US-135 to US-139) -- HIGH priority

| File | Title |
|---|---|
| [US-135-get-node-statuses-query-handler.md](./US-135-get-node-statuses-query-handler.md) | `getNodeStatusesQuery` Temporal query handler + `nodeStatuses` map |
| [US-136-node-statuses-endpoint.md](./US-136-node-statuses-endpoint.md) | Backend `GET /:id/runs/:runId/node-statuses` proxy endpoint |
| [US-137-use-node-statuses-hook.md](./US-137-use-node-statuses-hook.md) | Frontend `useNodeStatuses` TanStack hook |
| [US-138-node-status-badge.md](./US-138-node-status-badge.md) | `NodeStatusBadge` component + wire into node renderers |
| [US-139-active-edge-highlight.md](./US-139-active-edge-highlight.md) | `computeActiveEdges` + active-edge animation |

## Milestone D — Preview-cache endpoint + 4 widgets + dispatch shell (US-140 to US-145) -- HIGH priority

| File | Title |
|---|---|
| [US-140-preview-cache-endpoint.md](./US-140-preview-cache-endpoint.md) | Backend `GET /:id/preview-cache` endpoint |
| [US-141-preview-hook-and-dispatch-shell.md](./US-141-preview-hook-and-dispatch-shell.md) | `useActivityOutputPreview` hook + `PreviewWidget` dispatch shell |
| [US-142-document-preview.md](./US-142-document-preview.md) | `DocumentPreview` widget |
| [US-143-segment-array-preview.md](./US-143-segment-array-preview.md) | `SegmentArrayPreview` widget |
| [US-144-ocr-result-preview.md](./US-144-ocr-result-preview.md) | `OcrResultPreview` widget |
| [US-145-classification-preview.md](./US-145-classification-preview.md) | `ClassificationPreview` widget |

## Milestone E — Try affordances — Upload & Try + in-canvas Try button (US-146 to US-149) -- HIGH priority

| File | Title |
|---|---|
| [US-146-cancel-and-upload-and-try-backend.md](./US-146-cancel-and-upload-and-try-backend.md) | `cancelInFlightTriesForLineage` helper + `POST /sources/:id/upload` extension |
| [US-147-upload-and-try-frontend.md](./US-147-upload-and-try-frontend.md) | "Upload & Try" extension to `SourceUploadButton` |
| [US-148-in-canvas-try-button.md](./US-148-in-canvas-try-button.md) | New "Try" top-bar button for source.api / legacy isInput workflows |
| [US-149-run-drawer-try-tab.md](./US-149-run-drawer-try-tab.md) | `RunWorkflowDrawer` "Try" tab |

## Milestone F — Run history endpoint + drawer + replay + version badge (US-150 to US-155) -- HIGH priority

| File | Title |
|---|---|
| [US-150-run-history-endpoint.md](./US-150-run-history-endpoint.md) | `GET /api/workflows/:id/runs` — run-history endpoint + `summariseInputCtx` |
| [US-151-input-ctx-endpoint.md](./US-151-input-ctx-endpoint.md) | `GET /api/workflows/:id/runs/:runId/input-ctx` — replay re-run support |
| [US-152-version-run-count-endpoint-and-badge.md](./US-152-version-run-count-endpoint-and-badge.md) | `GET /versions/:versionId/run-count` + run-count badge on VersionHistoryDrawer |
| [US-153-run-history-drawer-and-filters.md](./US-153-run-history-drawer-and-filters.md) | `useWorkflowRuns` hook + `RunHistoryDrawer` shell + `RunHistoryFilters` |
| [US-154-run-row-and-replay-flow.md](./US-154-run-row-and-replay-flow.md) | `RunRow` + replay flow + `activeRunId` management for historical runs |
| [US-155-cache-evicted-preview-and-rerun.md](./US-155-cache-evicted-preview-and-rerun.md) | Cache-evicted preview state with "Re-run" button |

## Milestone G — End-to-end verification (US-156) -- HIGH priority

| File | Title |
|---|---|
| [US-156-end-to-end-verification.md](./US-156-end-to-end-verification.md) | End-to-end Playwright walkthrough — Phase 4 try-in-place |

## Suggested Implementation Order (by dependency chain)

Phase 4 has a clear linear backbone (cache schema + helpers → worker decorator + wiring → status streaming → preview widgets → Try affordances → run history → verification). The dependency chain is mostly sequential across milestones; within most milestones, stories can land in parallel after their shared foundation lands. After Milestone A (US-127 → US-129 introduce new runtime exports from `@ai-di/graph-workflow`) and after Milestone B (US-134 sweeps the catalog), **ask Alex to restart Vite** — the package pre-bundle goes stale otherwise.

### Phase 1 — cache schema + shared hash helpers (Milestone A — Vite-restart point after US-130)
- [x] **US-126** (`ActivityOutputCache` Prisma model + migration) — DB schema; foundation for the repo + worker decorator
- [x] **US-127** (`stable-json.ts` canonical JSON helper) — pure shared helper; foundation for `configHash` + `inputHash`
- [x] **US-128** (`hash-artifact.ts` content-addressable artifact hash) — consumed by `computeInputHash`
- [x] **US-129** (`compute-input-hash.ts`) — depends on US-127 + US-128
- [x] **US-130** (`nonCacheable?` catalog field + `ActivityOutputCacheRepository`) — depends on US-126 (table) + sets up the consumer surface for Milestone B

### Phase 2 — worker decorator + catalog sweep + GC (Milestone B — depends on Phase 1; Vite-restart point after US-134)
- [ ] **US-131** (cache proxy Temporal activities `findFresh` + `upsert`) — depends on US-130 (repo)
- [ ] **US-132** (`executeCachedActivity` worker decorator) — depends on US-127 + US-129 + US-131
- [ ] **US-133** (wire decorator into `graph-workflow.ts`) — depends on US-132; THIS IS WHEN CACHING GOES LIVE
- [ ] **US-134** (catalog `nonCacheable` sweep + GC activity + scheduling) — independent of US-131/132/133; can land in parallel; the catalog sweep IS the runtime export change that triggers Vite restart

### Phase 3 — status streaming + node badges + active-edge (Milestone C — depends on Phase 2)
- [ ] **US-135** (`getNodeStatusesQuery` query handler + `nodeStatuses` map) — depends on US-133 (the decorator integration drives the cacheHit flag)
- [ ] **US-136** (backend `/node-statuses` proxy endpoint) — depends on US-135
- [ ] **US-137** (frontend `useNodeStatuses` hook) — depends on US-136
- [ ] **US-138** (`NodeStatusBadge` component + `RunStateContext`) — depends on US-137
- [ ] **US-139** (`computeActiveEdges` + active-edge animation) — depends on US-138 (`RunStateContext`); can land in parallel with US-138 once context is in place

### Phase 4 — preview-cache endpoint + 4 widgets + dispatch shell (Milestone D — depends on Phase 1 + Phase 3 context)
- [ ] **US-140** (backend `/preview-cache` endpoint) — depends on US-130 (repo)
- [ ] **US-141** (`useActivityOutputPreview` hook + `PreviewWidget` dispatch shell) — depends on US-140 + US-138 (context)
- [ ] **US-142** (`DocumentPreview` widget) — depends on US-141 (dispatch shell); independent of US-143/144/145
- [ ] **US-143** (`SegmentArrayPreview` widget) — depends on US-141; independent of US-142/144/145
- [ ] **US-144** (`OcrResultPreview` widget) — depends on US-141; independent of US-142/143/145
- [ ] **US-145** (`ClassificationPreview` widget) — depends on US-141; independent of US-142/143/144

### Phase 5 — Try affordances (Milestone E — depends on Phase 2 + Phase 3 + Phase 4)
- [ ] **US-146** (`cancelInFlightTriesForLineage` + extend source-upload endpoint) — depends on US-133 (caching live); the backend half of the Try trigger
- [ ] **US-147** ("Upload & Try" SourceUploadButton extension) — depends on US-146 + US-138 (sets activeRunId in context)
- [ ] **US-148** ("Try" top-bar button) — depends on US-138 (context); independent of US-147 (different trigger surface)
- [ ] **US-149** (`RunWorkflowDrawer` Try tab) — depends on US-148 + US-138; closes Milestone E. CLICK-AND-PLAY MILESTONE.

### Phase 6 — run history + replay + version badge (Milestone F — depends on Phase 5)
- [ ] **US-150** (backend `/runs` run-history endpoint + `summariseInputCtx`) — independent of US-151/152; the backbone endpoint
- [ ] **US-151** (backend `/runs/:runId/input-ctx`) — independent of US-150/152; small endpoint for the Re-run flow
- [ ] **US-152** (version run-count endpoint + badge on VersionHistoryDrawer) — independent of US-150/151
- [ ] **US-153** (`useWorkflowRuns` hook + `RunHistoryDrawer` shell + filters) — depends on US-150
- [ ] **US-154** (`RunRow` + replay flow + activeRunId management) — depends on US-153
- [ ] **US-155** (`CacheEvictedAlert` + Re-run button) — depends on US-141 (dispatch shell) + US-151 (input-ctx endpoint)

### Phase 7 — end-to-end verification (Milestone G)
- [ ] **US-156** (Playwright walkthrough — Phase 4 try-in-place; screenshots in `/tmp/wb-phase4-verify/`)

> US-126 → US-130 ship first (`packages/graph-workflow` introduces new `cache/` exports + `nonCacheable?` field); after merging US-130 ask Alex to restart Vite — pre-bundle of `@ai-di/graph-workflow` goes stale otherwise.
>
> Milestone B's US-134 (catalog sweep) modifies existing runtime exports (catalog entries' `nonCacheable` flag). After Milestone B closes, **ask Alex to restart Vite a second time**.
>
> Milestones C + D have heavy frontend wiring but no shared-package changes — no Vite restart needed beyond what Phase 1+2 already required.
>
> Milestone E (US-146 → US-149) is the first click-and-play milestone for Alex. Until US-149 lands, status badges + previews are wired but not user-triggerable on the canvas (you can drive them via React DevTools to verify Phase 3 wiring).
>
> US-156 must be the last story checked off — it verifies the integrated whole and produces the SESSION_HANDOFF closeout notes.
