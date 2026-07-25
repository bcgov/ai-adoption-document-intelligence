# Document Sources as Nodes — Design

**Status:** Decided. Phase 8 of the post-1A plan. Analog of [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md) for the source-as-node concept.
**Last updated:** 2026-05-24.
**Why now:** Phase 3 (typed I/O) is closed, so the canvas can render typed Document/Artifact handles on a source node's output. Phase 4 (try-in-place) needs a unified "Input" abstraction; landing Phase 8 before Phase 4 lets the canvas-side upload affordance plug into a real source node instead of being a one-off widget.

This document commits to concrete decisions for the document-sources-as-nodes feature. Engine semantics are unchanged from [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) (Model A — single in / single out + blackboard ctx). Source nodes are a **schema + design-time + intake-routing** addition: they appear in the graph, declare typed outputs that feed ctx, and the `/runs` endpoint validates inbound payloads against their declared shape. Runtime execution flow is unchanged — the source node materializes as a ctx-merge that happens before the workflow's first activity executes.

---

## 0. Phase 8.0 scope (locked)

This design covers two implementation tiers:

- **Phase 8.0 (this milestone):** `source.api` + `source.upload` only. No external integrations, no credentials, no source library, no auto-migration. Single source.api per workflow; single source.upload per workflow; the two may coexist.
- **Phase 8.x (deferred):** `source.cron`, `source.sharepoint`, `source.email`, `source.s3`. Pull/polling lifecycle. Credentials storage. Reusable source library. Multi-source.api with URL routing.

Every section below calls out which tier it applies to. Hooks for 8.x land in 8.0 **only when they have no dead-code cost** — i.e., the schema accommodates 8.x cleanly but no unused tables/endpoints/UI ship.

---

## 1. The source node TYPE

A new `NodeType` variant alongside `activity`, `switch`, `map`, `join`, `childWorkflow`, `pollUntil`, `humanGate`:

```ts
// packages/graph-workflow/src/types.ts
export type NodeType =
  | "activity"
  | "switch"
  | "map"
  | "join"
  | "childWorkflow"
  | "pollUntil"
  | "humanGate"
  | "source";   // NEW — Phase 8

export interface SourceNode extends GraphNodeBase {
  type: "source";
  /** Source subtype id, e.g. "source.api" or "source.upload". Resolved against the source catalog. */
  sourceType: string;
  /** Static config — validated against the subtype's `parametersSchema`. */
  parameters?: Record<string, unknown>;
}

// And SourceNode joins the discriminated union:
export type GraphNode =
  | ActivityNode
  | SwitchNode
  | MapNode
  | JoinNode
  | ChildWorkflowNode
  | PollUntilNode
  | HumanGateNode
  | SourceNode;
```

**Why a new node TYPE, not just a new activity-catalog category?** Three reasons:

1. **No `inputs[]`.** A source has no upstream ports — it's the workflow's edge to the outside world. Modelling it as `activity` with empty inputs is misleading (the validator treats activity inputs as required-binding by default).
2. **Different runtime semantics.** Activities execute as Temporal activities; sources execute as a ctx-merge inside the workflow's Temporal start path. Wrapping that in `activity` would force a fake no-op Temporal activity per workflow.
3. **Different schema shape.** Source nodes carry an `outputSchema` derived from their parameters (see §3). Activities don't.

The `SourceNode` shape mirrors `ActivityNode` closely (label, optional inputs/outputs, sourceType field discriminating subtypes) so the existing JSON-Schema-driven settings-form machinery works without modification — just routed against the source catalog instead of the activity catalog.

**Validation rules** (enforced in `validateGraphConfig`):

- `SourceNode.inputs` MUST be empty/absent (sources have no upstream).
- `SourceNode.sourceType` MUST resolve to a registered source catalog entry.
- `SourceNode.parameters` MUST validate against the entry's `parametersSchema`.
- **Phase 8.0 only:** at most one source.api node per workflow; at most one source.upload node per workflow. (Validator emits a clear "Phase 8.0 supports at most one source of this subtype per workflow — multi-source.api is deferred to Phase 8.x" error.)
- When `entryNodeId` points at a source node, the source's downstream activity (via outbound wire) is what actually runs first; the source itself is a no-op marker. When `entryNodeId` does NOT point at a source node (legacy workflows), behavior is unchanged from Phase 2 Track 2.

---

## 2. The source catalog

