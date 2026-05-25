# Dynamic Nodes — Design

**Status:** Decided. Phase 6 of the post-1A plan. Analog of [TRY_IN_PLACE_DESIGN.md](TRY_IN_PLACE_DESIGN.md) (Phase 4) and [DOCUMENT_SOURCES_DESIGN.md](DOCUMENT_SOURCES_DESIGN.md) (Phase 8).
**Last updated:** 2026-05-25.
**Why now:** Phase 4 (Try-in-place + cache + per-node previews) is closed; Phase 3 (typed I/O) supplies the artifact kinds dynamic-node signatures reference; Phase 8 (source nodes) supplies the trigger surface dynamic nodes plug into. With the cache layer, status streaming, preview widgets, and Try affordance all in place, the substrate is ready for user-authored (and Phase 7 agent-authored) custom nodes.

This document commits to concrete decisions for the runtime sandbox, the signature DSL, persistence, the API surface, the worker activity, the frontend surfaces, and the failure-feedback path that an AI agent will use to revise its scripts. **Phase 6 is reframed around the AI feedback loop:** dynamic nodes are first an API a programmatic client (Phase 7's agent) calls, and second a UI surface humans use. Both consumers share the same backend and the same in-app editor component.

Engine semantics are unchanged from [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) (Model A — single in / single out + blackboard ctx). Phase 6 is layered as: a new Prisma lineage/version pair, a single shared `dyn.run` Temporal activity that wraps a Deno subprocess sandbox, an extension to the existing activity catalog that merges dynamic entries at request time, and an in-app code editor mounted in two surfaces.

---

## 0. Phase 6.0 scope (locked)

This design covers two implementation tiers:

- **Phase 6.0 (this milestone):**
  - Single shared `dyn.run` Temporal activity that delegates to a new **`deno-runner` HTTP sidecar service** (its own Docker image + OpenShift deployment) — NOT a host-installed Deno binary
  - `deno-runner` exposes `POST /execute` + `POST /check` + `GET /health` on a private cluster network; the backend's publish-time validation pipeline calls `/check`, the worker's `dyn.run` calls `/execute`
  - **TypeScript-only** publish surface. `deno check` at publish time against ambient `ArtifactKind` types
  - **HTTPS module imports allowed**, gated by a global allowlist of `--allow-net` hosts
  - **No user-supplied secret injection** (LandingAI / OpenAI / etc. keys deferred to 6.x)
  - **System-managed ambient env vars** injected by `dyn.run` so scripts can call back into the running backend via the existing `x-api-key` mechanic
  - JSDoc-header **signature DSL**, parsed in `@ai-di/graph-workflow` shared package, produces an `ActivityCatalogEntry`-shaped record
  - Dedicated **`DynamicNode` + `DynamicNodeVersion`** Prisma pair, **group-scoped**, mirroring Phase 2 Track 3 lineage/version semantics
  - Lineage identity is the signature's `name` slug — unique per group, immutable per lineage
  - **Caching default** `nonCacheable: true` with `@deterministic true` opt-in. Cache keys vary by *resolved* version, so republishing invalidates head-pinned consumers automatically
  - Five backend endpoints (`POST` / `PUT` / `GET list` / `GET detail` / `DELETE`) with full Swagger per CLAUDE.md
  - `GET /api/activity-catalog` extended to merge static catalog with group-scoped dynamic nodes
  - **Shared Monaco-based editor component** mounted as (a) right-click → modal inside the workflow editor (in-situ), and (b) standalone `/dynamic-nodes` management page
  - Palette + canvas + settings panel + binding-walk validator + Run drawer all consume the merged catalog
  - "DYN" pill on dynamic-node canvas + palette entries to visually distinguish from static activities
  - Stderr + stack trace flow into Phase 4's `NodeRunStatus.errorMessage`, truncated at 2KB
  - **No worker / frontend / Temporal restart** required on publish — `versionId`-keyed worker cache is naturally stale-free; frontend uses TanStack invalidation
- **Phase 6.x (deferred):**
  - Python / Pyodide runtime (engine abstraction not designed in 6.0)
  - User-supplied secret injection (new `GroupSecret` table or similar)
  - Per-group allowlist policy (6.0 uses a single global allowlist)
  - Streaming-stderr endpoint for live console output during long runs
  - Per-role permissions (6.0: any group member can publish)
  - Hard-delete + cascade through consuming workflows
  - Cost / usage telemetry per dynamic node
  - Module curation / private registry / per-script `import_map.json`
  - TS Compiler API reflection of parameter types (6.0: JSDoc-declared parameters only)

Every section below calls out which tier it applies to. Hooks for 6.x land in 6.0 only when they have no dead-code cost.

---

## 1. The dynamic-node execution model

A **`deno-runner` HTTP sidecar service** (own Docker image, own OpenShift deployment, own network policy) executes every dynamic node. The Temporal worker's `dyn.run` activity is a thin HTTP client; it does NOT spawn Deno subprocesses on the worker host.

```
Workflow executor encounters a node whose `type` starts with "dyn."
  ↓
Executor resolves dyn.<slug> → DynamicNode by (groupId, slug)
  ↓
Executor resolves version:
  - if node.dynamicNodeVersion is set → exact DynamicNodeVersion
  - else → DynamicNode.headVersionId (must point to a non-deleted lineage)
  ↓
Executor passes versionId (immutable) into dyn.run as an activity argument
  ↓
Phase 4 cache decorator computes configHash including versionId → cache hit/miss
  ↓
On cache miss:
  - Worker loads { script, signature, allowNet, deterministic } from DB,
    keyed in-process by versionId
  - Worker POSTs to deno-runner:9090/execute with
    { script, inputCtx, parameters, allowNet, ambientEnv, timeoutMs, maxMemoryMB }
  - deno-runner writes the script to a temp file, spawns
    `deno run --allow-net=<intersected hosts> --no-prompt
     --v8-flags=--max-old-space-size=<cap> <tempPath>` inside the container,
    pipes the input on stdin, reads stdout/stderr
  - deno-runner returns { stdout, stderr, exitCode, durationMs, timedOut }
  ↓
On script throw / non-zero exit / timed-out:
  - Worker maps the runner response to a typed DynamicNode*Error
  - stderr (last 2KB) + exit code flow into NodeRunStatus.errorMessage (Phase 4)
  - Cache row NOT written
  ↓
On runner success + output shape matches signature.outputs:
  - Worker parses runner's stdout as JSON, validates port shape
  - Result returned as activity output
  - Cache row written (unless nonCacheable=true)
  - Phase 4 preview-cache surfaces the output under the node on canvas
```

**Why a sidecar HTTP service, not host-installed Deno.** Three reasons:
1. **Isolation.** The worker process never has Deno on its filesystem or PATH; a script that escaped the sandbox could not pivot to the worker's resources because they're in a different container.
2. **Operations.** No ops dependency on host Deno binary — the runner ships as a versioned Docker image alongside backend/temporal in the same kustomize stack. Updates are a deployment, not a host upgrade.
3. **Resource boundary.** The runner container has its own cgroup memory/CPU limits — a runaway script can be killed at the container boundary, not just the subprocess.

**Why one shared Temporal activity, not one per dynamic node.** Temporal activities are typed by string name. Registering a new activity per dynamic node would require a worker restart on every publish — production-unstable. A single `dyn.run` activity dispatches on `(slug, versionId)` arguments; workers stay running across publishes. Worker-side "hot reload" is purely about an in-process script cache + the runner's per-versionId temp file.

**Subprocess lifecycle.** One subprocess per invocation INSIDE the runner container. Deno cold start ≈ 30–50 ms; fast enough that 6.0 does not need subprocess pooling. The runner stays up across invocations.

**Resource ceilings.** Per-invocation hard caps in 6.0: 60 s wall clock, 256 MB v8 heap (`--v8-flags=--max-old-space-size=256`), 5 MB max stdout. Signature DSL can request `timeoutMs` or `maxMemoryMB` within these ceilings (cannot raise them). The runner container has its own broader memory cap (e.g. 512 MB) so multiple in-flight invocations don't compete catastrophically. Per-group ceilings are 6.x.

**Permission flags.** The backend derives Deno flags from `(globalAllowlist) ∩ (signature.allowNet)` and passes the resolved list to the runner. A host listed in `signature.allowNet` but not in `globalAllowlist` is rejected at publish time. `--allow-read`, `--allow-write`, `--allow-env`, `--allow-run`, `--allow-ffi`, `--allow-sys` are NEVER granted in 6.0. `--allow-env` is the one exception — the runner grants `--allow-env=AI_DI_API_BASE_URL,AI_DI_API_KEY,AI_DI_GROUP_ID,AI_DI_WORKFLOW_RUN_ID` (the four ambient vars from §3, and only those) so scripts can read them.

**Why temp files inside the runner, not in-process eval.** Deno's `--allow-*` flags only apply to spawned subprocesses; in-process script evaluation bypasses the permission model. The runner uses temp files under its own ephemeral filesystem.

## 1.5 The `deno-runner` sidecar service

A new service in the kustomize stack at `deployments/openshift/kustomize/base/deno-runner/` (deployment + service + networkpolicy + kustomization) + a local equivalent in `deployments/local/docker-compose.deno.yml`.

**Image.** Custom image built from `denoland/deno:alpine-latest` with a small Deno-authored HTTP server at `apps/deno-runner/src/main.ts`. Exposed on port 9090. Non-root user.

**HTTP API:**

| Verb + Path | Purpose | Body | Response |
|---|---|---|---|
| `POST /execute` | Run a script against an input ctx | `{ script, inputCtx, parameters, allowNet, ambientEnv, timeoutMs, maxMemoryMB }` | `{ stdout: string, stderr: string, exitCode: number, durationMs: number, timedOut: boolean }` |
| `POST /check` | Type-check a script via `deno check` | `{ script }` | `{ ok: boolean, errors: { line, column, message }[] }` |
| `GET /health` | Liveness probe | — | `{ ok: true, denoVersion: string }` |

**Auth.** None in 6.0. The service is bound to the internal cluster network (`networkpolicy.yml` permits ingress only from `backend-services` and `temporal-worker` pods). Locally in docker-compose the service exposes port 9090 to `localhost` only.

**Container-level resource caps.** `resources.limits.memory: 512Mi`, `resources.limits.cpu: 500m` — enough headroom for ~2 concurrent invocations at the 256 MB per-invocation cap. Horizontal scaling deferred (6.x).

**Hot path.** `POST /execute` writes the script to `/tmp/<requestId>.ts`, spawns `Deno.Command("deno", { args: ["run", ...permFlags, tempPath], env: ambientEnv, stdin: "piped", stdout: "piped", stderr: "piped" })`, pipes `{ inputCtx, parameters }` to stdin, reads stdout (cap 5 MB), reads stderr, enforces timeout via `AbortController`. Returns the structured response. Deletes the temp file after the subprocess exits.

**No persistent state.** The runner is stateless across requests. The Temporal worker's in-process `versionCache` (US-169) caches `{ versionId → script }` on the worker side, sending the script body in every `/execute` call. (Alternative: cache scripts in the runner. Defer to 6.x — the worker-side cache plus stateless runner is simpler and works fine at current scale.)

**Image pinning.** The runner image is tagged per-release alongside backend + temporal. Same tag-promotion flow.

---

## 2. The signature DSL

A JSDoc header on the default-exported async function. Single source of truth — the script and its catalog entry live in one file, which is what the agent's `script: string` tool argument carries.

**Example:**

```ts
// dynamic-node.ts
import type { Document, OcrTable } from "@ai-di/graph-workflow/kinds";

/**
 * @workflow-node
 * @name extract-tables-via-public-pdf
 * @description Extracts tables from a publicly-hosted PDF via Tabula's free endpoint.
 * @category Custom
 * @deterministic false
 * @inputs {
 *   document: { kind: "Document", required: true, description: "Source PDF" }
 * }
 * @outputs {
 *   tables: { kind: "OcrTable[]", description: "Extracted tables" }
 * }
 * @parameters {
 *   minConfidence: { type: "number", default: 0.5, min: 0, max: 1, description: "Drop tables below this confidence" }
 * }
 * @allowNet ["tabula.example.com"]
 */
export default async function dynamicNode(
  ctx: { document: Document },
  params: { minConfidence: number },
): Promise<{ tables: OcrTable[] }> {
  const res = await fetch(`https://tabula.example.com/extract?url=${ctx.document.url}`);
  const { tables } = await res.json();
  return { tables: tables.filter((t: OcrTable) => t.confidence >= params.minConfidence) };
}
```

### 2.1 Recognized tags

| Tag | Purpose | Required |
|---|---|---|
| `@workflow-node` | Marker so the parser knows this JSDoc block declares a dynamic node | Yes |
| `@name` | Slug for the lineage. `[a-z0-9-]+`, unique per group, immutable per lineage | Yes |
| `@description` | Human-readable description; surfaces in palette tooltip + signature preview | Yes |
| `@category` | Display category in the palette. Free string; "Custom" is the default convention | No (default: "Custom") |
| `@deterministic` | `true` opts INTO Phase 4 caching. Default `false` (nonCacheable: true). | No (default: `false`) |
| `@inputs` | JSON-ish object mapping port name → `{ kind, required?, description? }`. `kind` must be a registered `ArtifactKind` (or `<Kind>[]`) | Yes |
| `@outputs` | JSON-ish object mapping port name → `{ kind, description? }`. Same `kind` rules as inputs. | Yes |
| `@parameters` | JSON-ish object mapping param name → `{ type, default?, min?, max?, enum?, description? }`. `type` is `string` / `number` / `boolean` / `enum`. | No (default: no parameters) |
| `@allowNet` | JSON array of host patterns the script needs `fetch` access to. Must be a subset of the global allowlist. | No (default: `[]`) |
| `@timeoutMs` | Per-invocation timeout override, capped at 60 000 in 6.0 | No (default: 60 000) |
| `@maxMemoryMB` | Per-invocation memory override, capped at 256 in 6.0 | No (default: 256) |

### 2.2 Parser output

The publish endpoint calls `parseDynamicNodeSignature(script: string)`, which produces:

```ts
{
  entry: {
    type: "dyn.extract-tables-via-public-pdf",     // "dyn." prefix added by parser
    category: "Custom",
    description: "...",
    iconHint: "code",                              // default for dyn.*; not user-set in 6.0
    colorHint: "dyn",                              // distinct hue from static catalog
    nonCacheable: true,                            // derived from `@deterministic false`
    paramsSchema: { /* JSON Schema 7 built from @parameters */ },
    inputs: [{ name: "document", kind: "Document", required: true, description: "Source PDF" }],
    outputs: [{ name: "tables", kind: "OcrTable[]", description: "Extracted tables" }],
    // Phase-6-specific metadata that rides on the catalog entry shape:
    dynamicNodeSlug: "extract-tables-via-public-pdf",
    dynamicNodeVersion: 3,                          // resolved at the publish endpoint
    allowNet: ["tabula.example.com"],
  },
  errors: []                                        // [] on success; populated on failure
}
```

`entry` is the same `ActivityCatalogEntry` shape the static catalog uses, with three Phase-6-only fields (`dynamicNodeSlug`, `dynamicNodeVersion`, `allowNet`) added. Static catalog consumers ignore the extras; Phase-6-aware code (canvas badge, version-pin UI, executor) reads them.

`errors` is a structured array — never free text — so the agent can target specific lines / tags / kinds in its revision:

```ts
type ParseError = {
  stage: "jsdoc-parse" | "signature-semantics" | "ts-check" | "allowlist";
  message: string;
  line?: number;
  column?: number;
  tag?: string;          // e.g. "@inputs" — for signature-semantics errors
  unknownKind?: string;  // when a declared kind isn't in the registry
  rejectedHost?: string; // when allowlist intersection fails
};
```

### 2.3 Kinds reference

`@inputs` / `@outputs` declarations use `ArtifactKind` names from Phase 3's registry as strings (`"Document"`, `"Segment"`, `"OcrResult"`, `"Classification"`, `"OcrTable"`, etc., plus `<Kind>[]` for arrays).

`@ai-di/graph-workflow` exports an ambient `.d.ts` (or named `kinds` subpath) so the script's TS code can `import type { Document } from "@ai-di/graph-workflow/kinds"`. The parser cross-checks that the function's typed parameters match the JSDoc-declared input kinds (best-effort, via the TS Compiler API at publish time — for 6.0 a soft warning, not a hard error, since exact TS-AST-to-kind unification is non-trivial).

### 2.4 Why JSDoc, not a separate file

Single file = single concern. The agent's tool call carries one `script: string`. The signature is grep-derivable from the source. Mistakes surface as line-anchored `ParseError`s — clean feedback for the agent's revision loop. TS Compiler API reflection of parameters / returns is filed for 6.x if JSDoc friction becomes a problem.

### 2.5 Parser lives in `packages/graph-workflow`

Pure function. Same package consumed by both backend (publish) and frontend (live signature preview pane in the editor). No backend round-trip needed for the preview.

---

## 3. Ambient context (system-managed env vars)

Distinct from Q3's deferred user-supplied secrets, the `dyn.run` activity injects four ambient env vars into every Deno subprocess. These are server-controlled, generated per-invocation, and let scripts call back into the running backend via the existing `x-api-key` mechanic.

| Env var | Value | Purpose |
|---|---|---|
| `AI_DI_API_BASE_URL` | Backend's base URL (e.g. `http://localhost:3002`) | What URL to call back at |
| `AI_DI_API_KEY` | A valid `x-api-key` value scoped to the current group | Authentication for callback requests |
| `AI_DI_GROUP_ID` | The current group's id | Lets scripts disambiguate when multiple groups share a script (rare; useful for telemetry) |
| `AI_DI_WORKFLOW_RUN_ID` | The current Temporal run id | Lets scripts correlate logs / write back run-scoped state if your API ever exposes such an endpoint |

