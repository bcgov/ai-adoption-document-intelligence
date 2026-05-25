# Phase 6 — Dynamic Nodes — Requirements

**Status:** Refined. Ready for user-story generation.
**Owner:** Alex
**Branch:** `feature/visual-workflow-builder`
**Feature-docs slug:** `20260601-workflow-builder-phase6-dynamic-nodes`
**Predecessor:** Phase 4 (`feature-docs/20260531-workflow-builder-phase4-try-in-place/`) — closed (cache + status streaming + preview widgets + Try affordance + run history shipped end-to-end with US-156 walkthrough; commit `fd9c283f`).
**Authoritative design:** [docs-md/workflow-builder/DYNAMIC_NODES_DESIGN.md](../../docs-md/workflow-builder/DYNAMIC_NODES_DESIGN.md) (locked scope in §0).
**Plan reference:** [docs-md/workflow-builder/IMPLEMENTATION_PLAN.md §5 Phase 6](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md).

---

## 1. Why this phase

Today (post-Phase-4 + post-Phase-8) the V2 editor is a live execution surface for the 41 activities baked into the static catalog. To add a 42nd capability — a custom OCR call, a non-trivial transform, a one-off API integration — the only path is editing TypeScript in the codebase and shipping a release. That's slow for power users and impossible for the **AI agent that Phase 7 will introduce**.