Mirrors `packages/graph-workflow/src/catalog/` (activity catalog) but for sources:

```
packages/graph-workflow/src/catalog/
├── activities/                   # existing — 41 activity catalog entries
├── sources/                      # NEW Phase 8
│   ├── source-api.ts             # source.api entry
│   └── source-upload.ts          # source.upload entry
├── source-catalog.ts             # NEW — SOURCE_CATALOG, getSourceCatalogEntry, listSourceTypes,
│                                 #         createSourceParameterValidator, deriveSourceOutputSchema
├── source-types.ts               # NEW — SourceCatalogEntry, SourceRuntimePattern, FieldDescriptor
└── … (existing files)
```

**`SourceCatalogEntry` shape:**

```ts
// packages/graph-workflow/src/catalog/source-types.ts
export type SourceRuntimePattern = "push" | "pull" | "manual";

export interface SourceCatalogEntry {
  type: string;                            // "source.api", "source.upload", future "source.cron"
  category: "source";                      // catalog category — drives palette section
  displayName: string;                     // "API endpoint", "File upload"
  description: string;
  iconHint?: string;                       // resolved by frontend catalog-utils
  colorHint?: string;
  /** Zod v4 schema for static configuration (parameters). Edited via JsonSchemaForm. */
  parametersSchema: ZodSchema;
  /** Runtime invocation pattern. "push"/"manual" land in 8.0; "pull" deferred to 8.x. */
  runtime: SourceRuntimePattern;
  /**
   * Derives the source's output schema (and therefore the workflow's input schema for /run-spec)
   * from the source node's configured parameters. Pure function, no I/O.
   *
   * For source.api: reads `parameters.fields[]` (user-authored) and returns a JSON Schema 7 object.
   * For source.upload: returns a fixed `{ documentUrl: string }` schema; parameters are ignored.
   */
  deriveOutputSchema: (parameters: Record<string, unknown>) => JsonSchema7;
  /**
   * Declared typed output kind for the canvas handle. For source.api the output is
   * `Artifact` (the user can declare a typed field — but the source node's handle stays
   * generic since fields are heterogeneous). For source.upload the output is `Document`.
   * Phase 3's `KindRef` type.
   */
  outputKind: KindRef;
}
```

**Source catalog index:**

```ts
// packages/graph-workflow/src/catalog/source-catalog.ts
export const SOURCE_CATALOG: ReadonlyArray<SourceCatalogEntry> = [
  sourceApiCatalogEntry,
  sourceUploadCatalogEntry,
] as const;

export function getSourceCatalogEntry(sourceType: string): SourceCatalogEntry | undefined;
export function listSourceTypes(): readonly string[];
export function createSourceParameterValidator(): (sourceType: string, parameters: unknown) => Result<void, ValidationError>;
export function deriveSourceOutputSchema(sourceNode: SourceNode): JsonSchema7;
```

This mirrors the activity catalog's surface (`ACTIVITY_CATALOG` / `getActivityCatalogEntry` / `createCatalogParameterValidator`) — the shared package patterns are preserved, only the catalog target differs.

---

## 3. The two Phase 8.0 source subtypes

### 3.1 `source.api` — push pattern

**Purpose:** First-class graph-level marker for "this workflow accepts a programmatic POST body." Replaces the implicit Phase 2 Track 2 mode (where `isInput` flags on ctx declarations defined the schema) for new workflows.

**`parametersSchema` (user-edited via JsonSchemaForm):**

| Param | Type | Notes |
|---|---|---|
| `fields` | `FieldDescriptor[]` | The list of input fields callers must send. Rendered via a new `field-list-editor` x-widget (see §6.2). Each entry: `{ name, type, kind?, required, description?, defaultValue? }`. |
| `authNotes?` | `string` | Optional override of the default auth notes string shown in the Run drawer. |

`FieldDescriptor` mirrors the existing `CtxDeclaration` shape (with `kind?` from Phase 3):

```ts
export interface FieldDescriptor {
  name: string;                                              // ctx key name; URL-safe identifier
  type: "string" | "number" | "boolean" | "object" | "array";
  kind?: KindRef;                                            // Phase 3 typed-I/O kind
  required: boolean;
  description?: string;
  defaultValue?: unknown;
}
```

**`deriveOutputSchema`** walks `parameters.fields[]` and emits a JSON Schema 7 object with the configured field names as top-level properties and the appropriate `required[]` array. Each field also contributes to the canvas's typed-I/O view via its `kind` annotation (see §5).

