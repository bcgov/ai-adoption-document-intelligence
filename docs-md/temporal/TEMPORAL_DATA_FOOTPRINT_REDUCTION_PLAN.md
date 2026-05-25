# Temporal Data Footprint Reduction — Single-Sweep Spec

> **Status:** Ready for implementation (decisions locked 2026-05-25; second holistic review incorporated)  
> **Strategy:** One release + **atomic maintenance cutover**. All existing Temporal executions and history are discarded. No dual-read, no legacy inline OCR **values** in workflow history.  
> **Out of scope:** `azureOcr.submitAndWait` and removing `pollUntil` + `azureOcr.poll` from templates (separate ticket). Azure graphs still emit **one history event per poll iteration** (small payloads after refs).

**Companion:** [benchmarking-temporal-history-bloat-fix.md](../benchmarking-temporal-history-bloat-fix.md), [DAG_WORKFLOW_ENGINE.md](../graph-workflows/DAG_WORKFLOW_ENGINE.md) §7.4

---

## 1. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Raw OCR JSON storage | **Blob** (`OperationCategory.OCR`). Structured UI fields → **`ocr_results`** via `ocr.storeResults` / `upsertOcrResult`. |
| D2 | Namespace retention (post-wipe) | **24 hours** on `default`. |
| D3 | Temporal wipe method | **Drop and recreate** `temporal` and `temporal_visibility` databases; re-run schema init (§7). |
| D4 | Documents after cutover | **`workflow_execution_id` set to NULL** on all documents (one-off SQL). |
| D5 | Workflow graph migration | **All** `workflow_versions.config` in place (§5.3); optional §5.4 template head refresh for slug-matched lineages. |
| D6 | `graphWorkflow` start args | **`workflowVersionId` + `configHash` only** — no `graph` in `GraphWorkflowInput`. Graph loaded inside workflow via `getWorkflowGraphConfig`. |
| D7 | Payload compression | **Required** at cutover — gzip (or zstd) `PayloadCodec` on worker + **all** Temporal clients (`TemporalClientService`, `BenchmarkTemporalService`). |
| D8 | Map fan-out | **`collection.length > 20`** → child `graphWorkflow` per item; join collects ref arrays only. |
| D9 | Base64 extraction activities | **Global** change to `document.extractToBase64` / `extract-pages-base64`; update every graph that uses them. |

---

## 2. Scope

### In scope

- Ref-based OCR pipeline (Azure poll/extract, Mistral, downstream OCR activities).
- Benchmark: `loadOcrCache` in wrapper; prediction/cache from **blob refs** (not child `ctx`); slim parent/child starts.
- `GraphWorkflowInput` / `GraphWorkflowResult` in **both** `apps/temporal` and `apps/backend-services` graph types.
- All tenant `workflow_versions` + `benchmark_definitions` hash refresh (§5).
- Map/child/blob orchestration (§4 C, D).
- Temporal wipe, 24h retention, required payload codec.
- Clear all `document.workflow_execution_id`.
- Workflow builder UI + docs aligned with `*Ref` ctx keys (same release). **No** document viewer / OCR API changes — those already use `ocr_results` / blobs.

### Out of scope

- Preserving or replaying old Temporal history.
- **Large inline OCR JSON** in activity results or workflow `ctx` (port **names** like `ocrResult` stay).
- `azureOcr.submitAndWait` / template poll-chain consolidation.
- Reducing Azure **poll event count** (only payload size per event).

### Authoritative data (unchanged)

App DB (`documents`, `ocr_results`, `benchmark_runs`, `benchmark_ocr_cache`), blob storage, Loki.

### Workflow migration note

Documents and benchmarks **pin** specific `WorkflowVersion.id` values. §5.3 updates **every** version row **in place** so pinned IDs keep working. §5.4 optionally appends a **new head** for slug-matched lineages (definitions pinned to older version IDs are unaffected).

### Atomic deploy (required)

Do **not** run the DB migrator on a live env while old workers are running.

**Single maintenance window order:**

1. **Block** OCR and benchmark starts (API or scale worker/backend to 0) — same as §7 step 1.
2. Deploy **worker + backend + frontend** (code that expects `*Ref` keys and new workflow I/O).
3. Run migrator `--apply` + §5.7 hash refresh + §5.5 gate.
4. Temporal wipe (§7 steps 6–9).
5. Resume traffic.

