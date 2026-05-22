# Typed I/O Artifacts on the Canvas — Brainstorm

**Status:** Placeholder. Deferred from Phase 1A. To be filled out when we're ready to think about it.
**Created:** 2026-05-22.

This document is the parking space for the typed-handles / typed-artifacts question. The Phase 1A canvas ships with untyped handles (single in / single out per the I/O model decision) — when we're ready to layer types *on top* of that for canvas-level enforcement, we work through it here.

---

## Why this is deferred

- The engine doesn't need types — data flows through the `ctx` blackboard, not through wires. See [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md).
- Adding type-painted handles is purely a *UI assertion*: the canvas refuses to draw a wire if the types don't match. The engine stays untyped.
- We can ship a working visual editor without it. The cost of *not* having it is mostly safety — users can wire incompatible things together and only find out at runtime.

The user's walking notes argue for it (see [NOTES.md §1.1](NOTES.md#11-typed-connections-between-nodes)) — the typed-artifact hierarchy is something we eventually want.

---

## Key questions for the brainstorm

These are the questions to work through when we open this up:

### Q1 — What's the artifact taxonomy?

The user's starting hierarchy:
- `Document` (base)
  - `MultiPageDocument`
  - `SinglePageDocument`
- `Segment` (a fragment of a document, e.g., a region within a page)
- OCR-derived: `OcrResult`, `OcrFields`, `OcrTable`
- Reference data: `Classification`, `ValidationResult`
- Pickable kinds: `Segment<Text>`, `Segment<Table>`, `Segment<Figure>`, `Segment<Form>`

What goes in the base set vs the extension set? What's `T | T[]` and what's `T[]` only? Where does the per-page bounding box live (on `Segment` itself, or on a sidecar)?

### Q2 — Where does the type registry live?

Options:
- In `packages/graph-workflow` alongside the activity catalog (one source of truth across backend + frontend)
- Frontend-only (since the engine ignores it)
- Decoupled package `@ai-di/workflow-types` (overkill?)

If types are checked at workflow-save time on the backend (refuse to save a workflow with type-mismatched wires), they have to be in the shared package.

### Q3 — How permissive is the matching?

LabVIEW / KNIME: strict — refuse mismatched draws.
Houdini: permissive — wire draws but value is converted lazily.
ComfyUI: strict per port type; some pickers expose subtype constraints.

Likely we want strict for primary types (`Document` → `Document` only) but allow subtype substitution (`SinglePageDocument` flows into a `Document` slot). Standard nominal subtyping.

### Q4 — How are types declared on the catalog entry?

Today the `PortDescriptor` is `{ name, label, description?, required? }`. To add types we extend it to `{ ..., kind: ArtifactKind }`. The `ArtifactKind` would be a string literal union or a registered class identifier.

```ts
inputs: [
  { name: "doc", label: "Document", kind: "Document", required: true },
]
outputs: [
  { name: "segments", label: "Segments", kind: "Segment[]", required: true },
]
```

Backwards compat with Phase 1A: missing `kind` = `any`, drawable to anything. So we can add types incrementally per activity.

### Q5 — How are types rendered on the canvas?

Options:
- LabVIEW-style: handle shape encodes the type (circle / square / diamond)
- KNIME-style: handle colour encodes the type
- ComfyUI-style: handle colour *and* port label

We use Mantine + Tabler, so colour-coded handle dots with a hover tooltip showing the type name is probably the right starting point. Possibly a tiny type pill at the handle on selected nodes.

### Q6 — How does the user pick a backing OCR/VLM model for a typed `Segment`?

This is where the user's "extract the segment out of a document and then pass it to a particular OCR or VLM" vision lives. The `segment.crop` node (Phase 5) produces a `SinglePageDocument` that downstream nodes consume. If the downstream node is a specialised VLM (e.g., a table-extraction model), its input slot kind is `SinglePageDocument`, the wire draws cleanly, types match.

The catalog of which OCR/VLM models accept which artifact kinds is itself a sub-design — likely a `provider-catalog.ts` companion to the activity catalog, with each provider declaring `{ id, displayName, acceptsKind: ArtifactKind, returns: ArtifactKind }`.

### Q7 — Does this collapse into per-activity input pickers?

Alternative approach: the type system isn't on the canvas — it's in the side panel. When you click an Activity node, the input pickers only offer ctx variables of matching kind. The canvas stays untyped (just connection order); the *binding* is what's typed. This is more conservative and matches the Model A blackboard better.

Tradeoff: less visual feedback. The user sees a draw-anywhere canvas but discovers mismatches when they open the settings panel.

### Q8 — How does this interact with dynamic nodes (Phase 6)?

If users author Windmill-style nodes at runtime, their signature declares the artifact kinds. So the type system survives dynamic registration as long as the catalog entry's `kind` field can reference user-defined kinds (or the kind is a free-text string with a registry of known kinds).

### Q9 — How does this interact with the AI builder (Phase 7)?

The AI agent reading the catalog uses the type information to compose valid workflows. Strict typing helps the agent — fewer invalid candidates. The JSON Schema export of the catalog should include `kind` in the `x-*` extension fields so LLM tool-calling consumers see it.

---

## What to read before opening this up

- [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) — why we landed on Model A
- [NOTES.md §1.1](NOTES.md#11-typed-connections-between-nodes) — the user's framing
- [NOTES.md §3](NOTES.md#3-workflow-system-taxonomy-research) — how ComfyUI / LabVIEW / KNIME do it
- [NOTES.md §4](NOTES.md#4-document-segmentation-research) — the `Segment` shape that feeds this

---

## When to revive this

When any of these happens:
- A real bug shows up in a deployed workflow that typed-handles would have caught at design time
- The AI builder (Phase 7) needs the type information to compose workflows correctly
- We onboard a non-trivial number of users who keep wiring incompatible nodes together

Until then, this stays on the shelf.