Example script using these:

```ts
const baseUrl = Deno.env.get("AI_DI_API_BASE_URL")!;
const apiKey  = Deno.env.get("AI_DI_API_KEY")!;
const libs = await fetch(`${baseUrl}/api/workflows?kind=library`, {
  headers: { "x-api-key": apiKey },
}).then(r => r.json());
```

**Network access for callbacks.** The activity automatically grants `--allow-net` for `AI_DI_API_BASE_URL`'s host — no need to add it to either the global allowlist or `@allowNet`. The signature's `@allowNet` is for *additional* outbound hosts.

**Key provenance.** In 6.0, `AI_DI_API_KEY` is the same `x-api-key` value already used for the calling request — passed through verbatim. Per-invocation short-lived keys are 6.x if needed.

**Not for user secrets.** Scripts cannot get arbitrary env vars. `--allow-env` is granted only for the four ambient names listed above; everything else is denied.

---

## 4. Persistence

Two new Prisma models in `apps/backend-services/prisma/schema.prisma` (also written to `apps/temporal/src/` via the `npm run db:generate` helper — see CLAUDE.md):

```prisma
model DynamicNode {
  id                String                @id @default(cuid())
  groupId           String                @map("group_id")
  slug              String
  description       String?
  ownerUserId       String?               @map("owner_user_id")
  headVersionId     String?               @unique @map("head_version_id")
  deletedAt         DateTime?             @map("deleted_at")
  createdAt         DateTime              @default(now()) @map("created_at")
  updatedAt         DateTime              @updatedAt @map("updated_at")

  headVersion       DynamicNodeVersion?   @relation("HeadVersion", fields: [headVersionId], references: [id])
  versions          DynamicNodeVersion[]  @relation("Versions")

  @@unique([groupId, slug])
  @@index([groupId, deletedAt])
  @@map("dynamic_node")
}

model DynamicNodeVersion {
  id                 String        @id @default(cuid())
  dynamicNodeId      String        @map("dynamic_node_id")
  versionNumber      Int           @map("version_number")
  script             String        @db.Text
  signature          Json                                    // parser output's `entry` field
  allowNet           String[]      @map("allow_net")
  deterministic      Boolean       @default(false)
  publishedByUserId  String?       @map("published_by_user_id")
  publishedAt        DateTime      @default(now()) @map("published_at")

  dynamicNode        DynamicNode   @relation("Versions", fields: [dynamicNodeId], references: [id], onDelete: Cascade)
  headOf             DynamicNode?  @relation("HeadVersion")

  @@unique([dynamicNodeId, versionNumber])
  @@map("dynamic_node_version")
}
```