**`runtime: "push"`.** When this source is present in a workflow:

- `GET /api/workflows/:id/run-spec` derives the input schema from the source.api's `deriveOutputSchema(parameters)` instead of from `isInput`-flagged ctx declarations.
- `POST /api/workflows/:id/runs` validates the body against that schema, merges the body **flat into `initialCtx`** (top-level body keys become top-level ctx keys), and starts Temporal.

**`outputKind: "Artifact"`.** The source node's single output handle is gray (Artifact wildcard) on the canvas — heterogeneous fields prevent a single representative kind. Per-field kinds still apply at the ctx-binding level (any consumer reading `ctx.<fieldName>` sees that field's declared kind via Phase 3's binding-walk validator — see §5).

### 3.2 `source.upload` — manual pattern

**Purpose:** First-class graph-level marker for "this workflow accepts a file uploaded interactively." Replaces Phase 4's planned canvas-side one-off upload widget; instead, the source.upload node IS the upload affordance.

**`parametersSchema` (user-edited via JsonSchemaForm):**

| Param | Type | Notes |
|---|---|---|
| `allowedMimeTypes?` | `string[]` | Optional MIME allowlist. Default: `["application/pdf", "image/*"]`. |
| `maxFileSizeMB?` | `number` | Optional max-size guard. Default: 50. |
| `ctxKey?` | `string` | Name of the ctx key the resulting blob URL is stored under. Default: `"documentUrl"`. |

**`deriveOutputSchema`** returns a fixed shape derived from `ctxKey`:

```json
{ "type": "object", "properties": { "<ctxKey>": { "type": "string", "format": "uri" } }, "required": ["<ctxKey>"] }
```

**`runtime: "manual"`.** When this source is present:

- The Run drawer renders a file-picker widget instead of (or alongside, when source.api is ALSO present) the JsonInput.
- The frontend POSTs the file as `multipart/form-data` to a **new endpoint** `POST /api/workflows/:id/sources/:sourceNodeId/upload` which:
  1. Validates the source node exists, is of subtype `source.upload`, and the upload satisfies `allowedMimeTypes` / `maxFileSizeMB`.
  2. Streams the file to blob storage (reuses the existing blob service).
  3. Returns `{ [ctxKey]: <url> }` — using the source's configured `ctxKey` parameter (default `"documentUrl"`) as the response key, so the response shape matches what the source declares as its output. This keeps the endpoint authoritative about the mapping.
  4. The frontend forwards that object verbatim as the `initialCtx` in the subsequent `POST /runs`.
- The /run-spec endpoint surfaces the source.upload's schema separately from any source.api's schema (see §4.3).

**`outputKind: "Document"`.** Single output handle is blue on the canvas. The configured `ctxKey` carries `kind: "Document"` for Phase 3 binding-walk purposes.

---

## 4. API surface

### 4.1 `GET /api/workflows/:id/run-spec` (Phase 2 Track 2 — extended)

Today the response derives `inputSchema` from either `metadata.inputs[]` (library workflows) or `isInput`-flagged ctx declarations (regular workflows). Phase 8 extends with a new derivation precedence:

```
priority:
  1. If workflow has a source.api node → derive from source.api.deriveOutputSchema(parameters)
  2. Else if workflow has metadata.inputs[] (library) → unchanged
  3. Else if workflow has any isInput-flagged ctx → unchanged (legacy)
  4. Else → empty schema {}
```

**Response shape gains an optional `uploadSpec?` field** when a source.upload is present:

```ts
interface RunSpecResponse {
  triggerUrl: string;
  inputSchema: JsonSchema7;            // unchanged shape; derivation now uses §4.1's precedence
  authNotes: string;
  sampleCurl: string;
  uploadSpec?: {                       // NEW Phase 8
    sourceNodeId: string;              // the source.upload node id
    uploadUrl: string;                 // POST /api/workflows/:id/sources/:sourceNodeId/upload
    allowedMimeTypes: string[];        // resolved (defaults filled in)
    maxFileSizeMB: number;
    ctxKey: string;
  };
}
```

A workflow may have both `inputSchema` (from source.api) AND `uploadSpec` (from source.upload) populated when both source nodes are present. The Run drawer renders both options.

### 4.2 `POST /api/workflows/:id/runs` (Phase 2 Track 2 — extended)