---

## 3. Types and contracts

### 3.1 `OcrPayloadRef`

```typescript
interface OcrPayloadRef {
  documentId: string;
  blobPath: string; // empty string allowed while status === "running"
  storage: "blob";
  byteLength?: number;
  pageCount?: number;
  /** running | succeeded | failed — required for pollUntil conditions */
  status?: string;
}
```

- **`storage: "db"`** is not used on the Temporal path; DB rows are written only in `ocr.storeResults` / `upsertOcrResult`.
- Helpers in `apps/temporal/src/ocr-payload-ref.ts` (name TBD):
  - `resolveGroupId(documentId)` — load `documents.group_id` (or use `state.groupId` from workflow input).
  - `writeOcrPayloadBlob(groupId, documentId, fileName, json)` → `blobPath`
  - `readOcrPayloadBlob(ref)` → parsed JSON

**Blob layout (normative):**

```text
{groupId}/ocr/{documentId}/azure-response.json
{groupId}/ocr/{documentId}/ocr-result.json
{groupId}/ocr/{documentId}/cleaned-result.json
{groupId}/ocr/{documentId}/pages/page-{n}.pdf
```

Use `buildBlobFilePath(groupId, OperationCategory.OCR, [documentId, ...], fileName)`.

### 3.2 `GraphWorkflowInput` (breaking)

Update in **`apps/temporal/src/graph-workflow-types.ts`** and **`apps/backend-services/src/workflow/graph-workflow-types.ts`** (keep in sync).

```typescript
interface GraphWorkflowInput {
  workflowVersionId: string;
  configHash: string;
  initialCtx: Record<string, unknown>;
  runnerVersion: string;
  parentWorkflowId?: string;
  requestId?: string;
  groupId?: string | null;
}
```

- **Remove** `graph: GraphWorkflowConfig` from workflow start args.
- **`workflowVersionId` resolution** (same as `getWorkflowGraphConfig`): `WorkflowVersion.id` → `WorkflowLineage.id` (head) → `WorkflowLineage.name` (head). Document OCR passes the pinned version **cuid**; library `childWorkflow` nodes often pass a **lineage name** (e.g. `standard-ocr-workflow`) — both are valid.
- **First steps inside `graphWorkflow`:** `getWorkflowGraphConfig({ workflowId: workflowVersionId })` → `computeConfigHash(loaded graph)` → **fail** if `configHash` mismatch → `runGraphExecution`.
- Adds **one** small activity completion to history per run (acceptable).
- **Backend** `startGraphWorkflow`: compute `configHash` from DB config, pass `documents.workflow_config_id` as `workflowVersionId`.
- **Remove** prod `graphOverride` (`ocr.service.ts`); keep only for local/integration harness if needed.
- **Hash algorithm:** `apps/temporal/src/config-hash.ts` and `apps/backend-services/src/workflow/config-hash.ts` must stay **identical** (shared normalization rules).

### 3.3 `GraphWorkflowResult` (breaking)

```typescript
interface GraphWorkflowResult {
  status: "completed" | "failed" | "cancelled";
  completedNodes: string[];
  documentId?: string;
  refs?: {
    ocrResponseRef?: OcrPayloadRef;
    ocrResultRef?: OcrPayloadRef;
    cleanedResultRef?: OcrPayloadRef;
  };
  /** Small metadata for benchmark wrapper / status — not OCR bodies */
  failedNodeId?: string;
  outputPaths?: string[];
  error?: string;
}
```

- **Remove** full `ctx` from the return type.
- `graphWorkflow` / `runGraphExecution` populates `refs` from final internal `ctx` ref keys before return; copy `failedNodeId` / `outputPaths` from runner state (today read from `ctx` in `benchmark-sample-workflow.ts`).
- Backend and APIs **must not** use `handle.result()` for OCR bodies; use `ocr_results` / blob by `documentId`.
- `getStatus` query: omit or redact blob paths; show statuses/counts only.

### 3.4 Context and port binding renames (graph JSON)