**Mirrors Phase 2 Track 3.** Lineage = `DynamicNode`; each publish = a new immutable `DynamicNodeVersion`; `headVersionId` is the movable pointer to the latest. Old workflows pinned to v1 keep resolving after v2 publishes. Soft-delete sets `deletedAt`; existing references continue to resolve until the row is hard-deleted (6.x).

**Workflow reference shape.** A workflow node referencing a dynamic node looks like:

```ts
{
  id: "extract1",
  type: "dyn.extract-tables-via-public-pdf",
  parameters: { minConfidence: 0.7 },
  dynamicNodeVersion?: 3,   // undefined = head
}
```

Matches Phase 2 Track 3's `workflowRef.version?` pattern. The Track 3 UI (head badge / pinned-vN badge / "Change version" button) ports to the dynamic-node settings panel.

**Migration.** Single new migration `add_dynamic_nodes` creating both tables. No data migration — Phase 6 introduces a new abstraction; no existing data to convert.

**Repository class.** New `DynamicNodeRepository` in `apps/backend-services/src/repositories/`. Methods: `createWithFirstVersion`, `publishNewVersion`, `findBySlugForGroup`, `listForGroup`, `softDelete`. Each method is unit-tested against a real DB per CLAUDE.md (no mocks).

---

## 5. Backend API surface

