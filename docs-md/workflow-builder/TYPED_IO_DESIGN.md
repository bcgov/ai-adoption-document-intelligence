# Typed I/O Artifacts on the Canvas — Design

**Status:** Decided. Phase 3 of the post-1A plan. (Formerly the `TYPED_IO_BRAINSTORM.md` placeholder.)
**Last updated:** 2026-05-23.
**Why now:** Three downstream phases all depend on a concrete artifact taxonomy — segmentation node pack (Phase 5), dynamic nodes (Phase 6), and the AI workflow builder (Phase 7). Continuing to defer this means those phases ship as half-features (segments are opaque blobs, the agent can't reason about port compatibility, dynamic nodes have no signature vocabulary).

This document commits to concrete decisions for the typed-handles question. Engine semantics are unchanged from [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) (Model A — single in / single out + blackboard ctx). Types are a **UI-layer assertion**: the canvas refuses to draw a wire if the types don't match; the runtime still passes opaque `Record<string, unknown>` through ctx.

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

**Mismatched-draw feedback.** When the user starts a connection from a typed handle, the canvas highlights compatible target handles in green and pulses incompatible ones with a red border. The draw is rejected on release if the target is incompatible; a Mantine notification names the reason (`"OcrResult cannot be wired to Segment input"`).

---

## 5. Where type-checking actually runs

Three checkpoints, all consuming the same `isAssignable()` from the shared package:

1. **Canvas — `onConnect`** — UI rejects draws that aren't assignable. Best UX. Implementation in `WorkflowEditorCanvas.tsx`'s `handleConnect`.
2. **Settings panel — variable picker** — when a port has a `kind`, the picker filters ctx variables to only those whose latest-known producer kind is assignable. The producer kind comes from the upstream-output catalog `kind` lookup. (Today's picker shows everything; Phase 3 filters.)
3. **Backend — save-time validator** — `validateGraphConfig` in `@ai-di/graph-workflow` walks every edge and asserts the source output port's `kind` is assignable to the target input port's `kind`. Mismatch produces a `GraphValidationError` with severity `"error"`, surfaced via the existing red node badges + drawer.

The runtime engine still doesn't check types. The blackboard is opaque `Record<string, unknown>`. Type safety is a save-time + design-time property only.

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

- **Auto-wrap / auto-unwrap** between `T` and `T[]`. Use `map` / `join`.
- **Structural typing or shape inference.** Strictly nominal — every `ArtifactKind` is declared in the registry.
- **Per-field types inside an artifact.** `OcrFields` is one kind; the individual fields it contains are not separately typed at the wiring layer.
- **Runtime type checks.** The engine stays opaque.
- **Migrating ctx declarations to typed.** `CtxDeclaration.type` (`"string" | "number" | "boolean" | "object" | "array"`) is a separate, runtime-shape concept; it stays as-is. Artifact kinds layer above it for UI/save-time purposes only.

---

## 12. Reading order for implementation

1. `packages/graph-workflow/src/types/artifacts.ts` — interfaces + `ArtifactKind` union
2. `packages/graph-workflow/src/types/artifact-registry.ts` — registry + `registerArtifactKind`
3. `packages/graph-workflow/src/types/subtype-check.ts` — `isAssignable`
4. Extend `PortDescriptor` with `kind?: ArtifactKind | ...[]`
5. Add type-check pass to `validator.ts` (save-time)
6. Frontend: handle colour + tooltip; reject mismatched draws in `handleConnect`
7. Frontend: filter variable picker by `kind`
8. Fan out `kind` declarations across the 41 catalog entries (incrementally)
9. Provider catalog (Phase 3 → Phase 5 hand-off)

---

## 13. Open after this lands

- Concrete kind palette beyond v1 list (when new domains appear)
- Auto-fan-out fixers in the editor ("you wired `Document[]` into a `Document` slot — add a `map` node?")
- LSP-style hovers that show the producer's actual ctxKey path, not just the kind

These are deliberately punted: get the floor in first, polish layer afterwards.