| Old `ctx` key | New `ctx` key | Notes |
|---------------|---------------|--------|
| `ocrResponse` | `ocrResponseRef` | pollUntil uses `ctx.ocrResponseRef.status` |
| `ocrResult` | `ocrResultRef` | |
| `cleanedResult` | `cleanedResultRef` | |
| base64-holding keys | `pageBlobPath` | per §5.2 / §3.8 |

**Activity port names** in the registry stay the same (`ocrResponse`, `ocrResult`, `response`, `cleanedResult`). Activities accept **`OcrPayloadRef` values** on those ports. Only **`ctxKey` / `ctx` declarations** in graph JSON change.

### 3.5 Azure `pollUntil` behavior (unchanged graph topology)

| Activity | When | Return (activity result → history) |
|----------|------|-------------------------------------|
| `azureOcr.submit` | once | Small metadata (`apimRequestId`, …) |
| `azureOcr.poll` | `status === "running"` | `{ ocrResponseRef: { documentId, blobPath: "", status: "running" } }` — **no** blob write |
| `azureOcr.poll` | `status === "succeeded"` | Write `azure-response.json`; `{ ocrResponseRef: { documentId, blobPath, status: "succeeded", byteLength } }` |
| `azureOcr.poll` | `status === "failed"` | `{ ocrResponseRef: { documentId, blobPath: "", status: "failed" } }` + small error fields |
| `azureOcr.extract` | once | Read `ocrResponseRef` blob; write `ocr-result.json`; `{ ocrResultRef }` |

- **`pollUntil` output:** `{ "port": "response", "ctxKey": "ocrResponseRef" }` (port name `response` unchanged).
- **Condition (migrated):** `"left": { "ref": "ctx.ocrResponseRef.status" }`, `"right": { "literal": "running" }`, operator `not-equals`.
- **Benchmark cache replay:** `benchmark.loadOcrCache` in wrapper only; poll writes blob from cached JSON once (no inline `OCRResponse` in history).

### 3.6 Mistral

- `mistralOcr.process`: write `ocr-result.json`; return `{ ocrResultRef }` only.

### 3.7 Downstream OCR chain

`ocr.cleanup`, `ocr.enrich`, `ocr.normalizeFields`, `ocr.characterConfusion`, `ocr.checkConfidence`, `ocr.spellcheck`: read/write blob artifacts per §3.1; pass **`OcrPayloadRef`** on ports; `ocr.storeResults` / `upsertOcrResult` load from ref and persist to `ocr_results`.

### 3.8 Base64 activities

| Activity | Return |
|----------|--------|
| `document.extractToBase64` | `{ pageBlobPath, pageIndex?, byteLength? }` |
| `extract-pages-base64` | same |

Update all graphs that consume base64 (including `feature-docs/010-data-transformation-node/example-pdf-extraction-workflow.json`, classifier/split templates). Downstream activities read bytes from blob.

### 3.9 Map and child workflows

Two patterns — do **not** conflate parent hash with library child graphs.

#### Map fan-out (same graph as parent)

- **`ExecutionState`:** add `workflowVersionId` + `configHash` copied from parent `GraphWorkflowInput`.
- **`map` with `collection.length > 20`:** each branch starts child `graphWorkflow` with `{ workflowVersionId, configHash, initialCtx: branch slice, groupId, … }` (same graph, same hash); join stores **ref arrays** only.
- **`map` with `collection.length ≤ 20`:** branches still run **in-process** (`executeBranchSubgraph`). Payloads are small after refs, but **poll event count × N** stays in **one** parent workflow history — can still approach event-count limits for large in-process maps (see §6, §10).

#### Library `childWorkflow` node (different graph than parent)

Used by templates such as `multi-page-report-workflow.json` (`workflowRef.type: "library"`, `workflowId` = lineage name or id).