Five endpoints under `/api/dynamic-nodes/*` + one extension to `/api/activity-catalog`. All endpoints have full Swagger per CLAUDE.md — dedicated request + response DTO classes with `@ApiProperty` decorators, specific response decorators (`@ApiOkResponse`, `@ApiBadRequestResponse`, `@ApiNotFoundResponse`, etc.), and `type` fields pointing at the DTO classes. Generic `@ApiResponse` is not used.

| Verb + Path | Purpose | Body | Response |
|---|---|---|---|
| `POST /api/dynamic-nodes` | Create new lineage + v1 | `CreateDynamicNodeRequestDto { script }` | 201 `DynamicNodePublishResponseDto { slug, version: 1, signature, errors: [] }` / 400 with `errors: ParseError[]` / 409 if slug already exists in this group |
| `PUT /api/dynamic-nodes/:slug` | Publish new version (vN+1) | `UpdateDynamicNodeRequestDto { script }` | 200 `DynamicNodePublishResponseDto { slug, version: N+1, signature, errors: [] }` / 400 with `errors: ParseError[]` / 404 if slug unknown / 409 if new script's `@name` differs from path slug |
| `GET /api/dynamic-nodes` | List group's non-deleted dynamic nodes | — | 200 `DynamicNodeListResponseDto { items: DynamicNodeListItemDto[] }` |
| `GET /api/dynamic-nodes/:slug` | Read lineage + version history | `?version=N` (optional) | 200 `DynamicNodeDetailResponseDto { slug, headVersion, versions }` / 404 if unknown |
| `DELETE /api/dynamic-nodes/:slug` | Soft-delete the lineage | — | 200 `DynamicNodeDeletedResponseDto { slug, deletedAt }` / 404 if unknown |

Plus:

| Verb + Path | Purpose | Change |
|---|---|---|
| `GET /api/activity-catalog` | Merged catalog | Response shape unchanged; merge adds the group's non-deleted dynamic nodes (head versions only) after the static entries. Each dynamic entry carries `dynamicNodeSlug` + `dynamicNodeVersion` + `colorHint: "dyn"` so the frontend can detect + render them distinctly. |

### 5.1 Publish-time validation pipeline

Runs synchronously inside `POST` / `PUT`:

1. **JSDoc parse.** `parseDynamicNodeSignature(script)` (shared package). On failure: 400 with `errors: [{ stage: "jsdoc-parse", line, column, message, tag? }]`.
2. **Signature semantics.** Every declared `kind` exists in the `ArtifactKind` registry (or is `<RegisteredKind>[]`); `@name` is a valid slug (`/^[a-z][a-z0-9-]*$/`, max 64 chars); `@parameters` shape coerces to JSON Schema 7. On failure: 400 with structured `signature-semantics` errors.
3. **TS check.** `deno check <tempScript>` against ambient `ArtifactKind` types. On failure: 400 with `errors: [{ stage: "ts-check", line, column, message }]` derived from Deno's stderr (already line-anchored).
4. **Allowlist intersection.** Every host in `@allowNet` must be in the global allowlist (`DYNAMIC_NODE_ALLOW_NET` env var on the backend, comma-separated). On failure: 400 with `errors: [{ stage: "allowlist", rejectedHost, message }]`.
5. **Persist.** Create `DynamicNodeVersion` row, move `headVersionId` to point at it.

**Validate-only.** No script execution at publish time (Q5: validate-only). The smoke is the agent's responsibility, via a normal Phase 4 Try after the script is published.

**Why all errors are structured.** The agent's feedback loop reads `errors: [{ stage, line, column, message }]` and revises the specific line / tag / kind that failed. Free-text errors are harder for an LLM to target.

### 5.2 Auth + scoping

All endpoints reuse the existing `x-api-key` middleware + group-scoping. Any group member can publish in 6.0. Per-role permissions deferred. The `groupId` on every `DynamicNode` is set from the calling key's group; cross-group reads return 404 (not 403, to avoid leaking existence).

### 5.3 Catalog merge endpoint behavior

`GET /api/activity-catalog`:
- Loads the static `ACTIVITY_CATALOG` from the shared package
- Loads `DynamicNode`s for the calling group where `deletedAt IS NULL` and `headVersionId IS NOT NULL`, joining `DynamicNodeVersion` for `signature`
- Returns `{ entries: [...static, ...dynamicEntries] }`
- Static entries are first; dynamic entries follow, sorted by `signature.name` for deterministic ordering

---

## 6. The `dyn.run` Temporal activity

Single new activity registered alongside the existing static activities in `apps/temporal/src/activities/`. Wrapped by Phase 4's cache decorator like every other catalog activity.

**Signature:**

```ts
async function dynRun(args: {
  slug: string;
  versionId: string;                            // resolved by the executor, NOT looked up here
  parameters: Record<string, unknown>;
  inputCtx: Record<string, unknown>;
}): Promise<Record<string, unknown>>;
```

### 6.1 Version resolution happens in the executor, not the activity

The graph executor (in `packages/graph-workflow` or its caller in the temporal app, wherever the node-iteration loop lives) sees a node with `type.startsWith("dyn.")`. Before invoking `dyn.run`, it:

1. Looks up the `DynamicNode` by `(groupId, slug)`. If `deletedAt` is set, throws `DynamicNodeDeletedError`.
2. Resolves the `versionId`:
   - If `node.dynamicNodeVersion` is set → `DynamicNodeVersion.findFirst({ dynamicNodeId, versionNumber })`. If not found, throws `DynamicNodeVersionNotFoundError`.
   - Else → uses `DynamicNode.headVersionId`. If null (lineage exists but every version got deleted — shouldn't happen in 6.0 since we don't allow per-version delete), throws `DynamicNodeHeadMissingError`.
3. Passes the resolved `versionId` to `dyn.run`.

The resolved `versionId` is included in Phase 4's `configHash` (via the normal activity parameter chain), so cache rows are keyed per-version automatically.

**Hot-reload semantics that fall out of this design.**
- Workflow uses head reference → executor resolves the latest `versionId` every execution → republishing automatically picks up the new version on the next run, no signal needed.
- Workflow pinned to v1 → executor resolves the same `versionId` every execution → cache hit, no DB read needed.
- The worker's in-process script cache is keyed by immutable `versionId` → never goes stale → no LISTEN/NOTIFY, no signal, no restart.

### 6.2 Subprocess invocation

Inside the activity body:

1. **Module cache lookup.** In-process `Map<versionId, { tempPath, signature, allowNet, deterministic }>`. On miss: `SELECT script, signature, allow_net, deterministic FROM dynamic_node_version WHERE id = ?`; write the script to a temp file (one per `versionId`, under `os.tmpdir()/ai-di-dyn/${versionId}.ts`); populate the cache. Temp files are reused across invocations of the same version.
2. **Compute permission flags.**
   - `--allow-net=<intersection of globalAllowlist and signature.allowNet, plus the API_BASE_URL host>`
   - `--allow-env=AI_DI_API_BASE_URL,AI_DI_API_KEY,AI_DI_GROUP_ID,AI_DI_WORKFLOW_RUN_ID`
   - `--no-prompt`
   - `--v8-flags=--max-old-space-size=${signature.maxMemoryMB ?? 256}`
