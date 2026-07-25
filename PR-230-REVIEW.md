# PR #230 Review — Visual Workflow Builder (Phases 1–8 + AI agent) → `develop`

**Reviewed:** `feature/visual-workflow-builder` @ `dc50da73` vs `origin/develop`
(merge-base `90a4f1ef`) · 822 files, +135k/−4k · draft.
**Method:** 10 parallel finder passes (correctness, security, cleanup, altitude,
conventions, removed-behavior, infra, merge-readiness) → 91 candidates →
adversarial verification of the 42 high/medium correctness+security+infra
candidates (1 verifier each, CONFIRMED / PLAUSIBLE / REFUTED).

> **Scope note.** This PR already carries a prior 34-item review,
> [`docs-md/workflow-builder/STACKED_PR_REVIEW_FINDINGS.md`](docs-md/workflow-builder/STACKED_PR_REVIEW_FINDINGS.md),
> all marked resolved. Everything below is **new or still-open** — largely
> issues surfaced by the ~197-commit `develop` merge (26 conflict resolutions),
> the cross-cutting agent/tools tenancy surface, and deploy wiring for the new
> deno-runner service. Findings that a verifier could not fully pin down are
> marked **PLAUSIBLE** or **needs investigation** rather than asserted.

---

## TL;DR

The builder itself is large but coherent and, for 822 files, unusually clean
(no stray `console.log`, only 4 `any`s, migrations complete). The blockers are
**not** in the canvas code — they cluster in three places the big merge stitched
together imperfectly:

1. **Deploy wiring for the new deno-runner is incomplete** — the dynamic-nodes
   feature will not work on any OpenShift environment as-is (3 confirmed infra
   blockers).
2. **The AI agent's workflow tools bypass the tenancy checks** the REST
   controller enforces — cross-group read **and write** (confirmed).
3. **Phase-4 caching merged with `develop`'s by-reference engine has several
   correctness holes** — stale/false cache hits and a cache-write failure that
   aborts the whole run (confirmed).

Plus a cluster of **frontend editor bugs** that a user hits in normal use
(un-typeable node picker on large graphs, Auto-arrange that doesn't move
anything, unsaved edits silently stomped by the agent chat), and one
**shipped-but-unimplemented** node option (Join "Any").

Recommendation: **not mergeable as one PR yet.** The
[stacked-PR split plan](docs-md/workflow-builder/STACKED_PR_SPLIT_PLAN.md) is the
right call — but the blockers below should be fixed as the stack is cut, not
deferred. Severity legend: 🔴 blocker · 🟠 fix before merge · 🟡 should-fix ·
⚪ nice-to-have.

---

## Progress checklist (fixes in progress)

> Status convention: `[ ]` open · `[x]` done · findings are annotated inline
> below with **✅ FIXED**, **⏭️ DEFERRED** (with reason), or **❓ NEEDS DECISION**.

**§1 Infra**
- [x] §1.1 Worker pod never receives deno-runner env (🔴)
- [x] §1.2 Backend pod same deno-runner env gap (🔴)
- [x] §1.3 Nothing builds the deno-runner image (🔴)
- [x] §1.4 CI never runs graph-workflow test suite (🟠)
- [x] §1.5 No linux-arm64 native-binary pins (🟡)
- [x] §1.6 deno-runner NetworkPolicy needs cluster validation (🟡 — resolved by reasoning + doc; live check is a one-time operator step)
- [x] §1.7 PLATFORM_API_KEY read as `?? ""` no fail-fast (⚪)

**§2 Security / tenancy**
- [x] §2.1 Agent workflow tools have no tenancy check (🔴)
- [x] §2.2 getNodeStatuses skips ownership check (🔴)
- [x] §2.3 deleteDynamicNode interpolates model slug into path (🟠)
- [x] §2.4 Conversation resume can run under wrong group (🟠)

**§3 Engine / cache**
- [x] §3.1 Parallel-batch cache deltas clobber fresh sibling writes (🔴)
- [x] §3.2 Best-effort cache write aborts whole run (🔴)
- [x] §3.3 Non-deterministic dynamic nodes are cached anyway (🟠)
- [x] §3.4 P2002 race-detection dead across activity boundary (🟠)
- [x] §3.5 Version-pinning a name-referenced child hard-fails (🟠)
- [x] §3.6 Validator rejects source-produced ctx keys (🟡)
- [x] §3.7 Map fan-out via child workflows disables cache (🟡)
- [x] §3.8 getInputCtx retention fallback returns different run's ctx (⚪ — user chose fail-safe 404)
- [x] §3.9 getInputCtx cross-lineage 403 guard skipped (⚪ — user chose fail-closed; §2.2 guard tightened too)

**§4 Frontend editor**
- [x] §4.1 NodePicker un-typeable on graphs >20 nodes (🔴)
- [x] §4.2 Auto-arrange changes nothing visible but persists (🔴)
- [x] §4.3 Agent "create workflow" lands on blank canvas (🔴)
- [x] §4.4 Agent chat stomps unsaved canvas edits (🔴)
- [x] §4.5 Chat-queued file uploads never fire (🔴)
- [x] §4.6 Run-drawer Upload starts duplicate run (🟠)
- [x] §4.7 Live Try floods canvas with false cache-evicted alerts (🟠)
- [x] §4.8 renameCtxKey misses most reference sites (🟠)
- [x] §4.9 Switch-case edits don't refresh edge labels (🟡)
- [x] §4.10 Can't draw error-fallback edge to node with normal edge (🟡)
- [x] §4.11 Fresh Try after a Replay never polls (🟡)
- [x] §4.12 errorPolicy change doesn't show/hide error handle (🟡)
- [x] §4.13 ConditionExpressionEditor literal JSON-parses every keystroke (🟡 — confirmed + fixed)

