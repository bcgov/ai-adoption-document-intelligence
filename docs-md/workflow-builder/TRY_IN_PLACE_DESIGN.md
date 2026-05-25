# Try-in-Place + Caching + Per-Node Previews — Design

**Status:** Decided. Phase 4 of the post-1A plan. Analog of [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md) (Phase 3) and [DOCUMENT_SOURCES_DESIGN.md](DOCUMENT_SOURCES_DESIGN.md) (Phase 8) for the "ComfyUI for documents" experience.
**Last updated:** 2026-05-24.
**Why now:** Phase 3 (typed I/O) supplies the artifact kinds that the per-node preview widgets render against; Phase 2 Track 2 (workflow-as-API) supplies the run-spec + run-start surface that Try-in-place builds on; Phase 8 (source nodes — `source.upload` in particular) supplies the canvas-side upload affordance that the Try-flow plugs into. With all three closed, Phase 4 is the next sequenced milestone in the dependency DAG ([IMPLEMENTATION_PLAN.md §4](IMPLEMENTATION_PLAN.md)).

This document commits to concrete decisions for the try-in-place, cached re-execution, per-node preview-widget, and run-history features. Engine semantics are unchanged from [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) (Model A — single in / single out + blackboard ctx). Phase 4 is layered as: a worker-side cache decorator (transparent to workflow code), a Temporal query handler (point-in-time status from the canvas), a small set of new read endpoints, and a redesigned canvas-side experience.

---

## 0. Phase 4.0 scope (locked)

This design covers two implementation tiers:

- **Phase 4.0 (this milestone):**
  - Lazy deploy of the in-flight workflow on first Try
  - Fresh Temporal execution per Try (cancels any prior in-flight Try for this lineage)
  - Sidecar Postgres K/V activity-output cache with TTL + lazy GC
  - Opt-out caching (every activity cached unless its catalog entry sets `nonCacheable: true`)
  - Per-node status badges + active-edge highlight via Temporal query handlers polled 1–2s
  - Per-node preview widgets for 4 ArtifactKind families: `Document`, `Segment[]`, `OcrResult`, `Classification`
  - In-canvas Try affordance — extends Phase 8 US-124's Test Upload button for `source.upload`; new in-canvas Try button for `source.api` and legacy `isInput` workflows
  - `GET /api/workflows/:id/runs` run-history endpoint with cursor pagination + status filter + date range
  - `RunHistoryDrawer` (sibling to Phase 2 Track 3's `VersionHistoryDrawer`) + run-count badge on version rows
  - Run-replay: clicking a past run replays per-node statuses + cached outputs on the canvas
- **Phase 4.x (deferred):**
  - Preview widgets for `OcrTable`, `ValidationResult`, and Switch-active-case
  - WebSocket / SSE push-based status (today: polling)
  - Cross-link between `/queue` (Processing monitor) and `RunHistoryDrawer` (both directions)
  - Cache-eviction beyond TTL (manual "Clear cache" UI, per-node "Invalidate" affordance)
  - Production-scope caching (multi-tenant sharing, GDPR review)

Every section below calls out which tier it applies to. Hooks for 4.x land in 4.0 only when they have no dead-code cost.

---

## 1. The Try-in-place execution model

**Each Try spawns a fresh Temporal workflow execution.** The cache layer (§2) short-circuits already-computed activities so subsequent Trys are still fast. This keeps Phase 4 cleanly layered: workflow code stays unchanged, the cache is a worker-level decorator, and the canvas talks to Temporal via existing query/start primitives.

```
User clicks "Try" on the canvas
  ↓
Frontend posts to POST /api/workflows/:id/runs (existing endpoint from Phase 2 Track 2)
  ↓
Backend resolves to the workflow's draft head version, cancels any in-flight Try for this lineage
  ↓
Backend calls TemporalClientService.startGraphWorkflow → returns workflowId
  ↓
Frontend stores activeRunId in canvas state, opens status-polling loop
  ↓
Worker executes each activity through the cache decorator (cache hit → skip; miss → execute + write)
  ↓
Worker updates the per-node status map (queried by canvas at 1–2s cadence)
  ↓
Canvas renders status badges + active edge highlight + per-node preview (read from cache endpoint)
```

**Cancel-on-new-Try.** When the user clicks Try while a prior Try is still running, the backend cancels the prior Temporal execution (`workflowHandle.cancel()`) before starting the new one. The canvas treats the prior run as "cancelled" — status badges freeze; preview widgets keep showing the prior cached outputs (cache rows survive cancellation). The cancel + restart cadence matches the "fast iteration" mental model that Phase 4 is built around.

**Lazy deploy.** No Temporal resource is created when the editor opens. The first Try is what creates the workflow's draft version (a regular `workflowVersion` row, no special "draft" flag — Phase 4 reuses the Phase 2 Track 3 versioning machinery). Subsequent Trys reuse the existing version unless the user explicitly saves a new one. This avoids burning Temporal resources for editor sessions where the user is just looking around.

**No new "draft" version concept.** A Try on an unsaved workflow auto-saves to a new version (Phase 2 Track 3 semantics) before starting the Temporal execution. The auto-save uses the existing save flow with the existing validator — no separate code path. This means every Try corresponds to a real, persisted, replayable version; nothing is lost if the user navigates away mid-iteration.

---

## 2. The activity-output cache

### 2.1 Why a sidecar K/V, not Temporal-replay-based

Temporal's replay model is designed to resume a single workflow execution after worker crashes, NOT to skip activities across runs. Coercing it into Phase 4's "skip cached activities on re-run" requires modifying every workflow definition to branch on prior-run history — workflow code becomes Phase-4-aware, and the cache lifetime is coupled to Temporal's history retention (typically days).

A sidecar K/V keeps caching a cross-cutting worker concern. Workflow code stays clean. Cache lifetime is decoupled from Temporal retention. Postgres + Prisma is already in the stack, so there's no new infrastructure to operate.

### 2.2 Schema

A new Prisma model in `apps/backend-services/prisma/schema.prisma` (also written to `apps/temporal/src/` via the `npm run db:generate` helper):

```prisma
model ActivityOutputCache {
  id                String   @id @default(cuid())
  /** Scopes cache rows to the workflow lineage. Cross-org isolation comes for free because
      Workflow.lineage_id is per-org. */
  workflowLineageId String
  /** Node id within the workflow config. Stable across versions if the user doesn't recreate the node. */
  nodeId            String
  /** sha256 hex of the canonical-JSON-stringified node.parameters. */
  configHash        String
  /** sha256 hex of the canonical-JSON-stringified upstream ctx values consumed by this node's input ports. */
  inputHash         String
  /** The ctx fragment this activity wrote (only the keys named by node.outputs[].ctxKey). */
  outputCtx         Json
  /** Surfaced to the canvas as the source data for preview widgets. */
  outputKind        String?  // ArtifactKind name; null if the catalog entry has no declared output kind
  createdAt         DateTime @default(now())
  expiresAt         DateTime // createdAt + 24h by default

  @@unique([workflowLineageId, nodeId, configHash, inputHash])
  @@index([workflowLineageId, nodeId])          // for the preview-cache read endpoint
  @@index([expiresAt])                          // for lazy GC
  @@index([workflowLineageId, createdAt])       // for run-history reconstruction
}
```

**Why `workflowLineageId` not `workflowVersionId`** — identical configs across version saves should share cache. Versions exist for audit/rollback; the cache key already includes `configHash`, which captures parameter changes regardless of which version those parameters live in.

**Why `nodeId` not `(nodeId, edge-from-source)`** — the wiring semantics are captured by `inputHash` (the upstream ctx values change when wiring changes, automatically invalidating downstream cache).

### 2.3 Hash construction

**Canonical JSON** — keys sorted alphabetically, no insignificant whitespace, arrays preserve declared order. A small helper `stableJson(value: unknown): string` ships in `packages/graph-workflow/src/cache/stable-json.ts` and is consumed by both the worker (for writes) and the backend (for lookups).

**`configHash`** — `sha256(stableJson(node.parameters))`. Empty parameters hash to `sha256("{}")` so unconfigured nodes still produce a stable key.

**`inputHash`** — for each port binding declared on this node, look up the ctx value at execution time and hash the combined set:

```ts
function computeInputHash(node: GraphNode, ctx: Record<string, unknown>): string {
  const consumedCtx: Record<string, unknown> = {};
  for (const binding of node.inputs ?? []) {
    consumedCtx[binding.port] = ctx[binding.ctxKey];
  }
  return sha256(stableJson(consumedCtx));
}
```

**Document / Segment ctx values are hashed by content-addressable key, not URL.** Blob URLs in this project include presigned-query timestamps; using the URL would make every Try miss the cache. Instead, the hash uses the underlying `blob.storage_key` (or the segment's `parentDocId + pageRange + polygon` tuple for Segments materialised inline). The shared `packages/graph-workflow/src/cache/hash-artifact.ts` helper centralises this conversion so it's identical between writes and reads.

**Source nodes participate in the same hash chain.** A source node's "output ctx" is captured at workflow start (the source-merge step in [DOCUMENT_SOURCES_DESIGN.md](DOCUMENT_SOURCES_DESIGN.md) §6). The source node's row in `ActivityOutputCache` is written at start; its `inputHash` is the hash of the inbound payload (uploaded file's content hash for `source.upload`, POSTed body for `source.api`). Downstream activities consume `outputCtx` via the same `inputHash` machinery — no special-casing.

### 2.4 Worker-side decorator

The Temporal worker wraps each activity execution with a cache check + write:

```ts
// apps/temporal/src/cache/cached-activity.ts (new)
export async function executeCachedActivity(
  node: GraphNode,
  ctx: Record<string, unknown>,
  workflowLineageId: string,
  rawExecute: () => Promise<Record<string, unknown>>, // returns the ctx delta the activity produced
): Promise<void> {
  const catalogEntry = ACTIVITY_CATALOG[node.activityType];
  if (catalogEntry.nonCacheable) {
    const delta = await rawExecute();
    Object.assign(ctx, delta);
    return;
  }

  const configHash = sha256(stableJson(node.parameters ?? {}));
  const inputHash = computeInputHash(node, ctx);

  const cached = await activityOutputCacheRepo.findFresh({
    workflowLineageId, nodeId: node.id, configHash, inputHash,
  });
  if (cached) {
    Object.assign(ctx, cached.outputCtx);
    return;
  }

  const delta = await rawExecute();
  Object.assign(ctx, delta);

  await activityOutputCacheRepo.upsert({
    workflowLineageId, nodeId: node.id, configHash, inputHash,
    outputCtx: delta,
    outputKind: catalogEntry.outputs?.[0]?.kind ?? null,
    expiresAt: new Date(Date.now() + DEFAULT_CACHE_TTL_MS),
  });
}
```

**Repo lives in `apps/backend-services/src/cache/activity-output-cache.repository.ts`** and is exposed to the Temporal worker via the existing Prisma-shared boundary. The worker doesn't import Prisma directly — it goes through a thin gRPC-style activity called by `executeCachedActivity` (matches how the worker reads other DB state today). Two new pure-Temporal activities: `activityOutputCache.findFresh` and `activityOutputCache.upsert`. They are non-cacheable themselves (the `nonCacheable: true` catalog flag on their entries; see §2.6).

### 2.5 Read endpoint

The canvas reads cached outputs through a new backend endpoint:

```
GET /api/workflows/:id/preview-cache?nodeId=<nodeId>[&runId=<runId>]
```

- **No `runId` (default)** — returns the most recent cache row for `(workflowLineageId, nodeId)`. Drives the canvas's "what was this node's last output?" view across Trys.
- **With `runId`** — returns the cache row that corresponds to the specified historical run (via the `workflowLineageId + createdAt` index, picking the row whose `createdAt` falls within the run's execution window). Drives the run-replay flow (§6.3).
- **404** when no fresh (`expiresAt > now`) row matches.

Response DTO:

```ts
class ActivityOutputPreviewDto {
  @ApiProperty({ description: "The ctx fragment this activity wrote." })
  outputCtx: Record<string, unknown>;

  @ApiProperty({ description: "ArtifactKind name (e.g. \"Document\", \"Segment[]\")", nullable: true })
  outputKind: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  expiresAt: string;
}
```

Full Swagger decorators per CLAUDE.md. The endpoint is read-only — there's no `POST /preview-cache` (cache rows are only written by the worker decorator).

### 2.6 Opt-out via `nonCacheable?`

Extend `ActivityCatalogEntry` in `packages/graph-workflow/src/catalog/types.ts`:

```ts
export interface ActivityCatalogEntry {
  // ...existing fields...
  /**
   * When true, this activity is never cached. Use for non-deterministic activities
   * (timestamped, RNG-driven, IO-stateful) where two executions with identical
   * inputs+params can produce different outputs.
   */
  nonCacheable?: boolean;
}
```

**Phase 4.0 sweeps the catalog and sets `nonCacheable: true` on:**
- `azureOcr.submit` — creates a new Azure operation; not idempotent
- `azureClassify.submit` — same
- `document.updateStatus` — writes to the documents table; idempotent in effect but skipping would mask user-visible side effects
- `document.storeRejection` — same rationale as updateStatus
- `benchmark.persistOcrCache`, `benchmark.persistEvaluationDetails`, `benchmark.writePrediction`, `benchmark.updateRunStatus`, `benchmark.cleanup` — all write to the benchmark tables
- Any other activity whose `parametersSchema.meta()` declares an explicit side effect (none today; reserved for Phase 6 dynamic nodes)

Source nodes are NOT opt-out — their cache row IS the ctx-merge they performed at workflow start. They're always cached (per §2.3).

The bulk catalog invariant test (Phase 3 Milestone F / US-103) is extended with an assertion that every catalog entry either declares `nonCacheable: true` or has a deterministic activity name (sanity-check; doesn't replace human review).

### 2.7 TTL + lazy GC

Default TTL is 24 hours (`DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000`), configurable per row via the `expiresAt` column. Lazy GC: a small background activity `activityOutputCache.gc` runs once per hour, deleting rows where `expiresAt < now()`. Per the `expiresAt` index, GC is O(rows-to-delete) regardless of total table size.

**No eviction on save / editor close.** Editor sessions aren't tracked; trying to attach session lifecycle to cache lifetime adds complexity for little payoff. TTL handles the "user came back tomorrow" case; the same-day case has cache rows that just stay until naturally evicted.

**Multi-tenancy.** Cache rows are scoped to `workflowLineageId`, which is per-org. There's no cross-org cache pollution. Production-scope sharing (multiple users on the same lineage benefiting from each other's caches) is in scope for Phase 4.0 because lineage-level scope is the natural boundary; what's out of scope is the GDPR review needed before extending the cache to cross-lineage shared content (deferred to Phase 4.x).

---

## 3. Per-node status streaming

### 3.1 Query handler on the workflow

`apps/temporal/src/workflows/graph-workflow.ts` adds a query handler returning the per-node status map:

```ts
import { defineQuery, setHandler } from "@temporalio/workflow";

export interface NodeRunStatus {
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  startedAt?: string;  // ISO
  endedAt?: string;
  errorMessage?: string;
  /** When status === "skipped", names the cache row that supplied the output. */
  cacheHit?: { configHash: string; inputHash: string };
}

export const getNodeStatusesQuery = defineQuery<Record<string, NodeRunStatus>>("getNodeStatuses");

// Inside the workflow body:
const nodeStatuses: Record<string, NodeRunStatus> = {};
setHandler(getNodeStatusesQuery, () => nodeStatuses);

// Before each node executes:
nodeStatuses[node.id] = { status: "running", startedAt: new Date().toISOString() };

// On cache hit:
nodeStatuses[node.id] = { status: "skipped", startedAt: ..., endedAt: ..., cacheHit: { ... } };

// On success:
nodeStatuses[node.id] = { status: "succeeded", startedAt: ..., endedAt: new Date().toISOString() };

// On failure:
nodeStatuses[node.id] = { status: "failed", startedAt: ..., endedAt: ..., errorMessage: e.message };
```

**Pending vs running.** Nodes start in `"pending"` only if the workflow walks them (touched but not yet executed). Nodes the graph never reaches stay absent from the map; the canvas treats absent ≡ pending. This avoids the worker having to know the full DAG upfront.

### 3.2 Backend proxy endpoint

The canvas can't talk to Temporal directly; the backend proxies the query:

```
GET /api/workflows/:id/runs/:runId/node-statuses
```

Returns the query result as a JSON object keyed by `nodeId`. Implementation:

```ts
@Get(":id/runs/:runId/node-statuses")
async getNodeStatuses(@Param("id") id, @Param("runId") runId) {
  await this.workflows.assertMember(id, this.user);
  const handle = this.temporalClient.workflow.getHandle(runId);
  return handle.query(getNodeStatusesQuery);
}
```

Returns 404 if the Temporal handle can't be found (run is too old / never existed); 410 Gone if the run has been retention-cleaned by Temporal. The canvas treats 410 as "use the cache row's `outputCtx.endedAt`" — the run is finished, statuses are frozen.

### 3.3 Frontend polling cadence + lifecycle

The canvas adds a new TanStack-Query hook:

```ts
// apps/frontend/src/features/workflow-builder/run/useNodeStatuses.ts
export function useNodeStatuses(workflowId: string, runId: string | null, opts?: { active: boolean }) {
  return useQuery({
    queryKey: ["node-statuses", workflowId, runId],
    queryFn: () => apiClient.getNodeStatuses(workflowId, runId!),
    enabled: !!runId && !!opts?.active,
    refetchInterval: 1500,  // 1.5s — within the 1-2s budget
    refetchIntervalInBackground: false,  // pause polling when the tab isn't visible
  });
}
```

**Polling stops** when every status in the map is in a terminal state (`succeeded` | `failed` | `skipped` | `cancelled`). The hook tracks this via `query.data` and disables the interval once terminal.

**On tab background.** `refetchIntervalInBackground: false` means polling pauses when the user switches tabs. When they return, one immediate refetch catches them up, then the interval resumes. This keeps backend load proportional to active editor sessions.

### 3.4 Active-edge highlight

xyflow edges support per-edge `style` and `animated` props. The canvas wires the active-edge animation through `WorkflowEdge.tsx` (the custom edge component shipped in Phase 1B Milestone A):

- An edge is "active" when its source node's status is `"running"` and its target's status is `"pending"` (it's the next hop).
- Active edges render with `animated: true` (xyflow's built-in dashed-stroke animation) and a `style: { stroke: theme.colors.blue[6], strokeWidth: 2.5 }`.
- Inactive edges render with the existing Phase 1B styling (per-edge-type stroke + label).

The mapping from node-statuses to active-edges lives in a pure helper `computeActiveEdges(config, statuses): Set<edgeId>` in `apps/frontend/src/features/workflow-builder/run/active-edges.ts`. Unit-tested independently.

### 3.5 Node-status badges on the canvas

Each `ActivityNodeRenderer` / `SourceNodeRenderer` grows a small status indicator in its top-right corner:

| Status | Icon | Color |
|---|---|---|
| pending | empty circle | gray |
| running | spinner | blue |
| succeeded | check | green |
| failed | x-circle | red |
| skipped (cache hit) | flash | violet |

Render-only via a new `NodeStatusBadge` component in `apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.tsx`. Driven by the same `useNodeStatuses` hook.

---

## 4. Per-node preview widgets (4 core)

Each node grows a preview pane under its renderer that shows the last cached output. The widget is chosen by the node's declared output `kind` (Phase 3).

### 4.1 Dispatch shell

A new pure helper:

```ts
// apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx
export function PreviewWidget({ outputKind, outputCtx, port }: {
  outputKind: ArtifactKind | `${ArtifactKind}[]` | null;
  outputCtx: Record<string, unknown>;
  port?: string;  // when the node has multiple outputs, picks one
}) {
  switch (outputKind) {
    case "Document":
    case "MultiPageDocument":
    case "SinglePageDocument":
      return <DocumentPreview value={outputCtx[port ?? "document"]} />;
    case "Segment[]":
      return <SegmentArrayPreview value={outputCtx[port ?? "segments"]} />;
    case "OcrResult":
    case "OcrFields":
      return <OcrResultPreview value={outputCtx[port ?? "ocrResult"]} />;
    case "Classification":
      return <ClassificationPreview value={outputCtx[port ?? "classification"]} />;
    default:
      return null;  // 4.x: OcrTable, ValidationResult, Switch-active-case
  }
}
```

**No preview pane is rendered when `outputKind` is null or the dispatch returns null.** This means activities that produce free-form `Artifact` outputs (35 of the 41 catalog entries before Phase 3.x fan-out; 0 after) get no preview pane. The canvas stays uncluttered.

### 4.2 `DocumentPreview`

A paginated thumbnail strip. For `MultiPageDocument`, renders the first page large + a small horizontal scroll of subsequent pages (max 8 visible). For `SinglePageDocument`, one large thumbnail. Driven by the document's `blob.storage_key` → existing `<BlobImage>` component in `apps/frontend/src/components/document/`. New file: `apps/frontend/src/features/workflow-builder/preview/DocumentPreview.tsx`. ~120 LoC.

### 4.3 `SegmentArrayPreview`

Region overlays. For each `Segment` in the array:
- Looks up the parent document's blob URL via `segment.parentDocId`
- Renders the parent at its display size with `segment.polygon` overlaid as a semi-transparent box, colour-coded by `segment.kind` (Text / Table / Figure / Form / KeyValue / Signature / Header — same palette as Phase 3 §1)
- Paginates if more than 6 segments (the "paging" from [NOTES.md](NOTES.md) §1.5)

New file: `apps/frontend/src/features/workflow-builder/preview/SegmentArrayPreview.tsx`. ~180 LoC.

### 4.4 `OcrResultPreview`

A structured key-value table. For `OcrResult`, renders the top-level keys as table rows with their string-coerced values. For nested objects, renders one level of indentation; deeper nesting is shown as `{...}` with a "View raw" link that opens a `<JsonInput readOnly>` modal. `OcrFields` (Phase 3 subtype) renders the same way.

New file: `apps/frontend/src/features/workflow-builder/preview/OcrResultPreview.tsx`. ~100 LoC.

### 4.5 `ClassificationPreview`

A compact label-with-confidence pill plus the matched rule's name. `{ label: string, confidence: number, ruleName?: string }`. Confidence renders as a small filled bar (green ≥ 0.8, amber 0.5–0.8, red < 0.5).

New file: `apps/frontend/src/features/workflow-builder/preview/ClassificationPreview.tsx`. ~60 LoC.

### 4.6 Preview loading + error states

Each preview component receives a single `value` prop (the unwrapped ctx fragment). Loading state (cache row hasn't arrived yet) is owned by the parent — the dispatch shell wraps `PreviewWidget` in a `<Skeleton>` while the `useActivityOutputPreview(workflowId, nodeId, runId)` hook is loading. Error state — a small red `<Alert>` saying "Preview unavailable" with a tooltip explaining ("cache evicted" / "node hasn't executed yet" / "ArtifactKind not supported in 4.0").

---

## 5. The Try affordance

### 5.1 `source.upload` workflows

US-124 (Phase 8 Milestone E) already shipped a "Test upload" button on the `source.upload` settings panel. Phase 4 extends that button's `onClick` handler to:

1. Save the canvas (if dirty) → triggers Phase 2 Track 3's auto-version-save.
2. Call `POST /api/workflows/:id/sources/:sourceNodeId/upload` (Phase 8 endpoint) with the chosen file.
3. Receive the upload response, which now includes a new field `runId: string` — the backend kicks off a Temporal run immediately after the upload completes (Phase 4 change to the source-upload handler).
4. Store `runId` in canvas state; the polling loop in §3.3 starts.

**Backend change to `POST /sources/:sourceNodeId/upload`.** Today it returns `{ blobKey, ctxKey, ctxValue }`. Phase 4 adds:

```ts
class SourceUploadResponseDto {
  // ...existing fields...

  @ApiProperty({ description: "Temporal workflow id of the run kicked off by this upload." })
  runId: string;

  @ApiProperty({ description: "Workflow version id used for this run." })
  workflowVersionId: string;
}
```

The handler reuses `TemporalClientService.startGraphWorkflow` with `initialCtx = { [ctxKey]: ctxValue }` (the uploaded doc's URL). The ctx value is the same blob URL that's already returned to the client — no extra work to compute.

### 5.2 `source.api` / legacy `isInput` workflows

A new "Try" top-bar button next to "Run this workflow" (the Phase 2 Track 2 button). Behaviour:

- Disabled in create mode (`<Tooltip>` "Save the workflow first").
- Click opens the existing `RunWorkflowDrawer` with a new "Try" tab next to the existing "Run" tab.
- The Try tab has the same JsonInput + Run button as the Run tab, but:
  - Clicking Run does NOT open in a separate run-status view.
  - Instead, the drawer closes immediately and the canvas's polling loop starts on the returned `runId`.
- The Run tab keeps its existing behaviour (Phase 2 Track 2) — paste body, click Run, see workflowId inline.

The split is intentional: Try is a canvas-iteration affordance; Run is an API-validation affordance. Users in development use Try; users showing the workflow to a stakeholder use Run.

**Implementation note.** The Try button shares its enabled-state logic with the existing Run button — both require a saved workflow. Reuse the existing `useExistingWorkflow(lineageId)` guard.

---

## 6. Run history

### 6.1 The endpoint

```
GET /api/workflows/:id/runs
```

Query parameters:

```ts
class ListRunsQueryDto {
  @ApiPropertyOptional({ description: "Cursor from a previous response's nextCursor." })
  @IsOptional() @IsString() cursor?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number = 50;

  @ApiPropertyOptional({ enum: ["running", "succeeded", "failed", "cancelled"] })
  @IsOptional() @IsIn(["running", "succeeded", "failed", "cancelled"]) status?: string;

  @ApiPropertyOptional({ description: "ISO timestamp; only include runs started at-or-after this." })
  @IsOptional() @IsDateString() startedAfter?: string;

  @ApiPropertyOptional({ description: "ISO timestamp; only include runs started at-or-before this." })
  @IsOptional() @IsDateString() startedBefore?: string;

  @ApiPropertyOptional({ description: "Filter to a specific pinned version." })
  @IsOptional() @IsString() workflowVersionId?: string;
}
```

Response:

```ts
class ListRunsResponseDto {
  @ApiProperty({ type: () => [RunSummaryDto] })
  runs: RunSummaryDto[];

  @ApiProperty({ nullable: true })
  nextCursor: string | null;
}

class RunSummaryDto {
  @ApiProperty() runId: string;
  @ApiProperty() workflowVersionId: string;
  @ApiProperty() versionNumber: number;
  @ApiProperty({ enum: ["running", "succeeded", "failed", "cancelled"] }) status: string;
  @ApiProperty() startedAt: string;
  @ApiPropertyOptional() endedAt?: string;
  @ApiPropertyOptional({ description: "Truncated input ctx for compact display." }) inputCtxSummary?: Record<string, unknown>;
}
```

**Data source.** The endpoint reads from Temporal's `ListWorkflowExecutions` API filtered by a search attribute that the existing `startGraphWorkflow` already sets — `WorkflowLineageId` (text search attribute, populated from the workflow's lineage). Cursor pagination uses Temporal's native page tokens. Status filter and date filter translate to Temporal's visibility query language. No new tables: Temporal's visibility store IS the canonical run record.

**Why not a sidecar `WorkflowRun` table.** Temporal already stores all of this; duplicating into Postgres would create a sync-or-drift problem. Production-scope query performance is fine via Temporal's visibility store (Elasticsearch-backed in our deployment per the existing Temporal config).

### 6.2 `RunHistoryDrawer` UI

New `apps/frontend/src/features/workflow-builder/run-history/` directory with:

- `RunHistoryDrawer.tsx` — right-side Mantine `<Drawer>` (mirrors `VersionHistoryDrawer`'s layout)
- `useWorkflowRuns(workflowId, filters)` — TanStack hook wrapping the new endpoint
- `RunRow.tsx` — one row per run (status badge + version pin + timestamp + input-ctx chip + Replay button)
- `RunHistoryFilters.tsx` — Mantine `<Select status>` + two `<DateInput>`s

A new top-bar button "Run history" (IconClipboardList) sits between Save and Run. Disabled in create mode with a tooltip "Save the workflow first".

Loading: 3 Skeleton rows. Empty: "No runs yet — click Try to execute this workflow." Error: red `<Alert>`. Pagination: infinite scroll using `useInfiniteQuery` keyed on filters.

### 6.3 Click-to-replay

Clicking a row's "Replay" button:

1. Sets `activeRunId = runId` in canvas state.
2. Triggers `useNodeStatuses(workflowId, runId, { active: false })` — pulls the historical status map once (not polled, since the run is terminal).
3. Triggers `useActivityOutputPreview(workflowId, nodeId, runId)` for each node — loads cached outputs from the new `?runId` parameter on the preview-cache endpoint (§2.5).
4. Renders status badges + active-edge "frozen at" the final state + per-node preview widgets from the historical cache.

The canvas treats replay mode as read-only-for-runs-only: the user can still edit node parameters (which would invalidate cached previews for the replay), but the "Replay" indicator stays in the top bar until the user clears it or starts a new Try.

### 6.4 Cache eviction during replay

If a historical run's cache rows have been TTL-evicted (24h after run), the preview-cache endpoint returns 404. The `PreviewWidget` falls back to an empty state: the status badge still renders (from Temporal history, which has longer retention), but the preview pane shows a small "Cache evicted — re-run to repopulate" alert with a "Re-run" button that starts a fresh Try with the historical input ctx.

The historical input ctx is captured in `RunSummaryDto.inputCtxSummary` (compact form for display) AND fetched in full from the existing `GET /api/workflows/:id/runs/:runId/input-ctx` endpoint (new, Phase 4 — small) when the user clicks Re-run.

### 6.5 Run-count badge on version rows

`VersionHistoryDrawer` (Phase 2 Track 3) grows a small gray `<Badge>` per row showing the run count for that version. Data sourced from a new `GET /api/workflows/:id/versions/:versionId/run-count` endpoint (or piggy-backed onto the existing per-version endpoint as a `runCount` field — TBD by implementer; both have low cost).

### 6.6 Cross-link with `/queue` (deferred to 4.x)

The existing `/queue` Processing monitor surfaces documents, not workflow runs. Future cross-links:

- On `/queue` rows, add a "View workflow run" action that opens the relevant workflow's `RunHistoryDrawer` filtered to runs that processed that document.
- On `RunHistoryDrawer` rows, add a "Documents processed" chip linking back to `/queue` filtered to docs from that run.

This requires correlating documents and runs, which today goes through `document.workflowRunId` (already set when source.upload creates a document). The correlation is straightforward but the UI work is non-trivial; **deferred to Phase 4.x** so 4.0 ships the Try-in-place loop without expanding into ops-monitoring scope.

---

## 7. Validator / catalog changes

Phase 4 needs minimal validator changes (the cache is a runtime concern; status streaming reads existing structure):

- **`ActivityCatalogEntry.nonCacheable?: boolean`** — schema addition (§2.6). No new validator rule; the bulk catalog invariant test is extended (§2.6).
- **No new graph-validation rules.** Try-in-place reuses Phase 2 Track 2's validation; the cache layer is invisible to the validator.
- **Source catalog: no change.** Source nodes participate in the cache layer via the standard hash chain (§2.3), not via a catalog flag.

---

## 8. Out of scope for Phase 4.0

- **Preview widgets for `OcrTable`, `ValidationResult`, Switch-active-case.** Filed for Phase 4.x. Dispatch shell (§4.1) is open in a way that adding cases later is mechanical.
- **WebSocket / SSE push.** Polling at 1.5s scales to single-digit concurrent editor sessions; push is filed for Phase 4.x when concurrency rises.
- **Cross-link between `/queue` and `RunHistoryDrawer`.** Deferred (§6.6).
- **Manual cache invalidation UI** (per-node "Clear cache" / global "Reset cache" buttons). Filed for Phase 4.x once user feedback identifies the need.
- **Cache sharing across workflow lineages** (e.g., two libraries with the same activity config sharing cache). Requires GDPR review on cross-lineage data flow. Deferred.
- **Replay of failed runs with partial output.** A failed run's downstream nodes have status `"pending"` but no cache rows; replay shows the failure point correctly but the user can't drill into "what would the next node have produced." This is OK for 4.0; "predictive preview" is a Phase 5+ idea.
- **Time-travel debugging** (step backwards through a run, inspect ctx at each step). Out of scope; Temporal's history viewer covers the operator audience for this in 4.0.
- **Cancellation UI mid-Try.** A "Cancel" button on the canvas while a Try is running. Achievable trivially by reusing the cancel-on-new-Try plumbing (§1); UI surface filed for the implementation phase (low cost — likely lands in 4.0 if it fits).
- **Live source.api intake during a Try.** Phase 4 Trys for `source.api` workflows use the Run drawer's pasted body. Receiving a real POST to the workflow's `source.api` endpoint and routing it into the in-flight Try (so the editor reacts live to external traffic) is filed for Phase 4.x.

---

## 9. Reading order for implementation

1. **`packages/graph-workflow/src/cache/stable-json.ts`** + **`hash-artifact.ts`** — shared hash helpers (consumed by worker + backend).
2. **`ActivityCatalogEntry.nonCacheable?`** — schema addition + sweep the catalog (§2.6).
3. **Prisma migration** — `ActivityOutputCache` model + indexes. Run `npm run db:generate` to write into `apps/temporal/src/`.
4. **`apps/backend-services/src/cache/activity-output-cache.repository.ts`** + tests.
5. **`apps/temporal/src/cache/cached-activity.ts`** — worker decorator wrapping every activity execution; two new pure-Temporal activities (`findFresh`, `upsert`) that the decorator calls.
6. **Graph workflow status query handler** — `apps/temporal/src/workflows/graph-workflow.ts` extension (§3.1).
7. **`GET /api/workflows/:id/runs/:runId/node-statuses`** endpoint (§3.2).
8. **`GET /api/workflows/:id/preview-cache`** endpoint (§2.5).
9. **`GET /api/workflows/:id/runs`** endpoint (§6.1).
10. **`useNodeStatuses` + `useActivityOutputPreview` + `useWorkflowRuns`** TanStack hooks.
11. **`NodeStatusBadge`** + **`computeActiveEdges`** + edge-styling updates in `WorkflowEdge.tsx` (§3.4 + §3.5).
12. **`PreviewWidget` dispatch shell** + the 4 widgets (`DocumentPreview`, `SegmentArrayPreview`, `OcrResultPreview`, `ClassificationPreview`) (§4).
13. **Try-button wiring** — extend `SourceUploadButton` (§5.1); new in-canvas Try button + drawer tab (§5.2).
14. **`RunHistoryDrawer`** + filters + replay flow (§6.2 + §6.3).
15. **Run-count badge** on `VersionHistoryDrawer` rows (§6.5).
16. **GC activity** — `activityOutputCache.gc` Temporal activity + schedule (§2.7).
17. **End-to-end Playwright walkthrough** — same cadence as Phase 3 Milestone G / Phase 8 Milestone F. Single fixture workflow with `source.upload` + 3-stage OCR + classification + validation. Walkthrough exercises: Try → status badges progress → previews render → tweak one parameter → second Try → cache hits on upstream, miss on tweaked node + downstream → run history shows two runs → replay shows previews → cache eviction (manual Prisma delete) → empty-state preview with Re-run button.

---

## 10. Open after this lands

- **Phase 4.x — full widget coverage.** `OcrTable`, `ValidationResult`, Switch-active-case previews.
- **Phase 4.x — push-based status transport.** Replace polling with WebSocket/SSE when concurrent editor sessions exceed ~10.
- **Phase 4.x — `/queue` ↔ `RunHistoryDrawer` cross-link.** Per-document run lookup; per-run document lookup.
- **Phase 4.x — manual cache invalidation UI.** Per-node + global.
- **Phase 4.x — Live source.api intake.** Real POST to the workflow's source.api endpoint routes into the in-flight Try.
- **Phase 5 — segmentation node pack.** Phase 5's segmentation activities will produce richer `Segment` artifacts that the `SegmentArrayPreview` already renders. No Phase 4 work to anticipate; just declare the new activities' output kinds correctly.
- **Phase 6 — dynamic nodes.** User-authored scripts will need to declare `nonCacheable` honestly. The 4.0 `nonCacheable` flag is the hook.
- **Phase 7 — AI agent.** The agent reads cached previews the same way the canvas does (via `useActivityOutputPreview`); no Phase 4 work to anticipate beyond the existing endpoint surface.
- **Cache-eviction policy refinement.** 24h TTL is a guess; first month of usage data should tell us whether it's too short (cache-miss frustration) or too long (storage growth). Easy to tune via `DEFAULT_CACHE_TTL_MS`.

These are deliberately punted: ship the floor in 4.0, layer the polish on top.
