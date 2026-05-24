# Typed I/O Artifacts on the Canvas — Design

**Status:** Decided. Phase 3 of the post-1A plan. (Formerly the `TYPED_IO_BRAINSTORM.md` placeholder.)
**Last updated:** 2026-05-23 — amended to clarify that types attach to **ports** (and the ctx slots they bind to), not to wires. See §5.
**Why now:** Three downstream phases all depend on a concrete artifact taxonomy — segmentation node pack (Phase 5), dynamic nodes (Phase 6), and the AI workflow builder (Phase 7). Continuing to defer this means those phases ship as half-features (segments are opaque blobs, the agent can't reason about port compatibility, dynamic nodes have no signature vocabulary).

This document commits to concrete decisions for the typed-handles question. Engine semantics are unchanged from [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) (Model A — single in / single out + blackboard ctx). Types are a **UI-layer + save-time assertion**: handles get coloured by their port's kind, the settings-panel variable picker filters by kind, and the backend `validateGraphConfig` walks ctx-key bindings to assert kind assignability between producers and consumers. Wires themselves remain pure execution-order arrows; the runtime still passes opaque `Record<string, unknown>` through ctx.

---

## 1. The artifact taxonomy

A single rooted hierarchy with nominal subtyping. Subtype-to-supertype draws are allowed; supertype-to-subtype draws are rejected at draw time.

```
Artifact (base)
├── Document
│   ├── MultiPageDocument
│   └── SinglePageDocument
├── Segment           ← a fragment of a document (region within a page, or a page-range slice)
│   └── Segment<Kind> where Kind ∈ { Text, Table, Figure, Form, KeyValue, Signature, Header }
├── OcrResult
│   ├── OcrFields     ← key-value extraction output
│   └── OcrTable      ← row/column table extraction
├── Classification    ← document-type label + confidence
├── ValidationResult  ← rule-by-rule validation output
└── Reference         ← lookup-data row (the table-features artifact)
```

**Cardinality** is part of the type: `Document` vs `Document[]` are distinct kinds. The schema notation is `T` for one, `T[]` for many. `T | T[]` is allowed where the producer is variadic (e.g., a splitter that can emit one or many segments).

**Parameterised kinds.** `Segment<Kind>` carries the region's semantic class. `OcrFields` and `OcrTable` are not parameterised in v1 — they're already specialised. If a need arises for `OcrResult<DocumentType>`, it's a future extension.

**Provenance metadata** rides along with every artifact instance at runtime via the existing ctx blackboard:

```ts
interface Segment {
  parentDocId: string;
  pageRange?: { start: number; end: number };
  polygon?: { x: number; y: number }[]; // image-space region
  kind?: "Text" | "Table" | "Figure" | "Form" | "KeyValue" | "Signature" | "Header";
  confidence?: number;
  blobKey?: string; // when the segment has been materialised to blob storage
}
```

This shape is reified in `packages/graph-workflow/src/types/artifacts.ts` (new) and re-exported from the package barrel.

---

## 2. Where the type registry lives

**In `packages/graph-workflow`**, alongside the activity catalog and validator. One source of truth across backend + frontend.

Files (new):
- `packages/graph-workflow/src/types/artifacts.ts` — TypeScript interfaces + the `ArtifactKind` string-literal union
- `packages/graph-workflow/src/types/artifact-registry.ts` — runtime registry mapping `ArtifactKind` → `{ displayName, color, baseKind?, isArray }`
- `packages/graph-workflow/src/types/subtype-check.ts` — the `isAssignable(from: ArtifactKind, to: ArtifactKind): boolean` function consumed by both the canvas and the save-time validator
- `packages/graph-workflow/src/types/index.ts` — barrel

Subtype check uses the registry's `baseKind` pointer. `isAssignable("SinglePageDocument", "Document")` → true; reverse → false. `isAssignable("Segment<Table>", "Segment")` → true. `isAssignable("Document", "Artifact")` → true (everything assigns to the base).

The registry is open in a controlled way: dynamic nodes (Phase 6) can register new kinds at runtime by calling `registerArtifactKind(...)`. User-defined kinds must declare a `baseKind` from the existing registry so the subtype graph stays connected.

---

## 3. How types are declared on the catalog entry

Extend `PortDescriptor` with an optional `kind` field:

```ts
// packages/graph-workflow/src/catalog/types.ts
export interface PortDescriptor {
  name: string;
  label: string;
  description?: string;
  required?: boolean;
  /** Artifact kind this port produces (output) or accepts (input). Omitted = `Artifact` (drawable to anything). */
  kind?: ArtifactKind | `${ArtifactKind}[]`;
}
```

**Backwards compatibility.** `kind?` is optional. Existing 41 catalog entries pre-Phase 3 have no `kind` declared; they default to `Artifact` (the base type, drawable to/from anything). Phase 3 fans out `kind` declarations per-activity, the same way Phase 1A fanned out the `parametersSchema` field — incrementally, one activity at a time, with the bulk catalog test asserting "every entry that DOES declare `kind` declares it for every port."

**Example, post-fanout:**

```ts
// document.split — fan-out splitter
inputs: [
  { name: "blobKey", label: "Source", required: true, kind: "MultiPageDocument" },
],
outputs: [
  { name: "segments", label: "Segments", required: true, kind: "Segment[]" },
],
```

```ts
// document.classify — single-segment classifier
inputs: [
  { name: "segment", label: "Segment", required: true, kind: "Segment" },
  { name: "ocrResult", label: "OCR result", required: true, kind: "OcrResult" },
],
outputs: [
  { name: "segmentType", label: "Classification", required: true, kind: "Classification" },
],
```

---

## 4. How types are rendered on the canvas

**Colour-coded handle dots + hover-tooltip with type name.** Mantine + Tabler:

| Kind family | Colour | Shape |
|---|---|---|
| `Document`, `Multi/SinglePageDocument` | blue | round dot |
| `Segment`, `Segment<...>` | green | round dot, lighter outline for parameterised |
| `OcrResult`, `OcrFields`, `OcrTable` | violet | round dot |
| `Classification`, `ValidationResult` | amber | round dot |
| `Reference` | teal | round dot |
| `Artifact` (default) | gray | round dot |
| Array (`T[]`) | (same as `T`) | doubled outline |

Hover-tooltip text: `"Segment[]"`, `"OcrResult"`, etc. — the rendered string is the `kind` declaration verbatim.

**On selected nodes**, a small type pill renders next to the handle (`OCR RESULT` / `SEGMENT[]`) for accessibility.

**Wires are NOT type-rejected at draw time.** In Model A, wires represent execution order only — data flows through the ctx blackboard via per-node `inputs[]` / `outputs[]` port bindings (`PortBinding { port, ctxKey }`), not along the wire. Drawing a wire from a typed output handle to an incompatible input handle is allowed — the wire just adds an ordering constraint. The picker is the first design-time discovery surface for kind mismatches (see §5).

**Wire body colour stays unchanged from Phase 1B** — wires are coloured by edge type (switch case / error / normal), not by data kind. The kind signal lives on the handle dot.

---

## 5. Where type-checking actually runs

**Two checkpoints, both operating on ctx-key bindings (NOT on wires).** Wires are pure execution-order arrows in Model A; the actual data hop is from a producer node's output port → its declared `ctxKey` → a consumer node's input port that reads the same `ctxKey`. Type checking follows the data, not the wire.

Both checkpoints consume the same `isAssignable()` from the shared package:

1. **Settings panel — variable picker** *(design-time, primary discovery surface)*. When a port with a declared `kind` is being bound to a ctx variable in the right-rail settings panel:
   - All ctx variables stay visible (don't hide — users will think "where did my variable go?").
   - Compatible variables list first (variables whose upstream-producer port kind is assignable to the consumer's `kind`).
   - Incompatible variables list below a divider, dimmed, with a hover tooltip naming the reason (`"OcrResult — incompatible with this port (expects Segment)"`).
   - **Manually-declared ctx variables** carry their own `kind` via Phase 3's extension to `CtxDeclaration` (see §6.1). Variables without a `kind` field (legacy entries before Phase 3) are treated as `Artifact` (wildcard — always compatible).

2. **Backend — save-time validator** *(authoritative; runs in `validateGraphConfig`)*. Walks **ctx keys**, not edges:

   ```
   for each ctxKey written or read anywhere in the graph:
     producers = [(node, outputPort, kind)  // every node.outputs[].ctxKey === ctxKey]
     consumers = [(node, inputPort, kind)   // every node.inputs[].ctxKey  === ctxKey]
     for each (cnode, cport, ckind) in consumers:
       for each (pnode, pport, pkind) in producers:
         if not isAssignable(pkind, ckind):
           emit GraphValidationError {
             severity: "error",
             nodeId: cnode.id, port: cport,
             message: "Input port `{cport}` ({ckind}) on node `{cnode}` reads from ctx key `{ctxKey}`, written by node `{pnode}` ({pkind}) — {pkind} not assignable to {ckind}"
           }
   ```

   The error anchors to the **consumer port** (where the mismatch is felt). The existing red node badges + error drawer (from Phase 1A) render the message verbatim.

**Multi-producer ctx keys** (a key written by multiple producers across switch / map / parallel branches): every producer's kind must be assignable to every consumer's kind. Strict producer-side check — if producers disagree, every consumer that doesn't accept the most-restrictive producer surfaces an error. Simpler than computing a least-common-supertype; encourages workflow authors to be explicit about merging branch outputs into typed ctx keys.

The runtime engine still doesn't check types. The blackboard is opaque `Record<string, unknown>`. Type safety is a save-time + design-time property only.

**Explicitly not in Phase 3:** draw-time wire rejection. Wires are ordering; rejecting them on type grounds would conflate two distinct user actions (wiring = ordering vs binding = data). An auto-bind-on-wire-draw layer (option C from the design discussion) is filed as a Phase 3.5 follow-up — it would make wires semantically meaningful AND restore draw-time UX in one move.

---

## 5.1 Typed soft edges — `CtxDeclaration` and `LibraryPortDescriptor`

Phase 3 extends two existing schema shapes so the type story doesn't break at workflow boundaries:

**`CtxDeclaration` extension** (workflow-settings drawer's ctx editor — the variable list every workflow declares). Adds optional `kind?: ArtifactKind | "${ArtifactKind}[]"` alongside the existing primitive `type` field:

```ts
interface CtxDeclaration {
  type: "string" | "number" | "boolean" | "object" | "array";  // unchanged
  description?: string;                                          // unchanged
  defaultValue?: unknown;                                        // unchanged
  isInput?: boolean;                                             // Track 2
  kind?: ArtifactKind | `${ArtifactKind}[]`;                     // Phase 3 — NEW
}
```

UI: the `WorkflowSettingsDrawer` ctx-rows grow a "Kind" Select column (after Description, before Default). Options populated from the registry. Optional — legacy entries with no `kind` default to `Artifact` (wildcard).

Why this matters: workflow entry-point inputs (those flagged `isInput: true` in Track 2) are the first hop into the typed graph. Without this extension, every entry-point binding shows as Artifact-compatible-with-everything in the picker, so the first activity's typed handle has nothing meaningful to filter against.

**`LibraryPortDescriptor` extension** (Track 1's library-signature editor + the library-picker modal + the childWorkflow signature summary). Adds optional `kind?: ArtifactKind | "${ArtifactKind}[]"` alongside the existing primitive `type` field:

```ts
interface LibraryPortDescriptor {
  label: string;                                                 // unchanged
  path: string;                                                  // unchanged
  type: "string" | "number" | "boolean" | "object" | "array";    // unchanged
  kind?: ArtifactKind | `${ArtifactKind}[]`;                     // Phase 3 — NEW
}
```

UI surfaces touched:
- `LibraryPortListEditor` (inside `SaveAsLibraryModal`) — each port row grows a "Kind" Select column.
- `LibraryPickerModal` — the per-library signature summary shows `kind` (when declared) alongside the primitive `type`.
- `ChildWorkflowNodeSettings` signature summary — shows the pinned library's typed signature (the new `v{N}` / `head` badge from Track 3 stays where it is; the kind annotations join it).

Why this matters: when a parent workflow references a library via a `childWorkflow` node, the library's port descriptors ARE the childWorkflow node's effective ports. Without this extension, library-referencing nodes render gray-on-gray handles, the library-picker can't be filtered by signature, and the binding-walk validator can't catch kind mismatches at the library boundary.

Both extensions are mechanically the same shape (optional `kind?: ArtifactKind | "${ArtifactKind}[]"`) and use the same registry / `isAssignable` function as activity `PortDescriptor`. The validator treats both the same way it treats activity ports.

---

## 6. Subtype rules

**Strict nominal subtyping with directed assignment:**

- `SinglePageDocument` → `Document` slot: ✓
- `MultiPageDocument` → `Document` slot: ✓
- `Document` → `SinglePageDocument` slot: ✗ (downcast)
- `Segment<Table>` → `Segment` slot: ✓
- `Segment` → `Segment<Table>` slot: ✗
- `Document` → `Artifact` slot: ✓ (everything's an Artifact)
- `Artifact` → `Document` slot: ✗
- `Document` → `Document[]` slot: ✗ (cardinality is part of the type; no auto-wrap)
- `Document[]` → `Document` slot: ✗ (no auto-unwrap)

**Why not auto-wrap / auto-unwrap?** Two reasons: it hides the fan-out / fan-in choice, and our schema already has `map` / `join` nodes specifically to make cardinality explicit. The wiring layer mirrors the schema.

---

## 7. Library workflows + childWorkflow nodes

`childWorkflow` already exists in the schema. With typed I/O, a library workflow declares its top-level `inputs` / `outputs` (these become the port descriptors of `childWorkflow` nodes that reference it). The library-management UX (Phase 2) shows the declared input/output kinds on the workflow card; the editor's `ChildWorkflowNodeSettings` form filters available library workflows by matching `kind` to the upstream producer.

This is the bridge from Phase 2 (library workflows) into Phase 3 (typed I/O): once libraries exist, they need typed signatures.

---

## 8. Dynamic nodes (Phase 6 interaction)

Windmill-style scripts declare a TS/Python signature. Phase 6 derives a `kind` for each declared parameter and return value. Where the signature uses a type the registry doesn't know, the user (or the AI agent) explicitly maps it to a registered `ArtifactKind` at script-publication time. No silent fallback to `Artifact` — that would silently weaken type safety.

---

## 9. AI workflow builder (Phase 7 interaction)

The agent reads the catalog (already JSON-Schema-exportable) and uses `kind` to narrow candidate activities per slot. The `kind` rides through `z.toJSONSchema()` as `x-kind` extension fields on each port descriptor, the same mechanism `x-widget` / `x-options` use today.

`isAssignable` is also exposed to the agent as a tool — the agent can ask "is `Segment<Table>` assignable to `Segment`?" without re-implementing subtype logic.

---

## 10. Provider catalog (the OCR-/VLM-picker question)

The user's original framing — *"extract the segment out of a document and then pass it to a particular OCR or VLM"* — collapses into a `provider-catalog.ts` companion to the activity catalog:

```ts
interface ProviderDescriptor {
  id: string;
  displayName: string;
  category: "ocr" | "vlm" | "classifier" | "validator";
  acceptsKind: ArtifactKind | `${ArtifactKind}[]`;
  returns: ArtifactKind | `${ArtifactKind}[]`;
}
```

Activities that take a `provider: string` parameter (e.g., a generic `ocr.run` that delegates to Azure / Mistral / Docling) source their dropdown from this catalog filtered by the upstream `kind`. Phase 3 introduces the descriptor type and one or two example providers; Phase 5 (segmentation pack) fans this out per real backend.

---

## 11. Out of scope for Phase 3

- **Draw-time wire rejection on type grounds.** Wires are execution-order only; rejecting them on kind mismatch would conflate ordering with data flow. See §5. An auto-bind-on-wire-draw layer that makes wires semantically meaningful (and brings back draw-time UX) is filed for **Phase 3.5**.
- **Auto-wrap / auto-unwrap** between `T` and `T[]`. Use `map` / `join`.
- **Structural typing or shape inference.** Strictly nominal — every `ArtifactKind` is declared in the registry.
- **Per-field types inside an artifact.** `OcrFields` is one kind; the individual fields it contains are not separately typed at the wiring layer.
- **Runtime type checks.** The engine stays opaque.
- **Migrating `CtxDeclaration.type` away.** The primitive `type` field (`"string" | "number" | "boolean" | "object" | "array"`) stays as-is alongside the new `kind?` field. `type` is a runtime-shape concept (Zod/JSON-Schema validation of the actual value); `kind?` is the artifact-layer annotation for UI/save-time purposes. Both coexist.

---

## 12. Reading order for implementation

1. `packages/graph-workflow/src/types/artifacts.ts` — interfaces + `ArtifactKind` union
2. `packages/graph-workflow/src/types/artifact-registry.ts` — registry + `registerArtifactKind`
3. `packages/graph-workflow/src/types/subtype-check.ts` — `isAssignable`
4. Extend `PortDescriptor` with `kind?: ArtifactKind | "${ArtifactKind}[]"` (activity catalog ports)
5. Extend `CtxDeclaration` with `kind?: ArtifactKind | "${ArtifactKind}[]"` (manually-declared ctx variables) — see §5.1
6. Extend `LibraryPortDescriptor` with `kind?: ArtifactKind | "${ArtifactKind}[]"` (library inputs/outputs) — see §5.1
7. Add **binding-walk** type-check pass to `validator.ts` (save-time; walks ctx keys not edges — see §5; consults activity `PortDescriptor.kind`, `CtxDeclaration.kind`, and `LibraryPortDescriptor.kind` interchangeably)
8. Frontend: handle colour + hover tooltip + on-selection type pill. **No `handleConnect` rejection** — wires are ordering only.
9. Frontend: variable picker shows all ctx variables; compatible ones first, incompatible ones dimmed below a divider with a hover-tooltip naming the reason.
10. Frontend: `WorkflowSettingsDrawer` ctx-rows grow a "Kind" Select column populated from the registry.
11. Frontend: `LibraryPortListEditor` (inside `SaveAsLibraryModal`) ports grow a "Kind" Select column. `LibraryPickerModal` signature summary + `ChildWorkflowNodeSettings` signature summary surface the kind annotations.
12. Fan out `kind` declarations across the 41 catalog entries (incrementally; framework + 4–6 exemplars is a reasonable Phase 3 cap, full fan-out as Phase 3.x)
13. Provider catalog (Phase 3 → Phase 5 hand-off)

---

## 13. Open after this lands

- **Phase 3.5 — auto-bind-on-wire-draw.** Make wire-draw semantically meaningful: drawing a wire between two typed handles auto-creates a ctx key + the matching input/output bindings on both sides. Restores draw-time UX (rejection on kind mismatch becomes consistent because the wire IS the binding). Bigger lift; punted to keep Phase 3 small.
- **Phase 3.x — full catalog fan-out.** Phase 3 ships framework + 4–6 exemplar activity entries; the remaining ~35 catalog entries get their `kind` declarations fanned out incrementally afterward. The bulk catalog test enforces "every entry that DOES declare `kind` declares it for every port" so partial fan-out stays consistent.
- Concrete kind palette beyond v1 list (when new domains appear)
- Auto-fan-out fixers in the editor ("you wired `Document[]` into a `Document` slot — add a `map` node?")
- LSP-style hovers that show the producer's actual ctxKey path, not just the kind

These are deliberately punted: get the floor in first, polish layer afterwards.