- **Do not** pass parent `state.configHash` or pass full `graph` in `executeChild` args (today `node-executors.ts` loads via `getWorkflowGraphConfig` then passes `graph` + parent hash — remove both).
- **Recommended:** extend `getWorkflowGraphConfig` (or add `resolveChildWorkflowStart`) to return `{ workflowVersionId: resolvedVersionCuid, configHash }` only — one small activity result in **parent** history per `childWorkflow` node, then `executeChild` with slim args. **Must not** reuse parent document `configHash`.
- **Start args:** `{ workflowVersionId, configHash, initialCtx, groupId, … }` where both fields refer to the **child** graph. Inner `graphWorkflow` reloads via `getWorkflowGraphConfig` and re-validates hash (§3.2).
- **Inline `workflowRef`:** not used in shipped templates; if present, same rule — no inline `graph` in Temporal start args (resolve to a version id or fail).
- **Output mappings:** port names unchanged (`ocrResult`, etc.); resolve values from `childResult.refs` (e.g. `ocrResult` port → `childResult.refs?.ocrResultRef`), **not** `childResult.ctx`. Downstream parent `ctx` keys hold **`OcrPayloadRef`**, not inline JSON.

### 3.10 Payload compression (required)

- Shared codec module; wire into `Worker.create`, `TemporalClientService`, `BenchmarkTemporalService` (and any other `Connection`/`Client` factory).
- **No** prod disable flag; deploy all consumers in one rollout.
- See §9.

### 3.11 Benchmark wrapper after slim `GraphWorkflowResult`

`benchmarkSampleWorkflow` today uses `graphResult.ctx` for predictions and OCR cache — **must change**:

1. Inner `graphWorkflow` returns `GraphWorkflowResult` with `refs` only (§3.3).
2. Wrapper activity (new or existing) **`benchmark.flattenPredictionFromRefs`**: read `cleanedResultRef` (fallback `ocrResultRef`) blob → build flat map (reuse `buildFlatPredictionMapFromCtx` on parsed `OCRResult` JSON).
3. **`benchmark.writePrediction`** unchanged (flat map in, file out).
4. **`benchmark.persistOcrCache`:** read raw response from `refs.ocrResponseRef` blob (or load cache in wrapper and pass ref after poll path writes blob).
5. **`buildFlatConfidenceMapFromCtx`** — same pattern from blob-loaded `OCRResult`.
6. **`failedNodeId` / `outputPaths`:** read from `GraphWorkflowResult` (§3.3), not `graphResult.ctx`.

---

## 4. Implementation checklist

### A. Benchmark

- [ ] **A.1** `benchmark.loadOcrCache` only in `benchmarkSampleWorkflow` (not parent). **Remove** parent-loop cache load in `benchmark-workflow.ts` fan-out (~`benchmark.loadOcrCache` + building `sampleMetadata.__benchmarkOcrCache` with inline `ocrResponse`).
- [ ] **A.2** Parent passes `ocrCacheBaselineRunId` + `sampleId` only — no `__benchmarkOcrCache` in `sampleMetadata`.
- [ ] **A.3** Slim Temporal args (recorded in **parent** history on each `executeChild` to `benchmarkSampleWorkflow`):
  - `BenchmarkRunWorkflowInput`: drop `workflowConfig` / `workflowConfigHash`; keep `workflowVersionId` + ids + evaluator settings.
  - `BenchmarkExecuteInput` (`benchmark-execute.ts`): drop `workflowConfig`; pass `workflowVersionId` + `configHash` only.
  - `BenchmarkSampleWorkflowInput` + inner `graphWorkflow` child: `workflowVersionId` + `configHash` only.
  - `BenchmarkTemporalService.startBenchmarkRunWorkflow` + `benchmark-run.service.ts`: stop loading/passing inline `workflowConfig`.
- [ ] **A.4** Wrapper §3.11: prediction, confidence, `persistOcrCache` from refs/blobs (not `graphResult.ctx`); use `GraphWorkflowResult.failedNodeId` / `outputPaths` (§3.3).
- [ ] **A.5** Register `benchmark.flattenPredictionFromRefs` in activity registry.
- [ ] **A.6** Tests: `benchmark-workflow.test.ts`, `benchmark-sample-workflow.test.ts`, `benchmark-execute.test.ts`.

### B. OCR refs

- [ ] **B.1** `OcrPayloadRef` helpers + `resolveGroupId` + tests.
- [ ] **B.2** `azureOcr.poll` / `azureOcr.extract` per §3.5.
- [ ] **B.3** `mistralOcr.process` per §3.6.
- [ ] **B.4** Downstream OCR per §3.7.
- [ ] **B.5** `ocr.storeResults` / `upsertOcrResult` load from ref.