3. **Spawn.** `node:child_process.spawn("deno", ["run", ...permFlags, tempPath], { env: { ...ambientEnvVars }, stdio: ["pipe", "pipe", "pipe"] })`.
4. **Write input.** Single JSON line on stdin: `JSON.stringify({ inputCtx, parameters })\n`. End stdin.
5. **Read output.** Buffer stdout (cap 5 MB; abort with `DynamicNodeStdoutTooLargeError` if exceeded). Buffer stderr (no cap during run; truncated to last 2 KB on failure).
6. **Timeout.** `AbortController` with `signature.timeoutMs ?? 60_000`. On timeout: SIGKILL the subprocess; throw `DynamicNodeTimeoutError`.
7. **Non-zero exit.** Parse last 2 KB of stderr; throw `DynamicNodeRuntimeError { exitCode, stderrTail }`.
8. **Parse stdout.** `JSON.parse(stdoutBuffer)`. On failure: throw `DynamicNodeOutputInvalidJsonError`.
9. **Structural output check.** For each port in `signature.outputs`, the parsed object must have that key and the value must not be `undefined`. Type-shape validation (e.g. an `OcrResult` actually has the OcrResult fields) is best-effort — the binding-walk validator catches shape issues at edit time; runtime enforces only key presence.
10. **Return** the parsed object as the activity output.

All error types map to Phase 4's `NodeRunStatus.errorMessage`. Phase 4's existing truncation handles the 2 KB cap.

### 6.3 Script contract

The script's default export is `async function(ctx: Ctx, params: Params): Promise<Outputs>`. The activity wraps the actual invocation in a tiny harness that the temp file embeds (or that's appended by the worker when writing the temp file):

```ts
// auto-appended by the worker, NOT in the user-authored script
import script from "./dynamic-node.ts";
const input = JSON.parse(await new Response(Deno.stdin.readable).text());
const out = await script(input.inputCtx, input.parameters);
await Deno.stdout.write(new TextEncoder().encode(JSON.stringify(out)));
```

Users / agents do not write this harness. They write the JSDoc-headed default export and nothing else.

---

## 7. Activity catalog merge + binding-walk

### 7.1 Catalog merge

Today the static catalog is a synchronous in-memory map. The merged catalog adds an async retrieval layer:

- **Backend.** `GET /api/activity-catalog` builds `{ entries: [...staticCatalog, ...groupDynamicEntries] }` per §5.3. Backend callers that today call `getActivityCatalogEntry(type)` synchronously gain an async sibling `getActivityCatalogEntryAsync(type, { groupId })` that consults both layers; the sync helper continues to work for static-only callers.
- **Frontend.** The existing `useActivityCatalog` TanStack hook becomes the merge layer — it just hits `GET /api/activity-catalog` and returns the merged result. Consumers (palette, canvas, settings panel, binding-walk validator) treat the merged catalog uniformly. Phase 6-specific UI (DYN pill, "Edit script" right-click) is gated on `entry.dynamicNodeSlug` being present.

### 7.2 Binding-walk

Phase 3's binding-walk validator (the typed-I/O save-time check that produces errors like `"Input port \`segment\` (Segment) on node \`classify1\` reads from ctx key \`pages\`, written by node \`split1\` (Segment[]) — Segment[] not assignable to Segment"`) walks the graph at save time and looks up each node's port kinds from the catalog. For dynamic nodes, it must consume the merged catalog so the kinds declared in the signature DSL participate in compatibility checks the same way static-catalog kinds do.

Concretely: the backend's `validateGraphConfig` already accepts an injectable catalog adapter (Phase 1B closeout). It gains a path that, when the workflow belongs to a group, also loads the group's dynamic nodes and includes them in the adapter before the binding-walk runs. The shared `validateBindings` walker (in `packages/graph-workflow/src/validator`) is unchanged — it already takes its catalog from the adapter.

### 7.3 Version-pin semantics in binding-walk

When a workflow is saved with `node.dynamicNodeVersion = N`, the validator looks up *that* version's signature, not head's. Republishing a dynamic node does not retroactively re-validate workflows pinned to old versions — and that's correct behavior, because those workflows continue to execute against the pinned version. The validator catches signature drift only when the head-resolving workflow is re-saved.

---

## 8. Hot-reload without restarts

Restating cleanly: **no restart of any process is required when a dynamic node is published, updated, or soft-deleted.**

### 8.1 Frontend (TanStack invalidation)

- Editor's Publish action → `useDynamicNodeMutation` (`POST` or `PUT`) → on success, `queryClient.invalidateQueries(['activity-catalog'])` and `queryClient.invalidateQueries(['dynamic-node', slug])`
- `useActivityCatalog` refetches → palette + canvas + settings panel + binding-walk validator re-derive
- No page reload, no Vite restart. Standard TanStack pattern.

The signature-preview pane inside the editor is purely client-side (uses the shared-package parser); it updates as the user types without any network call. Saving is the only network round-trip.

### 8.2 Worker (versionId-keyed cache, no signal)

The graph executor resolves head → an immutable `versionId` on every workflow execution. The activity's in-process script cache is keyed by `versionId`. Because `versionId`s are immutable:
- Publishing a new version assigns a new `versionId` → the next execution that resolves head sees the new id → cache miss → fresh load. The OLD `versionId`'s cache entry stays valid (pinned consumers continue to hit it). The cache is bounded by a simple LRU cap of 256 entries (ships in 6.0).
- Soft-deleting a lineage causes the executor's resolution step to throw `DynamicNodeDeletedError` *before* `dyn.run` is even invoked. The activity-level cache is bypassed entirely.

No `LISTEN/NOTIFY`, no Temporal signal, no worker restart.

### 8.3 Temporal registration

The single `dyn.run` activity is registered once at worker startup. Adding, updating, or deleting dynamic nodes never touches Temporal's activity registration. Worker processes stay up across publishes.

---

## 9. Frontend surfaces — one editor, two mounts

### 9.1 Shared `DynamicNodeEditor` component

Lives in `apps/frontend/src/features/workflow-builder/dynamic-nodes/`. Three-pane layout, takes one prop `slug?: string` (undefined = create mode):

- **Code pane (~60% width).** Monaco TS editor. Monaco is already a dep (no new install). Boilerplate prefilled in create mode:

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

  Below the editor: a status strip showing the *live* `parseDynamicNodeSignature` result (client-side, from the shared package) — green checkmark if the JSDoc parses, red error list with line numbers if not.

- **Signature preview pane (~25%).** Renders the parsed signature: name, description, category, deterministic flag, inputs (port name, kind with the Phase 3 color dot, required, description), outputs (same), parameters (rendered as the same `JsonSchemaForm` the canvas settings panel uses, in read-only mode), `@allowNet` chips. A "DYN" pill in the corner.