The user vision: *"can we have dynamic nodes, or basically nodes that you define at runtime, like Windmill"* ([NOTES.md §1.6](../../docs-md/workflow-builder/NOTES.md#16-dynamic-nodes-windmill-inspiration)). Phase 7 closes the loop: *"instruct an AI agent to build these workflows for you on the fly… work in a feedback loop where it sets up the pipeline and tests it"* ([NOTES.md §1.7](../../docs-md/workflow-builder/NOTES.md#17-ai-built-workflows--feedback-loop)).

Phase 6 reframes "dynamic nodes" around the **agent feedback loop**:

- Dynamic nodes are first an **API a programmatic client calls** — Phase 7's agent POSTs a script + signature, the backend validates and stores it, the catalog merges it, the agent drops it on a workflow, runs it via Phase 4's Try, reads node-statuses + preview-cache, revises, retries.
- The Monaco-based human editor is **the same component used by the agent** — the agent's `script: string` tool argument and the user's textarea content are identical.
- Failure feedback is **structured**, not free text — every publish-time error carries `{ stage, line, column, message, tag?, unknownKind?, rejectedHost? }` so an LLM can target its revision. Runtime errors flow into Phase 4's `NodeRunStatus.errorMessage` truncated at 2 KB.
- The whole loop closes **without restarting any process** — the worker's per-`versionId` script cache is naturally stale-free; the frontend uses TanStack invalidation.

Continuing to defer this leaves the editor static and pushes Phase 7's agent loop indefinitely. The Phase 6 surface is what Phase 7's agent SDK wraps — without it, the agent has no escape hatch for novel work.

---

## 2. Mental model — non-negotiable

The engine is **Model A** ([WORKFLOW_NODE_IO_MODEL_DECISION.md](../../docs-md/workflow-builder/WORKFLOW_NODE_IO_MODEL_DECISION.md)). Wires represent **execution order only**; data flows through the **ctx blackboard** via per-node `PortBinding { port, ctxKey }`.

Phase 6 adds **NO new runtime concept inside the workflow definition.** A workflow node referencing a dynamic node looks like a normal node with `type: "dyn.<slug>"` and an optional `dynamicNodeVersion?: N` (omitted = head). The graph executor resolves the slug + version to an immutable `versionId` BEFORE invoking the worker activity — the worker side sees the same shape as every other activity invocation.

**Execution model:** a single shared `dyn.run` Temporal activity wraps a Deno subprocess sandbox. One subprocess per invocation. The activity is wrapped by Phase 4's cache decorator — `configHash` includes the resolved `versionId`, so republishing automatically invalidates head-pinned consumer caches.

**Lineage / version semantics:** mirror Phase 2 Track 3's library workflows. `DynamicNode` is the lineage; `DynamicNodeVersion` is the immutable snapshot; `headVersionId` is the movable pointer. Publishing always creates a new version. Soft-delete keeps existing references resolvable. Group-scoped.

**Signature DSL:** a JSDoc header on the default-exported async function declares name, inputs, outputs, parameters, allow-list, determinism, and resource limits. The script and its catalog entry live in one file. The publish endpoint's parser (in `@ai-di/graph-workflow`) produces an `ActivityCatalogEntry`-shaped record consumed by both the live signature-preview pane in the editor (client-side, no round-trip) and the backend's persistence layer.

**Hot-reload without restarts:**
- **Frontend:** TanStack invalidation on publish refreshes `useActivityCatalog`. Standard pattern. No Vite restart.
- **Worker:** executor resolves head → an immutable `versionId` each execution; worker's in-process script cache is keyed by `versionId`; immutability means the cache never goes stale. No `LISTEN/NOTIFY`, no Temporal signal, no worker restart.
- **Temporal registration:** the `dyn.run` activity is registered once at startup. Publishing dynamic nodes never touches Temporal's activity registry.

**Failure feedback for the agent:**
- **Publish-time** — structured `ParseError[]` with stage (`jsdoc-parse` / `signature-semantics` / `ts-check` / `allowlist`) + line + column + targeted field tags.
- **Activity-time** — seven typed error classes (`DynamicNodeDeletedError`, `DynamicNodeVersionNotFoundError`, `DynamicNodeTimeoutError`, `DynamicNodeStdoutTooLargeError`, `DynamicNodeRuntimeError`, `DynamicNodeOutputInvalidJsonError`, `DynamicNodeOutputShapeError`) → Phase 4's `NodeRunStatus.errorMessage` truncated at 2 KB.
- **Success output** — Phase 4's preview-cache surfaces the script's output JSON under the node on the canvas.

---

## 3. Locked decisions

### 3.1 Pre-resolved scope locks (from the design's §0 + the brainstorm round)

- **L1. Sandbox runtime = Deno subprocess.** TypeScript-native, secure-by-default permission model, fast cold start (~30–50 ms). One subprocess per invocation; no pooling in 6.0. Pyodide / isolated-vm / Windmill-process rejected — Deno aligns with the agent's strongest authoring language and ships fastest.
- **L2. Signature DSL = JSDoc header on the default-exported function.** Single source of truth. Parser produces an `ActivityCatalogEntry`-shaped record. YAML/JSON sidecar + TS Compiler API reflection rejected — JSDoc is single-file + agent-friendly + grep-derivable.
- **L3. Persistence = dedicated `DynamicNode` + `DynamicNodeVersion` Prisma pair.** Group-scoped. Mirrors Phase 2 Track 3 lineage/version semantics. Reuse-as-library + inline-on-workflow rejected — dynamic nodes have a distinct lifecycle and need per-group scoping.
- **L4. Caching default = `nonCacheable: true`.** Opt-in determinism via `@deterministic true` in the signature header. The cache key already varies by *resolved* `versionId`, so republishing automatically invalidates head-pinned consumer caches.
- **L5. Security policy = single global allowlist in 6.0.** New env var `DYNAMIC_NODE_ALLOW_NET` on the backend, comma-separated host patterns. `@allowNet` in the signature is intersected with the global list at publish time. Per-group policy deferred to 6.x.
- **L6. Phase 7 API anticipation = ship full CRUD in 6.0.** `POST` / `PUT` / `GET list` / `GET detail` / `DELETE` all in 6.0 so Phase 7's agent is a thin wire-up.
- **L7. Versioning model = independent per-lineage version sequence.** `DynamicNodeVersion.versionNumber` starts at 1 and increments per lineage. Mirrors Phase 2 Track 3.
- **L8. Failure observability = stderr + stack trace into Phase 4's `NodeRunStatus.errorMessage` truncated at 2 KB.** Streaming-stderr endpoint deferred to 6.x.

### 3.2 Brainstorm-round locks

- **L9. Script language = TypeScript-only.** `deno check` runs at publish time against ambient `ArtifactKind` types. JS-allowed rejected — TS-only gives the agent type errors as feedback and forces every dynamic node to declare its inputs/outputs in types as well as JSDoc.
- **L10. HTTPS module imports = allowed, gated by the global allowlist.** Scripts can `import { ... } from "https://deno.land/x/..."`. The same `--allow-net` allowlist gates both `fetch()` and module loading. Curated registry deferred.
- **L11. User-supplied secret injection = NOT in 6.0.** No `GroupSecret` table, no signature DSL `@secrets` tag, no UI. LandingAI / OpenAI / private-API keys remain owned by the static catalog (managed via backend `process.env`). Scripts needing user-supplied secrets cannot be authored as dynamic nodes in 6.0.
- **L12. Runtime input representation = ctx JSON shape verbatim.** A script declaring `document: Document` receives the ctx slot's JSON shape (e.g. `{ url, contentType }`); the script fetches bytes itself via `--allow-net` if needed. Backend byte pre-fetch rejected as too coupling.
- **L13. Smoke at publish time = validate-only.** Publish endpoint runs JSDoc parse + signature semantics + `deno check` + allowlist intersection. NO script execution at publish time. Smoke happens via Phase 4 Try after publish.
- **L14. Lineage identity = group-scoped slug from `@name`.** Unique per group via `@@unique([groupId, slug])`. Workflows reference `type: "dyn.<slug>"` + optional `dynamicNodeVersion?: N` (omitted = head).
- **L15. System-managed ambient env vars (NOT user secrets).** `dyn.run` injects four env vars into every Deno subprocess: `AI_DI_API_BASE_URL`, `AI_DI_API_KEY`, `AI_DI_GROUP_ID`, `AI_DI_WORKFLOW_RUN_ID`. `--allow-env` is restricted to exactly these four names. `--allow-net` for `AI_DI_API_BASE_URL`'s host is auto-granted. Scripts call back via the existing `x-api-key` mechanic.
- **L16. Editor surface = one Monaco component, two mounts.** In-situ modal accessible via right-click → "Edit script" on a dynamic node on canvas, AND a standalone `/dynamic-nodes` management page. Same `<DynamicNodeEditor>` component, two layouts (modal vs full-page).

### 3.3 New locks (this requirements pass)

- **L17. Shared package `parseDynamicNodeSignature(script: string): { entry, errors }`.** Lives in `packages/graph-workflow/src/dynamic-nodes/`. Pure function. Consumed by both backend publish + frontend signature-preview pane. Errors are structured: `{ stage: "jsdoc-parse" | "signature-semantics" | "ts-check" | "allowlist", message, line?, column?, tag?, unknownKind?, rejectedHost? }`.
- **L18. Recognized JSDoc tags.** `@workflow-node` (marker, required), `@name` (slug, required, `/^[a-z][a-z0-9-]*$/` max 64), `@description` (required), `@category` (default "Custom"), `@deterministic` (default `false`), `@inputs` (required), `@outputs` (required), `@parameters` (optional), `@allowNet` (optional default `[]`), `@timeoutMs` (optional default 60_000, cap 60_000 in 6.0), `@maxMemoryMB` (optional default 256, cap 256 in 6.0).
- **L19. Ambient `kinds` subpath export.** New `@ai-di/graph-workflow/kinds` export ships TS type aliases (`Document`, `Segment`, `OcrResult`, `Classification`, `OcrTable`, `OcrFields`, `ValidationResult`, `Reference`, `Artifact`, `SinglePageDocument`, `MultiPageDocument`) so dynamic-node scripts can `import type { Document } from "@ai-di/graph-workflow/kinds"`. Aliases are intentionally minimal (the kinds are runtime tags, not deep type-checked shapes) — backed by `Record<string, unknown>` with a kind brand.
- **L20. `DynamicNode` Prisma model.** Columns: `id (cuid)`, `groupId (string)`, `slug (string)`, `description (string?)`, `ownerUserId (string?)`, `headVersionId (string? @unique)`, `deletedAt (DateTime?)`, `createdAt (DateTime @default(now))`, `updatedAt (DateTime @updatedAt)`. `@@unique([groupId, slug])`, index on `(groupId, deletedAt)`. Maps to `dynamic_node` table.
- **L21. `DynamicNodeVersion` Prisma model.** Columns: `id (cuid)`, `dynamicNodeId (string)`, `versionNumber (int)`, `script (string @db.Text)`, `signature (Json)`, `allowNet (string[])`, `deterministic (boolean @default(false))`, `publishedByUserId (string?)`, `publishedAt (DateTime @default(now))`. `@@unique([dynamicNodeId, versionNumber])`. Relation `dynamicNode` with `onDelete: Cascade` (only used for hard-delete in 6.x). Maps to `dynamic_node_version` table.
- **L22. `DynamicNodeRepository` (`apps/backend-services/src/dynamic-nodes/`).** Methods: `createWithFirstVersion({ groupId, slug, script, signature, allowNet, deterministic, ownerUserId })`, `publishNewVersion({ groupId, slug, script, signature, allowNet, deterministic, publishedByUserId })`, `findBySlugForGroup(groupId, slug)`, `listForGroup(groupId, { includeDeleted? = false })`, `softDelete(groupId, slug)`. Real DB in unit tests per CLAUDE.md.
- **L23. `POST /api/dynamic-nodes`.** Body `CreateDynamicNodeRequestDto { script }`. On success: 201 `DynamicNodePublishResponseDto { slug, version: 1, signature, errors: [] }`. On JSDoc/semantics/ts-check/allowlist failure: 400 with `errors: ParseError[]`. On slug already exists for this group: 409.
- **L24. `PUT /api/dynamic-nodes/:slug`.** Body `UpdateDynamicNodeRequestDto { script }`. On success: 200 `DynamicNodePublishResponseDto { slug, version: N+1, signature, errors: [] }`. On parse failure: 400 with `errors`. On slug unknown / soft-deleted: 404. On new script's `@name` differing from path slug: 409.
- **L25. `GET /api/dynamic-nodes`.** No body. Returns 200 `DynamicNodeListResponseDto { items: DynamicNodeListItemDto[] }` where each item carries `{ slug, headVersion: { versionNumber, signature, publishedAt }, versionCount, usedInWorkflowCount }`. Excludes soft-deleted lineages. Sorted by slug ascending. `usedInWorkflowCount` is a simple LIKE count: `SELECT count(*) FROM workflow WHERE config::text LIKE '%"dyn.<slug>"%'`.
- **L26. `GET /api/dynamic-nodes/:slug`.** Query param `?version=N` (optional). Returns 200 `DynamicNodeDetailResponseDto { slug, headVersion, versions: DynamicNodeVersionDto[] }`. Each version carries `{ versionNumber, script, signature, allowNet, deterministic, publishedAt, publishedByUserId? }`. 404 on unknown / soft-deleted slug.
- **L27. `DELETE /api/dynamic-nodes/:slug`.** Soft-delete: sets `deletedAt = now()`. 200 `DynamicNodeDeletedResponseDto { slug, deletedAt }`. 404 on unknown slug. Idempotent (re-deleting an already-deleted lineage returns 200 with the existing `deletedAt`). The `Used in N workflows` count is computed and returned alongside for the frontend's confirm-delete modal.
- **L28. Publish-time validation pipeline.** Synchronous inside `POST` / `PUT`. Order: (1) JSDoc parse → if failure, return 400 with `[{ stage: "jsdoc-parse", line, column, message, tag? }]`. (2) Signature semantics — every declared kind exists in registry, `@name` matches `/^[a-z][a-z0-9-]*$/` max 64, `@parameters` shape coerces to JSON Schema 7. (3) TS check — `deno check <tempScript>` against the ambient kinds package. Parse Deno's stderr into structured `{ stage: "ts-check", line, column, message }`. (4) Allowlist intersection — every host in `@allowNet` must be in `DYNAMIC_NODE_ALLOW_NET` env. Otherwise `{ stage: "allowlist", rejectedHost, message }`. (5) Persist. No script execution at any stage.
- **L29. `GET /api/activity-catalog` extension.** Existing endpoint grows the response to include the calling group's non-deleted dynamic nodes (head versions only) after the static entries. Each dynamic entry carries `dynamicNodeSlug` + `dynamicNodeVersion` + `colorHint: "dyn"`. Static entries first; dynamic entries sorted by `signature.name` for determinism. Cache the merge per-group server-side with a 30 s TTL to absorb palette-render request bursts.
- **L30. `dyn.run` Temporal activity.** Single activity registered alongside static activities. Signature: `dynRun(args: { slug, versionId, parameters, inputCtx }): Promise<Record<string, unknown>>`. Wrapped by Phase 4's cache decorator — `configHash` includes `versionId` so cache rows are keyed per-version naturally. Activity is `nonCacheable: false` by default; the catalog entry's `nonCacheable` (derived from `@deterministic`) governs whether the wrapper short-circuits.
- **L31. Executor-side version resolution.** The graph executor (in `apps/temporal/src/workflows/graph-workflow.ts`, before invoking the activity proxy) sees `node.type.startsWith("dyn.")` → looks up `DynamicNode` by `(groupId, slug)` → throws `DynamicNodeDeletedError` if `deletedAt` set → resolves `versionId` from either `node.dynamicNodeVersion` (exact `DynamicNodeVersion`) or `headVersionId` → throws `DynamicNodeVersionNotFoundError` if pinned version unknown → throws `DynamicNodeHeadMissingError` if head is null (shouldn't happen in 6.0 since no per-version delete exists). Passes resolved `versionId` to the activity.
- **L32. Subprocess invocation flow.** Inside `dyn.run`: (1) Module cache lookup `Map<versionId, { tempPath, signature, allowNet, deterministic }>`. Cache miss → SELECT from `dynamic_node_version`, write script to `os.tmpdir()/ai-di-dyn/${versionId}.ts` (one per versionId, reused). LRU cap 256 entries. (2) Compute Deno flags: `--allow-net=<intersection of globalAllowlist and signature.allowNet, plus API_BASE_URL host>`, `--allow-env=AI_DI_API_BASE_URL,AI_DI_API_KEY,AI_DI_GROUP_ID,AI_DI_WORKFLOW_RUN_ID`, `--no-prompt`, `--v8-flags=--max-old-space-size=${signature.maxMemoryMB ?? 256}`. (3) Spawn via `node:child_process.spawn("deno", ...)` with the four ambient env vars. (4) Write `JSON.stringify({ inputCtx, parameters })\n` to stdin, end stdin. (5) Buffer stdout (cap 5 MB), stderr (uncapped during run). (6) AbortController on timeout (`signature.timeoutMs ?? 60_000`). (7) On timeout → SIGKILL, throw `DynamicNodeTimeoutError`. (8) On non-zero exit → throw `DynamicNodeRuntimeError { exitCode, stderrTail: last 2 KB }`. (9) On stdout-not-JSON → `DynamicNodeOutputInvalidJsonError`. (10) Structural output check (every declared output port key present + not `undefined`) → `DynamicNodeOutputShapeError` on miss. (11) Return parsed object as activity output.
- **L33. Auto-appended subprocess harness.** Worker prepends a small wrapper to the user-authored script when writing the temp file: imports the default export, reads one JSON line from stdin, calls the function with `(inputCtx, parameters)`, writes JSON to stdout. Users / agents do NOT write this harness. The wrapper is identical for every version; it's appended by the worker.
- **L34. Error class hierarchy.** New `apps/temporal/src/dynamic-nodes/errors.ts` exports 7 typed error classes: `DynamicNodeDeletedError`, `DynamicNodeVersionNotFoundError`, `DynamicNodeHeadMissingError`, `DynamicNodeTimeoutError`, `DynamicNodeStdoutTooLargeError`, `DynamicNodeRuntimeError`, `DynamicNodeOutputInvalidJsonError`, `DynamicNodeOutputShapeError`. Each renders into Phase 4's `NodeRunStatus.errorMessage` with a structured prefix (`[DynamicNodeRuntimeError] exitCode=1\n<stderrTail>`) + Phase 4 handles 2 KB truncation.
- **L35. `useActivityCatalog` hook upgrade.** Existing TanStack hook returns the merged catalog from L29. No new query key. Consumers (`ActivityPalette`, `NodeSettingsPanel`, the canvas's `getEntry` lookup, `binding-walk` validator's catalog adapter) all consume via the existing hook unchanged — they just see `dyn.*` entries in the response. Hot-reload after `POST` / `PUT` / `DELETE` via `queryClient.invalidateQueries(['activity-catalog'])`.
- **L36. `validateGraphConfig` adapter extension.** Existing catalog adapter (Phase 1B closeout) gains an async path that loads the workflow's group's dynamic nodes before binding-walk runs. The shared `validateBindings` walker (in `packages/graph-workflow/src/validator`) is unchanged — it already takes its catalog from the adapter.
- **L37. `DynamicNodeEditor` shared component.** Lives in `apps/frontend/src/features/workflow-builder/dynamic-nodes/`. Takes one prop `slug?: string` (undefined = create mode). Three-pane layout: code (60%, Monaco TS editor), signature preview (25%, parsed signature derived live via L17's shared parser — pure client-side, no round-trip), version history (15%, mirroring Phase 2 Track 3's `VersionHistoryDrawer` shape). Top bar with Publish / Delete buttons. Monaco is already a dep — no new install.
- **L38. Boilerplate on `/new`.** Editor in create mode prefills:

  ```ts
  import type { Document } from "@ai-di/graph-workflow/kinds";

  /**
   * @workflow-node
   * @name my-custom-node
   * @description TODO
   * @inputs { document: { kind: "Document", required: true } }
   * @outputs { result: { kind: "Artifact" } }
   */
  export default async function dynamicNode(
    ctx: { document: Document },
    params: {},
  ): Promise<{ result: unknown }> {
    return { result: ctx.document };
  }
  ```

- **L39. Live signature parse strip.** Below the Monaco editor: a status strip showing the *live* `parseDynamicNodeSignature` result. Green checkmark on success ("Signature OK: extract-tables-via-public-pdf — Document → OcrTable[]"). Red list of line-anchored errors on failure. Parse runs on debounce 300 ms post-keystroke, client-side from the shared package — no network call.
- **L40. Publish-time error rendering.** On 400 from `POST` / `PUT`, structured `errors[]` render in two places: (a) the status strip below the editor (compact list of `{stage} line N col M: message`), (b) Monaco markers via `editor.deltaDecorations` for entries that carry `line` + `column` (gutter squiggle + hover tooltip). Click an error → editor jumps to the line.
- **L41. Version history pane.** List newest-first: `v{n}` indigo badge + relative timestamp + optional blue "head" badge + "View" / "Revert" buttons. View opens a `<Modal size="80%">` with two `<JsonInput readOnly>` panels side-by-side (selected version on left, head on right) — no diff library, matches Phase 2 Track 3's D1 decision. Revert = PUT the old version's script as the new head (creates a new version with the old script content).
- **L42. In-situ mount via NodeContextMenu.** Right-click a dynamic-node instance on canvas (`type.startsWith("dyn.")`) → `NodeContextMenu` (Phase 1B Milestone J) grows an "Edit script" entry → opens `<Modal size="80%">` mounting `<DynamicNodeEditor slug={node.type.replace("dyn.", "")} />`. Modal closes after publish; canvas updates via the catalog hook's invalidation.
- **L43. Palette "+ New custom node" button.** New "Custom" section in `ActivityPalette` after "Flow Control" (mirrors Phase 8 Sources placement). Contains the "+ New custom node" button at top, followed by the group's dynamic-node entries (one per non-deleted lineage). Click the button → opens `<Modal size="80%">` with `<DynamicNodeEditor />` (create mode). On successful publish, the modal closes; new node is auto-dropped on the canvas at the next free position with its `type: "dyn.<slug>"`.
- **L44. Standalone management page routes.** Three new routes: `/dynamic-nodes` (list), `/dynamic-nodes/new` (create), `/dynamic-nodes/:slug` (edit). List view is a table with columns: slug (link), head version, last published (relative), version count, used in N workflows, actions. Edit / new views mount `<DynamicNodeEditor>` full-page (not a modal). Top-bar nav grows a "Dynamic nodes" link adjacent to the existing Workflows / Templates / Settings entries.
- **L45. Canvas DYN pill.** Dynamic-node renderer in `WorkflowEditorCanvas` adds a small "DYN" pill (Mantine `<Badge size="xs" variant="filled" color="grape">`) at the top-right of the node header. Port colors come from declared kinds via Phase 3's palette. Static activity nodes are unchanged.
- **L46. Settings panel version-pin UI.** `NodeSettingsPanel` for `dyn.*` nodes shows: header with the dynamic-node slug + description + DYN pill, version badge (`v3` indigo or `head` gray), "Change version" button opening a Mantine `<Select>` of available `versionNumber`s, "Edit script" button opening the in-situ modal. Standard `JsonSchemaForm` against the version's `signature.paramsSchema` for the parameters body.
- **L47. "Deleted dynamic node" affordance.** When the canvas loads a workflow whose config references `type: "dyn.<slug>"` for a slug absent from the merged catalog (because soft-deleted), the node renders with a red "Deleted" badge in place of the DYN pill, and the settings panel shows a red `<Alert>` "This dynamic node was deleted. Restore from the management page to use it." Try is disabled. The workflow remains saveable and will fail loudly at runtime via Phase 4's status streaming + `DynamicNodeDeletedError` → `NodeRunStatus.errorMessage`.
- **L48. Milestone slicing — A through G.** Seven milestones, one commit per milestone, matching Phase 4 / Phase 8 cadence.

---

## 4. Scope — what we will build

### 4.1 Shared package (`packages/graph-workflow`)

**New `src/dynamic-nodes/` directory:**

- `parse-signature.ts` — `parseDynamicNodeSignature(script): { entry, errors }` per L17.
- `types.ts` — `DynamicNodeSignature`, `DynamicNodeVersionRecord`, `ParseError` types.
- `parse-signature.test.ts` — parser unit tests including every error stage + happy path + edge cases.

**New `src/kinds/` directory:**

- `index.ts` — exports TS type aliases for every registered `ArtifactKind` per L19.
- Package.json `exports` map updated so consumers can `import type { Document } from "@ai-di/graph-workflow/kinds"`.

**Schema additions in `src/catalog/types.ts`:**

- Extend `ActivityCatalogEntry` with three optional Phase-6-only fields: `dynamicNodeSlug?: string`, `dynamicNodeVersion?: number`, `allowNet?: string[]`. Static-catalog consumers ignore them; Phase-6-aware code reads them.

**No validator changes** — the binding-walk walker already takes the catalog from an injectable adapter (L36 extends the adapter at the backend boundary, not the validator core).

### 4.2 Backend (`apps/backend-services`)

**Prisma migration:**

- New `DynamicNode` + `DynamicNodeVersion` models per L20, L21.
- Generated via `npm run db:generate` so the models land in both `apps/backend-services/src/` and `apps/temporal/src/`.

**New `src/dynamic-nodes/` directory:**

- `dynamic-node.repository.ts` — Prisma-backed repo per L22.
- `dynamic-node.repository.spec.ts` — real-DB unit tests per CLAUDE.md.
- `dynamic-nodes.controller.ts` — five endpoints per L23–L27 with full Swagger DTOs per CLAUDE.md.
- `dynamic-nodes.controller.spec.ts`.
- `dynamic-nodes.service.ts` — orchestrates parser + repo + validation pipeline per L28.
- `dynamic-nodes.service.spec.ts`.
- `dynamic-nodes.module.ts`.
- DTOs: `CreateDynamicNodeRequestDto`, `UpdateDynamicNodeRequestDto`, `DynamicNodePublishResponseDto`, `DynamicNodeListResponseDto`, `DynamicNodeListItemDto`, `DynamicNodeDetailResponseDto`, `DynamicNodeVersionDto`, `DynamicNodeDeletedResponseDto`, `ParseErrorDto`.

**Existing controller changes:**

- `ActivityCatalogController` (or wherever `GET /api/activity-catalog` lives today) extends the response per L29. Adds per-group merge + 30 s server-side cache. New `MergedCatalogEntryDto` (or extend the existing one) carries the Phase-6-only fields.

**`validateGraphConfig` adapter extension** per L36 — load group's dynamic nodes when validating a workflow.

**Env var:**

- New `DYNAMIC_NODE_ALLOW_NET` env var (comma-separated host patterns). Read at service startup; injected into the publish-time validation pipeline.

**Swagger / OpenAPI:**

- Five new endpoint definitions + one extended endpoint definition, each with full DTO classes per CLAUDE.md.

### 4.3 Temporal (`apps/temporal`)

**New `src/dynamic-nodes/` directory:**

- `dyn-run.activity.ts` — the `dyn.run` activity per L30 + L32.
- `dyn-run.activity.spec.ts` — tests against a real `deno` binary in CI.
- `errors.ts` — 7 typed error classes per L34.
- `subprocess-harness.ts` — the auto-appended wrapper text per L33 (string template, not user-callable code).
- `version-cache.ts` — in-process LRU `Map<versionId, ScriptCacheEntry>` with capacity 256.

**Workflow definition changes (`src/workflows/graph-workflow.ts`):**

- Executor's per-node-execute step detects `node.type.startsWith("dyn.")` and runs the resolution path per L31 before calling the activity proxy. Wraps in cache decorator from Phase 4 (no decorator changes needed — `versionId` becomes part of the parameters chain that's already hashed).

**Activity registration:**

- Register `dyn.run` once at worker startup alongside the existing static activities. The activity is registered with `nonCacheable: false` by default; the wrapper decides via the catalog entry's `nonCacheable` field (derived from `@deterministic` in the signature).

### 4.4 Frontend (`apps/frontend`)

**New `src/features/workflow-builder/dynamic-nodes/` directory:**

- `DynamicNodeEditor.tsx` — three-pane editor per L37.
- `CodePane.tsx` — Monaco wrapper + boilerplate (L38) + live signature parse strip (L39) + publish-time error markers (L40).
- `SignaturePreviewPane.tsx` — renders parsed signature card.
- `VersionHistoryPane.tsx` — version list + view/revert per L41.
- `useDynamicNode.ts` — TanStack hook wrapping `GET /api/dynamic-nodes/:slug`.
- `useDynamicNodeList.ts` — TanStack hook wrapping `GET /api/dynamic-nodes`.
- `useDynamicNodePublish.ts` — mutation hook for `POST` / `PUT`. On success: invalidate `['activity-catalog']` + `['dynamic-node', slug]` + `['dynamic-node-list']`.
- `useDynamicNodeDelete.ts` — mutation hook for `DELETE`.

**New `src/pages/dynamic-nodes/` directory:**

- `DynamicNodesListPage.tsx` — `/dynamic-nodes` route per L44 list view.
- `DynamicNodeNewPage.tsx` — `/dynamic-nodes/new` route, full-page editor.
- `DynamicNodeEditPage.tsx` — `/dynamic-nodes/:slug` route, full-page editor.

**Edits to existing files:**

- `App.tsx` — register the three new routes.
- `components/nav/TopBarNav.tsx` (or equivalent) — add "Dynamic nodes" link.
- `palette/ActivityPalette.tsx` — add "Custom" section per L43.
- `palette/usePaletteSections.ts` (or wherever sections are computed) — split merged catalog into static + dynamic for section rendering.
- `canvas/WorkflowEditorCanvas.tsx` — render the DYN pill on `dyn.*` nodes per L45 + render "Deleted" pill per L47.
- `canvas/NodeContextMenu.tsx` — add "Edit script" entry for `dyn.*` nodes per L42.
- `settings/NodeSettingsPanel.tsx` — render dynamic-node settings (version pin + Edit script button + JsonSchemaForm for params) per L46 + render deleted-Alert per L47.
- `settings/dynamic-node/DynamicNodeSettings.tsx` (new) — body component dispatched from `NodeSettingsPanel`.

**No new auth surface.** All endpoints inherit the existing `x-api-key` middleware + group-scoping.

### 4.5 Coexistence with prior phases

- **Phase 1B (catalog adoption).** The `validateGraphConfig` adapter that Phase 1B introduced is extended (L36) — same shape, just an async path for loading group dynamic nodes.
- **Phase 2 Track 3 (versioning).** Dynamic-node lineages mirror Phase 2 Track 3's library workflow lineage/version pattern. Version pin UI in the settings panel ports directly from `ChildWorkflowNodeSettings`'s library-version-pin affordance.
- **Phase 3 (typed I/O).** Dynamic-node signatures reference `ArtifactKind`s by name from the Phase 3 registry. Port colors on the canvas come from Phase 3's palette unchanged. Binding-walk participation falls out of L36.
- **Phase 4 (Try-in-place + cache).** `dyn.run` is wrapped by Phase 4's cache decorator. Resolved `versionId` becomes part of `configHash` naturally. Failure feedback flows into Phase 4's `NodeRunStatus.errorMessage`. Preview-cache surfaces script outputs under nodes on the canvas.
- **Phase 8 (sources).** Source nodes that feed dynamic-node consumers continue to work unchanged. No source-catalog changes needed.

---

## 5. Out of scope (explicitly deferred)

- **Python / Pyodide runtime** — 6.x. Engine abstraction designed-around but not built.
- **User-supplied secrets** — 6.x. No `GroupSecret` table, no signature DSL `@secrets` tag, no UI.
- **Per-group allowlist policy** — 6.x. 6.0 uses one global `DYNAMIC_NODE_ALLOW_NET` env var.
- **Streaming stderr / live console output** — 6.x. All output captured at process exit.
- **Per-role / per-author permissions** — 6.x. Any group member can publish in 6.0.
- **Hard-delete + cascade** — 6.x. Soft-delete only; existing references continue to resolve.
- **Cost / usage telemetry** — 6.x. No per-script invocation counters in 6.0.
- **Subprocess pooling** — 6.x. One Deno subprocess per invocation; cold start is fast enough.
- **TS Compiler API parameter reflection** — 6.x. Parameters declared in JSDoc `@parameters`.
- **Workflow auto-migration when a signature changes** — 6.x. Binding-walk catches mismatches at next save; user must rewire manually.
- **Module curation / private registry / per-script `import_map.json`** — 6.x.
- **"Try on a workflow" link from the editor** — 6.x. Not load-bearing for the agent loop.
- **Per-version delete** — 6.x. Only lineage-level soft-delete in 6.0.
- **US-053 (`borderColor` console warning)** — still open from Phase 1B; not bundled into Phase 6.
- **Pre-existing commit `b86741c7` (native-binary pin)** — lands as its own PR against develop; not bundled.
- **Pre-existing backend `graph-schema-validator` template-validation failure** — predates Phase 8; not blocking Phase 6.

---

## 6. Milestone breakdown — A through G

Per L48. One commit per milestone, matching Phase 4 / Phase 8 cadence. The user-stories writer should produce one umbrella `README.md` plus one `US-NNN-*.md` file per scenario, dependency-ordered. **Numbering continues from US-157** (Phase 4 closed at US-156).

### Milestone A — Shared package: signature DSL parser + types + ambient kinds (US-157 → US-161)

- `packages/graph-workflow/src/dynamic-nodes/parse-signature.ts` + tests (L17, L18).
- `packages/graph-workflow/src/dynamic-nodes/types.ts` — `DynamicNodeSignature`, `DynamicNodeVersionRecord`, `ParseError` types.
- `packages/graph-workflow/src/kinds/index.ts` + package.json `exports` update (L19).
- `ActivityCatalogEntry` extension with Phase-6-only optional fields (L17 / 4.1).
- Shared-package barrel exports the new modules.
- Package test-suite green.
- **Verification surface for Alex:** none — pure shared-package infra. Build the package + remind Alex to restart Vite (new runtime exports). Parser unit tests cover every error stage + happy path.

### Milestone B — Backend: Prisma model + repository + publish endpoints (US-162 → US-167)

- New Prisma migration adding `DynamicNode` + `DynamicNodeVersion` models per L20 / L21. Run `npm run db:generate`.
- Backend `dynamic-node.repository.ts` + tests (L22).
- Backend `dynamic-nodes.service.ts` orchestrating parser + repo + validation pipeline (L28). Uses the shared parser from Milestone A. Uses `deno check` via a subprocess — Deno must be installed on the backend host (document this as a Phase 6 ops dependency).
- Backend `dynamic-nodes.controller.ts` with 5 endpoints per L23 → L27, all with full Swagger DTOs.
- Backend tests green.
- **Verification surface for Alex:** API-only verification. With a published static catalog, run `curl -H "x-api-key: <key>" -X POST localhost:3002/api/dynamic-nodes -d '{"script": "<minimal valid script>"}'` and observe a successful publish. Verify 400 on a malformed signature returns line-anchored errors. Verify 409 on duplicate slug. End-to-end UI surface lights up in Milestone E + F.

### Milestone C — Temporal: dyn.run activity + Deno subprocess runner + executor resolution (US-168 → US-172)

- `apps/temporal/src/dynamic-nodes/errors.ts` — 7 typed error classes per L34.
- `apps/temporal/src/dynamic-nodes/version-cache.ts` — LRU per L32.
- `apps/temporal/src/dynamic-nodes/subprocess-harness.ts` — auto-appended harness template per L33.
- `apps/temporal/src/dynamic-nodes/dyn-run.activity.ts` — the `dyn.run` activity per L30 + L32. Includes ambient-env-var injection per L15.
- `apps/temporal/src/dynamic-nodes/dyn-run.activity.spec.ts` — real-Deno tests covering: success path, timeout, non-zero exit, stdout-too-large, invalid-JSON output, missing-output-port, and ambient-env-var injection. Spec assumes Deno is installed locally.
- Executor change in `apps/temporal/src/workflows/graph-workflow.ts` — version resolution per L31 before invoking activity proxy.
- Temporal + backend test-suites green.
- **Verification surface for Alex:** still API-only. Compose a workflow that references a Phase-6 dynamic node (manually via JSON for now; UI ships in Milestone F), POST to `/runs`, observe the activity execute through Deno + cache decorator. End-to-end UI surface lights up in Milestone F.

### Milestone D — Catalog merge + binding-walk extension (US-173 → US-175)

- Backend `GET /api/activity-catalog` extension per L29 — group-scoped merge + 30 s server-side cache.
- `validateGraphConfig` adapter extension per L36 — load group dynamic nodes before binding-walk runs.
- Frontend `useActivityCatalog` hook upgrade per L35 — same shape, just sees `dyn.*` entries automatically.
- Backend tests cover: merged response includes dynamic entries, soft-deleted lineages excluded, group-scoping isolates between groups, 30 s cache absorbs bursts.
- Binding-walk regression tests with dynamic-node nodes in fixtures (kind mismatches surface the same error wording as static).
- Backend + frontend test-suites green.
- **Verification surface for Alex:** API-only verification. Publish a dynamic node via Milestone B endpoints, then `curl /api/activity-catalog` and observe the new entry in the merged response. Verify cross-group isolation by switching API keys.

### Milestone E — Frontend: DynamicNodeEditor component (US-176 → US-179)

- New `apps/frontend/src/features/workflow-builder/dynamic-nodes/` directory per 4.4.
- `DynamicNodeEditor.tsx` shell per L37.
- `CodePane.tsx` — Monaco TS editor + boilerplate prefill (L38) + live signature parse strip (L39) + publish-time error markers (L40). Uses the shared package's parser client-side for the live strip.
- `SignaturePreviewPane.tsx` — parsed signature card.
- `VersionHistoryPane.tsx` — list newest-first + view/revert per L41.
- `useDynamicNode` / `useDynamicNodeList` / `useDynamicNodePublish` / `useDynamicNodeDelete` TanStack hooks.
- Frontend tests cover: editor mounts in create mode with boilerplate, live parse strip updates on debounced keystroke, publish triggers POST/PUT and surfaces errors as Monaco markers + status strip.
- Frontend test-suite green.
- **Verification surface for Alex:** still not click-and-play end-to-end. The editor component is testable in isolation but not yet mounted in any route. Milestone F mounts it.

### Milestone F — Frontend: in-situ mount + management page + canvas integration (US-180 → US-184)

- Three new routes: `/dynamic-nodes` (list), `/dynamic-nodes/new` (create), `/dynamic-nodes/:slug` (edit) per L44.
- `DynamicNodesListPage.tsx` with table per L44.
- `DynamicNodeNewPage.tsx` + `DynamicNodeEditPage.tsx` mount the editor full-page.
- Edit `App.tsx` to register the routes.
- Edit `components/nav/TopBarNav.tsx` (or equivalent) to add the "Dynamic nodes" link.
- Edit `palette/ActivityPalette.tsx` to add the "Custom" section per L43 with "+ New custom node" button + group dynamic-node entries.
- Edit `canvas/WorkflowEditorCanvas.tsx` to render the DYN pill per L45 + render the "Deleted" pill per L47.
- Edit `canvas/NodeContextMenu.tsx` to add "Edit script" entry for `dyn.*` nodes per L42.
- Edit `settings/NodeSettingsPanel.tsx` to dispatch to a new `DynamicNodeSettings` body component for `dyn.*` nodes per L46.
- New `settings/dynamic-node/DynamicNodeSettings.tsx` — version pin + Edit script button + JsonSchemaForm for params.
- Mantine modal mounts of the editor component from in-situ entry points (right-click "Edit script" + palette "+ New custom node").
- Frontend tests cover: list page renders entries, edit page mounts in-situ modal opens via right-click, "+ New custom node" opens create modal, canvas renders DYN pill for `dyn.*` nodes, settings panel renders version pin + Edit script button.
- Frontend test-suite green.
- **Verification surface for Alex:** first click-and-play milestone. Navigate to `/dynamic-nodes`, click "+ New", paste a TS script with JSDoc, click Publish → palette refreshes → drag the new node onto a canvas → right-click → Edit script → modal opens with the editor → edit + Publish v2 → palette + canvas update without restart. Click Try (Phase 4) on a workflow that uses the dynamic node — observe the script execute via Deno + status badges + preview widget.

### Milestone G — End-to-end Playwright verification (US-185)

End-to-end walkthrough per the design doc §13:

1. Set `DYNAMIC_NODE_ALLOW_NET` env var on the backend to include any hosts the test scripts need (start empty for the smoke test below).
2. Publish a minimal "uppercase-document-url" dynamic node via `curl POST /api/dynamic-nodes`:
   ```ts
   /**
    * @workflow-node
    * @name uppercase-document-url
    * @description Uppercases the document URL.
    * @inputs { document: { kind: "Document", required: true } }
    * @outputs { uppercased: { kind: "Artifact" } }
    */
   export default async function dynamicNode(ctx, params) {
     return { uppercased: { url: ctx.document.url.toUpperCase() } };
   }
   ```
   Verify 201 + `{ slug: "uppercase-document-url", version: 1, signature, errors: [] }`.
3. Verify `GET /api/activity-catalog` now includes `dyn.uppercase-document-url`.
4. Open the V2 editor. Verify the palette's "Custom" section shows `uppercase-document-url` with DYN pill.
5. Create a fixture workflow `WF_PH6_ID` with: `source.api → dyn.uppercase-document-url`. Wire the source's `document` output to the dynamic node's `document` input. Save.
6. Click Try (Phase 4). Paste body `{"documentUrl": "https://example.com/foo.pdf"}`. Click Try.
7. Verify the canvas comes alive — source.api status transitions to succeeded, then the dynamic node executes through Deno + status transitions blue → green; the preview under the dynamic node shows the uppercased URL.
8. Publish v2 changing "uppercase" to "reverse":
   ```ts
   return { uppercased: { url: ctx.document.url.split("").reverse().join("") } };
   ```
   PUT to `/api/dynamic-nodes/uppercase-document-url`. Verify 200 + `version: 2`.
9. Click Try again on the same workflow. Verify the dynamic node executes (cache miss — `configHash` changed because `versionId` changed) and the preview now shows the reversed URL.
10. Verify static source.api is a cache hit (purple status — Phase 4 cache decorator surface).
11. Right-click the dynamic node on canvas → click "Edit script" → modal opens with v2's script in Monaco. Make a syntactically invalid edit (e.g. delete a closing brace). Click Publish. Verify the status strip shows `[ts-check] line X col Y: ...` and Monaco gutter shows a squiggle on the broken line.
12. Fix the syntax + Publish. Verify success notification.
13. Navigate to `/dynamic-nodes`. Verify the list shows `uppercase-document-url` with `version count: 3, used in 1 workflows`.
14. Click the slug. Verify the edit page shows the full v3 script + signature preview + 3-row version history.
15. Click v1 in the version history → verify view modal opens with two side-by-side script blocks.
16. Click DELETE icon → verify confirm modal lists `Used in: <fixture workflow name>` → confirm → verify list refreshes without the slug.
17. Re-open the fixture workflow. Verify the dynamic node renders with a red "Deleted" badge and the settings panel shows the deleted-Alert. Try is disabled.
18. Verify zero `pageerror` events across the walkthrough.

Screenshots land under `/tmp/wb-phase6-verify/`.

- **Verification surface for Alex:** click-and-play closeout for Phase 6. Final ping for the phase.

---

## 7. Non-functional constraints

- **Backwards compatibility.** All schema additions are additive. `DynamicNode` + `DynamicNodeVersion` are new tables; `ActivityCatalogEntry.dynamicNodeSlug?` / `dynamicNodeVersion?` / `allowNet?` are optional. Existing workflows that reference only static activities continue to validate and run identically.
- **No "any" types** per [CLAUDE.md](../../CLAUDE.md). `ParseError`, `DynamicNodeSignature`, `DynamicNodeVersionRecord`, every DTO — fully typed. Script `inputCtx` and `parameters` are `Record<string, unknown>` (not `any`).
- **Full Swagger / OpenAPI documentation** per [CLAUDE.md](../../CLAUDE.md). 5 new endpoints + 1 extended endpoint, each with full DTO classes + specific decorators.
- **Backend tests when backend code changes** per [CLAUDE.md](../../CLAUDE.md). Each Milestone A → F backend deliverable ships matching tests. Temporal-side tests cover real-Deno subprocess invocation (Deno binary required in CI; document this).
- **Generic-system constraint** per [CLAUDE.md](../../CLAUDE.md). Dynamic nodes are user-authored arbitrary logic — they cannot be document-specific by definition. The runtime ABI (ctx JSON in / JSON out) carries no document-specific knowledge.
- **No premature abstraction.** No generic "script runner" interface; the `dyn.run` activity is one function. No "validation pipeline framework"; the publish-time pipeline is a sequence of five concrete steps.
- **Dev server cadence.** After Milestone A (new shared-package exports) and Milestone E (new frontend hooks consuming the merged catalog), explicitly ping Alex to restart Vite. Vite's pre-bundle goes stale otherwise.
- **No bundling unrelated commits.** Pre-existing `b86741c7` (native-binary pin) lands separately. US-053 (borderColor warning) stays blocked.
- **Deno binary required at runtime.** The Temporal worker process and the backend (for `deno check`) both depend on a `deno` binary on PATH. Document this in `apps/temporal/README.md` + `apps/backend-services/README.md` + the Dockerfile updates. Phase 6 Milestone G's walkthrough confirms Deno is available in the local dev environment.
- **Performance budget.** Script cold-start ~30–50 ms; activity-level overhead negligible compared to a 60 s wall-clock cap. Per-publish endpoint latency dominated by `deno check` (~200–500 ms locally) — well within reasonable publish-endpoint latency. Module-cache LRU at 256 entries keeps worker memory bounded.
- **Security posture.** `--allow-read` / `--allow-write` / `--allow-run` / `--allow-ffi` / `--allow-sys` NEVER granted. `--allow-env` restricted to exactly four ambient names per L15. `--allow-net` intersected against the global allowlist. `--no-prompt` ensures no interactive permission escalation. v8 memory cap via `--v8-flags`.

---

## 8. Roles & permissions

- **Dynamic-node author.** Any group member. Creates / edits / deletes dynamic nodes via either the in-situ modal or the management page. No new permissions in 6.0.
- **Workflow author.** Drops dynamic nodes onto the canvas, pins versions, edits parameters, clicks Try. All affordances inherited from Phases 1–4.
- **Workflow consumer / API client.** Continues calling `POST /api/workflows/:id/runs`. The Phase 6 layer is invisible to them — they get the same response shape. Their executions DO populate Phase 4 cache rows for dynamic-node outputs the same way as static.
- **Phase 7 agent (future, not built in 6.0).** Calls the same 5 endpoints + the merged catalog + the existing `/runs` and Phase 4 endpoints. Authenticates with a regular `x-api-key`. No special endpoint surface for the agent — the same API a human's editor uses.
- **System admin / observer.** Unaffected. `/queue` Processing monitor surfaces documents as before; future cross-link to the management page deferred.

No new auth surface. All endpoints inherit the existing `x-api-key` middleware + group-scoping (workflows / dynamic-nodes are both group-scoped resources).

---

## 9. Edge cases + error states

- **Publish with malformed JSDoc.** 400 with `errors: [{ stage: "jsdoc-parse", line, column, message, tag? }]`. Editor's status strip + Monaco markers render the errors.
- **Publish with unknown `kind` in `@inputs` / `@outputs`.** 400 with `errors: [{ stage: "signature-semantics", message: "Unknown kind: <kind>", tag: "@inputs" }]`. Editor renders inline.
- **Publish with `deno check` failure.** 400 with `errors: [{ stage: "ts-check", line, column, message }]` derived from Deno's stderr. Editor's gutter shows squiggles at the failing lines.
- **Publish with host outside global allowlist.** 400 with `errors: [{ stage: "allowlist", rejectedHost, message }]`. Editor's status strip lists the rejected hosts.
- **Publish with `@name` already used in the group.** `POST` returns 409 with `{ code: "DUPLICATE_SLUG", slug }`. The agent loop translates this into "use PUT to update existing".
- **PUT with `@name` differing from path slug.** 409 with `{ code: "NAME_MISMATCH", pathSlug, scriptName }`.
- **PUT on a soft-deleted slug.** 404 — soft-deleted lineages are invisible. Restore from list isn't in 6.0; the agent can `POST` a new lineage with the same slug if the soft-deleted row is hard-deleted manually (out of scope; ops escape hatch).
- **PUT on an unknown slug.** 404.
- **Script throws at runtime.** `DynamicNodeRuntimeError` → Phase 4 `NodeRunStatus.errorMessage` carries `[DynamicNodeRuntimeError] exitCode=1\n<stderrTail>`. Cache row NOT written. Subsequent Try with the same input re-executes.
- **Script exceeds 60 s timeout.** `DynamicNodeTimeoutError` → subprocess SIGKILL → `errorMessage` carries the timeout signal. Cache row NOT written.
- **Script writes > 5 MB to stdout.** `DynamicNodeStdoutTooLargeError` → subprocess SIGKILL → `errorMessage` indicates the cap was hit.
- **Script writes invalid JSON to stdout.** `DynamicNodeOutputInvalidJsonError` → `errorMessage` carries the first 500 chars of stdout for the agent to inspect.
- **Script returns an object missing a declared output port.** `DynamicNodeOutputShapeError` → `errorMessage` lists the missing port name(s).
- **Workflow references a `dyn.*` type whose lineage was soft-deleted.** Canvas: settings panel shows "Deleted" red badge per L47; Try disabled. If the user clicks Try anyway (or another caller hits `/runs`), the executor throws `DynamicNodeDeletedError` → Phase 4 `errorMessage` says "Dynamic node 'dyn.<slug>' is deleted." Workflow fails loudly.
- **Workflow pins `dynamicNodeVersion: N` for an N that's never existed.** `DynamicNodeVersionNotFoundError` → `errorMessage` says "Dynamic node 'dyn.<slug>' v<N> not found."
- **Worker module cache reaches 256 entries.** LRU evicts the least-recently-used. Next invocation of an evicted version re-loads from DB. Per-DB-row script content is small (< 100 KB typically); eviction cost is one SELECT.
- **Concurrent publishes of the same slug from two clients.** Database `@@unique([groupId, slug])` on `DynamicNode` prevents two lineages. For two PUTs against the same slug racing, both create new `DynamicNodeVersion` rows with consecutive `versionNumber`s; whichever transaction commits last wins `headVersionId`. The losing client's response still carries its own `version: N+1` value.
- **`@allowNet` shrinks between v1 and v2.** v2's narrower allowlist applies to v2 only. Workflows pinned to v1 continue using v1's broader allowlist. Hot-reload works automatically.
- **Soft-deleted lineage's `headVersionId` still references a `DynamicNodeVersion` row.** That's by design — workflows pinned to a specific version of a soft-deleted lineage continue to resolve. Soft-delete only affects discoverability (catalog merge, palette, list).
- **TanStack catalog refetch races with publish.** TanStack's `invalidateQueries` triggers a refetch; if the refetch arrives before the publish commits (very fast), the next refetch resolves it. The publish mutation's `onSuccess` invalidation guarantees eventual consistency.
- **`deno check` not installed on backend host.** Publish endpoint returns 500 with `{ code: "DENO_UNAVAILABLE" }` after detecting the missing binary at service startup. Documented in the README updates per §7.
- **Subprocess inherits unintended env vars from worker process.** The activity's `spawn` call uses `env: { ...ambientEnvVars }` (NOT `env: { ...process.env, ...ambientEnvVars }`), guaranteeing only the four ambient names are present in the subprocess environment.
- **Network blip during a long-running script.** Script's `fetch` calls surface normal `TypeError: Failed to fetch` to the script. If the script doesn't catch, the subprocess exits non-zero → `DynamicNodeRuntimeError`. Caller (agent or user) retries.
- **Workflow saved with a `dyn.*` node whose lineage was deleted between save and run.** Save succeeds (binding-walk uses merged catalog at the time of save). Subsequent run fails with `DynamicNodeDeletedError`. The user / agent must rewire.

---

## 10. Open follow-ups

These are filed but explicitly **not blocking Phase 6.0 landing**:

- **Phase 6.x — Python / Pyodide runtime.** Second runner dispatched by signature `@runtime python`. Brings Python's data-science ecosystem to the authoring surface.
- **Phase 6.x — user-supplied secrets.** `GroupSecret` table + CRUD + signature `@secrets [{ groupSecretName, asEnv }]`. Unlocks LandingAI / OpenAI / private-API scripts.
- **Phase 6.x — module curation.** Backend-resolved short-name registry (e.g. `@ai-di/openai`) so popular clients don't need full HTTPS URLs in every script.
- **Phase 6.x — streaming stderr.** New endpoint proxying live stderr from running invocations for long scripts whose progress matters in real time.
- **Phase 6.x — per-group allowlist.** Replace the global `DYNAMIC_NODE_ALLOW_NET` env var with a per-group config managed via UI.
- **Phase 6.x — hard-delete + cascade.** Purge `DynamicNode` rows; surface "your workflow references a removed dynamic node" errors and offer a one-click rewire.
- **Phase 6.x — cost / usage telemetry.** Per-script invocation counters + runtime histograms + per-group cost attribution.
- **Phase 6.x — TS Compiler API parameter reflection.** Derive `@parameters` schema from TS types instead of JSDoc declarations. Filed in case JSDoc friction emerges.
- **Phase 6.x — subprocess pooling.** Reuse Deno processes across invocations for tighter latency. Only needed if cold start becomes a bottleneck.
- **Phase 6.x — workflow auto-migration on signature change.** When a head-pinned dynamic node's signature changes ports, offer a rewire suggestion in the binding-walk error.
- **Phase 6.x — per-version delete + restore.** Hide a specific version (e.g. v2 introduced a regression) without bumping head.
- **Phase 7 — the AI workflow builder agent.** Wires Claude Agent SDK to a tool allowlist covering: `GET /api/activity-catalog`, `GET /api/workflows`, `POST/PUT/GET/DELETE /api/dynamic-nodes`, `POST /api/workflows`, `POST /api/workflows/:id/runs`, `GET /api/workflows/:id/runs/:runId/node-statuses`, `GET /api/workflows/:id/preview-cache`. Most exist by end of Phase 6. Phase 7 ships the `.claude/agents/workflow-builder.md` system prompt + chat surface in the editor.
- **Cross-group dynamic-node sharing** — "marketplace" of community-published dynamic nodes. Far future; gated on security + provenance review.

---

## 11. References

- Authoritative design: [DYNAMIC_NODES_DESIGN.md](../../docs-md/workflow-builder/DYNAMIC_NODES_DESIGN.md).
- Plan: [IMPLEMENTATION_PLAN.md §5 Phase 6](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md).
- Predecessor: [TRY_IN_PLACE_DESIGN.md](../../docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md) (Phase 4 — cache + status streaming + preview-cache).
- Predecessor: [DOCUMENT_SOURCES_DESIGN.md](../../docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md) (Phase 8 — sources).
- Predecessor: [TYPED_IO_DESIGN.md](../../docs-md/workflow-builder/TYPED_IO_DESIGN.md) (Phase 3 — `ArtifactKind` registry referenced by signatures).
- I/O model decision: [WORKFLOW_NODE_IO_MODEL_DECISION.md](../../docs-md/workflow-builder/WORKFLOW_NODE_IO_MODEL_DECISION.md).
- Session handoff: [SESSION_HANDOFF.md](../../docs-md/workflow-builder/SESSION_HANDOFF.md).
- Phase 4 closure (predecessor pattern reference): [feature-docs/20260531-workflow-builder-phase4-try-in-place/](../20260531-workflow-builder-phase4-try-in-place/).
- Phase 2 Track 3 closure (versioning UI precedent for VersionHistoryPane patterns): [feature-docs/20260528-workflow-builder-phase2-versioning-ui/](../20260528-workflow-builder-phase2-versioning-ui/).
- User vision threads: [NOTES.md §1.6](../../docs-md/workflow-builder/NOTES.md#16-dynamic-nodes-windmill-inspiration) (Windmill inspiration), [NOTES.md §1.7](../../docs-md/workflow-builder/NOTES.md#17-ai-built-workflows--feedback-loop) (AI feedback loop).