### C. Orchestration

- [ ] **C.1** Base64 activities per §3.8; update all dependent graph JSON + example workflow doc.
- [ ] **C.2** Library `childWorkflow` per §3.9 (`getWorkflowGraphConfig` returns resolved cuid + child `configHash` only; versionId-only `executeChild`; `refs` output mappings) in `node-executors.ts`.
- [ ] **C.3** `map` threshold 20 + `ExecutionState.workflowVersionId` per §3.9; update stale “> 50 items” comment in `executeMapNode`.

### D. Workflow + backend

- [ ] **D.1** `GraphWorkflowInput` / `graphWorkflow` load-at-start + hash check (§3.2) — **temporal + backend** types.
- [ ] **D.2** `GraphWorkflowResult` + populate `refs` at end; `getStatus` redaction (§3.3).
- [ ] **D.3** `TemporalClientService.startGraphWorkflow` — versionId-only args; prod path drops `graphOverride`.
- [ ] **D.4** Document/OCR/benchmark/ground-truth paths: no OCR body from `handle.result()`.
- [ ] **D.5** Payload codec on worker + all Temporal clients (§3.10).
- [ ] **D.6** Optional: delete `{groupId}/ocr/{documentId}/` blob prefix on document delete (or document existing lifecycle hook).
- [ ] **D.7** Workflow version **publish/save** API: recompute and persist `configHash` whenever `workflow_versions.config` is written (prevents mismatch on next `graphWorkflow` start).

### E. Workflow config migration (all tenants)

- [ ] **E.1** `migrateGraphConfigToOcrRefs` (§5.3) + tests (standard, Mistral, multi-page, classifier, custom sample).
- [ ] **E.2** CLI `workflow:migrate-ocr-refs` — `--dry-run` / `--apply`.
- [ ] **E.3** Migrate `benchmark_definitions.workflow_config_overrides` (§5.2 walk).
- [ ] **E.4** Edit §5.1 template JSON in repo.
- [ ] **E.5** Optional §5.4 template head refresh (slug map).
- [ ] **E.6** §5.7 recompute `benchmark_definitions.workflowConfigHash`.
- [ ] **E.7** §5.5 gate + per-row `validateGraphConfig`.
- [ ] **E.8** Docs: `DAG_WORKFLOW_ENGINE.md`, `WORKFLOW_BUILDER_GUIDE.md`, `WORKFLOW_NODE_CATALOG.md`.

### F. Platform (cutover)

- [ ] **F.1** §7 cutover on staging then prod (atomic with §2).
- [ ] **F.2** Namespace retention 24h (`tctl`/operator; document if namespace pre-exists).
- [ ] **F.3** `upsertSearchAttributes` on terminal graph status (`completed` / `failed`).
- [ ] **F.4** Alerts: `temporal-pg` disk %, history limit errors, queue depth.

### G. Verification

- [ ] **G.1** Unit tests: refs, poll/extract/mistral, migrator, benchmark wrapper flatten, library `childWorkflow` child-hash + `refs` mappings, `config-hash` parity (temporal vs backend).
- [ ] **G.2** Docker-compose + update `apps/backend-services/integration-tests/graph-workflow-tests/` harness for versionId-only starts.
- [ ] **G.3** Staging: 100-sample benchmark + OCR cache replay.
- [ ] **G.4** New `graph-{documentId}`: activity payloads ≪ pre-change; note poll **count** may still be high.

---

## 5. Workflow config migration

### §5.1 Shipped template files (repo)

Update under `docs-md/graph-workflows/templates/` per §3.4 (source for new lineages and §5.4):

| File | Notes |
|------|--------|
| `standard-ocr-workflow.json` | Full §3.4 chain |
| `standard-ocr-workflow-normalize.json` | Full |
| `standard-ocr-workflow-with-corrections.json` | Full |
| `standard-ocr-workflow-with-payment-lookup.json` | Full |
| `mistral-standard-ocr-workflow.json` | Mistral path |
| `multi-page-report-workflow.json` | Full + map |
| `azure-classifier-extraction-workflow.json` | Poll + page blobs |
| `orientation-detection-workflow.json` | No OCR refs; remove stale `ocrResponse` ctx if present |

