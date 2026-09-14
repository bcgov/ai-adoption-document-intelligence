# Phase 4 — Try-in-Place + Caching + Per-Node Previews — Requirements

**Status:** Refined. Ready for user-story generation.
**Owner:** Alex
**Branch:** `feature/visual-workflow-builder`
**Feature-docs slug:** `20260531-workflow-builder-phase4-try-in-place`
**Predecessor:** Phase 8 (`feature-docs/20260530-workflow-builder-phase8-document-sources/`) — closed (`source.api` + `source.upload` shipped; SourceNode + source catalog + binding-walk participation in place).
**Authoritative design:** [docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md](../../docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md) (locked scope in §0).
**Plan reference:** [docs-md/workflow-builder/IMPLEMENTATION_PLAN.md §5 Phase 4](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md#phase-4--try-in-place--caching--per-node-previews).

---

## 1. Why this phase

Today (post-Phase-8), the V2 editor is design-only. To test a workflow the user has to save it, open the Run drawer, paste a body or upload a file, click Run, then leave the editor entirely and look at Temporal UI to see what happened. The feedback loop is minutes, not seconds, and it breaks before the user gets to per-node results.

[NOTES.md §1.5](../../docs-md/workflow-builder/NOTES.md#15-try-in-place-and-comfyui-inspiration) names this gap — a "ComfyUI for documents" where the canvas is the place you iterate, not a form you fill out before testing somewhere else. Phase 4 collapses the loop:

- The canvas becomes a **live execution surface** — every node shows its last-run output inline.
- The **active edge animates** while a run executes.
- Tweaking a parameter on one node re-runs **only that node and everything downstream**; upstream nodes serve from cache.
- A **Try** affordance triggers the in-canvas execution (extends Phase 8 US-124's "Test upload" for source.upload workflows; new in-canvas Try button for source.api / legacy isInput workflows).
- **Run history** surfaces past executions per workflow with click-to-replay.

Three things make Phase 4 different from earlier phases:

- **The cache layer is the load-bearing piece.** Without caching, a 17-node OCR workflow re-runs the entire chain (~30–90s) every parameter tweak. The cache short-circuits already-computed activities so re-runs measure in milliseconds.
- **Phase 4 is multi-layered** — Prisma model + worker decorator + Temporal query handler + multiple new endpoints + 4 preview widgets + 2 new drawers. Heavier than Phase 8 (one new NodeType + a catalog) but each layer is independent.
- **Phase 4 makes the editor a real-time UI.** Status badges + active-edge animation + preview widgets all update on a 1.5s polling loop while a Try executes.

Continuing to defer this leaves the V2 editor design-only and pushes the "ComfyUI for documents" experience indefinitely. Phase 5 (segmentation pack), Phase 6 (dynamic nodes), and Phase 7 (AI agent) all assume Phase 4's per-node-preview surface is in place.

---

## 2. Mental model — non-negotiable

The engine is **Model A** ([WORKFLOW_NODE_IO_MODEL_DECISION.md](../../docs-md/workflow-builder/WORKFLOW_NODE_IO_MODEL_DECISION.md)). Wires represent **execution order only**; data flows through the **ctx blackboard** via per-node `PortBinding { port, ctxKey }`.

Phase 4 adds **NO new runtime concept inside the workflow definition.** The cache is a worker-level decorator wrapping each activity execution. The status map is a Temporal query handler that mirrors activity transitions into a plain JS object. Preview widgets read from the cache table via a new endpoint — they never read Temporal history. From the workflow code's perspective, Phase 4 doesn't exist.

**Execution model:** each click of Try spawns a **fresh Temporal workflow execution**. The cache makes "fresh" feel "incremental" — only nodes whose `(configHash, inputHash)` changed actually execute their underlying activity. When the user clicks Try while a prior Try is still running, the backend cancels the prior execution and starts a new one.

**Lazy deploy.** No Temporal resource is created until the first Try. The first Try auto-saves the workflow to a new version (Phase 2 Track 3 versioning) before starting the Temporal execution.

**Run history is sourced from Temporal's visibility store** (Elasticsearch-backed in our deployment), not from a new sidecar `WorkflowRun` table. Pagination, status filters, and date filters all map to Temporal's visibility query language.

**Cache is dev-scope-with-lineage-sharing.** Cache rows are scoped by `workflowLineageId`, which is per-org. Multiple users iterating on the same workflow lineage can benefit from each other's cache rows (their lineage is shared; their hashes match). Cross-lineage sharing (e.g., two libraries with identical activities sharing cache) is OUT of scope pending GDPR review.

---

## 3. Locked decisions

### 3.1 Pre-resolved scope locks (from blocking-question round 1)

- **L1. Cache backend = sidecar Postgres K/V.** New `ActivityOutputCache` Prisma model. Temporal-replay-based caching rejected — would require workflow code to be Phase-4-aware and coupled cache lifetime to Temporal retention.
- **L2. Deploy timing = lazy.** No Temporal resource until first Try. First Try auto-saves to a new version. Eager deploy on editor open rejected as too expensive per browse-only session.
- **L3. Phase 4.0 ships 4 preview widgets only.** `Document`, `Segment[]`, `OcrResult`, `Classification`. `OcrTable`, `ValidationResult`, Switch-active-case deferred to Phase 4.x.
- **L4. Status streaming transport = Temporal query handlers polled at 1–2s.** WebSocket/SSE rejected as new infra without clear scale need (single-digit concurrent editor sessions today).
- **L5. Run history endpoint = cursor pagination + status filter + date range, production-scope.** The endpoint is a thin read layer over Temporal's visibility store. Sidecar `WorkflowRun` table rejected (sync-or-drift problem).

### 3.2 Pre-resolved design locks (from blocking-question round 2)

- **L6. Execution model = fresh Temporal execution per Try, cancel-on-new-Try.** Cleanly layered: workflow code unchanged, cache decorator handles short-circuiting. Signal-driven re-run from checkpoint rejected — workflow code would become Phase-4-aware.
- **L7. Caching opt-in/out = opt-out.** Every activity is cached by default. Add `nonCacheable?: boolean` to `ActivityCatalogEntry`; sweep the catalog setting it where activity is non-deterministic. Opt-in rejected — most activities in this codebase are deterministic-by-design and opt-in would leave most uncached out of the gate.
- **L8. Run history UI = sibling `RunHistoryDrawer`.** New right-side drawer for runs; `VersionHistoryDrawer` (Phase 2 Track 3) grows a small run-count badge per row for cross-reference. Tabbed-in-one-drawer rejected — versions and runs are conceptually distinct.

### 3.3 New locks (this requirements pass)

- **L9. `ActivityOutputCache` Prisma model.**
  - Columns: `id (cuid)`, `workflowLineageId (string)`, `nodeId (string)`, `configHash (string, sha256 hex)`, `inputHash (string, sha256 hex)`, `outputCtx (Json)`, `outputKind (string?)`, `createdAt (DateTime @default(now))`, `expiresAt (DateTime)`.
  - Unique index on `(workflowLineageId, nodeId, configHash, inputHash)`.
  - Secondary indexes: `(workflowLineageId, nodeId)` for the preview-cache endpoint, `(expiresAt)` for GC, `(workflowLineageId, createdAt)` for run-history reconstruction.
  - Default TTL = 24 hours (`DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000`).
- **L10. Stable JSON helper.** New `packages/graph-workflow/src/cache/stable-json.ts` exports `stableJson(value: unknown): string` — canonical JSON with sorted keys, no insignificant whitespace, arrays preserve declared order. Pure function. Consumed by both worker (cache writes) and backend (lookups).
- **L11. Artifact hash helper.** New `packages/graph-workflow/src/cache/hash-artifact.ts` exports `hashArtifact(value: unknown): string` — handles content-addressable artifacts (Documents → `blob.storage_key`, Segments → `parentDocId + pageRange + polygon` tuple) before hashing, so re-uploading the same file yields the same hash.
- **L12. `configHash` = `sha256(stableJson(node.parameters ?? {}))`.** Empty parameters hash to `sha256("{}")`. Stable across runs.
- **L13. `inputHash` = sha256 of stableJson of the consumed ctx slice.** For each `PortBinding { port, ctxKey }` declared on the node, look up `ctx[ctxKey]` at execution time; collect into `{ [port]: ctx[ctxKey] }`; hash. Document/Segment values are normalised via `hashArtifact` before hashing. Source nodes' input ctx is the inbound payload (uploaded file content hash for source.upload, POST body for source.api).
- **L14. Worker decorator.** New `apps/temporal/src/cache/cached-activity.ts` exports `executeCachedActivity(node, ctx, workflowLineageId, rawExecute)`. On entry: if `catalogEntry.nonCacheable` → execute raw. Else compute `configHash` + `inputHash`, look up cache row via `findFresh`, on hit assign `outputCtx` into ctx and return without executing, on miss execute + write row via `upsert`. Two new pure-Temporal activities `activityOutputCache.findFresh` and `activityOutputCache.upsert` — these are themselves `nonCacheable: true`.
- **L15. `nonCacheable?` catalog flag sweep.** Phase 4.0 sets `nonCacheable: true` on the catalog entries: `azureOcr.submit`, `azureClassify.submit`, `document.updateStatus`, `document.storeRejection`, `benchmark.persistOcrCache`, `benchmark.persistEvaluationDetails`, `benchmark.writePrediction`, `benchmark.updateRunStatus`, `benchmark.cleanup`. All other activities remain cacheable. The bulk catalog invariant test (US-103) is extended with a sanity assertion that every entry has a `nonCacheable` field set explicitly OR an absent field (defaults to false).
- **L16. Source nodes participate in cache via the same hash chain.** A source node's row is written at workflow start with `inputHash` = hash of the inbound payload, `outputCtx` = the source-derived ctx merge. Source nodes are NOT subject to the `nonCacheable?` flag — they're always cached.
- **L17. GC = hourly Temporal activity.** New `activityOutputCache.gc` activity deletes rows where `expiresAt < now()`. Scheduled via Temporal's existing scheduling support (or a periodic workflow if simpler — implementer choice). Lazy GC (delete-on-write) is OK as a fallback; daemon is the canonical path.
- **L18. `getNodeStatusesQuery` Temporal query handler.** Added to `apps/temporal/src/workflows/graph-workflow.ts`. Returns `Record<nodeId, NodeRunStatus>` where `NodeRunStatus = { status: "pending" | "running" | "succeeded" | "failed" | "skipped"; startedAt?: ISO; endedAt?: ISO; errorMessage?: string; cacheHit?: { configHash, inputHash } }`. Workflow body updates the map before/after each node execution + on cache hit.
- **L19. Backend proxy `GET /api/workflows/:id/runs/:runId/node-statuses`.** Calls `temporalClient.workflow.getHandle(runId).query(getNodeStatusesQuery)`. Returns the map JSON. 404 if Temporal handle not found; 410 Gone if retention-cleaned. Existing per-workflow membership check applies.
- **L20. Backend `GET /api/workflows/:id/preview-cache`.** Query params: `nodeId` (required), `runId?` (optional). Without `runId`, returns the most recent fresh (`expiresAt > now`) cache row for `(workflowLineageId, nodeId)`. With `runId`, scoped to the row whose `createdAt` falls within the run's execution window. New `ActivityOutputPreviewDto { outputCtx, outputKind, createdAt, expiresAt }`. 404 on no fresh match. Full Swagger decorators.
- **L21. Backend `GET /api/workflows/:id/runs` (run history).** Query params per `ListRunsQueryDto`: `cursor?`, `limit? (default 50, max 200)`, `status?`, `startedAfter?`, `startedBefore?`, `workflowVersionId?`. Returns `ListRunsResponseDto { runs: RunSummaryDto[], nextCursor: string | null }` where each `RunSummaryDto` carries `runId, workflowVersionId, versionNumber, status, startedAt, endedAt?, inputCtxSummary?`. Sources from Temporal's `ListWorkflowExecutions` API filtered by `WorkflowLineageId` search attribute (set by existing `startGraphWorkflow`). Cursor pagination uses Temporal's native page tokens.
- **L22. `inputCtxSummary` truncation.** First 4 top-level ctx keys, string-coerced values truncated to 80 characters each. Heavier values (Document blob URLs) shown as `"Document(<storage_key tail>)"`. Pure helper in `apps/backend-services/src/workflows/run-history/summarise-input-ctx.ts`.
- **L23. Backend `GET /api/workflows/:id/runs/:runId/input-ctx` (replay re-run support).** Returns the full `initialCtx` JSON for a historical run. Read from Temporal's workflow input or from the cache row keyed by the run's source-node entry. 404 if neither is available. Used by the "Re-run" button on evicted-cache previews (§6.4 in the design doc).
- **L24. Backend `GET /api/workflows/:id/versions/:versionId/run-count`.** Returns `{ runCount: number }`. Used by VersionHistoryDrawer to render the per-row run-count badge. Implementation: `count` query against Temporal visibility filtered by `WorkflowLineageId + WorkflowVersionId`. Cached per-version for 60s server-side (LRU helper in the workflow controller).
- **L25. `POST /api/workflows/:id/sources/:sourceNodeId/upload` extension.** Existing Phase 8 endpoint grows two response fields: `runId: string` and `workflowVersionId: string`. After commit-to-blob, the handler calls `TemporalClientService.startGraphWorkflow` with `initialCtx = { [ctxKey]: ctxValue }`, after first cancelling any in-flight Try for this lineage (lookup via Temporal visibility filtered to `status=running, WorkflowLineageId=this lineage` → cancel). The frontend stores `runId` in canvas state.
- **L26. Cancel-on-new-Try helper.** New `cancelInFlightTriesForLineage(lineageId)` method on `WorkflowsService`. Queries Temporal visibility for running executions in this lineage, calls `.cancel()` on each. Idempotent (safe to call when none in flight). Called from both the upload-and-Try path (L25) and the new in-canvas Try path (L27).
- **L27. New in-canvas Try button** for source.api / legacy isInput workflows. Top-bar button labelled "Try" with IconBolt, between "Save as library" and "Run this workflow". Disabled in create mode with Tooltip "Save the workflow first". Click opens `RunWorkflowDrawer` with the new "Try" tab pre-selected.
- **L28. `RunWorkflowDrawer` "Try" tab.** Renders the same JsonInput as the "Run" tab (Phase 2 Track 2) but with different submit semantics: clicking the Try button (a) cancels any in-flight Try via L26, (b) posts to `POST /runs` with the body, (c) closes the drawer immediately, (d) the canvas's polling loop on `activeRunId` starts. The "Run" tab is unchanged — keeps Phase 2 Track 2's "see workflowId inline" behaviour for API-validation use cases.
- **L29. Frontend `useNodeStatuses(workflowId, runId, opts)` TanStack hook.** Polls L19's endpoint at 1.5s while `opts.active && !terminal`. Terminal = every status in the map is `succeeded | failed | skipped | cancelled`. `refetchIntervalInBackground: false` (pauses on tab blur).
- **L30. Frontend `useActivityOutputPreview(workflowId, nodeId, runId?)` TanStack hook.** Calls L20's endpoint. Triggered debounced once per `node-status transitioned to non-pending`. Returns `ActivityOutputPreviewDto | null` (null on 404 / no cache row).
- **L31. Frontend `useWorkflowRuns(workflowId, filters)` TanStack `useInfiniteQuery` hook.** Wraps L21's endpoint with infinite-scroll pagination keyed on filter params.
- **L32. `NodeStatusBadge` component.** Small badge in the node renderer's top-right corner. Status → (icon, color): pending → empty circle / gray; running → spinner / blue; succeeded → check / green; failed → x-circle / red; skipped → flash / violet. Mantine + Tabler.
- **L33. Active-edge highlight.** Pure helper `computeActiveEdges(config, statuses): Set<edgeId>` in `apps/frontend/src/features/workflow-builder/run/active-edges.ts`. Edge is active when source node is `"running"` AND target is `"pending"`. Active edges render with `animated: true` + `style: { stroke: theme.colors.blue[6], strokeWidth: 2.5 }` via `WorkflowEdge.tsx`.
- **L34. `PreviewWidget` dispatch shell.** New `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx` switches on `outputKind` and renders `<DocumentPreview>` / `<SegmentArrayPreview>` / `<OcrResultPreview>` / `<ClassificationPreview>` or returns `null` for unsupported kinds. Wraps in `<Skeleton>` while the hook loads.
- **L35. `DocumentPreview`.** New `apps/frontend/src/features/workflow-builder/preview/DocumentPreview.tsx`. Paginated thumbnail strip for MultiPageDocument (first page large + up to 8 thumbnails); single thumbnail for SinglePageDocument. Uses existing `<BlobImage>` component from `apps/frontend/src/components/document/`.
- **L36. `SegmentArrayPreview`.** New `apps/frontend/src/features/workflow-builder/preview/SegmentArrayPreview.tsx`. Renders parent doc at display size with semi-transparent polygon overlays colour-coded by `segment.kind` using the Phase 3 §1 palette. Paginates if more than 6 segments.
- **L37. `OcrResultPreview`.** New `apps/frontend/src/features/workflow-builder/preview/OcrResultPreview.tsx`. Structured K/V table; nested objects render one level then collapse to `{...}` with a "View raw" link opening `<JsonInput readOnly>` in a modal. `OcrFields` (Phase 3 subtype) renders the same way.
- **L38. `ClassificationPreview`.** New `apps/frontend/src/features/workflow-builder/preview/ClassificationPreview.tsx`. Compact label pill + confidence bar (green ≥ 0.8 / amber 0.5–0.8 / red < 0.5) + matched-rule name.
- **L39. `RunHistoryDrawer` component.** New `apps/frontend/src/features/workflow-builder/run-history/RunHistoryDrawer.tsx`. Right-side Mantine `<Drawer>`. Header + filters (`<Select status>` + two `<DateInput>`s + `<Select version>`) + infinite-scrolling list of `<RunRow>`s. New top-bar button "Run history" (IconClipboardList) between Save and Run buttons. Disabled in create mode.
- **L40. `RunRow` component.** Status badge + version pin (`v3 — head` or `v2`) + start timestamp + truncated `inputCtxSummary` chip + "Replay" button. Click on row body OR Replay button calls `setActiveRunId(runId)`.
- **L41. Replay flow.** When `activeRunId` is set: (a) `useNodeStatuses(workflowId, runId, { active: false })` pulls the historical map once; (b) `useActivityOutputPreview(workflowId, nodeId, runId)` fires for each node loading historical cached outputs; (c) canvas renders frozen status badges + frozen active-edge state + preview widgets. Top bar shows a "Replay mode" indicator with a "Clear" button. Editing parameters while in replay mode is allowed but the replay state remains until the user explicitly clears it or starts a new Try.
- **L42. Cache-evicted preview state.** When `useActivityOutputPreview` returns null (404 → cache row gone): preview pane renders a small red `<Alert>` "Preview unavailable — cache evicted. Re-run to repopulate." with a "Re-run" button that calls `POST /runs` with the historical `initialCtx` (fetched via L23's endpoint).
- **L43. Run-count badge on `VersionHistoryDrawer`.** Each version row grows a small gray `<Badge variant="light">{runCount} runs</Badge>` after the existing v{n}/head/createdAt content. Driven by L24's endpoint via a new `useVersionRunCount(workflowId, versionId)` hook.
- **L44. Milestone slicing — A through G.** Seven milestones, one commit per milestone, matching the Phase 8 cadence.

---

## 4. Scope — what we will build

### 4.1 Shared package (`packages/graph-workflow`)

**New `src/cache/` directory:**

- `stable-json.ts` — canonical JSON serialiser (L10).
- `hash-artifact.ts` — content-addressable hash for Documents/Segments before `sha256` (L11).
- `compute-input-hash.ts` — `computeInputHash(node, ctx): string` (L13). Pure function consumed by the worker decorator.
- `index.ts` — barrel exports.
- Unit tests for each.

**Schema additions in `src/catalog/types.ts`:**

- Extend `ActivityCatalogEntry` with `nonCacheable?: boolean` (L7 / L15).

**Catalog sweep:**

- Set `nonCacheable: true` on the 9 entries in L15. The bulk catalog invariant test asserts every entry has either `nonCacheable: true` set explicitly or the field absent (defaults to false; sanity check for typos).

**No validator changes.** The cache layer is a runtime concern; status streaming reads existing structure.

### 4.2 Backend (`apps/backend-services`)

**Prisma migration:**

- New `ActivityOutputCache` model per L9.
- Generated via `npm run db:generate` so the model lands in both `apps/backend-services/src/` and `apps/temporal/src/`.

**New `src/cache/` directory:**

- `activity-output-cache.repository.ts` — Prisma-backed repo with `findFresh`, `upsert`, `deleteExpired`.
- `activity-output-cache.repository.spec.ts`.

**Existing controller changes (`WorkflowController`):**

- Add `GET /:id/runs/:runId/node-statuses` per L19.
- Add `GET /:id/preview-cache` per L20.
- Add `GET /:id/runs` per L21.
- Add `GET /:id/runs/:runId/input-ctx` per L23.
- Add `GET /:id/versions/:versionId/run-count` per L24.
- Extend `POST /:id/sources/:sourceNodeId/upload` per L25 — kick off Temporal run after commit; return `runId` + `workflowVersionId`.

**New endpoint helpers:**

- `cancelInFlightTriesForLineage(lineageId)` per L26.
- `summariseInputCtx(ctx)` per L22.

**Swagger / OpenAPI:**

- New DTOs: `ActivityOutputPreviewDto`, `ListRunsQueryDto`, `ListRunsResponseDto`, `RunSummaryDto`, `VersionRunCountDto`, `NodeRunStatusDto`.
- Extend `SourceUploadResponseDto` with `runId` + `workflowVersionId`.
- All `@ApiOkResponse` / `@ApiBadRequestResponse` / `@ApiUnauthorizedResponse` / `@ApiNotFoundResponse` / `@ApiGoneResponse` decorators per [CLAUDE.md](../../CLAUDE.md).

### 4.3 Temporal (`apps/temporal`)

**New `src/cache/` directory:**

- `cached-activity.ts` — worker decorator per L14.
- Two new pure-Temporal activities `activityOutputCache.findFresh` and `activityOutputCache.upsert` exposed via the existing activities-barrel. Both `nonCacheable: true`.
- `activityOutputCache.gc` activity per L17 + a periodic scheduling shim.

**Workflow definition changes (`src/workflows/graph-workflow.ts`):**

- Define `getNodeStatusesQuery` query handler per L18.
- Maintain `nodeStatuses: Record<string, NodeRunStatus>` inside the workflow body.
- Update statuses before/after each node execution and on cache hit (via the decorator's return-shape signalling whether it was a hit).
- Wire `executeCachedActivity` between the existing per-node-execute helper and the underlying activity proxy. Workflow code is unchanged in shape — just the dispatch goes through the decorator.

**Activity-side concerns:**

- The worker decorator imports the shared `computeInputHash` from `@ai-di/graph-workflow/cache`.
- Cache reads/writes go through the proxied activities (`findFresh` / `upsert`), keeping the worker pure-Temporal.

### 4.4 Frontend (`apps/frontend`)

**New `src/features/workflow-builder/run/` extensions** (Phase 2 Track 2 directory):

- `useNodeStatuses.ts` — L29.
- `useActivityOutputPreview.ts` — L30.
- `active-edges.ts` — `computeActiveEdges` helper per L33.
- `NodeStatusBadge.tsx` — L32.

**New `src/features/workflow-builder/preview/` directory:**

- `PreviewWidget.tsx` — dispatch shell per L34.
- `DocumentPreview.tsx` — L35.
- `SegmentArrayPreview.tsx` — L36.
- `OcrResultPreview.tsx` — L37.
- `ClassificationPreview.tsx` — L38.

**New `src/features/workflow-builder/run-history/` directory:**

- `RunHistoryDrawer.tsx` — L39.
- `useWorkflowRuns.ts` — L31.
- `RunRow.tsx` — L40.
- `RunHistoryFilters.tsx` — `<Select status>` + two `<DateInput>`s + `<Select version>`.
- `useVersionRunCount.ts` — driving L43.

**Edits to existing files:**

- `WorkflowEditorV2Page.tsx` — add "Try" top-bar button per L27; add "Run history" top-bar button per L39; manage `activeRunId` canvas state; mount the polling loops when `activeRunId` is set.
- `canvas/WorkflowEditorCanvas.tsx` — render `NodeStatusBadge` inside each node renderer; consume `computeActiveEdges` to style edges.
- `canvas/WorkflowEdge.tsx` — accept an `isActive` prop; render the active-edge animation per L33 when set.
- `run/RunWorkflowDrawer.tsx` — add the "Try" tab per L28; existing Run-drawer behaviour preserved.
- `sources/SourceUploadButton.tsx` — rename to "Upload & Try" + extend `onClick` to consume the upload response's `runId` + start the polling loop (L25 frontend half).
- `versioning/VersionHistoryDrawer.tsx` — add run-count badge per L43.

**No new auth surface.** All endpoints inherit the existing per-workflow membership check.

### 4.5 Coexistence with prior phases

- **Phase 2 Track 2 (workflow-as-API).** Existing `RunWorkflowDrawer` keeps its "Run" tab semantics unchanged (used for API-validation by external callers). Phase 4 adds the "Try" tab next to it.
- **Phase 2 Track 3 (versioning).** `VersionHistoryDrawer` grows a run-count badge (L43). First Try on an unsaved workflow auto-saves to a new version (reuses Phase 2 Track 3's `useSaveWorkflowVersion`).
- **Phase 3 (typed I/O).** `PreviewWidget` dispatches on `outputKind` (Phase 3's `ArtifactKind` string). Cache layer is type-agnostic — only the preview rendering depends on Phase 3.
- **Phase 8 (sources).** `source.upload`'s "Test upload" button (US-124) is extended to "Upload & Try" per L25. `source.api` workflows use the new in-canvas Try button per L27. Source nodes participate in the cache via L16.

---

## 5. Out of scope (explicitly deferred)

- **Preview widgets for `OcrTable`, `ValidationResult`, Switch-active-case** — Phase 4.x. Dispatch shell open for additions.
- **WebSocket / SSE push status streaming** — Phase 4.x. Polling at 1.5s scales fine for current dev concurrency.
- **`/queue` ↔ `RunHistoryDrawer` cross-link** — Phase 4.x. Both views coexist; cross-links land later.
- **Manual cache invalidation UI** — Phase 4.x. No per-node "Clear" button, no global "Reset cache" button. TTL handles eviction; users restart by waiting for natural expiry or doing a hard Prisma delete.
- **Cross-lineage cache sharing** — Phase 4.x, gated on GDPR review. 4.0 ships with lineage-scoped sharing only.
- **Time-travel debugging** (step backwards through a run, inspect ctx at each step) — not planned. Temporal history viewer covers operator audience.
- **Cancellation UI mid-Try** (explicit "Cancel" button while a Try is running) — likely lands in 4.0 if it fits the implementation phase (trivial reuse of L26), filed here for visibility.
- **Live source.api intake during a Try** — Phase 4.x. 4.0 Trys for source.api workflows use the Run-drawer JsonInput body.
- **Predictive preview** (showing what a node WOULD have produced based on partial run) — Phase 5+. Not planned for 4.0.
- **Replay of failed-mid-run workflows with downstream preview** — partial-completion replay only. Failed-then-downstream-might-have-worked predictions out of scope.
- **Auto-cleanup of cache rows on workflow delete** — eventually filed; today TTL handles orphans.
- **US-053 (`borderColor` console warning)** — still open from Phase 1B; blocked on Alex pasting dev-console text. Not bundled into Phase 4.
- **Pre-existing commit `b86741c7` (native-binary pin)** — lands as its own PR against develop; not bundled into Phase 4.
- **Pre-existing backend `graph-schema-validator` template-validation failure** — predates Phase 8; worth a triage commit at some point but NOT blocking Phase 4.

---

## 6. Milestone breakdown — A through G

Per L44. One commit per milestone, matching Phase 8's cadence. The user-stories writer should produce one umbrella `README.md` plus one `US-NNN-*.md` file per scenario, dependency-ordered. **Numbering continues from US-126** (Phase 8 closed at US-125).

### Milestone A — Cache schema + shared hash helpers (US-126 → US-130)

- New Prisma migration adding `ActivityOutputCache` model (L9). Run `npm run db:generate` to write the model into both `apps/backend-services/src/` and `apps/temporal/src/`.
- `packages/graph-workflow/src/cache/stable-json.ts` + tests (L10).
- `packages/graph-workflow/src/cache/hash-artifact.ts` + tests (L11).
- `packages/graph-workflow/src/cache/compute-input-hash.ts` + tests (L13).
- Shared package barrel exports the new helpers.
- `ActivityCatalogEntry.nonCacheable?` schema addition (L7).
- Backend `activity-output-cache.repository.ts` + tests (Prisma repo; methods: `findFresh`, `upsert`, `deleteExpired`).
- Package + backend test-suites green.
- **Verification surface for Alex:** none yet — pure infra. Build the package + restart Vite reminder (new runtime exports). DB migration applied locally.

### Milestone B — Worker decorator + catalog opt-out sweep + GC (US-131 → US-134)

- `apps/temporal/src/cache/cached-activity.ts` worker decorator per L14.
- Two new pure-Temporal activities: `activityOutputCache.findFresh` + `activityOutputCache.upsert`. Both `nonCacheable: true`.
- Sweep `packages/graph-workflow/src/catalog/activities/` setting `nonCacheable: true` on the 9 entries per L15. Update the bulk catalog invariant test (US-103) with the L15 sanity assertion.
- `activityOutputCache.gc` activity per L17 + a scheduling shim (periodic workflow OR Temporal schedule, implementer choice).
- Wire `executeCachedActivity` into `graph-workflow.ts`'s per-node-execute dispatch — workflow code stays in shape, just calls go through the decorator.
- Temporal + backend + package test-suites green.
- **Verification surface for Alex:** still no UI. Direct DB inspection possible (run a workflow via curl, observe `ActivityOutputCache` rows). End-to-end UI surface lights up in Milestone E.

### Milestone C — Status query handler + status endpoint + node badges + active-edge (US-135 → US-139)

- Define `getNodeStatusesQuery` + maintain `nodeStatuses` map in `graph-workflow.ts` per L18.
- Backend `GET /:id/runs/:runId/node-statuses` per L19 + Swagger DTOs.
- Frontend `useNodeStatuses` hook per L29.
- Frontend `NodeStatusBadge` component per L32.
- Frontend `computeActiveEdges` helper per L33 + tests.
- Edit `canvas/WorkflowEditorCanvas.tsx` + each node renderer to mount the badge.
- Edit `canvas/WorkflowEdge.tsx` to accept `isActive` + render the active-edge animation.
- Edit `WorkflowEditorV2Page.tsx` to manage `activeRunId` canvas state (still no Try button yet — `activeRunId` will be empty until Milestone E).
- Backend + frontend tests green.
- **Verification surface for Alex:** if you manually set `activeRunId` in dev (e.g., via React DevTools) to a known Temporal runId, you should see status badges + active-edge animation update as the run progresses. Not click-and-play yet — Milestone E wires up the trigger.

### Milestone D — Preview-cache endpoint + 4 widgets + dispatch shell (US-140 → US-145)

- Backend `GET /:id/preview-cache` per L20 + Swagger DTOs.
- Frontend `useActivityOutputPreview` hook per L30.
- New `src/features/workflow-builder/preview/` directory:
  - `PreviewWidget.tsx` dispatch shell per L34.
  - `DocumentPreview.tsx` per L35.
  - `SegmentArrayPreview.tsx` per L36.
  - `OcrResultPreview.tsx` per L37.
  - `ClassificationPreview.tsx` per L38.
- Edit each node renderer to mount `<PreviewWidget>` under the node's body.
- Frontend tests cover each widget renders for representative outputCtx + outputKind combos.
- Frontend test-suite green.
- **Verification surface for Alex:** still no Try trigger, but if you set `activeRunId` manually after running a workflow via curl, the canvas should now show status badges + per-node previews loaded from the cache. Wire-up complete in Milestone E.

### Milestone E — Try affordances — Upload & Try + in-canvas Try button (US-146 → US-149)

- Extend `POST /:id/sources/:sourceNodeId/upload` per L25 — kick off Temporal run, return `runId` + `workflowVersionId`, cancel in-flight via L26.
- New `cancelInFlightTriesForLineage` helper per L26.
- Frontend: rename `SourceUploadButton` to "Upload & Try"; extend its `onClick` to store `runId` in canvas state (starts polling loops via Milestones C + D).
- Frontend: add the "Try" top-bar button per L27.
- Frontend: extend `RunWorkflowDrawer` with the "Try" tab per L28 — same JsonInput shape, different submit semantics (cancel + post + close + start polling).
- Frontend tests cover: Upload & Try kicks off a run; in-canvas Try button starts a run; cancel-on-new-Try fires when the second Try begins.
- Backend tests cover the upload-then-Try chain + the cancel helper.
- Backend + frontend test-suites green.
- **Verification surface for Alex:** This is the first click-and-play milestone. On a workflow with source.upload: click Upload & Try, drop a PDF, watch the canvas come alive — status badges progress, active edges animate, previews render under each node as it completes. On a workflow with source.api: click Try in the top bar, paste a body, click Try in the drawer, drawer closes, canvas comes alive. Tweak a parameter on one node, click Try again — upstream nodes flash violet (cache hits), the tweaked node + downstream re-execute.

### Milestone F — Run history endpoint + drawer + replay + version badge (US-150 → US-155)

- Backend `GET /:id/runs` per L21 + Swagger DTOs + Temporal visibility query helpers.
- Backend `GET /:id/runs/:runId/input-ctx` per L23.
- Backend `GET /:id/versions/:versionId/run-count` per L24.
- Frontend `useWorkflowRuns` hook per L31.
- Frontend `useVersionRunCount` hook driving L43.
- New `src/features/workflow-builder/run-history/` directory:
  - `RunHistoryDrawer.tsx` per L39.
  - `RunRow.tsx` per L40.
  - `RunHistoryFilters.tsx`.
- Edit `WorkflowEditorV2Page.tsx` to add the "Run history" top-bar button.
- Replay flow per L41 — clicking Replay sets `activeRunId` in canvas state with the historical runId; polling loops fire in `active: false` mode (one-shot fetch).
- Cache-evicted preview state per L42 — `<Alert>` + "Re-run" button calling L23's input-ctx endpoint.
- Edit `versioning/VersionHistoryDrawer.tsx` to add the run-count badge per L43.
- Backend + frontend tests green.
- **Verification surface for Alex:** Click "Run history" in the top bar. See the last N runs of the current workflow with status badges + version pins + timestamps. Filter by status/date/version. Click Replay on an old run — canvas replays its status badges + previews from cache. Open Version history — each version row shows a run-count badge.

### Milestone G — End-to-end Playwright verification (US-156)

Per the verification list:

1. Create a fixture workflow `WF_PH4_ID` with: `source.upload → file.prepare → azureOcr.submit → azureOcr.poll → azureOcr.extract → ocr.normalizeFields → document.classify`. Save it.
2. Click Upload & Try on the source.upload node; drop a test PDF. Verify the canvas comes alive — status badges progress in execution order, active edges animate, previews render in sequence.
3. Verify the source.upload preview shows the uploaded document via DocumentPreview.
4. Verify the classify node's preview shows a Classification widget with label + confidence + matched rule.
5. Tweak `confidenceThreshold` on the classify node. Click Upload & Try with the same PDF. Verify upstream nodes flash violet (cache hits) within a couple of seconds; classify + downstream re-execute (status transitions blue → green); preview updates.
6. Cancel-on-new-Try: while a Try is running, click Try again. Verify the prior run shows "cancelled" in the run history.
7. Open Run history. Verify three runs visible (initial + tweaked + cancelled), each with correct status badge + version pin + timestamp.
8. Filter Run history by status=succeeded. Verify only the two successful runs show.
9. Click Replay on the initial run. Verify the canvas replays its status badges + previews (now showing the pre-tweak classification result).
10. Manually delete the cache row for the classify node (`DELETE FROM activity_output_cache WHERE node_id = '<classify-id>'`). Click Replay again on the same run. Verify the classify node's preview shows the cache-evicted Alert with a "Re-run" button. Click Re-run; verify a fresh Try kicks off with the historical input ctx.
11. Open Version history. Verify each version row shows a `runCount` badge.
12. Create a source.api workflow `WF_PH4_API_ID` (no upload). Click Try in the top bar. Verify the Run drawer opens with a "Try" tab pre-selected. Paste a body. Click Try. Verify the drawer closes immediately and the canvas comes alive.
13. Switch between the "Try" tab and the "Run" tab in the drawer for `WF_PH4_API_ID`. Verify the "Run" tab still behaves as Phase 2 Track 2 (inline workflowId result; doesn't close the drawer).

Screenshots land under `/tmp/wb-phase4-verify/`. Zero `pageerror` events required.

- **Verification surface for Alex:** the click-and-play closeout for Phase 4. Final ping for the phase.

---

## 7. Non-functional constraints

- **Backwards compatibility.** All schema additions are additive. `ActivityOutputCache` is a new table; the catalog `nonCacheable?` field is optional with a `false` default. Existing workflows with no Try-in-place usage validate and run identically to today (the worker decorator wraps activities but uncached defaults to "execute normally + write cache row").
- **No "any" types** per [CLAUDE.md](../../CLAUDE.md). `NodeRunStatus`, `ActivityOutputPreviewDto`, `RunSummaryDto`, `ListRunsQueryDto`, etc. all properly typed. `outputCtx` is `Record<string, unknown>` (not `any`).
- **Full Swagger / OpenAPI documentation** per [CLAUDE.md](../../CLAUDE.md). Five new endpoints + one extended endpoint, each with full DTO classes + specific decorators.
- **Backend tests when backend code changes** per [CLAUDE.md](../../CLAUDE.md). Each Milestone A → F backend deliverable ships matching tests. Temporal-side tests cover the worker decorator's cache-hit / cache-miss / opt-out paths.
- **Generic-system constraint** per [CLAUDE.md](../../CLAUDE.md). No document-specific implementation. The preview widgets are kind-driven (Phase 3) — `DocumentPreview` works for any `Document` artifact regardless of source.
- **No premature abstraction.** No generic "preview adapter" interface; each widget is one component. No "cache strategy" abstraction; the worker decorator is one function.
- **Dev server cadence.** After Milestone A and Milestone B (catalog flag sweep + new shared-package exports), `packages/graph-workflow` introduces new runtime exports — explicitly ping Alex to restart Vite. Vite's pre-bundle goes stale otherwise.
- **No bundling unrelated commits.** Pre-existing `b86741c7` (native-binary pin) lands separately. US-053 (borderColor warning) stays blocked.
- **GDPR considerations.** Cache rows are lineage-scoped (per-org). Cross-lineage sharing is out of scope pending review. Cache rows contain workflow output data which may include OCR-extracted text from user documents — TTL eviction (24h) is the privacy backstop for 4.0.
- **Performance budget.** Status polling at 1.5s intervals → ~40 requests/minute per active editor. Preview-cache endpoint called once per node-status transition (debounced) → ~17 requests per workflow execution at most. Cache table writes ≤ 1 per executed activity. Well within current backend capacity.

---

## 8. Roles & permissions

- **Workflow author.** Drops nodes, configures parameters, clicks Try, watches the canvas come alive, tweaks + retries. They get every Phase 4 affordance.
- **Workflow consumer / API client.** Continues calling `POST /api/workflows/:id/runs`. The Phase 4 cache layer is invisible to them — they get the same response shape and behaviour. Their executions DO populate the cache table though; subsequent dev iterations on the same workflow benefit from cache rows their calls produced.
- **System admin / observer.** Unaffected. The `/queue` Processing monitor surfaces documents as before; future cross-link to `RunHistoryDrawer` deferred to Phase 4.x.

No new auth surface. All five new endpoints inherit the existing per-workflow membership check + the seed-default `x-api-key` auth.

---

## 9. Edge cases + error states

- **Try on an unsaved workflow.** First Try auto-saves a new version via the existing `useSaveWorkflowVersion` flow before starting the Temporal execution. If save fails (validator error), the Try is aborted with the validator's error toast — no Temporal resource consumed.
- **Try while a prior Try is still running.** L26's cancel helper fires; prior run shows "cancelled" status in Run history; new run starts cleanly.
- **Try cancelled by user navigating away.** No explicit cancel — the prior run finishes naturally (or times out per existing Temporal timeouts). Next Try cancels it via L26 anyway.
- **Cache row TTL-evicted between writing and replay.** L42 surfaces the cache-evicted Alert with a Re-run button. Status badges still render (Temporal history is longer-retention than the cache).
- **Cache hash collision** (`configHash` + `inputHash` collide for different inputs). Effectively impossible with sha256; not handled.
- **Two simultaneous workers writing the same cache key.** Prisma's `@@unique` constraint causes one to throw on `upsert` collision. The decorator catches and falls through to execute the activity raw (treats the conflict as "cache row already exists, use it" — does a follow-up findFresh).
- **Activity throws after writing partial output to ctx.** The decorator's `upsert` only runs on activity success. Partial writes are NOT cached. Re-Try executes the activity from scratch.
- **Workflow execution cancelled mid-activity.** Activity throws a Temporal cancellation error; decorator does not write to cache. Status map records `"failed"` with error message. Subsequent Trys see the previous activities as cache hits + the cancelled one as a fresh miss.
- **Cache row written by a different workflow version with the same hash.** Cache rows are scoped by `workflowLineageId`, not `versionId`. Identical configs across versions share cache — by design. The user revert from v2 to v1 with no schema diff: cache rows remain valid.
- **Network blip during status polling.** TanStack retry handles a single failure; user sees a brief stall. After two consecutive failures the hook surfaces an error state via the existing query-error toast plumbing.
- **Temporal returns 410 Gone on `getNodeStatusesQuery`.** Run is past retention; the cache row's `endedAt` is used as a freeze point. Status badges show whatever the last cache rows recorded.
- **Run history filter returns zero results.** Drawer shows an empty state: "No runs match these filters."
- **Run history pagination cursor invalidated** (e.g., Temporal visibility re-indexed). Backend returns 400 + a "Cursor expired — reload" message; UI scroll-resets to the first page.
- **Source.upload + cache hit on the same file.** Re-uploading the same content (same `hashArtifact` result) → `inputHash` matches → downstream activities cache-hit. Upload itself doesn't "cache" because uploading-the-same-file always results in the same content hash regardless. Source node's cache row is written at start; subsequent identical uploads see it as cache-hit too.
- **Cache eviction GC fails.** Lazy fallback: `findFresh` filters by `expiresAt > now()` so expired rows are invisible to consumers. GC daemon eventual; not load-bearing.
- **Replay of a run whose source.upload blob has been deleted.** DocumentPreview falls back to a "Document unavailable" state (file gone). Other previews keep working. Re-run button still works if `inputCtx` has the file reference.
- **`getNodeStatusesQuery` race during query handler installation.** The handler is installed in the workflow's first execution step, before any activity runs. Polling that arrives during the few-ms install window gets a TemporalQueryNotRegistered error; TanStack retries; second poll succeeds.
- **Activity catalog gains a new entry between cache row write and read.** Old cache rows have stable hashes; they remain valid until TTL. New activities get fresh hashes. No migration concern.
- **Workflow deleted while a Try is running.** Existing Phase 2 Track 2 behaviour: the Temporal execution continues to completion (Temporal owns its lifecycle); cache rows orphan and TTL-evict normally; the UI clears the editor (workflow's gone).

---

## 10. Open follow-ups

These are filed but explicitly **not blocking Phase 4.0 landing**:

- **Phase 4.x — full widget coverage.** `OcrTable`, `ValidationResult`, Switch-active-case previews.
- **Phase 4.x — push-based status transport.** Replace polling with WebSocket/SSE when concurrent editor sessions exceed ~10.
- **Phase 4.x — `/queue` ↔ `RunHistoryDrawer` cross-link.** Per-document run lookup; per-run document lookup.
- **Phase 4.x — manual cache invalidation UI.** Per-node + global "Clear cache" buttons.
- **Phase 4.x — Live source.api intake.** Real POST to the workflow's source.api endpoint routes into the in-flight Try.
- **Phase 4.x — Cancellation UI mid-Try.** Explicit Cancel button while a Try is running (trivial reuse of L26's helper; UI surface only).
- **Cross-lineage cache sharing** — gated on GDPR review; production cost-savings opportunity (repeat-doc workflows).
- **Auto-cleanup of cache rows on workflow delete** — today TTL handles orphans; eventually wire a hook.
- **Cache-eviction policy tuning** — 24h TTL is a guess; first month of usage data should tell us whether it's too short (cache-miss frustration) or too long (storage growth). Easy to tune via `DEFAULT_CACHE_TTL_MS`.
- **Phase 5 — segmentation node pack.** Phase 5's segmentation activities produce richer Segment artifacts that `SegmentArrayPreview` already renders. No Phase 4 work to anticipate; just declare the new activities' output kinds correctly.
- **Phase 6 — dynamic nodes.** User-authored scripts will need to declare `nonCacheable` honestly. The 4.0 `nonCacheable` flag is the hook.
- **Phase 7 — AI agent.** The agent reads cached previews the same way the canvas does (via `useActivityOutputPreview`); no Phase 4 work to anticipate beyond the existing endpoint surface.

---

## 11. References

- Authoritative design: [TRY_IN_PLACE_DESIGN.md](../../docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md).
- Plan: [IMPLEMENTATION_PLAN.md §5 Phase 4](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md).
- Predecessor: [DOCUMENT_SOURCES_DESIGN.md](../../docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md) (Phase 8 — sources).
- Predecessor: [TYPED_IO_DESIGN.md](../../docs-md/workflow-builder/TYPED_IO_DESIGN.md) (Phase 3 — typed I/O).
- I/O model decision: [WORKFLOW_NODE_IO_MODEL_DECISION.md](../../docs-md/workflow-builder/WORKFLOW_NODE_IO_MODEL_DECISION.md).
- Session handoff: [SESSION_HANDOFF.md](../../docs-md/workflow-builder/SESSION_HANDOFF.md).
- Phase 8 closure (predecessor pattern reference): [feature-docs/20260530-workflow-builder-phase8-document-sources/](../20260530-workflow-builder-phase8-document-sources/).
- Phase 2 Track 2 closure (workflow-as-API precedent): [feature-docs/20260527-workflow-builder-phase2-workflow-as-api/](../20260527-workflow-builder-phase2-workflow-as-api/).
- Phase 2 Track 3 closure (versioning UI precedent for drawer patterns): [feature-docs/20260528-workflow-builder-phase2-versioning-ui/](../20260528-workflow-builder-phase2-versioning-ui/).