**Body validation** now uses the same precedence as `run-spec` (source.api takes priority over `isInput`-flagged ctx). Validation logic is otherwise unchanged: missing required field → 400; type mismatch → 400; unknown field → 400 with strict allowlist.

**`workflowVersionId?`** behavior unchanged from Track 3 — version selection still works orthogonally.

### 4.3 `POST /api/workflows/:id/sources/:sourceNodeId/upload` (NEW Phase 8)

- Accepts `multipart/form-data` with a single `file` part.
- Resolves the source node, verifies subtype is `source.upload`, validates MIME + size.
- Streams to blob storage. Storage location reuses the existing per-org blob bucket convention.
- Returns `{ [ctxKey]: <url> }` — keyed by the source node's configured `ctxKey` parameter (default `"documentUrl"`). The value is a signed URL or blob key, matching whichever shape the existing OCR pipeline already consumes.
- 4xx on: unknown workflow / source / version, wrong source subtype, MIME mismatch, oversized file. 401/403 unchanged from existing auth.
- This endpoint is **upload-only** — it does NOT trigger the workflow run. The frontend chains the upload result into a subsequent `POST /runs`. This keeps the upload concern separable from the run concern (and lets the frontend show the upload result to the user before they hit "Run").

---

## 5. Coexistence with Phase 3 typed I/O

Sources participate in the Phase 3 binding-walk validator the same way `CtxDeclaration` does:

- **source.api fields with `kind?`:** Each field becomes a ctx key whose declared kind is the field's `kind?` (or `Artifact` if absent). When a downstream activity binds `inputs[].ctxKey = <fieldName>`, the binding-walk validator runs `isAssignable(field.kind, activityInputPort.kind)` and surfaces an error on mismatch — exactly mirroring Phase 3's `CtxDeclaration` → activity-input check.
- **source.upload's documentUrl:** The configured `ctxKey` is treated as a ctx declaration with `kind: "Document"`. Consumers reading that ctx key get typed-Document filtering in the variable picker.
- **Source node's output handle on the canvas:** Coloured per `SourceCatalogEntry.outputKind`. source.api = gray (Artifact wildcard, heterogeneous). source.upload = blue (Document). Hover tooltip reads "Artifact" or "Document" verbatim.
- **`entryNodeId` pointing at the source:** New workflows authored via the V2 editor set `entryNodeId` to the source node's id when a source is present. Runtime treats the source as a no-op (ctx is already populated from /runs body or the upload chain) and starts execution at the first node downstream of the source via the outbound edge.

---

## 6. Coexistence with Phase 2 Track 2's `isInput` flag

**Locked migration: leave existing workflows as-is.** Phase 2 Track 2's `CtxDeclaration.isInput` continues to work verbatim. The runtime + /run-spec + /runs all keep deriving from isInput when no source.api is present.

**For new workflows authored via the V2 editor**, the recommended pattern is to add a `source.api` node instead of toggling `isInput` on ctx declarations. Both paths produce functionally equivalent results — same /run-spec schema, same /runs validation — but the source.api path is the visible graph-level statement of intent.

**No auto-migration banner. No deprecation warning.** `isInput` is not deprecated — it just stops being the only path. Phase 7's AI agent can author either form.

**Conflict resolution.** If a workflow has BOTH a source.api node AND `isInput`-flagged ctx declarations, the source.api wins (per §4.1 precedence). The validator emits a `severity: "warning"` (NOT error) on this configuration: `"Workflow has a source.api node — isInput flags on ctx declarations are ignored. Remove isInput flags or remove the source.api to clarify intent."` This is a soft nudge, not a save blocker.

---

## 7. Canvas rendering

### 7.1 Palette

A new "Sources" palette section in `ActivityPalette` (or a new sibling component), positioned ABOVE the existing activity categories. Two entries in 8.0:

| Entry | Display name | Icon hint | Color hint |
|---|---|---|---|
| `source.api` | "API endpoint" | `cloud-upload` | indigo |
| `source.upload` | "File upload" | `file-upload` | blue |

Dragging a source entry onto the canvas creates a `SourceNode` with the subtype-default parameters.

### 7.2 Source node rendering

Source nodes render via a NEW `SourceNodeRenderer` xyflow custom-node component (sibling to existing activity / control-flow renderers):