### §5.2 Transform rules (all `workflow_versions.config`)

Apply to **every** row in `workflow_versions` (all tenants, all `version_number`, including non-head pins).

| Location | Transform |
|----------|-----------|
| `ctx` keys | `ocrResponse` → `ocrResponseRef`, `ocrResult` → `ocrResultRef`, `cleanedResult` → `cleanedResultRef` |
| `nodes[*].inputs[*].ctxKey` / `outputs[*].ctxKey` | Same when value is an exact old key |
| Conditions (`pollUntil`, `switch`, `humanGate`) | Update `ref` paths per §3.5 |
| `data.transform` `fieldMapping` | `{{ocrResult.` → `{{ocrResultRef.` (and `ocrResponse`, `cleanedResult`) |
| Base64 ctx keys | → `pageBlobPath` when migrator detects `extractToBase64` output binding; else flag manual |
| Activity ports | **Unchanged** |

**Do not change:** topology, `activityType`, node ids, `entryNodeId`, edges.

### §5.3 Migrator implementation

- **Code:** `apps/backend-services/src/workflow/migrate-graph-config-ocr-refs.ts` + `migrate-graph-config-ocr-refs.spec.ts`.
- **CLI:** `apps/backend-services/scripts/migrate-workflow-config-ocr-refs.ts`
  - `--dry-run` (default): counts, changed lineage slugs/version ids, validation failures.
  - `--apply`: update each `workflow_versions.config`.
- **Idempotent:** must not produce `ocrResultRefRef`.
- **Validate** each output with `validateGraphConfig` / `validateGraphConfigForExecution`.

### §5.4 Template head refresh (optional, after §5.3)

**Purpose:** Align **head** of slug-matched lineages to canonical repo JSON (may differ from in-place migrated tenant edits).

1. Maintain explicit **slug → §5.1 file** map in the CLI.
2. For each match: **append** new `WorkflowVersion` (`version_number + 1`), set `workflow_lineages.head_version_id` to new id.
3. **Does not** replace older pinned version rows (they remain §5.3-migrated).
4. After append: run §5.7 for definitions that reference the **new** head version id.

Skip lineages with no OCR-related nodes. Custom lineages without a template slug rely on §5.3 only.

### §5.5 Cutover gate (structured)

Before §7, automated check must report **zero** configs containing legacy identifiers:

- Walk JSON: any `ctx` key, `ctxKey`, or condition `ref` exactly matching `ocrResponse`, `ocrResult`, or `cleanedResult` (not `ocrResponseRef`, etc.).
- Do **not** rely on naive `config::text LIKE '%ocrResult%'` (false positives on `ocrResultRef`).

Emit list of failing `workflow_versions.id` for manual fix.

### §5.6 Related app DB columns

| Table / column | Action |
|----------------|--------|
| `workflow_versions.config` | **Required** §5.3 `--apply` |
| `benchmark_definitions.workflow_config_overrides` | **Required** §5.2 walk |
| `benchmark_definitions.workflowConfigHash` | **Required** §5.7 recompute |
| `benchmark_runs.params` (embedded `workflowConfig`) | Optional (historical) |
| `documents.workflow_config_id` | Unchanged (same id, migrated config) |

### §5.7 Recompute `benchmark_definitions.workflowConfigHash`

After §5.3 (and §5.4 if run), for **each** `benchmark_definitions` row:

1. Resolve effective config: `workflowVersionId` (+ merge `workflow_config_overrides` if present, same as run service).
2. `workflowConfigHash = computeConfigHash(config)` (shared `config-hash.ts` logic).
3. `UPDATE benchmark_definitions SET "workflowConfigHash" = $hash WHERE id = $id`.

Without this, inner `graphWorkflow` hash checks fail immediately after migration.

Include in migrator CLI as `--refresh-benchmark-hashes` or automatic post-apply step.

---

## 6. Success criteria (post-cutover, new traffic only)

