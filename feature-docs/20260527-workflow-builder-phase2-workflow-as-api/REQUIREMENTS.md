# Phase 2 Track 2 — Workflow-as-API surfacing

**Workflow-builder Phase 2, second of three tracks.** Surfaces the
"run this workflow" affordance that every workflow gets in
production: a documented trigger URL, a derived JSON Schema for the
expected input payload, a sample `curl`, auth notes, and a
paste-JSON-and-run dev affordance. Plus a `kind` filter on the
workflow list page so library workflows are reachable beyond the
childWorkflow picker modal.

## Background

[IMPLEMENTATION_PLAN.md §5 Phase 2](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md#phase-2--library-workflows--workflow-as-api--versioning)
splits Phase 2 into three independent tracks:

1. **Track 1 — Library workflow management.** Closed 2026-05-26.
   See `../20260526-workflow-builder-phase2-library-workflows/`.
2. **Track 2 — Workflow-as-API surfacing.** (This document.)
3. **Track 3 — Versioning UI.** Filed for the next milestone.

Track 3 is explicitly out of scope here. It becomes the next
feature-doc.

## Locked decisions (made by the user via session-start questions)

These were resolved with the user at session kickoff. Each decision
is recorded with its rationale so a future session can re-litigate if
circumstances change.

### D1 — Trigger URL shape: `POST /api/workflows/:id/runs`

The endpoint takes the `WorkflowLineage.id` UUID (not the slug). Plural
`runs` is consistent with REST resource-creation conventions and
mirrors the existing `GET /api/workflows/:id/versions` sub-resource
naming.

**Why:** Slugs are unique per `group_id`, not globally — a slug-keyed
endpoint would force every API caller to thread the group through the
URL. UUIDs are self-contained. The `:id/runs` collection also lines up
with a future `GET /api/workflows/:id/runs` (run history) endpoint
without churn.

### D2 — Input schema for *regular* workflows derives from ctx entries marked `isInput: true`

The user has two flavors of workflow:

- **Library workflows** already declare `metadata.inputs[]`
  (`LibraryPortDescriptor[]` with `{ label, path, type }`). Track 2
  reuses these directly.
- **Regular workflows** today have no input-port declaration. We
  extend `CtxDeclaration` in `@ai-di/graph-workflow` with an optional
  `isInput?: boolean` flag. The workflow settings drawer grows an
  "Input" checkbox per ctx row. Only ctx declarations marked
  `isInput: true` appear in the derived input schema.

**Why this over alternatives:**

- "Surface all ctx declarations as inputs" — too noisy; internal /
  computed ctx values would pollute the input schema.
- "Walk entry-node port bindings" — too implicit; won't surface ctx
  fields the user wants exposed as inputs but doesn't yet reference
  from a binding.

The flag is purely declarative (no runtime enforcement, mirroring how
the validator treats `description`).

### D3 — Library navigation: `kind` filter on the existing `/workflows` list page

A `SegmentedControl` filter chip (All / Workflows / Libraries) at the
top of the existing list page. The default tab is `Workflows`
(matches current behavior — libraries hidden); `Libraries` shows only
libraries; `All` shows both.

**Why:** Single page, easy to discover, no nav-item churn. The
filter chip surfaces library workflows for the first time outside
the childWorkflow picker modal. Rows already link to
`/workflows/:id/edit-v2` (no row changes needed).

### D4 — The Run panel actually starts Temporal runs

The paste-JSON-and-run textarea + Run button POSTs to
`/api/workflows/:id/runs` and triggers a real Temporal workflow
execution. Returns the `workflowExecutionId` so the user can find it
in the Temporal Web UI / logs.

**Why:** Half-affordances ("here's the URL but you can't actually
call it from here") create exactly the friction Track 2 is trying to
remove. Triggering real runs from the editor is the core of the
"workflow-as-API" experience.

**Implementation note:** `TemporalClientService.startGraphWorkflow()`
currently requires a `documentId` and seeds doc-specific keys
(`blobKey`, `fileName`, `contentType`, …) into `initialCtx`. Track 2
makes `documentId` optional — when absent, the seeded keys are
omitted and only the caller's `initialCtx` ends up in ctx. The
synthetic context lets non-document workflows run too.

### D5 — Trigger URL shown in the panel is absolute, derived at request time

The `run-spec` endpoint returns a fully-qualified URL
(e.g., `https://di.dev.example.com/api/workflows/:id/runs`) computed
from the request's `Host` + `X-Forwarded-Proto` headers (with a
local-dev fallback to `http://localhost:3002`). This keeps the
sample curl copyable without hand-editing.

**Why:** The frontend can't reliably know the public API base URL
(behind reverse proxies, with multiple deployments). The backend
already sees the inbound URL it was reached on; it's the right place
to compute "where can callers reach me from?".

## Scope (what we build)

### Backend (`apps/backend-services` + `packages/graph-workflow`)

1. **`CtxDeclaration.isInput?: boolean`** in
   `packages/graph-workflow/src/types.ts`. Validator accepts it (no
   enforcement). Optional so existing workflow JSONs stay valid.

2. **`GET /api/workflows/:id/run-spec`** — returns the run-time
   contract for a workflow:
   ```typescript
   {
     triggerUrl: string;                  // absolute, e.g. "http://localhost:3002/api/workflows/:id/runs"
     inputSchema: JsonSchema;             // JSON Schema describing the expected body
     authNotes: string;                   // short explanation of the x-api-key header
     sampleCurl: string;                  // ready-to-copy curl invocation
   }
   ```
   - **For `kind: "library"` workflows:** `inputSchema` is derived
     from `metadata.inputs[]` (LibraryPortDescriptor — uses `label` /
     `path` / `type`).
   - **For `kind: "primary"` workflows:** derived from `ctx[]`
     entries where `isInput === true`. Maps `CtxDeclaration.type`
     (`string | number | boolean | object | array`) to JSON Schema
     primitives. Includes `defaultValue` + `description` if set.
   - **For `kind: "benchmark_candidate"`:** same derivation as
     `primary` (no special handling).
   - `inputSchema` is always a valid JSON Schema object with `type:
     "object"`, `properties: {...}`, and a `required: string[]`
     populated by entries that have no `defaultValue`.

3. **`POST /api/workflows/:id/runs`** — triggers a workflow run.
   Body:
   ```typescript
   {
     initialCtx?: Record<string, unknown>;
     workflowVersionId?: string;  // defaults to head version
   }
   ```
   Response:
   ```typescript
   {
     workflowId: string;          // Temporal workflow execution id
     workflowVersionId: string;   // resolved (head or explicit)
     status: "started";
   }
   ```
   - Authorized via the existing `ApiKeyAuthGuard` (`x-api-key`
     header).
   - Resolves `workflowVersionId` to head (`WorkflowLineage.head_version_id`)
     when absent; returns 404 if the lineage has no versions yet.
   - Calls a refactored `TemporalClientService.startGraphWorkflow()`
     with `documentId?: string | undefined`. When undefined, the
     synthetic seeding (`blobKey`, `fileName`, `contentType`, …) is
     skipped — only the user-supplied `initialCtx` reaches the
     workflow.

4. **Full Swagger DTOs + Vitest coverage** per CLAUDE.md. Specific
   decorators (`@ApiOkResponse`, `@ApiNotFoundResponse`,
   `@ApiBadRequestResponse`, …), dedicated DTO classes with
   `@ApiProperty`, referenced via the `type` field. Supertest happy
   path + 404 + auth-required paths.

### Frontend (`apps/frontend`)

1. **`RunWorkflowDrawer`** (new component in
   `apps/frontend/src/features/workflow-builder/run/`). Right-side
   Mantine `Drawer` opened from a new top-bar button. Shows:
   - **Trigger URL** with a one-click copy button (uses Mantine
     `CopyButton`).
   - **Input schema** rendered as a compact field list (label /
     path / type / required / description / default). For library
     workflows: one row per `metadata.inputs[]` entry. For regular
     workflows: one row per `ctx[]` entry where `isInput === true`.
     Empty state: "No inputs declared — see Workflow settings to
     mark ctx entries as input."
   - **Sample curl** (read-only `<Code>` block + copy button).
     Pre-populated with a JSON body that uses each input's
     `defaultValue` or a type-appropriate stub (`""` for string,
     `0` for number, etc.).
   - **Auth notes** — one paragraph noting the `x-api-key` header
     and pointing at the team's API-key flow (text only; no link
     out to a separate doc).
   - **Paste JSON & run** — Mantine `<JsonInput>` (validated JSON,
     surfaces parse errors inline) + a "Run" button. On submit,
     POSTs to `/api/workflows/:id/runs`. Surfaces the returned
     `workflowId` with a copy button + a success notification. On
     error: red Alert with the response message.