- **Version history pane (~15%).** Same shape as Phase 2 Track 3's `VersionHistoryDrawer`: list of versions newest-first with publish timestamps; click → diff modal (side-by-side script blocks via two `<JsonInput readOnly>` panels — no diff library, matches Track 3 D1 decision). Head badge on the latest. Revert ("PUT script of vN as new head version") is a single-click action with a confirm modal.

- **Top bar:**
  - **Publish** — `POST` (create mode) or `PUT` (edit mode). On 400, render structured `errors` inline with line anchors (Monaco markers via `editor.deltaDecorations`). On 200, green Mantine notification + version history refreshes + catalog invalidates.
  - **Delete** — soft-delete via `DELETE`. Confirm modal lists consuming workflows ("Used in: WF_A, WF_B, ..."). Disabled if there are consumers in create mode (no slug yet).
  - **Try on a workflow** (edit mode only) — links to a fresh workflow with the node pre-dropped, for ad-hoc Try without authoring a workflow. Deferred to 6.x (not load-bearing for the agent loop).

### 9.2 In-situ mount (primary path for the agent + canvas tweaks)

- **Right-click a dynamic-node instance on the canvas** → `NodeContextMenu` (existing Phase 1B component) grows an **"Edit script"** entry for `dyn.*` nodes → opens a `<Modal size="80%">` mounting `<DynamicNodeEditor slug={node.type.replace("dyn.", "")} />`.
- **Create from palette.** The palette's "Custom" section grows a **"+ New custom node"** button. Click → modal with `<DynamicNodeEditor />` (create mode). On successful publish, the new node is auto-dropped on the canvas at the next free position.

The modal closes after publish; the workflow editor stays put with the new/updated node visible.

### 9.3 Standalone management page (`/dynamic-nodes`)

- **List view.** Table of the group's non-deleted dynamic nodes:
  - Slug (link)
  - Head version number
  - Last published (relative time)
  - Total version count
  - Used in N workflows (computed from a simple `SELECT count(*) FROM workflow WHERE config::text LIKE '%"dyn.<slug>"%'` — accurate enough for a count column; perfectly indexed for 6.x)
  - Actions: Edit / Delete
- **Edit view.** `<DynamicNodeEditor slug={params.slug} />` mounted full-page (not a modal). Same component; the layout responds to viewport.
- **New view.** `<DynamicNodeEditor />` mounted full-page.
- **Routes added:** `/dynamic-nodes`, `/dynamic-nodes/new`, `/dynamic-nodes/:slug`.

### 9.4 Palette + canvas

- **Palette.** New "Custom" section after "Flow Control" (mirrors Phase 8 Sources section placement). Each dynamic node renders as a normal palette entry with a small "DYN" pill on the right and the description as the hover tooltip. The "+ New custom node" button anchors the section.
- **Canvas.** Dynamic nodes use the existing `ActivityNodeRenderer` — port colors come from declared kinds (same Phase 3 palette). A small "DYN" pill on the node header distinguishes them from static activities.
- **Settings panel.** Standard `JsonSchemaForm` against `signature.paramsSchema`. Version-pin UI ports from Phase 2 Track 3: a "Pinned to vN" / "Head" badge with a "Change version" button that opens a Mantine `Select` of available versions. "Edit script" button opens the in-situ modal.

### 9.5 Settings panel — "deleted dynamic node" affordance

Detection mechanism: the workflow's saved config references `type: "dyn.<slug>"`, but the merged catalog (which excludes soft-deleted lineages — see §7.1) does not list that slug. When the canvas opens a workflow and finds a `dyn.*` node whose type is absent from the merged catalog, it renders the node with a red "deleted" badge in the settings panel and disables Try. The workflow can still be saved; running it will fail loudly with `DynamicNodeDeletedError` via Phase 4's status streaming.

---

## 10. Failure observability + the agent feedback loop

The agent's loop closes by reading errors that are structured enough to revise from. Three error surfaces, in order:

1. **Publish-time `ParseError[]`** (§5.1). Stage tags (`jsdoc-parse` / `signature-semantics` / `ts-check` / `allowlist`), line + column where available, the failing tag or kind or host. The agent's revision step targets the specific line. No execution happens at this stage — the script never reaches Deno.
2. **Activity-time errors** (§6.2). Five typed error classes:
   - `DynamicNodeDeletedError` — the lineage was soft-deleted between save and run
   - `DynamicNodeVersionNotFoundError` — pinned version doesn't exist
   - `DynamicNodeTimeoutError` — wall-clock cap hit
   - `DynamicNodeStdoutTooLargeError` — output exceeded 5 MB
   - `DynamicNodeRuntimeError` — non-zero exit; carries last 2 KB of stderr + exit code
   - `DynamicNodeOutputInvalidJsonError` — stdout wasn't parseable JSON
   - `DynamicNodeOutputShapeError` — declared output port absent from stdout JSON

   Each renders into Phase 4's `NodeRunStatus.errorMessage` as a structured prefix + the 2 KB stderr tail. The agent reads `errorMessage`, classifies by prefix, and revises accordingly.
3. **Phase 4 preview-cache outputs.** On success, the script's output JSON is stored in the preview cache. The agent reads `GET /api/workflows/:id/preview-cache?nodeId=...` and inspects the actual result against expectations. If "result wrong but no error" → revise the script's logic; if "missing field" → revise the signature; if "type mismatch downstream" → revise either side.

**No streaming.** A single `errorMessage` field per node-run, polled at Phase 4's 1–2 s cadence. Streaming-stderr endpoints are 6.x.

---

## 11. Out of scope for Phase 6.0