- **No input handle.** The left side of the node renders no Handle component.
- **Single output handle** on the right, coloured per `SourceCatalogEntry.outputKind` (see §5). Hover tooltip reads the kind name verbatim.
- **Label, icon, color** sourced from the source catalog entry the same way activities source from the activity catalog (via the catalog-utils helpers).
- **Selection pill** (Phase 3) shows the source's typed output(s). For source.api: a single "Artifact" line with a note "see Settings → Fields for typed field-level kinds." For source.upload: a single "Document" line.

### 7.3 Settings panel

A new `SourceNodeSettings` component (sibling to `NodeSettings` and `GroupNodeSettings`) routed via `NodeSettingsPanel`'s dispatch shell:

- Top of panel: source subtype display name + description + icon (matches activity-node-settings header).
- Body: `JsonSchemaForm` rendering the source's `parametersSchema`. For source.api, the `fields[]` array uses a new `field-list-editor` x-widget — analogous to the existing `validation-rule-editor` / `keyword-pattern-editor` (one row per field; columns: name / type / kind / required / description / default).
- For source.upload only: a **"Test upload"** button below the form. Clicking opens the OS file picker. Selected file POSTs to `/sources/:sourceNodeId/upload`, returns the `documentUrl`, and prefills the ctx-keyed entry in the Run drawer's "Test run" surface. (This is the canvas-side play affordance Phase 4 was going to build standalone.)

### 7.4 Run drawer changes

`RunWorkflowDrawer` extends to render up to TWO sections when the workflow has source nodes:

- **API source section** (present when source.api exists): unchanged from Phase 2 Track 2 — trigger URL, schema field table, sample curl, auth notes, JsonInput, Run button.
- **Upload source section** (present when source.upload exists): a Dropzone (Mantine `<Dropzone>`) with the configured MIME / size constraints surfaced inline; below it a Run button that triggers the upload-then-/runs chain.
- Workflows with neither source node fall back to the existing isInput-derived behavior (no changes).

The Run drawer is the user's "test the workflow" surface; with both sections rendered, the user picks whichever source they want to exercise on a given test run.

---

## 8. Where the runtime hooks land

**Backend (`apps/backend-services`):**

- `WorkflowController` — extend `GET /:id/run-spec`, `POST /:id/runs`, and add `POST /:id/sources/:sourceNodeId/upload`.
- `deriveInputSchema()` helper — extend with the §4.1 precedence rules. Add unit tests for source.api-derived schemas alongside the existing library/isInput cases.
- `validateRunInput()` helper — unchanged on signature; consumed by the controller via the precedence-aware input-schema fetch.
- New `SourceUploadService` (or method on an existing blob-storage service) for the multipart-handling endpoint. Reuses existing blob storage convention.

**Backend (`apps/temporal`):**

- No worker changes. Source nodes never reach the worker as a Temporal activity — they're materialized as the initial ctx the `startGraphWorkflow` call already produces.

**Validator (`packages/graph-workflow`):**

- `validateGraphConfig` walks the new node type. New violations:
  - `SourceNode.inputs not empty` → error.
  - `SourceNode.sourceType not in source catalog` → error.
  - `SourceNode.parameters` fails the source's `parametersSchema` → error (same shape as existing activity-parameter errors).
  - Phase 8.0 only: 2+ source.api nodes → error (cite the 8.x deferral). 2+ source.upload nodes → error.
- Binding-walk validator (Phase 3) treats source node outputs the same way it treats `CtxDeclaration` kinds. No new code path — the source catalog's `deriveOutputSchema` and `outputKind` are inputs to the existing walker.

---

## 9. Frontend additions

```
apps/frontend/src/features/workflow-builder/
├── sources/                          # NEW Phase 8
│   ├── SourceNodeRenderer.tsx        # xyflow custom-node (canvas-side)
│   ├── SourceNodeSettings.tsx        # right-rail per-source settings panel
│   ├── FieldListEditor.tsx           # x-widget for source.api's fields[] param
│   ├── SourceUploadButton.tsx        # the "Test upload" button on source.upload panel
│   └── source-catalog-utils.ts       # icon/color hint resolution (mirrors catalog-utils.ts)
├── run/RunWorkflowDrawer.tsx         # extend — render up to 2 source sections
├── palette/ActivityPalette.tsx       # extend — add "Sources" section above activity categories
├── canvas/WorkflowEditorCanvas.tsx   # extend — register SourceNodeRenderer in nodeTypes
└── …
```