| Metric | Target |
|--------|--------|
| `temporal` DB size after 7 days | Stable (no pre-wipe growth rate) |
| New `graphWorkflow` history bytes | ≪ ~600 KB/doc inline OCR baseline |
| Azure poll **event count** | Unchanged (out of scope); per-event size small |
| Map **≤ 20** branches in-process | Poll events × N in **one** workflow; refs keep bytes small but event count can still grow |
| Benchmark parent @ 100 samples | &lt; ~10 MB |
| No `history size exceeds limit` | Normal OCR + benchmark load |
| Product paths | OCR, viewer, benchmark drill-down OK |
| §5.5 gate | Zero legacy ctx keys |

---

## 7. Cutover runbook

**Prerequisites:** Staging **G** passed; **atomic** sequence in §2 completed on target env.

1. Announce maintenance — block OCR and benchmark starts (API or scale to 0).
2. Deploy **temporal-worker**, **backend-services**, **frontend** (same release).
3. Run `workflow:migrate-ocr-refs --apply` + benchmark hash refresh (§5.7).
4. Run §5.5 gate — abort if failures.
5. Scale down worker (optional); cancel open workflows (optional).
6. **Drop and recreate** DBs `temporal` and `temporal_visibility`; schema init (`temporal-server-deployment.yml` initContainer pattern).
7. Set namespace retention **24h**.
8. **SQL:** `UPDATE documents SET workflow_execution_id = NULL WHERE workflow_execution_id IS NOT NULL;`
9. Scale up Temporal server, worker, backend.
10. Smoke: one document OCR (standard slug), one benchmark sample (with/without OCR cache replay).
11. Resume traffic.

**pgBackRest:** Temporal data may remain in backups until retention (30d default).

---

## 8. Implementation order

1. B.1 + D.5 (refs + codec)  
2. B.2–B.5, D.1–D.2 (activities + workflow contracts, both apps)  
3. A (including A.4 wrapper flatten)  
4. C  
5. D.3–D.7  
6. E (migrator → hash refresh → gate; §5.4 optional)  
7. G staging → §7 prod  

**Estimate:** ~2–3 weeks one engineer; ~1–1.5 weeks with two (split temporal vs backend/migration).

---

## 9. Payload compression — performance

Compression applies to Temporal SDK serialization only (not blob/DB).

| Dimension | Effect |
|-----------|--------|
| CPU | Small per event after refs; monitor worker CPU |
| Replay | Less DB I/O; decompress per replayed event |
| Disk | Smaller `history` rows |
| User latency | Negligible vs OCR/API time |

Codec required (D7); all clients in one rollout.

---

## 10. Risks

| Risk | Mitigation |
|------|------------|
| Migrator misses edge-case expression | §5.5 structured gate; dry-run review |
| Stale `benchmark_definitions.workflowConfigHash` | §5.7 mandatory |
| Wrapper prediction empty after slim result | §3.11 + A.4 tests |
| §5.4 overwrites tenant head customizations | Append-only new version; document in release notes |
| `configHash` mismatch on publish | D.7 recompute on workflow save API |
| Library `childWorkflow` uses parent hash | §3.9 child-only hash; C.2 |
| Map child missing `workflowVersionId` | C.3 + `ExecutionState` |
| Map ≤ 20 in-process event-count blow-up | Prefer refs; use child map path when N &gt; 20; document limit |
| Temporal vs backend `computeConfigHash` drift | Keep both `config-hash.ts` files identical; test parity |
| Codec only on one client | D.5 checklist all factories |
| Deploy before migrator | §2 atomic order |
| Blob orphans | D.6 lifecycle hook |
| Template vs pinned version drift | §5.3 in-place pins OK; head moves only on §5.4 |

---

## 11. Documentation

| Doc | Action |
|-----|--------|
| This spec | Track §4 |
| `benchmarking-temporal-history-bloat-fix.md` | Link A.1 (parent loop removal), §3.11 |
| Graph workflow docs + `WORKFLOW_NODE_CATALOG.md` | §3.4 `*Ref` keys |
| OpenShift deployment docs | §7 |
| Release notes | Temporal wiped; migrator + hash refresh; optional template head bump; custom graphs included via §5.3 |

---

## 12. Agent notes

- No dual-read; no inline OCR JSON in Temporal payloads.
- Backend changes: tests per `CLAUDE.md`.
- Sync **temporal** and **backend-services** `graph-workflow-types.ts` and **config-hash** logic.
- One release branch; staging cutover before prod.