- **Python / Pyodide runtime.** Engine abstraction designed-around but not built. Adding Python is a 6.x story: a second runner alongside Deno, dispatched by file extension or signature tag.
- **User-supplied secrets.** No `GroupSecret` table, no UI for it, no signature DSL for it. LandingAI / OpenAI / etc. keys remain in the static catalog's `process.env` (managed by ops). Scripts that need user-supplied secrets can't be authored as dynamic nodes in 6.0.
- **Per-group allowlist.** One global `DYNAMIC_NODE_ALLOW_NET` env var on the backend. Per-group policy (e.g., group A can call LandingAI, group B can't) is 6.x.
- **Streaming stderr / console output.** All output captured at process exit; no live view during the run. The agent's loop is fine with this — it gets the full stderr at completion via `errorMessage`.
- **Per-role / per-author permissions.** Any group member can publish. Per-role gating is 6.x.
- **Hard-delete + cascade.** Soft-delete only; existing references still resolve. Hard-delete (purge the rows, surface "your workflow references a removed dynamic node" errors) is 6.x.
- **Cost / usage telemetry.** No per-script invocation counters, runtime histograms, or cost attribution in 6.0.
- **TS Compiler API parameter reflection.** Parameters are declared in JSDoc `@parameters`; the TS function signature is checked for shape consistency but not used as the parameter-schema source.
- **Subprocess pooling.** One Deno subprocess per invocation. Cold start is fast enough that pooling is unwarranted in 6.0.
- **Workflow auto-migration when a dynamic-node signature changes.** A workflow head-pinned to a dynamic node whose new version changes its output port kinds will fail binding-walk on the next save; the user must rewire. No auto-migration in 6.0.

---

## 12. Open after this lands

- **Phase 6.x — user-supplied secrets.** A `GroupSecret` table + CRUD + signature DSL `@secrets [{ groupSecretName, asEnv }]` lets scripts use LandingAI / OpenAI / private APIs without backend redeploys.
- **Phase 6.x — Python / Pyodide.** Adds a second runner dispatched by signature `@runtime python`. Brings Python's data-science ecosystem (pandas, numpy) to the agent's authoring surface. ~5 s cold start; subprocess pooling may become necessary.
- **Phase 6.x — module curation.** A backend-resolved short-name registry (`import { OpenAI } from "@ai-di/openai"`) so popular clients don't need full HTTPS URLs + version pins in every script.
- **Phase 6.x — streaming stderr.** A new endpoint that proxies live stderr from running invocations to the canvas, for long-running scripts whose progress matters in real time.
- **Phase 7 — the AI agent.** Wires Claude Agent SDK to a tool allowlist covering: `GET /api/activity-catalog`, `GET /api/workflows`, `POST /api/dynamic-nodes`, `PUT /api/dynamic-nodes/:slug`, `POST /api/workflows`, `POST /api/workflows/:id/runs`, `GET /api/workflows/:id/runs/:runId/node-statuses`, `GET /api/workflows/:id/preview-cache`. Most of these already exist; `POST` and `PUT /api/dynamic-nodes` are the Phase 6 additions. Phase 7's `.claude/agents/workflow-builder.md` system prompt teaches the loop laid out in §10.

---

## 13. Reading order for implementation

Suggested milestone slicing (analog of Phase 4's A → G):

- **Milestone A — Shared package: signature DSL parser + types + ambient kinds.** `parseDynamicNodeSignature`, `ParseError` types, `DynamicNodeSignature` / `DynamicNodeVersionRecord` types, ambient `kinds.d.ts` export. All pure functions, unit-tested.
- **Milestone B — Backend: Prisma model + repository + publish endpoints.** Migration; `DynamicNodeRepository`; `POST` + `PUT` + `GET list` + `GET detail` + `DELETE` endpoints with full Swagger; publish-time validation pipeline. Backend tests against real DB.
- **Milestone C — Temporal: `dyn.run` activity + Deno subprocess runner + executor resolution.** Wraps Phase 4's cache decorator; the four ambient env vars; the version-resolution layer in the executor. Activity tests use a real Deno binary in CI.
- **Milestone D — Catalog merge + binding-walk.** `GET /api/activity-catalog` extension; `useActivityCatalog` consumes merged; `validateGraphConfig` adapter loads group dynamic nodes; binding-walk regression tests with dynamic-node nodes in fixtures.
- **Milestone E — Frontend: `DynamicNodeEditor` component.** Monaco editor + signature preview + version history pane. Pure component, tested in isolation.
- **Milestone F — Frontend: in-situ mount + management page.** Right-click `Edit script` modal; "+ New custom node" palette button; `/dynamic-nodes` routes (list + edit + new); palette "Custom" section; canvas DYN pill; settings panel version-pin UI.
- **Milestone G — End-to-end verification via Playwright.** Walkthrough: publish a small "uppercase-document-url" script via `curl POST /api/dynamic-nodes`; drag the new node onto a canvas with a source.api source; wire it; save; click Try; paste body with `documentUrl=foo.pdf`; verify the node runs and the preview shows the uppercased URL. Then publish v2 changing "uppercase" to "reverse"; verify palette hot-reload; verify a new Try produces the reversed output (cache invalidation via configHash version change).

Per-milestone commit message convention matches Phase 4 / Phase 8:

```
feat(workflow-builder): <summary> (Phase 6 — Milestone <X> — <story refs>)
```

---

## 14. Companion documents

- [IMPLEMENTATION_PLAN.md §5 Phase 6](IMPLEMENTATION_PLAN.md) — original phase stub this design supersedes
- [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md) — Phase 3 artifact taxonomy; the `ArtifactKind` registry dynamic-node signatures reference
- [TRY_IN_PLACE_DESIGN.md](TRY_IN_PLACE_DESIGN.md) — Phase 4 design; the cache + status streaming + preview-cache surfaces dynamic-node executions feed into
- [DOCUMENT_SOURCES_DESIGN.md](DOCUMENT_SOURCES_DESIGN.md) — Phase 8 design; source nodes that feed dynamic-node consumers
- [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) — the engine's single-in/single-out + blackboard model that dynamic nodes layer on top of
- [SESSION_HANDOFF.md](SESSION_HANDOFF.md) — current branch state at Phase 6 kickoff