2. **Top-bar "Run this workflow" button** in `WorkflowEditorV2Page`,
   placed between "Save" and "Save as library". Opens the drawer.
   Disabled when the workflow has no `id` yet (i.e., on the
   create-v2 route — show a tooltip explaining "Save the workflow
   first").

3. **`isInput` checkbox in `WorkflowSettingsDrawer`** — adds an
   "Input" checkbox column to the ctx declarations list. Toggling
   updates `ctx[key].isInput` in the in-flight config.

4. **`WorkflowListPage` kind filter** — `SegmentedControl` (All /
   Workflows / Libraries) above the list. Wires to the existing
   `useWorkflows({ kind })` hook (already supports `kind=library`
   from Track 1; we add `kind=workflow` and the "all" path).
   Default tab: `Workflows`.

### Verification

- **Backend Vitest + supertest** for both new endpoints. Coverage:
  - `run-spec` for library workflow (inputs derived from
    `metadata.inputs[]`)
  - `run-spec` for regular workflow with mixed `isInput` flags
    (only flagged ctx entries appear)
  - `run-spec` 404 for unknown workflow
  - `runs` happy path (calls the Temporal client mock with the
    expected args, returns `workflowId`)
  - `runs` 404 for unknown workflow
  - `runs` 400 when supplied `initialCtx` fails the input schema
    (missing required field, wrong type)
  - Auth: both endpoints rejected without `x-api-key`

- **Frontend Vitest** for:
  - `RunWorkflowDrawer` — renders trigger URL + schema rows + curl;
    copy buttons present; paste-and-run wiring calls the mocked
    fetch
  - `WorkflowListPage` — filter chip updates the active query
  - `WorkflowSettingsDrawer` — `isInput` checkbox round-trips

- **Playwright walkthrough** (per `app-browser-auth` skill against
  the live dev server with the seed-default API key):
  - Open Run panel for a regular workflow (with one `ctx` entry
    flagged `isInput: true`). Verify trigger URL + schema row +
    sample curl. Paste a JSON body. Click Run. See the
    `workflowId` returned.
  - Open Run panel for a library workflow. Verify the declared
    inputs appear instead of ctx entries.
  - On `/workflows`, toggle the filter chip. Verify the row count
    changes appropriately.

## Out of scope (filed for later)

- **Version pinning ("run version 5").** The `workflowVersionId`
  body field is implemented but the Run drawer always defaults it to
  head (omits it from the request). A version dropdown gets added in
  Track 3 (versioning UI).
- **Status polling / live execution view.** Track 2 returns the
  `workflowId` and stops there. Per-node status overlays + Temporal
  Web links are Phase 4 (try-in-place).
- **Run history.** No `GET /api/workflows/:id/runs` (list) endpoint
  in this track. Phase 4.
- **OAuth / non-API-key auth modes.** The Run panel documents only
  the existing API-key model.
- **Schema validation depth-check** (per-input type enforcement on
  paste). The drawer does basic JSON parsing; field-level validation
  surfaces only when the backend rejects with 400. A live in-drawer
  validator is filed for Phase 3 (typed I/O extends the
  enforcement story).

## Open considerations (not blocking)

- **Empty `initialCtx`.** If the workflow declares no inputs and the
  user POSTs `{}`, the workflow starts with an empty ctx (no doc
  seeding). Works today; covered by the happy-path test.
- **`workflowVersionId` mismatch with `:id`.** If the body's
  `workflowVersionId` doesn't belong to the path's lineage, the
  endpoint returns 400 with a clear message.
- **Logging.** Each run-trigger logs at info level: `{ workflowId,
  lineageId, versionId, ctxKeys }` — no raw input values (avoid
  leaking PII into logs).
