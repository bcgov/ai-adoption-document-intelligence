# Phase 8 — Document Sources as Nodes — Requirements

**Status:** Refined. Ready for user-story generation.
**Owner:** Alex
**Branch:** `feature/visual-workflow-builder`
**Feature-docs slug:** `20260530-workflow-builder-phase8-document-sources`
**Predecessor:** Phase 3 (`feature-docs/20260529-workflow-builder-phase3-typed-io-artifacts/`) — closed (typed I/O artifacts shipped; all 41 catalog entries typed).
**Authoritative design:** [docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md](../../docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md) (locked taxonomy + scope in §0).
**Plan reference:** [docs-md/workflow-builder/IMPLEMENTATION_PLAN.md §5 Phase 8](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md#phase-8--sources-document-intake-as-nodes).

---

## 1. Why this phase

Today (post-Phase-3), every workflow's intake is implicit: a caller POSTs to `/api/workflows/:id/runs` with an `initialCtx` body keyed by `CtxDeclaration.isInput`-flagged ctx vars (Phase 2 Track 2). Sources from SharePoint / email / S3 / cron / watched folders would have to be glued on outside the graph — they aren't first-class concepts in the workflow.

[NOTES.md §1.1](../../docs-md/workflow-builder/NOTES.md#11-typed-connections-between-nodes) names two halves of the typed-connections vision: a *typed artifact hierarchy* (delivered by Phase 3) AND *document sources as nodes* — a base document type with a document source such as SharePoint or API input. This phase reclaims the second half.

Three downstream phases depend on Phase 8 landing as the unified intake abstraction:

- **Phase 4 (try-in-place per-node previews)** absorbs `source.upload` as its canvas-side upload affordance instead of building a one-off widget.
- **Phase 7 (AI workflow builder)** uses source nodes as its composition surface for "where does input X come from."
- **Phase 8.x (cron / SharePoint / email / S3 + credentials + source library)** all extend the 8.0 schema and catalog without restructuring.

Continuing to defer this leaves the graph's edge to the outside world implicit and forces Phase 4 to ship a one-off upload widget.

---

## 2. Mental model — non-negotiable

The engine is **Model A** ([WORKFLOW_NODE_IO_MODEL_DECISION.md](../../docs-md/workflow-builder/WORKFLOW_NODE_IO_MODEL_DECISION.md)). Wires represent **execution order only**; data flows through the **ctx blackboard** via per-node `PortBinding { port, ctxKey }`.

Phase 8 introduces a **new `"source"` NodeType variant** alongside the existing seven (`activity` / `switch` / `map` / `join` / `childWorkflow` / `pollUntil` / `humanGate`). Source nodes:

- Have **no input handle** on the canvas (they ARE the workflow's edge to the outside world).
- Have **one output handle** whose colour follows Phase 3's `KindRef` palette (blue for Document, gray for Artifact wildcard, etc.).
- Declare a **`sourceType`** (subtype id like `"source.api"` or `"source.upload"`) resolved against a NEW **source catalog** sibling to the existing activity catalog.
- Have **`parameters`** validated against the subtype's Zod-v4 `parametersSchema` (same pattern as activity nodes).

Source nodes are **NOT** Temporal activities. They materialize at workflow start time as a ctx-merge: the source's `deriveOutputSchema(parameters)` produces the workflow's input schema; the inbound POST body (or upload result) is validated against that schema and merged flat into `initialCtx`. The runtime engine sees ctx exactly the way it would in a Phase 2 Track 2 `isInput` workflow — no new runtime path inside the worker.

**`entryNodeId`** points at the source node when one is present. The runtime treats it as a no-op marker (ctx is already populated from /runs body or the upload chain) and starts execution at the source's downstream activity via the outbound wire.

**`isInput`-flagged ctx coexists silently.** Existing workflows are not migrated. New workflows authored via the V2 editor get a source node by default; the editor stops surfacing the `isInput` checkbox on new ctx rows (it stays editable on legacy ctx).

---

## 3. Locked decisions

### 3.1 Pre-resolved scope locks (from blocking-question round 1)

- **L1.** Phase 8.0 ships **`source.api` + `source.upload` only**. No cron, SharePoint, email, S3 integration sources in 8.0.
- **L2.** **Credentials storage table deferred to Phase 8.x.** Neither api nor upload needs stored secrets (api uses existing API-key auth; upload is interactive).
- **L3.** **Reusable source library deferred to Phase 8.x.** 8.0 hardcodes source parameters inline on each node.
- **L4.** **No auto-migration of existing workflows.** Existing workflows keep using `CtxDeclaration.isInput`. Only NEW workflows author source nodes.

### 3.2 Pre-resolved design locks (from blocking-question round 2)

- **L5.** **Single `source.api` per workflow in 8.0** (multi-source.api routing deferred to 8.x). Symmetric restriction: **single `source.upload` per workflow in 8.0**. The two MAY coexist (one of each — degenerate "multi-trigger of different subtypes" supported).
- **L6.** **Flat-merge ctx semantics.** The source's `deriveOutputSchema(parameters)` produces a JSON Schema 7 object; the POST body (validated against that schema) is merged **flat into `initialCtx`** (top-level body keys become top-level ctx keys). Matches Phase 2 Track 2's mental model exactly.

### 3.3 New locks (this requirements pass)

- **L7. New `NodeType` variant.** `SourceNode` joins the discriminated union in `packages/graph-workflow/src/types.ts`. Shape: `{ id, type: "source", label, sourceType, parameters?, outputs?, metadata?, errorPolicy? }`. NO `inputs[]` field (validator rejects non-empty `inputs`).
- **L8. Source catalog sibling to activity catalog.** New `packages/graph-workflow/src/catalog/sources/` directory mirroring `activities/`. New `source-catalog.ts` exposing `SOURCE_CATALOG`, `getSourceCatalogEntry`, `listSourceTypes`, `createSourceParameterValidator`, `deriveSourceOutputSchema`. New `source-types.ts` for `SourceCatalogEntry` / `SourceRuntimePattern` / `FieldDescriptor`.
- **L9. Source catalog entry shape.** Each entry declares: `type` (subtype id), `category: "source"`, `displayName`, `description`, `iconHint?`, `colorHint?`, `parametersSchema` (Zod v4), `runtime: "push" | "pull" | "manual"`, `deriveOutputSchema(parameters): JsonSchema7` (pure function), `outputKind: KindRef` (Phase 3 typed-I/O annotation).
- **L10. `source.api` entry shape.**
  - `runtime: "push"`
  - `outputKind: "Artifact"` (heterogeneous fields prevent a single representative kind)
  - `parametersSchema` user-edits a `fields[]` array via a NEW `field-list-editor` x-widget. Each `FieldDescriptor`: `{ name: string, type: "string" | "number" | "boolean" | "object" | "array", kind?: KindRef, required: boolean, description?: string, defaultValue?: unknown }`. Also: optional `authNotes?: string` (overrides default auth notes string in Run drawer).
  - `deriveOutputSchema(parameters)` walks `parameters.fields[]` and emits a JSON Schema 7 object with field names as top-level properties and a `required[]` array.
- **L11. `source.upload` entry shape.**
  - `runtime: "manual"`
  - `outputKind: "Document"` (handle is blue on canvas)
  - `parametersSchema`: `{ allowedMimeTypes?: string[] (default ["application/pdf", "image/*"]), maxFileSizeMB?: number (default 50), ctxKey?: string (default "documentUrl") }`.
  - `deriveOutputSchema(parameters)` returns `{ type: "object", properties: { [ctxKey]: { type: "string", format: "uri" } }, required: [ctxKey] }`.
- **L12. /run-spec derivation precedence.** When deriving `inputSchema`:
  1. If workflow has a `source.api` node → derive from `source.api.deriveOutputSchema(parameters)`.
  2. Else if workflow has `metadata.inputs[]` (library) → unchanged Track-1 derivation.
  3. Else if workflow has any `isInput`-flagged ctx → unchanged Track-2 legacy derivation.
  4. Else → empty schema `{}`.
- **L13. `RunSpecResponse.uploadSpec?` optional field.** When a `source.upload` node is present, `/run-spec` populates `uploadSpec: { sourceNodeId, uploadUrl, allowedMimeTypes, maxFileSizeMB, ctxKey }`. Both `inputSchema` and `uploadSpec` MAY be populated together when both source nodes exist.
- **L14. New endpoint `POST /api/workflows/:id/sources/:sourceNodeId/upload`.** Accepts `multipart/form-data` with a single `file` part. Validates source exists, subtype is `source.upload`, MIME + size constraints met. Streams to blob storage (reuses existing per-org blob bucket convention). Returns `{ [ctxKey]: <url> }` keyed by the source's configured `ctxKey` (default `"documentUrl"`). 4xx on unknown workflow/source/version, wrong source subtype, MIME mismatch, oversized file. **Upload-only** — does NOT trigger the workflow run; the frontend chains the upload result into a subsequent `POST /runs`.
- **L15. `POST /runs` body validation** uses the same precedence as `/run-spec` (L12). Otherwise unchanged.
- **L16. Conflict resolution between `source.api` and legacy `isInput`.** When both are present, **source.api wins** for derivation precedence. The validator emits a `severity: "warning"` (NOT error): `"Workflow has a source.api node — isInput flags on ctx declarations are ignored. Remove isInput flags or remove the source.api to clarify intent."` Soft nudge, not a save blocker.
- **L17. Validator rules for `SourceNode`.**
  - `SourceNode.inputs` MUST be empty/absent → error otherwise.
  - `SourceNode.sourceType` MUST resolve to a registered source catalog entry → error otherwise.
  - `SourceNode.parameters` MUST validate against the entry's `parametersSchema` → error otherwise.
  - Workflow MAY have at most one `source.api` AND at most one `source.upload` in 8.0 → error otherwise, citing the 8.x deferral.
- **L18. Canvas rendering.** Source nodes render via a NEW `SourceNodeRenderer` xyflow custom-node. No input handle. Single output handle coloured per `outputKind` (Phase 3 palette). Hover tooltip shows the kind literal. On-selection type pill (Phase 3) shows a single "Artifact" line for source.api (with footnote: "see Settings → Fields for typed field-level kinds") or "Document" for source.upload.
- **L19. Palette section.** New "Sources" palette section in `ActivityPalette` (or sibling component), positioned ABOVE the existing activity categories. Two entries in 8.0: `source.api` ("API endpoint", icon `cloud-upload`, colour indigo) + `source.upload` ("File upload", icon `file-upload`, colour blue).
- **L20. Settings panel.** New `SourceNodeSettings` component routed via `NodeSettingsPanel`'s dispatch shell. Header shows source subtype displayName + description + icon. Body renders `JsonSchemaForm` against `parametersSchema`. For `source.upload`: an additional "Test upload" button opens an OS file picker, POSTs to the upload endpoint, prefills the Run drawer's ctx-keyed entry with the resulting URL.
- **L21. Run drawer extensions.** `RunWorkflowDrawer` extends to render up to TWO sections:
  - **API source section** (when source.api exists): unchanged from Phase 2 Track 2 — trigger URL / schema table / sample curl / auth notes / JsonInput / Run button. Schema derived per L12.
  - **Upload source section** (when source.upload exists): a Mantine `<Dropzone>` with the configured MIME/size constraints surfaced inline; Run button triggers the upload-then-/runs chain.
  - Workflows with neither source node → no changes (legacy `isInput`-derived behaviour).
- **L22. `entryNodeId` for new workflows.** When a user drags a source node onto an empty canvas in the V2 editor, the editor sets `entryNodeId` to the source node's id. Subsequent activity drops chain via outbound wires. Existing-workflow `entryNodeId` is never silently rewritten by the editor.
- **L23. Phase 3 typed-I/O coexistence.**
  - `source.api`'s `fields[].kind?` annotations participate in Phase 3's binding-walk validator. Each field becomes a ctx key whose declared kind is the field's `kind?` (or `Artifact` if absent). Consumers reading `ctx.<fieldName>` get the standard `isAssignable` check from Phase 3.
  - `source.upload`'s configured `ctxKey` is treated as a ctx declaration with `kind: "Document"` for Phase 3 binding-walk purposes.
- **L24. Milestone slicing — A through F.** One commit per milestone, matching the Phase 2 Track 3 / Phase 3 cadence.

---

## 4. Scope — what we will build

### 4.1 Shared package (`packages/graph-workflow`)

**Schema additions in `src/types.ts`:**

- Extend `NodeType` union: add `"source"`.
- New `SourceNode` interface joining the `GraphNode` discriminated union.

**Source catalog (new):**

- `packages/graph-workflow/src/catalog/source-types.ts` — `SourceCatalogEntry`, `SourceRuntimePattern`, `FieldDescriptor` types.
- `packages/graph-workflow/src/catalog/source-catalog.ts` — `SOURCE_CATALOG`, `getSourceCatalogEntry`, `listSourceTypes`, `createSourceParameterValidator`, `deriveSourceOutputSchema`.
- `packages/graph-workflow/src/catalog/sources/source-api.ts` — the `source.api` catalog entry.
- `packages/graph-workflow/src/catalog/sources/source-upload.ts` — the `source.upload` catalog entry.
- Re-exports from the package barrel.

**Validator extensions in `src/validator/validator.ts`:**

- Walk `SourceNode` per L17 rules.
- Detect dual `source.api` + `isInput` and emit the L16 warning.
- Phase 3 binding-walk pass: treat source.api fields as kind-bearing ctx producers (per L23).

### 4.2 Backend (`apps/backend-services`)

**Existing controller changes (`WorkflowController`):**

- Extend `GET /:id/run-spec` derivation per L12 precedence; populate `RunSpecResponseDto.uploadSpec?` per L13.
- Extend `POST /:id/runs` body validation per L12 precedence.

**New endpoint:**

- `POST /api/workflows/:id/sources/:sourceNodeId/upload` per L14.
- New DTO `SourceUploadResponseDto { [ctxKey: string]: string }` (dynamic key — represented in Swagger as `additionalProperties: { type: string }`).
- 4xx classes per L14.
- Reuses existing blob storage service; introduces a small `SourceUploadService` (or method on an existing service) for the multipart-handling concern.

**Pure helper extensions:**

- `deriveInputSchema(config)` (Phase 2 Track 2 helper) — extended per L12 with unit tests for source.api-derived schemas alongside existing library + isInput cases.
- `validateRunInput(body, schema)` — unchanged on signature; consumed via the precedence-aware input-schema fetch.

**Swagger / OpenAPI:**

- New DTOs for the upload endpoint (`SourceUploadResponseDto`).
- Extend `RunSpecResponseDto` with optional `uploadSpec?` field.
- All `@ApiOkResponse` / `@ApiBadRequestResponse` / `@ApiUnauthorizedResponse` / `@ApiNotFoundResponse` decorators per [CLAUDE.md](../../CLAUDE.md).

### 4.3 Temporal (`apps/temporal`)

**No worker changes.** Source nodes never reach the worker as Temporal activities. The runtime keeps consuming `initialCtx` from the `startGraphWorkflow` call — that call is invoked by the controller after body validation OR by the upload-then-/runs chain.

### 4.4 Frontend (`apps/frontend`)

**New directory `src/features/workflow-builder/sources/`:**

- `SourceNodeRenderer.tsx` — xyflow custom-node (canvas-side). No input handle; single output handle coloured per `outputKind`.
- `SourceNodeSettings.tsx` — right-rail per-source settings panel. Header + JsonSchemaForm body + (for source.upload) "Test upload" button.
- `FieldListEditor.tsx` — x-widget for source.api's `fields[]` param. Per-row columns: name / type / kind / required / description / default. Registered in `JsonSchemaForm` via the existing x-widget routing.
- `SourceUploadButton.tsx` — the "Test upload" button on the source.upload settings panel.
- `source-catalog-utils.ts` — icon/color hint resolution (mirrors existing `catalog-utils.ts`).

**Edits to existing files:**

- `palette/ActivityPalette.tsx` — add the "Sources" section above activity categories, populated from `SOURCE_CATALOG`.
- `canvas/WorkflowEditorCanvas.tsx` — register `SourceNodeRenderer` in xyflow `nodeTypes`.
- `settings/NodeSettingsPanel.tsx` — dispatch to `SourceNodeSettings` for source nodes.
- `run/RunWorkflowDrawer.tsx` — extend per L21 to render up to two source sections.
- `WorkflowEditorV2Page.tsx` — when dropping a source as the first node onto an empty canvas, set `entryNodeId` to its id per L22.

**TanStack hooks:**

- New `useSourceUpload(workflowId, sourceNodeId)` mutation hook wrapping the upload endpoint.
- Existing `useWorkflowRunSpec` hook returns the extended `RunSpecResponse` shape — no new hook needed.

### 4.5 Coexistence with Phase 3 typed I/O

- `SourceNodeRenderer` consumes the Phase 3 `KindRef` palette + handle-colour helpers — no new colour table.
- Phase 3's binding-walk validator (`validateBindings` in `packages/graph-workflow`) walks `SourceNode` outputs the same way it walks `CtxDeclaration` / `LibraryPortDescriptor`. The source's `deriveOutputSchema` is consulted to enumerate the source's output ctx keys; `FieldDescriptor.kind?` (source.api) or the fixed `"Document"` (source.upload) is the producer kind. Standard `isAssignable` from Phase 3 applies downstream.

### 4.6 Coexistence with Phase 2 Track 2 `isInput` flag

- Existing workflows with `isInput`-flagged ctx vars keep working verbatim. /run-spec + /runs continue to derive from them per L12.4 when no `source.api` is present.
- New workflows authored via V2 editor with a `source.api` node DON'T need `isInput` flags (the source owns the input schema).
- When both are present in the same workflow, L16's soft warning fires + source.api wins.

---

## 5. Out of scope (explicitly deferred)

- **Pull-pattern sources (`source.cron`, `source.sharepoint`, `source.email`, `source.s3`)** — Phase 8.x. `SourceRuntimePattern = "pull"` is reserved in the union but no entry uses it.
- **Credentials storage table + UI** — Phase 8.x. None of the 8.0 sources need stored secrets.
- **Reusable source library** — Phase 8.x. 8.0 hardcodes source parameters inline.
- **Multi-source.api with URL path-slug routing** — Phase 8.x. `SourceNode.path?: string` is reserved as a future extension point.
- **Multi-trigger of the same subtype** (2+ source.api or 2+ source.upload) — Phase 8.x.
- **Auto-migration / banner on existing workflows.** No UI nudges existing isInput workflows to convert.
- **Webhook signatures (HMAC verification on source.api).** Out of 8.0 scope; extension point reserved in `SourceNode.parameters`.
- **Per-source rate limiting.** Out of 8.0 scope.
- **Run history per source.** Filed for Phase 4 alongside the existing run-history backend gap.
- **Per-field auth scoping** (subset auth tokens for subset of source.api fields). Out of scope, likely permanently.
- **Source-output schema runtime checks.** The runtime engine still doesn't validate ctx shapes. Schema-based validation runs at save-time (validator) + run-trigger-time (/runs + upload body validation) only.
- **Phase 4 try-in-place + per-node previews.** Gated on Phase 8 landing.
- **US-053 (`borderColor` console warning).** Still open from Phase 1B; blocked on Alex pasting dev-console text. Not bundled into Phase 8.
- **Pre-existing commit `b86741c7` (native-binary pin).** Lands as its own PR against develop; not bundled into Phase 8.

---

## 6. Milestone breakdown — A through F

Per L24. One commit per milestone, matching Phase 3's cadence. The user-stories writer should produce one umbrella `README.md` plus one `US-NNN-*.md` file per scenario, dependency-ordered. **Numbering continues from US-106** (Phase 3 closed at US-105).

### Milestone A — Shared schema + source catalog scaffold

- Extend `NodeType` union; add `SourceNode` interface to `packages/graph-workflow/src/types.ts`.
- Create `src/catalog/source-types.ts` (`SourceCatalogEntry`, `SourceRuntimePattern`, `FieldDescriptor`).
- Create `src/catalog/source-catalog.ts` with empty `SOURCE_CATALOG` array initially — registry + helpers in place.
- Re-exports from package barrel.
- Validator extensions per L17 (rules apply even with an empty catalog — `SourceNode.sourceType` won't resolve until catalog entries land in Milestone C).
- Unit tests: SourceNode schema accepts/rejects per L17 rules; type discriminator round-trips.
- Package build passes.
- **Verification surface for Alex:** none yet — pure shared-package change. Build the package; ask Alex to restart Vite (new runtime exports — `SOURCE_CATALOG` is a runtime export).

### Milestone B — Backend API surface

- Extend `deriveInputSchema(config)` with L12 precedence rules; unit tests covering source.api-derived schemas + dual-source.api+isInput-warning scenario.
- Extend `GET /:id/run-spec` with `uploadSpec?` population per L13.
- Extend `POST /:id/runs` body-validation precedence per L12 + L15.
- New endpoint `POST /:id/sources/:sourceNodeId/upload` per L14.
- New DTOs (`SourceUploadResponseDto`, extend `RunSpecResponseDto`).
- Full Swagger decorators per CLAUDE.md.
- Backend tests: precedence rules in `deriveInputSchema`, upload endpoint happy + 4xx paths (unknown workflow, unknown source, wrong source subtype, MIME mismatch, oversized file).
- Backend full-suite green.
- **Verification surface for Alex:** none yet — backend change. Direct curl spot-checks of the new endpoint possible against a fixture workflow but no UI yet.

### Milestone C — Catalog entries `source.api` + `source.upload`

- Author `src/catalog/sources/source-api.ts` per L10.
- Author `src/catalog/sources/source-upload.ts` per L11.
- Register both in `SOURCE_CATALOG`.
- Unit tests: each entry's `deriveOutputSchema` returns the expected JSON Schema for representative `parameters` inputs; `parametersSchema` accepts/rejects expected shapes; `outputKind` matches L10/L11.
- Package full-suite green.
- **Verification surface for Alex:** none yet on its own — the catalog entries are pure data + functions. Renderers / settings panels light up in Milestone D.

### Milestone D — Frontend palette + canvas renderer + settings panel + FieldListEditor

- Author `src/features/workflow-builder/sources/SourceNodeRenderer.tsx` per L18.
- Author `src/features/workflow-builder/sources/SourceNodeSettings.tsx` per L20 (without the "Test upload" button — that lands in Milestone E alongside upload wiring).
- Author `src/features/workflow-builder/sources/FieldListEditor.tsx` (the `field-list-editor` x-widget for source.api's `fields[]` param). Register in `JsonSchemaForm`.
- Author `src/features/workflow-builder/sources/source-catalog-utils.ts` (icon/color hint resolution).
- Edit `palette/ActivityPalette.tsx` to add the "Sources" section per L19.
- Edit `canvas/WorkflowEditorCanvas.tsx` to register `SourceNodeRenderer`.
- Edit `settings/NodeSettingsPanel.tsx` to dispatch to `SourceNodeSettings`.
- Edit `WorkflowEditorV2Page.tsx` for the `entryNodeId` autoset per L22.
- Frontend vitest covers: palette renders Sources section, source.api node renders with gray Artifact handle, source.upload node renders with blue Document handle, FieldListEditor add/remove/reorder, kind Select within FieldListEditor round-trip.
- Type-check passes; Biome clean.
- **Verification surface for Alex:** drop a source.api node onto a fresh canvas, add 2 fields with kinds, save, reload — fields persist with kinds. Drop a source.upload node, configure ctxKey, save, reload. Drop both source.api + source.upload, save — succeeds. Drop a second source.api — save returns the L17 error.

### Milestone E — Run drawer extensions + source.upload "Test upload" wiring

- Extend `run/RunWorkflowDrawer.tsx` to render up to TWO source sections per L21.
- Author `src/features/workflow-builder/sources/SourceUploadButton.tsx` (the "Test upload" button on the source.upload settings panel).
- Wire `useSourceUpload(workflowId, sourceNodeId)` TanStack mutation hook.
- Wire the upload-then-/runs chain in the upload source section of the Run drawer.
- Frontend vitest covers: Run drawer with source.api only → JsonInput rendered with fields-derived schema; Run drawer with source.upload only → Dropzone rendered; Run drawer with both → both sections rendered; upload mutation returns ctxKey-keyed shape.
- **Verification surface for Alex:** workflow with source.api → Run drawer renders the JsonInput + curl with the fields-derived schema → paste body → Run → Temporal execution starts. Workflow with source.upload → Run drawer renders Dropzone → drop a PDF → upload-then-/runs chain succeeds → Temporal execution starts. Workflow with both → drawer renders both → either path works.

### Milestone F — End-to-end Playwright verification (US-NNN closeout)

Per the verification list:

1. Drop a `source.api` node onto a fresh canvas; verify the entryNodeId autoset (L22). Verify the canvas handle is gray + hover tooltip reads "Artifact".
2. Add 3 fields to source.api (e.g. `documentUrl: string/Document/required`, `priority: number/—/optional`, `metadata: object/—/optional`). Save. Reload. Verify fields persist with kinds.
3. Open the Run drawer. Verify the field table renders correctly (documentUrl REQUIRED + Document kind dot), sample curl reflects the schema, paste a stub body, Run, verify Temporal execution starts.
4. Replace source.api with a source.upload node. Verify the canvas handle is blue + hover tooltip reads "Document". Configure `ctxKey: "myFile"`.
5. Open the Run drawer; verify the Dropzone renders, drop a test PDF, verify the upload chain succeeds (ctxKey-keyed response, /runs invocation, Temporal execution starts).
6. Add a source.api back alongside the source.upload. Verify the Run drawer renders both sections.
7. Try to add a SECOND source.api; verify save returns the L17 multi-source error.
8. On a workflow with BOTH source.api AND an `isInput`-flagged ctx, verify the L16 warning surfaces (not error) and source.api wins for the derived schema.
9. On a legacy workflow with `isInput` but NO source node, verify the existing Phase 2 Track 2 behavior is unchanged (Run drawer renders the isInput-derived schema; /runs validates against it).
10. Phase 3 binding-walk check: wire a source.api whose field `pages: kind=Segment[]` is downstream of an activity that consumes `pages: kind=Segment` — verify the binding-walk validator surfaces the typed mismatch anchored to the consumer port.

Screenshots land under `/tmp/wb-phase8-verify/`.

- **Verification surface for Alex:** this is the click-and-play milestone. Final ping for the phase.

---

## 7. Non-functional constraints

- **Backwards compatibility.** All schema additions are additive. Existing workflows without source nodes validate and run identically to today. Existing `isInput`-flagged ctx workflows are not migrated; their UX is unchanged.
- **No "any" types** per [CLAUDE.md](../../CLAUDE.md). `SourceNode`, `SourceCatalogEntry`, `FieldDescriptor` all properly typed. `KindRef` is the Phase 3 string-literal union.
- **Full Swagger / OpenAPI documentation** per [CLAUDE.md](../../CLAUDE.md). New DTOs: `SourceUploadResponseDto` (with `additionalProperties: { type: "string" }` since the response key is dynamic), `RunSpecResponseDto.uploadSpec?` (new optional field with `@ApiPropertyOptional`).
- **Backend tests when backend code changes** per [CLAUDE.md](../../CLAUDE.md). Each Milestone B + Milestone D (frontend tests) commit ships matching tests.
- **No `apps/temporal` runtime impact.** Source nodes never enter the worker as Temporal activities. The engine stays opaque per [WORKFLOW_NODE_IO_MODEL_DECISION.md](../../docs-md/workflow-builder/WORKFLOW_NODE_IO_MODEL_DECISION.md).
- **Generic-system constraint.** No document-specific implementations per [CLAUDE.md](../../CLAUDE.md). `source.upload`'s default `ctxKey: "documentUrl"` is convention, not a constraint — users can rename it; `outputKind: "Document"` is the Phase 3 kind (generic).
- **No premature abstraction.** No generic "intake adapter" interface unless source.api + source.upload + a third 8.x source all want it. The catalog entry shape already IS the abstraction.
- **Dev server cadence.** After Milestone A and Milestone C (catalog entries), `packages/graph-workflow` introduces new runtime exports — explicitly ping Alex to restart Vite. Vite's pre-bundle goes stale otherwise.
- **No bundling unrelated commits.** Pre-existing `b86741c7` (native-binary pin) lands separately. US-053 (borderColor warning) stays blocked.

---

## 8. Roles & permissions

- **Workflow author.** Drops source nodes, configures `fields[]` (source.api) or upload constraints (source.upload), tests via the Run drawer. They get the canvas handle colour cue, the typed-field-in-FieldListEditor surface, the save-time validator errors/warnings, the upload affordance.
- **Workflow consumer / API client.** Continues calling `POST /api/workflows/:id/runs`. For workflows with a source.api node, the body is validated against the source's `fields[]`-derived schema instead of `isInput`-flagged ctx — identical caller experience from the outside.
- **System admin / observer.** Unaffected.

No new auth surface. Existing Phase 1A workflow access controls cover the new endpoint + UI. The upload endpoint inherits the same `x-api-key` auth as `POST /runs`.

---

## 9. Edge cases + error states

- **SourceNode with non-empty `inputs[]`.** Validator error per L17.1. UI never lets the user wire INTO a source node (no input handle on the renderer).
- **SourceNode referencing unknown `sourceType`.** Validator error per L17.2.
- **SourceNode with parameters that fail `parametersSchema`.** Validator error per L17.3, anchored at the source node id, same shape as existing activity-parameter errors.
- **Workflow with 2+ source.api nodes.** Validator error per L17.4 + L5 (cites the 8.x deferral).
- **Workflow with 2+ source.upload nodes.** Same — validator error per L17.4 + L5.
- **Workflow with source.api whose fields[] is empty.** No error. The derived inputSchema is `{ type: "object", properties: {}, required: [] }`. POST /runs accepts an empty body. Reasonable degenerate case (the source IS still a graph-level statement of intent that the workflow has a programmatic API).
- **Workflow with source.upload referencing a `ctxKey` that's also declared in `metadata.ctx`.** No error. The upload response's flat-merge populates the ctx key the same way `initialCtx` populates ctx keys — consistent with Track 2 semantics. The metadata.ctx declaration's `defaultValue?` is overridden when the upload runs.
- **POST /runs body with extra fields not in source.api's `fields[]`.** 400 per `validateRunInput`'s existing strict allowlist behaviour. Same as Phase 2 Track 2.
- **POST upload with file exceeding `maxFileSizeMB`.** 4xx per L14.
- **POST upload to a sourceNodeId that's a source.api (wrong subtype).** 4xx per L14.
- **Dual source.api + isInput in same workflow.** L16 warning, source.api wins for derivation precedence (L12.1 takes priority over L12.3). Save proceeds.
- **Existing legacy workflow (no source node) opens in V2 editor.** No banner, no auto-conversion. The user sees the existing isInput-flagged ctx checkbox in `WorkflowSettingsDrawer` and the existing Run drawer behaviour — exactly as today.
- **`entryNodeId` pointing at a source node with no outbound wire.** Validator error: source node is the entry but has no downstream activity to run. Same error wording as today's "entryNodeId references unknown node" / "graph has unreachable nodes" — adapted with source-specific phrasing.
- **Phase 3 binding-walk: source.api field with `kind: "Segment"` downstream of activity expecting `kind: "Document"`.** Standard Phase 3 binding-walk error anchored to the consumer port. No source-specific logic.

---

## 10. Open follow-ups

These are filed but explicitly **not blocking Phase 8.0 landing**:

- **Phase 8.x — full source taxonomy.** `source.cron`, `source.sharepoint`, `source.email`, `source.s3`. Pull-pattern lifecycle. Credentials storage table. Reusable source library. Multi-source.api with URL path-slug routing.
- **Webhook signatures (HMAC verification on source.api).** Extension point reserved in `SourceNode.parameters`. Lands alongside the first integration source.
- **Auto-migration of legacy isInput workflows.** If the user later changes their mind, the editor can build a "Convert to source.api" affordance on top of the 8.0 schema — purely frontend, no backend changes needed.
- **Per-source run history.** Filed for Phase 4 alongside the existing run-history backend gap. Phase 8.0 doesn't expose history.
- **AI agent integration (Phase 7).** The agent reads `SOURCE_CATALOG` + `deriveOutputSchema` the same way it reads `ACTIVITY_CATALOG` + `parametersSchema`. No Phase 8.0 work required — Phase 7's own kickoff wires this.

---

## 11. References

- Authoritative design: [DOCUMENT_SOURCES_DESIGN.md](../../docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md).
- Plan: [IMPLEMENTATION_PLAN.md §5 Phase 8](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md).
- Phase 3 (predecessor) typed I/O design: [TYPED_IO_DESIGN.md](../../docs-md/workflow-builder/TYPED_IO_DESIGN.md).
- I/O model decision: [WORKFLOW_NODE_IO_MODEL_DECISION.md](../../docs-md/workflow-builder/WORKFLOW_NODE_IO_MODEL_DECISION.md).
- Session handoff: [SESSION_HANDOFF.md](../../docs-md/workflow-builder/SESSION_HANDOFF.md).
- Phase 3 closure (predecessor pattern reference): [feature-docs/20260529-workflow-builder-phase3-typed-io-artifacts/](../20260529-workflow-builder-phase3-typed-io-artifacts/).
- Phase 2 Track 2 closure (isInput precedent): [feature-docs/20260527-workflow-builder-phase2-workflow-as-api/](../20260527-workflow-builder-phase2-workflow-as-api/).