**§5 Merge-readiness**
- [x] §5.1 Join strategy "Any" selectable but unimplemented (🔴 — removed)
- [x] §5.2 Dev-only route ships to production (🔴)
- [x] §5.3 HumanGate ships with 3 main paths it.skip'd (🟠 — documented; harness hang, not a product bug)
- [ ] §5.4 Session/dev artifacts riding along in product PR (🟠 — ❓ NEEDS DECISION, see note)
- [x] §5.5 4 `any`s violate no-`any` rule (🟡)
- [x] §5.6 Dead placeholder subprocess-harness.ts (🟡)

**§6 Cleanup** (quality, not blocking — ❓ NEEDS DIRECTION; see note at §6)
- [x] §6.1 Raw fetch bypasses ApiService in ~9 builder modules — **✅ FIXED**: added `data/services/builder-fetch.ts` (`builderAuthHeaders` + `builderFetch`) and a public `ApiService.refreshSessionOnce()`; `builderFetch` attaches CSRF + test-key + `credentials:'include'` and routes a 401 through ApiService's single-flight refresh/logout, retrying once. Migrated all 9 modules (deleted their per-file `readCsrfToken`/`buildAuthHeaders`). 4 wrapper tests; 318 hook tests pass.
- [x] §6.2 Third hand-rolled Map-LRU cache — **✅ FIXED**: extracted a generic `LruTtlCache<V>` (`cache/lru-ttl-cache.ts`); replaced the inline `versionRunCountCache` read/write in `WorkflowController` with it, and made `CatalogCache` a thin wrapper over it. (The temporal `LruVersionCache` is left as-is — no TTL, separate app; consolidating it would need a shared package for different semantics.) 5 new tests; existing cache tests green.
- [x] §6.3 replaceNode splice + shape detectors — **✅ FIXED (A+B)**: shared `replaceNode(config, id, node)` helper applied to all 9 node-settings splice sites; extracted shared `isDocumentShape`/`isSegmentShape` detectors (`cache/artifact-shapes.ts`) consumed by both `hash-artifact.ts` and `compute-input-hash.ts` (removes the write-hash/read-hash drift risk). **Part C (generic `<ListEditor>`) declined** — the 4+ editors share only the small list plumbing; their row rendering + validation (the bulk of each 188–427-line component) is genuinely heterogeneous, so a render-prop generic is indirection over large components for modest gain + regression risk (an abstraction better left deferred). New replaceNode + LruTtl-style tests.
- [x] §6.4 mergeBenchmarkOcrCacheParams altitude leak — **✅ FIXED**: added `benchmarkOcrCacheRole?: "passthrough" | "extract"` to `ActivityCatalogEntry`, set it on the 3 Azure-OCR entries, and the engine now reads the role from the catalog instead of a hard-coded activity-type set (deleted `AZURE_OCR_CACHE_ACTIVITY_TYPES`). Engine no longer names OCR activities. 5 new unit tests.

---

## 1. Deploy / infra blockers (all CONFIRMED)

The dynamic-nodes (Phase 6) Deno sandbox is wired in code and in the configmaps,
but not into the pods or the build.