The `field-list-editor` x-widget is registered in `JsonSchemaForm` the same way other rich widgets (`validation-rule-editor`, `keyword-pattern-editor`) are.

---

## 10. Hooks for Phase 8.x (deferred, no dead code in 8.0)

These items are explicitly **NOT** built in 8.0. The 8.0 design accommodates them without breaking changes:

- **Pull pattern sources (cron, sharepoint, email, s3).** `SourceRuntimePattern = "pull"` is reserved in the union. When a pull source first ships, a new `WorkflowSourceBinding` Prisma table is added (lineage_id, version_number, source_node_id, last_polled_at, …). No schema changes to `GraphWorkflowConfig` or `SourceNode` required.
- **Multi-source.api with URL routing.** When the restriction is lifted in 8.x, `SourceNode` gains an optional `path?: string` field (URL-safe slug). The new `POST /api/workflows/:id/sources/:path/runs` endpoint coexists with the existing single-source endpoint; the legacy endpoint stays valid for single-source.api workflows.
- **Credentials.** A new `Credentials` Prisma table with the source.\<integration\> entries carrying a `credentialId?: string` parameter. Schema layout deferred until first integration ships.
- **Reusable source library.** Track-1-style. Adds a new `WorkflowKind` enum value (`source-library` or similar) and a new `SourceLibraryPickerModal`. Schema-only changes to `SourceNode.parameters` (an optional `sourceLibraryId?: string` parameter that, when set, replaces the inline `parameters` with the referenced library's parameters).
- **Auto-migration of `isInput` workflows.** If the user later changes their mind and wants existing workflows to auto-insert a source.api on open, the editor can build that on top of the 8.0 schema without further backend changes — it's purely a frontend convenience.

The 8.0 catalog entries (`source.api`, `source.upload`) and the `SourceCatalogEntry` shape (`runtime` + `deriveOutputSchema` + `outputKind`) are designed to accommodate all four 8.x source subtypes without restructuring.

---

## 11. Multi-trigger semantics

Phase 8.0 supports the degenerate "multi-trigger" case where a workflow has BOTH a `source.api` and a `source.upload` node. The Run drawer renders both sections; user picks which to exercise. Each invocation runs the same downstream pipeline against an `initialCtx` shaped by whichever source fired.

**True multi-trigger** (Zapier-style — N triggers of the same subtype, each with independent paths / schemas) lands in Phase 8.x along with multi-source.api URL routing. The 8.0 restriction (one source.api + one source.upload max) is the simple-case ramp.

---

## 12. Open items / non-decisions

- **Per-field auth scoping.** When a source.api has 10 fields, can a caller send only a subset (validation already enforces required[]) but with different auth tokens scoped to different fields? **No** — out of scope for 8.0 and likely forever.
- **Webhook signatures (HMAC verification on source.api).** Not in 8.0. When the first integration source needs it in 8.x, `SourceNode.parameters.webhookSecret?: string` is the obvious extension point.
- **Run history per source.** Filed for Phase 4 (try-in-place) alongside the existing run-history backend gap. Phase 8 doesn't expose history.
- **Per-source rate limiting.** Out of scope for 8.0.

---

## 13. Out of scope for Phase 8.0

- **Polling / cron / external integrations.** All deferred to 8.x.
- **Credentials table + UI.** Deferred to 8.x.
- **Reusable source library.** Deferred to 8.x.
- **Auto-migration / banner on existing workflows.** Existing workflows keep working with `isInput` — no UI change pushes them to convert.
- **Multi-source.api routing via URL path slugs.** Deferred to 8.x.
- **Multi-trigger of the same subtype (2+ source.api).** Deferred to 8.x.
- **Source-output schema runtime checks.** The runtime engine still doesn't validate ctx shapes. Schema-based validation runs at save-time (validator) + run-trigger-time (/runs body validation) only.

---

## 14. Companion documents

- [IMPLEMENTATION_PLAN.md §5 Phase 8](IMPLEMENTATION_PLAN.md#phase-8--sources-document-intake-as-nodes) — high-level menu
- [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md) — Phase 3 typed I/O; source nodes participate via the same `KindRef` annotations
- [NOTES.md §1.1](NOTES.md#11-typed-connections-between-nodes) — the user-vision "document source as a node" thread
- [SESSION_HANDOFF.md](SESSION_HANDOFF.md) — current branch state and cadence