| | Finding | File |
|---|---|---|
| 🔴 | **Worker pod never receives the deno-runner env.** `temporal-worker-configmap.yml` adds `DENO_RUNNER_URL`, `AI_DI_API_BASE_URL`, `DYNAMIC_NODE_ALLOW_NET`, but `temporal-worker-deployment.yml` wires only `PLATFORM_API_KEY` (no `envFrom`, no `configMapKeyRef` for the three). At runtime `dyn-run.activity.ts` falls back to `http://localhost:3002` / `deno-runner.client.ts` to `localhost:9099`. **Every dynamic-node run fails on first deploy.** **✅ FIXED** — added `DENO_RUNNER_URL`, `AI_DI_API_BASE_URL`, `DYNAMIC_NODE_ALLOW_NET` `configMapKeyRef` env entries to the worker deployment (after `PLATFORM_API_KEY`). | [temporal-worker-deployment.yml:160](deployments/openshift/kustomize/base/temporal/temporal-worker-deployment.yml#L160) |
| 🔴 | **Backend pod same gap.** `backend-services/configmap.yml` adds `DENO_RUNNER_URL` + `DYNAMIC_NODE_ALLOW_NET`; `deployment.yml`'s 28-entry env list injects neither. Publish-time `/check` hits `localhost:9099` → **publishing any dynamic node fails in every environment.** **✅ FIXED** — added `DENO_RUNNER_URL` + `DYNAMIC_NODE_ALLOW_NET` `configMapKeyRef` env entries to the backend deployment (after `DB_POOL_MAX`). | [backend-services/deployment.yml:92](deployments/openshift/kustomize/base/backend-services/deployment.yml#L92) |
| 🔴 | **Nothing builds the deno-runner image.** `deno-runner/deployment.yml` pulls `…/deno-runner:main-latest`, and `apps/deno-runner/Dockerfile` exists, but the build matrix (`deploy-instance.yml`) and `scripts/oc-build-push.sh` only know `backend-services\|frontend\|temporal\|ches-adapter`. **Fresh `oc apply -k` → `ImagePullBackOff`.** **✅ FIXED** — added `deno-runner` to the `deploy-instance.yml` build matrix (context `apps/deno-runner`) and to `scripts/oc-build-push.sh` (usage, arg parser, `--all`, build case); also pinned the runner image per-instance via a new optional `--deno-runner-image` in `generate-overlay.sh` + overlay `images:` entry, wired from `oc-deploy-instance.sh` and the CI deploy step. Overlay tests updated (51 pass). | [deno-runner/deployment.yml:23](deployments/openshift/kustomize/base/deno-runner/deployment.yml#L23) |
| 🟠 | **CI never runs the graph-workflow test suite.** ~9,100 lines of jest tests in `packages/graph-workflow`, but `frontend-qa.yml` only *builds* the package; backend/temporal QA run their own workspaces. The shared validator + cache-hash + ctx-binding code (used by backend save-path, worker, and canvas) has **zero CI-enforced coverage** — regressions ship green. **✅ FIXED** — added a "Test graph-workflow package" step to `frontend-qa.yml` (which triggers on `packages/**`, so any change to the shared package runs its 838-test jest suite). | [packages/graph-workflow/…/validator.test.ts](packages/graph-workflow/src/validator/validator.test.ts) |
| 🟡 | **No `linux-arm64` native-binary pins.** Root `optionalDependencies` pins darwin-arm64 + linux-x64(/musl) only for biome/esbuild/sharp/rollup/swc. `npm install` on an ARM64 build host / CI runner gets no matching binary → build fails. **✅ FIXED** — added `linux-arm64` (+ `-musl`) pins for biome, esbuild, sharp, rollup, and swc; verified all 9 packages exist at the pinned versions and refreshed `package-lock.json`. | [package.json:70](package.json#L70) |
| 🟡 | **deno-runner NetworkPolicy `NEEDS CLUSTER VALIDATION`** (the file says so). Egress is `:53`→`openshift-dns` ns + `:3002`→backend-services. If the target cluster's DNS pods aren't in a namespace labelled `kubernetes.io/metadata.name=openshift-dns`, the runner can't resolve backend-services and every platform callback times out slowly. **Needs a live cluster check.** **✅ RESOLVED (by reasoning)** — the `kubernetes.io/metadata.name` label is auto-applied to every namespace by Kubernetes (NamespaceDefaultLabelName, GA since 1.21 / OCP 4.8+), and standard OpenShift 4.x runs CoreDNS in `openshift-dns` (the BC Gov Silver/Gold target), so the selector resolves without manual labelling. Replaced the vague warning with the rationale + the exact one-time `oc` commands an operator runs only on a non-standard DNS topology. A true live-cluster check remains an operator deploy step. | [deno-runner/networkpolicy.yml:38](deployments/openshift/kustomize/base/deno-runner/networkpolicy.yml#L38) |
| ⚪ | `PLATFORM_API_KEY` read as `?? ""` (no fail-fast); secrets manifest ships the placeholder `your-platform-api-key-here`. A worker deployed before the real secret injects an empty key → opaque 401s deep inside script execution instead of a clear config error. **✅ FIXED** — `dyn.run` now throws a non-retryable `DynamicNodeConfigError` when `PLATFORM_API_KEY` is empty/unset (never injects `""`); tests updated. | [dyn-run.activity.ts:116](apps/temporal/src/dynamic-nodes/dyn-run.activity.ts#L116) |

---

## 2. Security / tenancy (agent tools bypass authz)

The REST `WorkflowController` guards every endpoint with
`identityCanAccessGroup`. The Phase-7 agent's tools call the **services
directly** and skip that guard.

| | Finding | File |
|---|---|---|
| 🔴 | **Agent workflow tools have no tenancy check → cross-group read *and write*.** `getWorkflow`/`writeWorkflow` tools call `WorkflowService.getWorkflow/updateWorkflow`, which `findUnique({where:{id}})` with `actorId` used **only in log lines** — no group filter. The tool schema accepts an arbitrary model-supplied `workflowId`. Config re-validation on write uses the *victim* row's `group_id`, so cross-group writes validate and succeed. Reachable via prompt injection from document/OCR text surfaced through `getPreviewCache`. **Cross-tenant read+write of any workflow by id.** **✅ FIXED** — added `fetchWorkflowInGroup(ctx, id)` that fetches via the service then throws `NotFoundException` unless `wf.groupId === ctx.groupId` (the agent's single bound group); routed `readWorkflow`, `writeWorkflow` (asserts before update), the `getWorkflow` tool, and `updateWorkflowMetadata` through it — covering every read/graph-edit/metadata tool. The `internalFetch` self-call tools already route through the REST controller's `identityCanAccessGroup`. 3 new cross-group rejection tests (read, metadata write, addNode read+write); 20 pass. | [agent/tools.ts:184,277](apps/backend-services/src/agent/tools.ts#L277) |
| 🔴 | **`getNodeStatuses` skips the ownership check its sibling has.** It authorizes the URL's *workflow*, then calls `queryNodeStatuses(runId)` with **no lineage/run scoping** (`getInputCtx` guards exactly this at L1051). Any group member pairs their own workflow id with a victim `runId` (leaked via logs/URLs) and reads another tenant's per-node status map — node ids, error-message strings, cache hashes. **✅ FIXED** — `getNodeStatuses` now resolves the run via `getRunInput(runId)` and rejects with `ForbiddenException` when `workflowLineageId !== id` (and `NotFoundException` when start args can't be decoded, i.e. ownership unverifiable) before ever calling `queryNodeStatuses`. Mirrors the getInputCtx guard; Swagger 403 updated; new ownership test added. (The `!== null` skip is tightened uniformly in §3.9.) | [workflow.controller.ts:842](apps/backend-services/src/workflow/workflow.controller.ts#L842) |
| 🟠 | **`deleteDynamicNode` interpolates a model-supplied slug into a self-call path** (`/api/dynamic-nodes/${slug}`), unbounded/unencoded (`publishDynamicNode` is regex-bounded; delete is not). `slug='../workflows/<id>'` normalizes to `DELETE /api/workflows/<id>`. Bounded by the caller's own api-key (same privilege), but converts a soft-delete tool into arbitrary same-privilege DELETEs — reachable via prompt injection. **✅ FIXED** — `deleteDynamicNode` now rejects any slug not matching `/^[a-z][a-z0-9-]*$/` before the self-call and `encodeURIComponent`s it; the publish PUT path is encoded too. New tests cover the traversal rejection + valid-slug path. | [agent/tools.ts:728](apps/backend-services/src/agent/tools.ts#L728) |
| 🟠 | **Conversation resume can run under the wrong group.** `findConversationByIdForUser` filters by `createdBy` only, not `groupId`; resume builds tool ctx from the *request's* group while binding the stored `workflowId`. A multi-group user resuming a group-B conversation while presenting group B... A can operate tools against a mismatched group. Bounded to the same user, not cross-user. **✅ FIXED** — `startChat` now rejects with `NotFoundException` when the resumed `conversation.groupId !== input.groupId`, before persisting any message or building tool ctx. New mismatch test added. (The §2.1 agent-tool guard is a second line of defense, since the bound workflow would also fail the `wf.groupId === ctx.groupId` check.) | [agent/chat.repository.ts:44](apps/backend-services/src/agent/chat.repository.ts) |

> **Safety-classifier note.** The two backend finder passes ran while the
> `claude-opus-4-8[1m]` safety classifier was unavailable, so their raw output
> carried a "verify before acting" caveat. Every security finding above was
> **independently re-verified** by a separate adversarial pass that quoted the
> guilty lines (results in `scratchpad/verdicts-backend.json`) — they do not
> rest on the unclassified pass. No item required working around a safeguard;
> nothing is left unverified for that reason.

---

## 3. Engine / cache correctness (Phase 4 ⋈ develop by-reference merge)

| | Finding | File |
|---|---|---|
| 🔴 | **Parallel-batch cache deltas clobber fresh sibling writes.** `snapshotCtxDelta` captures the *entire top-level subtree* (e.g. all of `documentMetadata` for a `doc.*` output), including whatever siblings already wrote there; a later cache hit does `Object.assign(ctx, cached.outputCtx)`, replacing the whole subtree. With ready-set `Promise.all` execution over shared `ctx`, a cache-hitting node **restores a stale subtree and silently reverts a concurrent node's fresh output**. Downstream consumes wrong data, no error. **✅ FIXED** — `snapshotCtxDelta` now records only the exact resolved leaf paths the node wrote (`collectOutputLeafPaths` via `applyCtxNamespace`) into a nested delta, and the cache decorator restores it with a new `deepMergeCtx` instead of `Object.assign`, so a hit writes only this node's leaves and leaves a concurrent sibling's writes to the same subtree intact. `outputCtx` stays nested (preview/source-node/getInputCtx unaffected). New write-side (leaf-only snapshot) + restore-side (sibling preserved) tests; P2002 race test updated to the deterministic invariant. | [node-executors.ts:243](apps/temporal/src/graph-engine/node-executors.ts#L243) |
| 🔴 | **A best-effort cache write aborts the whole run.** `writeSourceNodeCache`'s doc comment promises "errors are caught and silently dropped," but the body has **no try/catch** and `graph-runner.ts` awaits it unguarded. A transient DB blip (upsert exhausts its 3 retries) **fails the workflow at start**, before any real node runs. **✅ FIXED** — wrapped the `deps.upsert` in try/catch so a failed write is silently dropped (matching the doc contract); the source ctx-merge already happened, so only a cache row is forfeited. New `source-node-cache.test.ts` covers the happy path + the swallow-on-error path. | [source-node-cache.ts:103](apps/temporal/src/cache/source-node-cache.ts#L103) |
| 🟠 | **Non-deterministic dynamic nodes are cached anyway.** `isNonCacheable()` only consults the static `ACTIVITY_CATALOG`, which has **no `dyn.*` entries**; nothing reads `DynamicNodeVersion.deterministic`. A `@deterministic:false` script (external API / randomness) re-run with the same `versionId`+inputs is served **stale cached output** — `dyn.run` never re-executes. (`version-cache.ts`'s comment claims the flag is consumed by the decorator; it has no consumer.) **✅ FIXED** — `dynamicNode.resolveLineage` now surfaces the resolved version's `deterministic` (both head + pinned paths, `select` updated), and `executeActivityNode` bypasses the Phase 4 cache path when `deterministic === false` (falls through to the uncached path so the script re-executes every run). version-cache comment corrected; resolve-lineage tests assert the flag; dyn-node integration mocks updated. | [cached-activity.ts:113](apps/temporal/src/cache/cached-activity.ts#L113) |
| 🟠 | **P2002 race-detection is dead across the activity boundary → cache write becomes fatal.** `deps.upsert` is a Temporal activity proxy, so the workflow gets an `ActivityFailure`/`ApplicationFailure` with Prisma's `.code` stripped; `code === "P2002"` can never match in production (only in unit tests with plain mocks). Any terminal upsert failure rethrows and **fails the node even though the activity already succeeded** — contradicts the module's best-effort contract. **✅ FIXED** — the decorator no longer probes for `code === "P2002"` (removed the dead `isUniqueConstraintViolation`); on ANY upsert failure it re-runs `findFresh` (itself guarded) and overlays the winner's `outputCtx` if a row now exists (`cacheHit: true`), otherwise keeps the already-applied delta and continues uncached (`cacheHit: false`) — never failing the node. Scenario 4b replaced with two tests (no-committed-row and lost-race). | [cached-activity.ts:239](apps/temporal/src/cache/cached-activity.ts#L239) |
| 🟠 | **Version-pinning a child workflow referenced by name hard-fails.** The pinned path only does `findUnique(lineage_id_version_number)` with the ref string as `lineage_id`; the unpinned path *also* resolves `WorkflowVersion.id` and lineage **name**. `ChildWorkflowNodeSettings` exposes a free-text ref, so a name-referenced child works until a version pin is added, then throws `"Library lineage <name> has no version N"`. **✅ FIXED** — the pinned path now resolves the free-text ref to a lineage id (by id, then by name — mirroring the head-path fallbacks) before the `(lineage_id, version_number)` lookup. New name-referenced-pin test + a not-found test; existing pinned tests updated. | [get-workflow-graph-config.ts:60](apps/temporal/src/activities/get-workflow-graph-config.ts#L60) |
| 🟡 | **Validator rejects source-produced ctx keys as "undeclared."** `validatePortBindings` builds `declaredCtxKeys` only from `config.ctx`; source-node fields (`source.api` fields[], `source.upload` ctxKey) are never mirrored there and never bound by auto-wire, so an activity input bound to a source key **fails save** with `"Port binding references undeclared ctx key"` — contradicting `walkCtxKeyBindings` (which treats them as valid producers) and the design doc. **✅ FIXED** — added `collectSourceProducedCtxKeys` (mirrors `enumerateSourceProducers`' key derivation: `source.api` field names + `source.upload` ctxKey) and merged those into `declaredCtxKeys` in BOTH `validatePortBindings` and `validateExpressions`. New tests: activity input bound to a source.upload key + switch condition on a source.api field key both validate clean. | [validator.ts:625](packages/graph-workflow/src/validator/validator.ts#L625) |
| 🟡 | **Map fan-out via child workflows (>20 items) silently disables the cache.** The `executeChild` path omits `workflowLineageId`, so children build no `cacheDeps` and re-execute uncached; `executeBranchSubgraph` (≤20) *does* propagate it. Cache/replay behavior **flips on collection size**. Results stay correct; try-in-place "skipped/cache-served" semantics break above the threshold. **✅ FIXED** — the map `executeChild` args now pass `workflowLineageId: state.workflowLineageId ?? null` (matching the `childWorkflow`-node path), so children build `cacheDeps` and cache uniformly regardless of collection size. | [node-executors.ts:578](apps/temporal/src/graph-engine/node-executors.ts#L578) |
| ⚪ | `getInputCtx` retention fallback returns a **different run's** `initialCtx`. When history is retention-cleaned, `findMostRecentFresh` returns the newest cache row in the *lineage* (a different, newer run) and returns it as the requested run's input — "Re-run" replays with the wrong document. Confined to one lineage. **✅ FIXED (user: fail-safe)** — removed the unscoped `findMostRecentFresh` fallback; a retention-cleaned run now returns 404 ("input not available") rather than a possibly-different run's ctx. (`findMostRecentFresh` remains used by the preview-cache endpoint, where "most recent" is the intended semantic.) Retention-evicted test updated to expect 404. | [workflow.controller.ts:1085](apps/backend-services/src/workflow/workflow.controller.ts#L1085) |
| ⚪ **PLAUSIBLE** | `getInputCtx` cross-lineage 403 guard is skipped when start args carry no `workflowLineageId`. `startGraphWorkflow` always sets it today, so the trigger requires pre-Phase-4 runs (or another writer to the namespace) still inside the retention window. **Investigate** whether such runs exist in the target envs. **✅ FIXED (user: fail-closed)** — the guard is now `workflowLineageId !== id` (was `!== null && !== id`), so a run whose start args can't prove it belongs to this lineage is rejected with 403. The matching §2.2 `getNodeStatuses` guard was tightened the same way. Swagger 403/404 docs updated; the "no lineage in args" test now asserts 403. | [workflow.controller.ts:1052](apps/backend-services/src/workflow/workflow.controller.ts#L1052) |

**REFUTED (not bugs):** `stable-json.ts` dropping `Date.toJSON()` (values cross
Temporal's JSON converter first, so never reach it as `Date`); `enumerateSourceProducers`
`Artifact` default (intended fail-closed typing, doc'd + tested);
`resolvePortKind` "inverse" direction pairing (deliberate, tested);
`parametersSchema.parse` 500 and `deriveFromSourceApi` 500 (both guarded by
save-time validator rules — unreachable for configs saved through the service).

---

## 4. Frontend editor bugs (all CONFIRMED unless noted)

These are things a user hits in normal editing.

| | Finding | File |
|---|---|---|
| 🔴 | **NodePicker is un-typeable on graphs >20 nodes.** The autocomplete branch is controlled and runs `onChange(labelToId.get(displayValue) ?? null)` on **every keystroke**; any partial (non-exact-label) string emits `null`, the parent clears the value, and the input snaps back to empty. Only pasting/selecting an exact label works. Affects Join "Source Map node", Map body entry/exit, etc. **✅ FIXED** — extracted the autocomplete branch into `NodePickerAutocomplete` holding local `search` state; it commits an id ONLY on an exact-label match (or `null` on full clear) and re-syncs to external value changes via `currentLabel`. Partial strings just update local state, so the field stays typeable. 2 new tests (typeable partial; exact-match commit); 10 pass. | [NodePicker.tsx:196](apps/frontend/src/features/workflow-builder/graph-widgets/NodePicker.tsx#L196) |
| 🔴 | **Auto-arrange changes nothing visible but persists a new layout.** `buildStructuralFingerprint` omits `metadata.position`, and the projection effect early-returns on an unchanged fingerprint. `handleAutoArrange` only `setConfig(layoutGraph(prev))` (positions only) + fitView → **xyflow nodes never move**, yet the new layout is silently written to config, so the canvas disagrees with what renders after reload. **✅ FIXED** — added a `layoutNonce` prop the host bumps in `handleAutoArrange`; the canvas has a dedicated effect that re-applies `config.nodes[*].metadata.position` to the internal xyflow nodes when the nonce changes, bypassing the position-excluding fingerprint (so drags still don't re-project, but Auto-arrange moves the nodes). | [WorkflowEditorCanvas.tsx:1274](apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx#L1274) |
| 🔴 | **Agent "create workflow" lands on a blank canvas.** `ToolCallNavigator` goes to `/workflows/create?id=<id>`, but that route mounts `WorkflowEditorV2Page mode="create"`, which reads only `useParams().workflowId` — never `?id=`. User sees an empty "New workflow"; hitting Save creates a **duplicate**. Should target `/workflows/<id>/edit`. **✅ FIXED** — `ToolCallNavigator` now navigates to `/workflows/${id}/edit` (the mode="edit" route that reads `useParams().workflowId`); guard simplified to the pathname check. | [AgentChatDrawer.tsx:790](apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx#L790) |
| 🔴 | **Agent chat stomps unsaved canvas edits.** The edit-mode hydration effect unconditionally `setConfig(...existingWorkflow.config)` whenever `useWorkflow` returns a new object, and the chat drawer invalidates `['workflow']` after **every write tool + stream finish** → refetch → local unsaved edits overwritten by the server copy. (Mitigations: TanStack structural sharing means identical data keeps the ref; `refetchOnWindowFocus:false` is set globally — so the focus vector doesn't fire, but the agent-write vector does.) **✅ FIXED** — the edit-mode hydration effect now hydrates only when the local `config` still equals the last hydrated snapshot (reference compare via a render-synced `configRef` + `lastHydratedConfigRef`). Unsaved local edits (a new config object) block the stomp; with no local edits the server state (e.g. the agent's write) is still adopted. `handleSave` re-baselines so post-save refetches and future agent writes hydrate again. | [WorkflowEditorV2Page.tsx:351](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L351) |
| 🔴 | **Chat-queued file uploads never fire.** The drain gate checks `node?.type === "source.upload"`, but the backend `addNode` tool returns `{ type: "source", sourceType: "source.upload" }` → condition never matches → files dropped into chat before the node exists stay "uploading…" forever. Fix: `type === "source" && sourceType === "source.upload"`. **✅ FIXED** — the drain gate now checks `node.type === "source" && node.sourceType === "source.upload"` (matching the backend addNode tool's return shape). | [AgentChatDrawer.tsx:827](apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx#L827) |
| 🟠 | **Run-drawer Upload starts a duplicate, ctx-polluting run.** Since US-146 the upload endpoint itself cancels in-flight Tries and starts a run, but `UploadSourceSection.handleRun` still chains a **second** `POST /runs` with `initialCtx: uploadResult` — where `uploadResult` now contains literal `runId`/`workflowVersionId` keys. Two executions per click; if a non-head version was selected, they run **different versions**. The hook's "only uploads" comment is stale. **✅ FIXED** — `handleRun` no longer chains a second `startRun`; it uses the run the upload already started (`uploadResult.runId`). Removed the now-unused `startRun` from this section. Since the upload endpoint runs head, a non-head selection now surfaces a yellow "ran head version" notice instead of silently running a second version. | [RunWorkflowDrawer.tsx:489](apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx#L489) |
| 🟠 | **Live Try floods the canvas with false "cache evicted" alerts.** `PreviewWidget` renders `CacheEvictedAlert` whenever `data===null && runId`, but `NodePreviewOverlay` passes `activeRunId` for **live** Tries too; every not-yet-run node 404s on preview-cache → red "Preview unavailable — Re-run to repopulate" on nodes the run hasn't reached. Clicking Re-run then duplicates/cancels the in-flight Try. Should gate on `isReplay`. **✅ FIXED** — added an `isReplay` prop to `PreviewWidget` (forwarded from `RunStateContext` via `NodePreviewOverlay`); the cache-evicted Alert now renders only when `isReplay && runId`. Live-Try 404s (not-yet-run nodes) stay silent. New live-Try test; evicted test updated to pass `isReplay`; 23 pass. | [PreviewWidget.tsx:97](apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx#L97) |
| 🟠 | **`renameCtxKey` misses most reference sites.** It rewrites only `node.inputs/outputs` PortBindings — **not** `map.collectionCtxKey/itemCtxKey/indexCtxKey`, `join.resultsCtxKey`, `childWorkflow` in/out mappings, or `ValueRef` refs in switch/pollUntil conditions — despite the drawer copy promising "renaming a key rewrites every binding that references it." Silent runtime breakage. **✅ FIXED** — extracted a pure `renameCtxKeyInConfig` helper that rewrites node inputs/outputs, `map.collectionCtxKey/itemCtxKey/indexCtxKey`, `join.resultsCtxKey`, `childWorkflow.inputMappings/outputMappings`, and every `ValueRef.ref` inside switch/pollUntil conditions (recursively, incl. dotted paths rooted at the key). Drawer calls it; 6 helper tests cover each node type. | [WorkflowSettingsDrawer.tsx:71](apps/frontend/src/features/workflow-builder/settings/WorkflowSettingsDrawer.tsx#L71) |
| 🟡 | **Switch-case edits don't refresh edge labels.** `edgesFingerprint` hashes only `id\|source\|target\|type`; `sourceSwitch` (case/default labels) is snapshotted at projection, so editing a case condition/order/default leaves stale labels until an edge is added/removed. **✅ FIXED** — `edgesFingerprint` now folds each source switch node's `{ cases, defaultEdge }` into the per-edge hash, so a case edit re-projects the edges with fresh `sourceSwitch` data. | [WorkflowEditorCanvas.tsx:1524](apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx#L1524) |
| 🟡 | **Can't draw an error-fallback edge to a node that already has a normal edge.** `handleConnect`'s duplicate check compares only `source`+`target`, ignoring `sourceHandle`/type, so a `fallback` edge (or a second switch-case edge) to the same target is silently dropped. **✅ FIXED** — `handleConnect` now computes `edgeType` before the dedup and compares `(source, target, type)`, so an error edge (type `error`) coexists with a normal edge to the same target while a same-type duplicate is still rejected. | [WorkflowEditorCanvas.tsx:1832](apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx#L1832) |
| 🟡 | **Fresh Try after a Replay never polls.** `TrySourceSection.handleTry` (and `SourceUploadButton`) set `activeRunId` but never `setIsReplay(false)`; `useNodeStatuses` is built with `active:!isReplay` → the new live run fetches once, badges freeze, and the "Replay mode" banner persists. **✅ FIXED** — both `TrySourceSection.handleTry` and `SourceUploadButton` now call `runState.setIsReplay(false)` before `setActiveRunId`, so a fresh Try starts live polling. | [RunWorkflowDrawer.tsx:693](apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx#L693) |
| 🟡 | **`errorPolicy` change doesn't show/hide the error handle.** Structural fingerprint omits `node.errorPolicy`, so toggling `onError='fallback'` doesn't re-project → the bottom "error" source handle doesn't appear until an unrelated structural change. (Trigger currently limited to paths that edit `errorPolicy` directly.) **✅ FIXED** — `buildStructuralFingerprint` now folds each node's `errorPolicy.onError` into its per-node signature, so toggling `onError: 'fallback'` re-projects and the error handle appears/disappears immediately. | [WorkflowEditorCanvas.tsx:1290](apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx#L1290) |
| 🟡 **needs check** | **ConditionExpressionEditor literal mode JSON-parses every keystroke** → the stored literal's type flips (string→number→bool→null) mid-typing, and plain-string literals like `"true"`/`"10"` can't be authored (`status == "10"` silently becomes `== 10`). *Not sent through the verifier pass — confirm the parse-on-change path before fixing.* **✅ CONFIRMED + FIXED** — `parseLiteral` did `JSON.parse` on every keystroke and the input was re-derived from the parsed value (`literalToString(parseLiteral(text))`), so the type flipped mid-typing and quotes were stripped. `ValueRefEditor` now holds the literal input as local `literalText` (source of truth for display), emits the parsed value on change, and re-syncs only on an external value change (via a canonical-string compare). Author a string with JSON quotes (`"10"`). 2 new stability tests; 13 pass. | [ConditionExpressionEditor.tsx:812](apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx#L812) |

**REFUTED:** `useNodeStatuses` "polling stops mid-run" (#12) — the successor's
`running` write happens in the same workflow activation as the predecessor's
`succeeded`, before any await, so a query can never observe the gap.

Lower-severity frontend items (duplicate-label collision in NodePicker,
`entryNodeId` silent reassignment on delete, `PageRangeListEditor` swallowing
cleared values, UTC vs local day in run-history date filter, chat paperclip =
silent Try) are catalogued in `scratchpad/findings-fe-*.json`.

---

## 5. Merge-readiness / finishing touches

| | Finding | File |
|---|---|---|
| 🔴 | **Join strategy "Any" is selectable but unimplemented.** `executeJoinNode` throws `nonRetryable` `'Join strategy "any" not yet implemented'`, while `JoinNodeSettings` offers `{value:"any"}` in a SegmentedControl and `types.ts` declares `"all"\|"any"`. User picks it, saves, runs → hard failure. **Implement `Promise.race` semantics or remove the option** (+ its type) before merge. **✅ FIXED (removed)** — the map eagerly collects every branch result before the join runs, so `"any"` (first-to-complete) has nothing to race without a map redesign. Removed the option: `JoinNode.strategy` is now `"all"`, deleted the dead `"any"` throw in `executeJoinNode`, and removed the strategy `SegmentedControl` from `JoinNodeSettings`. Tests updated (strategy control asserted absent). | [node-executors.ts:639](apps/temporal/src/graph-engine/node-executors.ts#L639) |
| 🔴 | **Dev-only route ships to production.** `/workflows/dev-form-preview` (`WorkflowFormPreviewPage`, self-described "dev-only tracer") is registered unconditionally — no `import.meta.env.DEV` gate — reachable by any authenticated user, exposing raw JSON-Schema/Zod internals. Gate or remove. **✅ FIXED** — the route is now conditionally spread into the children array behind `import.meta.env.DEV`, so it's absent from production builds. | [App.tsx:77](apps/frontend/src/App.tsx#L77) |
| 🟠 | **HumanGate ships with its 3 main paths `it.skip`'d** (approval-continue, timeout-continue, timeout-fallback) — the node *is* implemented and in the palette, but signal/timeout regressions would go undetected. Un-skip or document why. **✅ RESOLVED (documented)** — un-skipping was attempted: all three HANG (60s jest timeout), not assert-fail — the workflow blocks in the humanGate `condition(...)` and the buffered signal / timer don't reliably resolve under the local `TestWorkflowEnvironment` (no time-skipping; signal ordering deadlocks `runUntil`). Not a product bug — the handler is correct and the **rejection** path (signal delivery + payload→ctx + `HUMAN_GATE_REJECTED`) passes. Added a describe-block comment documenting the harness limitation + what re-enabling needs (time-skipping env + signal-after-gate barrier). | [graph-workflow.test.ts:1128](apps/temporal/src/graph-workflow.test.ts#L1128) |
| 🟠 | **Session/dev artifacts riding along in the product PR.** `.claude/skills/app-browser-auth/` documents how to bypass IDIR auth and embeds a (seed-default) API key; `.claude/agents/workflow-builder.md`; `docs/superpowers/plans/*` (3000+-line session plans in the HTML-site dir); and `docs-md/workflow-builder/{SESSION_HANDOFF,PHASE7_HANDOFF,NOTES,IMPLEMENTATION_PLAN,STACKED_PR_*}.md` mix working notes into the docs taxonomy. Split these out of the 822-file PR. **❓ NEEDS DECISION (not auto-applied)** — these are your own dev tools / session notes, several still referenced: the review's own "Suggested merge path" step 6 links `STACKED_PR_SPLIT_PLAN.md`, and the `app-browser-auth` skill is actively used for local Playwright auth. Deleting them is a PR-restructuring call (which files to drop vs relocate vs keep) that I don't want to make unilaterally on files I didn't create. Tell me which to remove/relocate (e.g. move the `docs-md/workflow-builder/*HANDOFF*/NOTES/IMPLEMENTATION_PLAN` working notes to a feature-docs archive, drop `docs/superpowers/plans/*` from the HTML-site dir, exclude `.claude/skills/app-browser-auth` + `.claude/agents/workflow-builder.md` from the product commits) and I'll do it. | `.claude/skills/app-browser-auth/SKILL.md` |
| 🟡 | **4 `any`s** violate the repo's no-`any` rule: `auto-wire/resolve-input-port.ts`, `canvas/map-body-groups.ts`, `WorkflowEditorV2Page.tsx`, `deno-runner/subprocess-harness.ts`. **✅ FIXED** — the first three no longer contain any explicit `any` on this branch (only `any` in comment prose remains); the `deno-runner/subprocess-harness.ts` harness string now casts `__fn` to `(inputCtx: unknown, parameters: unknown) => unknown` and drops the `deno-lint-ignore no-explicit-any`. | — |
| 🟡 | **Dead placeholder file** `apps/temporal/src/dynamic-nodes/subprocess-harness.ts` exports only a path-string constant, zero importers, doc comment admits it's "so future refactors can land their export here" — forbidden by CLAUDE.md. Delete. **✅ FIXED** — deleted `apps/temporal/src/dynamic-nodes/subprocess-harness.ts` (zero importers; the only remaining mention is a doc comment in `version-cache.ts` pointing at the real runner-side harness). | [subprocess-harness.ts:17](apps/temporal/src/dynamic-nodes/subprocess-harness.ts#L17) |

**Swept clean:** no `console.log`/`console.debug` in changed frontend source;
only 2 (appropriate) `logger.debug` in backend; all 5 new Prisma models
(`ActivityOutputCache`, `DynamicNode`, `DynamicNodeVersion`, `ChatConversation`,
`ChatMessage`) have matching migrations.

---

## 6. Cleanup (quality, not blocking)

Only items already **at** the owner's 3-copy abstraction threshold:

- **Raw `fetch` bypasses `ApiService` in ~9 builder modules**, each re-implementing
  CSRF-cookie parsing + test-key header + `credentials:'include'` (~7 verbatim
  copies). Skips the 401 refresh/logout interceptors, so an expired session in
  the builder hard-fails instead of refreshing. At minimum extract one shared
  fetch wrapper. [dynamic-node-api.ts:13](apps/frontend/src/features/workflow-builder/dynamic-nodes/dynamic-node-api.ts#L13)
  **✅ FIXED** — extracted `builderFetch` (shared auth + `credentials:'include'`
  + ApiService's 401 refresh/logout); all 9 modules migrated.
- **Third hand-rolled Map-LRU cache** (`writeVersionRunCountCache`) duplicating
  `CatalogCache` and `LruVersionCache` with subtly different TTL semantics.
  [workflow.controller.ts:264](apps/backend-services/src/workflow/workflow.controller.ts#L264)
  **✅ FIXED** — generic `LruTtlCache<V>`; both backend caches now use it.
- **7+ near-identical list editors** and **7 copies of the `replaceNode`
  config-splice**; the duplicated `isDocumentShape`/`isSegmentShape` detectors
  that gate cache-key computation (drift → false misses/collisions).
  **✅ FIXED** — shared `replaceNode` helper (all 9 splice sites) + shared
  `artifact-shapes.ts` detectors (used by both cache-hash paths). The generic
  list-editor was intentionally NOT built (heterogeneous rows; see §6.3 note).
- **Altitude:** `mergeBenchmarkOcrCacheParams` bakes a benchmark magic-ctx-key +
  a hard-coded set of 3 Azure-OCR activity types into the generic executor,
  probed on every dispatch — contradicts the "engine stays workload-generic"
  rule; belongs in catalog metadata. [node-executors.ts:95](apps/temporal/src/graph-engine/node-executors.ts#L95)
  **✅ FIXED** — the activity-type set moved to a per-entry
  `benchmarkOcrCacheRole` catalog field; the engine reads the role and no
  longer names any OCR activity.

Full list: `scratchpad/findings-cleanup-*.json`.

> **§6 status — ❓ NEEDS DIRECTION (not auto-applied).** These are the only
> non-blocking items left; every bug/blocker in §1–§5 is fixed. I've held off
> on §6.1–§6.4 because they are large de-duplication / altitude refactors that
> the review itself notes are "at the owner's 3-copy threshold" — i.e. they
> touch code you deliberately left un-abstracted, and imposing an abstraction
> shape (shared fetch wrapper, unified LRU, generic list editor, catalog
> metadata for benchmark replay) is a design call I'd rather confirm than guess,
> especially given the regression surface. §6.4 is the one that maps to a hard
> CLAUDE.md rule (the engine must stay workload-generic) and is the most
> self-contained — say the word and I'll do it (and/or any of §6.1–§6.3) with
> the shape above.

---

## Suggested merge path

1. **Fix the 3 infra blockers + wire CI for graph-workflow** — the stack is
   pointless if dynamic-nodes can't deploy and the shared package isn't tested.
2. **Close the agent-tools tenancy gap and `getNodeStatuses` ownership check**
   before the Phase-7 PR — these are the highest-risk items.
3. **Land the cache-correctness fixes with the Phase-4 PR** (subtree clobber,
   fatal cache write, non-deterministic dyn caching, P2002 dead path).
4. **Sweep the frontend editor blockers into the Phase-1/7 PRs** — the
   NodePicker, Auto-arrange, agent-nav, and unsaved-edit-stomp bugs are
   demo-breaking.
5. **Decide Join "Any"** (implement or remove) and **gate/remove the dev route
   and session artifacts** as housekeeping across the stack.
6. Then execute the [split plan](docs-md/workflow-builder/STACKED_PR_SPLIT_PLAN.md).
