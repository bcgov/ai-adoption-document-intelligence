# Phase 3 — Typed I/O Artifacts — Requirements

**Status:** Refined. Ready for user-story generation.
**Owner:** Alex
**Branch:** `feature/visual-workflow-builder`
**Feature-docs slug:** `20260529-workflow-builder-phase3-typed-io-artifacts`
**Predecessor:** Phase 2 Track 3 (`feature-docs/20260528-workflow-builder-phase2-versioning-ui/`) — closed.
**Authoritative design:** [docs-md/workflow-builder/TYPED_IO_DESIGN.md](../../docs-md/workflow-builder/TYPED_IO_DESIGN.md) (locked taxonomy + reading order in §12).
**Plan reference:** [docs-md/workflow-builder/IMPLEMENTATION_PLAN.md §5 Phase 3](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md#phase-3--typed-io-artifacts).

---

## 1. Why this phase

Three downstream phases all depend on a concrete artifact taxonomy:

- **Phase 4 (try-in-place per-node previews)** picks renderers by `ArtifactKind`.
- **Phase 5 (segmentation node pack)** emits `Segment<Kind>[]`.
- **Phase 6 (dynamic nodes)** maps Windmill-style script signatures to kinds.
- **Phase 7 (AI workflow builder)** uses kinds to narrow candidate activities.

Continuing to defer this means those phases ship as half-features (segments stay opaque blobs, the agent can't reason about port compatibility, dynamic nodes have no signature vocabulary).

---

## 2. Mental model — non-negotiable

The engine is **Model A** ([WORKFLOW_NODE_IO_MODEL_DECISION.md](../../docs-md/workflow-builder/WORKFLOW_NODE_IO_MODEL_DECISION.md)). Wires between nodes represent **execution order only**. Data flows through the **ctx blackboard** via each node's per-port bindings (`PortBinding { port: string, ctxKey: string }`, declared in `node.inputs[]` / `node.outputs[]`).

Phase 3 attaches `kind?: ArtifactKind` to:

- **PORTS** (the activity catalog's `PortDescriptor`)
- **`CtxDeclaration`** (workflow-settings drawer's ctx editor)
- **`LibraryPortDescriptor`** (library inputs/outputs)

…but **NOT to wires**. The type signal lives on the **HANDLE** (the coloured dot on the node) + the **SELECTION TYPE PILL**. Wires stay execution-order arrows; wire body colour stays coloured by edge type (switch / error / normal) from Phase 1B.

**Single in / single out on the canvas stays sacrosanct.** No per-port handles. Multi-typed-port activities (e.g. `document.classify` with outputs `[Classification, Artifact, Artifact]`) are handled via the **selection type pill** listing all ports — not via multiple handles on the canvas.

**There is NO draw-time wire rejection in Phase 3.** Drawing a wire between two typed handles whose kinds don't match succeeds — the wire still adds ordering. Type enforcement happens at two checkpoints, both operating on **ctx-key bindings** (not edges):

1. **Settings-panel variable picker** (design-time, primary discovery surface): all ctx variables visible, compatible ones first, incompatible ones below a divider, dimmed, with hover tooltip naming the reason.
2. **Backend `validateGraphConfig`** (save-time, authoritative): walks ctx keys; for each, every producer port's kind must be assignable to every consumer port's kind. Errors anchor to the **consumer port**.

The walker consults `kind` from THREE sources interchangeably: activity `PortDescriptor.kind?`, `CtxDeclaration.kind?`, `LibraryPortDescriptor.kind?`. Any missing `kind` defaults to `Artifact` (wildcard).

---

## 3. Locked decisions

### 3.1 Pre-existing locks (from TYPED_IO_DESIGN.md)

- **D1.** `ArtifactKind` is a **flat string-literal union**, including pre-enumerated parameterised entries (`"Segment<Text>"`, `"Segment<Table>"`, `"Segment<Figure>"`, `"Segment<Form>"`, `"Segment<KeyValue>"`, `"Segment<Signature>"`, `"Segment<Header>"`). Not a structural `{ kind: "Segment"; parameter?: SegmentKind }`.
- **D2.** Cardinality via **string suffix** (`"Document[]"`, `"Segment[]"`), one `kind` field. No sibling `isArray` field.
- **D3.** Strict nominal subtyping. No auto-wrap between `T` and `T[]`.
- **D4.** Type registry open via `registerArtifactKind(...)` for Phase 6 dynamic nodes; user-defined kinds must declare a `baseKind` from the existing registry.
- **D5.** Wire body colour stays coloured by edge type (switch / error / normal). Kind colour lives only on the handle dot + type pill.
- **D6.** Multi-producer ctx keys use a **strict producer-side check** — every producer must be assignable to every consumer; no least-common-supertype computation.

### 3.2 New locks (this requirements pass)

- **D7. Catalog exemplar set (5 entries).**
  1. **`document.split`** ([document-split.ts](../../packages/graph-workflow/src/catalog/activities/document-split.ts)):
     - Inputs: `blobKey: MultiPageDocument`, `groupId: Artifact`, `documentId: Artifact`.
     - Outputs: `segments: Segment[]`.
  2. **`document.classify`** ([document-classify.ts](../../packages/graph-workflow/src/catalog/activities/document-classify.ts)) — **multi-port exemplar**:
     - Inputs: `ocrResult: OcrResult`, `segment: Segment`.
     - Outputs: `segmentType: Classification`, `confidence: Artifact`, `matchedRule: Artifact`.
     - Scalar/metadata outputs (`confidence`, `matchedRule`) carry `Artifact` wildcard — honest about not being in the artifact taxonomy.
  3. **`mistral-ocr.process`** ([mistral-ocr-process.ts](../../packages/graph-workflow/src/catalog/activities/mistral-ocr-process.ts)):
     - Inputs: `fileData: Document`, plus other Artifact inputs (template / prompt).
     - Outputs: `ocrResult: OcrResult`.
  4. **`document.validateFields`** ([document-validate-fields.ts](../../packages/graph-workflow/src/catalog/activities/document-validate-fields.ts)):
     - Inputs typed where they map cleanly (`OcrResult` / `OcrFields` where applicable); other inputs as `Artifact`.
     - Outputs: `validationResults: ValidationResult`.
  5. **`tables.lookup`** ([tables-lookup.ts](../../packages/graph-workflow/src/catalog/activities/tables-lookup.ts)):
     - Inputs: all `Artifact` (groupId / tableId / lookupName are identifiers, not artifacts).
     - Outputs: `result: Reference`.
- **D8. OCR coverage in Phase 3 = Mistral only.** `azure-ocr-submit` / `azure-ocr-poll` / `azure-ocr-extract` defer to **Phase 3.x** alongside the rest of the catalog fan-out. Avoids over-investing in the multi-step async OCR pattern before the steady state is clear.
- **D9. Multi-port verification uses `document.classify`.** No throwaway fixture diff; the entry's existing 3-output shape drives the multi-port Playwright scenario.
- **D10. Milestone slicing — A through G, one commit per milestone.** Mirrors Phase 2 Track 3's cadence.
- **D11. Provider catalog scaffold seed = Azure OCR + Mistral OCR.** Two `ProviderDescriptor` entries. Actual provider-filtered dropdown UX deferred to Phase 5.
- **D12. Picker UX = all variables visible, divider, incompatibles dimmed ~50% with hover tooltip.** Tooltip text: `"<producerKind> — incompatible with this port (expects <consumerKind>)"`.
- **D13. "Kind" Select column placement = after Description, before Default.** Includes blank `"—"` option meaning "no kind / Artifact wildcard" so users can opt out per-row without losing the column.
- **D14. Library `metadata.inputs[].path` depth-check lands in Milestone F.** Phase 2 follow-up. The new binding-walk validator naturally has access to the same ctx-key shape; this check (path resolves to a real ctx key / output binding source) fits there.
- **D15. Bulk catalog test is all-or-nothing per entry.** If an entry declares `kind` on any port, it must declare `kind` on every port (using `"Artifact"` wildcard where the port isn't in the taxonomy).

---

## 4. Scope — what we will build

### 4.1 Shared package (`packages/graph-workflow`)

Three new files in `src/types/`:

- **[`artifacts.ts`](../../packages/graph-workflow/src/types/)**: TS interfaces + `ArtifactKind` string-literal union (`Artifact` / `Document` / `MultiPageDocument` / `SinglePageDocument` / `Segment` / `Segment<Text|Table|Figure|Form|KeyValue|Signature|Header>` / `OcrResult` / `OcrFields` / `OcrTable` / `Classification` / `ValidationResult` / `Reference`). Plus provenance shapes (`Segment` carries `parentDocId / pageRange? / polygon? / kind? / confidence? / blobKey?`).
- **`artifact-registry.ts`**: runtime registry mapping `ArtifactKind` → `{ displayName, color, baseKind?, isArray }`. Also exports `registerArtifactKind(...)` for Phase 6 dynamic nodes.
- **`subtype-check.ts`**: `isAssignable(from: ArtifactKind, to: ArtifactKind): boolean` consumed by picker + validator. Walks `baseKind` chain. Strict nominal — no auto-wrap between `T` and `T[]`.
- **`index.ts`**: barrel.

Three schema extensions, all the same shape (`kind?: ArtifactKind | "${ArtifactKind}[]"`), all back-compat (omitted = `Artifact` wildcard):

- **`PortDescriptor`** in [`packages/graph-workflow/src/catalog/types.ts`](../../packages/graph-workflow/src/catalog/types.ts) — activity catalog ports.
- **`CtxDeclaration`** in [`packages/graph-workflow/src/types.ts`](../../packages/graph-workflow/src/types.ts) — manually-declared ctx variables. New field is optional and coexists with the existing primitive `type` field (`type` is runtime-shape; `kind` is artifact-layer).
- **`LibraryPortDescriptor`** in [`packages/graph-workflow/src/types.ts`](../../packages/graph-workflow/src/types.ts) — library inputs/outputs. Same coexistence pattern as `CtxDeclaration`.

### 4.2 Backend binding-walk validator pass

In [`packages/graph-workflow/src/validator/validator.ts`](../../packages/graph-workflow/src/validator/validator.ts):

```
for each ctxKey written or read in the graph:
  producers = [(node, outputPort, kind) for every node.outputs that writes this key]
  consumers = [(node, inputPort, kind) for every node.inputs that reads this key]
  for each (cnode, cport, ckind) in consumers:
    for each (pnode, pport, pkind) in producers:
      if not isAssignable(pkind, ckind):
        emit GraphValidationError {
          severity: "error",
          nodeId: cnode.id,
          port: cport,
          message: "Input port `<cport>` (<ckind>) on node `<cnode>` reads from ctx key `<ctxKey>`, written by node `<pnode>` (<pkind>) — <pkind> not assignable to <ckind>"
        }
```

The kind for each port resolves through (in order of precedence per source):

1. Activity `PortDescriptor.kind?` (when the port belongs to an activity node).
2. `CtxDeclaration.kind?` (when the port reads/writes a ctx variable declared in `metadata.ctx`).
3. `LibraryPortDescriptor.kind?` (when the port belongs to a library `inputs[]` / `outputs[]`).

Any missing `kind` defaults to `Artifact` (wildcard, always assignable).

Errors anchor to the consumer port so the existing red node badges + error drawer (from Phase 1A) light up the right surface.

### 4.3 Backend follow-up — library `metadata.inputs[].path` depth-check

The new binding-walk validator has access to the workflow's full ctx-key map. Add a parallel check: for every `LibraryPortDescriptor.path` in `metadata.inputs[]` / `metadata.outputs[]`, verify the path references a real ctx key / output binding source in the graph. Emits a `GraphValidationError` anchored to the workflow root (no specific node) if the path doesn't resolve.

### 4.4 Frontend canvas handle rendering

Model A intact — single in / single out on the canvas.

- Each node renders ONE input handle (left) + ONE output handle (right). Do not add per-port handles for multi-typed-port activities.
- **Handle colour rule:**
  - **Single typed port on that side** → handle dot coloured per the §4 palette table (blue=Document, green=Segment, violet=OcrResult, amber=Classification/ValidationResult, teal=Reference; arrays = doubled outline).
  - **Zero or multiple typed ports on that side** → handle stays **gray** (Artifact wildcard). Gray means "click the node to see the full typed signature" — never "this output is untyped."
- **Hover tooltip:** coloured handle shows the kind literal (`"Segment[]"`); gray multi-port handle shows `"Multiple outputs — select node to view all"` (or input-side equivalent).
- **On-selection type pill:** small Mantine `<Badge>` next to the handle. Single-port → one-line (`SEGMENT[]`). Multi-port → small list of all declared input + output ports with their kinds.
- **NO change to `handleConnect`** — wires remain draw-anything.

### 4.5 Frontend variable picker

In [`apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx`](../../apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx):

- When the target port has a declared `kind`, render ALL ctx variables.
- Sort compatible first.
- Incompatible variables below a divider labelled `"Incompatible with this port"`, dimmed to ~50% opacity, with hover tooltip naming the reason: `"<producerKind> — incompatible with this port (expects <consumerKind>)"`.
- Compatibility is computed per variable by looking up the upstream producer's kind (which may come from an activity output port, a `CtxDeclaration` with `kind` set, a library port, or default to `Artifact`).
- When the target port has **no declared kind** (legacy Artifact wildcard), no dimming — all variables show as compatible (the current behaviour).
- When the upstream producer's kind cannot be determined (e.g. user-declared ctx with no `kind` field), treat as `Artifact` → compatible with everything.

### 4.6 Frontend UI for the two new typed schema extensions

- **[`WorkflowSettingsDrawer`](../../apps/frontend/src/features/workflow-builder/settings/)** ctx-rows grow a `"Kind"` Select column. Options populated from the registry's display names + a blank `"—"` option meaning "no kind / Artifact wildcard". Column placement: after Description, before Default. Optional — leaving it blank persists no `kind` and is treated as Artifact wildcard.
- **`LibraryPortListEditor`** (inside [`SaveAsLibraryModal`](../../apps/frontend/src/features/workflow-builder/library/SaveAsLibraryModal.tsx)) ports grow the same `"Kind"` Select column with the same placement.
- **[`LibraryPickerModal`](../../apps/frontend/src/features/workflow-builder/library/LibraryPickerModal.tsx)** per-library signature summary surfaces the `kind` annotations alongside the primitive `type` (when present).
- **[`ChildWorkflowNodeSettings`](../../apps/frontend/src/features/workflow-builder/settings/control-flow/)** signature summary surfaces the same `kind` annotations next to each port (alongside the Track 3 `v{N}` / `head` badge — they coexist).

### 4.7 Catalog fan-out — 5 exemplars

Per D7 above. The bulk catalog test (`packages/graph-workflow/src/catalog/catalog.test.ts`) gains an invariant: every entry that declares `kind` on any port declares `kind` on every port.

### 4.8 Provider catalog scaffold

New file: `packages/graph-workflow/src/catalog/provider-catalog.ts`.

```ts
export interface ProviderDescriptor {
  id: string;
  displayName: string;
  category: "ocr" | "vlm" | "classifier" | "validator";
  acceptsKind: ArtifactKind | `${ArtifactKind}[]`;
  returns: ArtifactKind | `${ArtifactKind}[]`;
}
```

Two seed entries (per D11):

- `{ id: "azure-ocr", displayName: "Azure OCR", category: "ocr", acceptsKind: "Document", returns: "OcrResult" }`
- `{ id: "mistral-ocr", displayName: "Mistral OCR", category: "ocr", acceptsKind: "Document", returns: "OcrResult" }`

No dropdown rendering wired up in Phase 3 — that's Phase 5's job once the segmentation pack lands.

---

## 5. Out of scope (explicitly deferred)

- **Phase 3.5 — auto-bind-on-wire-draw.** Wires staying ordering-only means draw-time UX still has no rejection. The future bridge that makes wires also create the matching ctx bindings is filed as its own milestone.
- **Full catalog fan-out** to the remaining ~35 entries (Phase 3.x).
- **Phase 4 (try-in-place + per-node previews)** — gated on Phase 3 landing.
- **Draw-time wire rejection on type grounds.**
- **Auto-wrap / auto-unwrap between `T` and `T[]`.**
- **Structural typing or shape inference.**
- **Per-field types inside an artifact.**
- **Runtime type checks.** The engine stays opaque `Record<string, unknown>` through ctx.
- **Migrating `CtxDeclaration.type` away.** The primitive `type` field stays alongside the new `kind?` field.
- **US-053 (`borderColor` console warning).** Still open from Phase 1B; blocked on Alex pasting dev-console text. Not bundled into Phase 3.
- **Pre-existing commit `b86741c7` (native-binary pin).** Lands as its own PR against develop; not bundled into Phase 3.

---

## 6. Milestone breakdown — A through G

Per D10. One commit per milestone, matching Phase 2 Track 3's cadence. The user-stories writer should produce one umbrella `README.md` plus one `US-NNN-*.md` file per scenario, dependency-ordered.

### Milestone A — Shared package types/registry/subtype-check + three schema extensions

- Create `packages/graph-workflow/src/types/artifacts.ts` (interfaces + `ArtifactKind` union).
- Create `packages/graph-workflow/src/types/artifact-registry.ts` (registry + `registerArtifactKind`).
- Create `packages/graph-workflow/src/types/subtype-check.ts` (`isAssignable`).
- Create `packages/graph-workflow/src/types/index.ts` (barrel).
- Re-export from package barrel (`packages/graph-workflow/src/index.ts`).
- Extend `PortDescriptor` with `kind?: ArtifactKind | "${ArtifactKind}[]"`.
- Extend `CtxDeclaration` with `kind?: ArtifactKind | "${ArtifactKind}[]"`.
- Extend `LibraryPortDescriptor` with `kind?: ArtifactKind | "${ArtifactKind}[]"`.
- Unit tests: `isAssignable` covers the full subtype matrix; registry round-trips entries; user-defined kind via `registerArtifactKind` shows up in `isAssignable`.
- Package build passes.
- **Verification surface for Alex:** none yet — pure shared-package change. Build the package; ask Alex to restart Vite (Phase 3 introduces runtime exports — the registry + `isAssignable` are not types-only).

### Milestone B — Backend binding-walk validator pass + library path depth-check

- Add binding-walk pass to `packages/graph-workflow/src/validator/validator.ts`.
- Resolve `kind` from `PortDescriptor.kind?` / `CtxDeclaration.kind?` / `LibraryPortDescriptor.kind?` interchangeably.
- Emit `GraphValidationError` anchored to the consumer port.
- Add `LibraryPortDescriptor.path` depth-check (D14).
- Backend tests: single-producer mismatch, multi-producer mismatch, `CtxDeclaration`-as-producer typed correctly, `LibraryPortDescriptor`-as-producer typed correctly, cleanly-typed graph passes, library `path` resolves vs doesn't.
- Backend full-suite green.
- **Verification surface for Alex:** none yet — backend change.

### Milestone C — Frontend canvas handle colour + hover tooltip + type pill

- Update canvas handle rendering to apply the colour rule from §4.
- Hover tooltip shows kind literal or "Multiple outputs..." text.
- On-selection type pill renders next to the handle (Mantine `<Badge>`).
- Multi-port pill expands to list all declared input + output ports.
- No change to `handleConnect`.
- Frontend vitest covers single-port handle colour, multi-port gray handle, type pill rendering.
- Type-check passes; Biome clean.
- **Verification surface for Alex:** open a typed workflow → see coloured handle on a `document.split` node (after Milestone F fans out the kind) → select it → see the type pill. Until Milestone F lands, the pill renders against synthetic test fixtures in the vitest only.

### Milestone D — Frontend variable picker dim-with-tooltip

- Update `VariablePicker.tsx` to sort compatible-first, dim incompatible, render divider, and add hover tooltip with the reason string.
- Honor "kind on producer not known → treat as `Artifact` → compatible."
- Frontend vitest covers: compatible-only render, mixed list with divider, hover-tooltip text, picker on a non-typed port (no dimming).
- **Verification surface for Alex:** none yet on its own — the picker uses kind from Milestone F's typed exemplars. Synthetic test fixtures cover the unit behaviour.

### Milestone E — Frontend "Kind" Select columns

- `WorkflowSettingsDrawer` ctx-rows grow a "Kind" Select column (after Description, before Default).
- `LibraryPortListEditor` ports grow the same column.
- `LibraryPickerModal` signature summary surfaces `kind`.
- `ChildWorkflowNodeSettings` signature summary surfaces `kind` alongside the `v{N}` / `head` badge.
- Round-trip tests: save → load preserves the `kind` selection in both schemas.
- Frontend vitest covers each surface.
- **Verification surface for Alex:** Open the Workflow settings drawer → add a ctx variable → set Kind = "Document" → save → reload → Kind still selected. Same for Save-as-library + library picker + childWorkflow node.

### Milestone F — Catalog fan-out (5 exemplars) + provider catalog scaffold

- Fan out `kind` declarations on `document.split`, `document.classify`, `mistral-ocr.process`, `document.validateFields`, `tables.lookup` per D7.
- Bulk catalog test asserts all-or-nothing per entry.
- Create `packages/graph-workflow/src/catalog/provider-catalog.ts` with the Azure OCR + Mistral OCR seed entries.
- **Verification surface for Alex:** rebuild package → restart Vite → drop a `document.split` node onto a canvas → output handle is green (Segment[]) → drop a `document.classify` node → handles are gray with multi-port pill on select.

### Milestone G — End-to-end Playwright verification

Per the verification list in the user's prompt:

1. Open a workflow with a typed single-output activity (e.g. `document.split`); verify output handle is coloured per palette + hover shows kind literal.
2. Select the node; verify the type pill renders next to the handle with the kind text.
3. Open a workflow with `document.classify` (the multi-port exemplar); verify the handle stays gray + the selection type pill expands to list ALL declared ports.
4. Draw a wire between two typed handles whose kinds don't match — verify it succeeds (wire created, no rejection).
5. Open the variable picker on a typed port — confirm compatible-first ordering + dimmed incompatible entries with hover tooltip.
6. In the Workflow settings drawer, add a ctx variable + set its Kind to "Document"; verify a typed picker downstream recognises it as compatible with Document-accepting ports.
7. Save a workflow with a real cross-kind ctx binding (Document producer writing to a ctx key read by a Segment consumer); confirm the backend returns the binding-walk error anchored to the consumer node + port.
8. Save a workflow as a library, declaring a typed input/output via `LibraryPortListEditor`; reference it from a parent workflow's childWorkflow node; verify the typed signature surfaces in `ChildWorkflowNodeSettings` summary + drives the picker filter.
9. Fix the bindings via the picker; re-save → green.

Screenshots land under `/tmp/wb-phase3-verify/`.

- **Verification surface for Alex:** this is the click-and-play milestone. Final ping for the phase.

---

## 7. Non-functional constraints

- **Backwards compatibility.** All three schema extensions are additive + optional. Existing workflows without `kind` declarations validate cleanly and render with gray handles. Existing 35+ catalog entries that don't get typed in Phase 3 default to `Artifact` everywhere — same as before.
- **No "any" types** per [CLAUDE.md](../../CLAUDE.md). `kind` field is properly typed via the literal-string union; the registry maps known kinds to known shapes.
- **Full Swagger / OpenAPI documentation** per [CLAUDE.md](../../CLAUDE.md). No new backend endpoints in Phase 3 (the validator pass extends an existing endpoint), so this is "no new DTOs to document" — just confirm the existing `GraphValidationError` shape covers the new error case.
- **No `apps/temporal` runtime impact.** Type checking is design-time + save-time only. The engine stays opaque per [WORKFLOW_NODE_IO_MODEL_DECISION.md](../../docs-md/workflow-builder/WORKFLOW_NODE_IO_MODEL_DECISION.md).
- **No premature abstraction.** Don't introduce a generic kind-resolution helper unless three surfaces want it. The picker, the validator, and the canvas handle renderer ARE three surfaces — a small `resolvePortKind(port, ctx, libraryPorts)` helper is fine; broader generic refactoring is not.
- **Dev server cadence.** After Milestone A (and again after Milestone F) the `packages/graph-workflow` build will introduce new runtime exports — explicitly ping Alex to restart Vite. The pre-bundle of the package goes stale otherwise.
- **No bundling unrelated commits.** Pre-existing `b86741c7` (native-binary pin) lands separately. US-053 (borderColor warning) stays blocked.

---

## 8. Roles & permissions

- **Workflow author.** Drops nodes, declares ctx variables, draws wires, sets per-port bindings, picks libraries, sets `kind` annotations. They get the picker dim, the type pill, the handle colour cue, the save-time error.
- **Workflow consumer / API client.** Unaffected — runtime engine stays opaque.
- **System admin / observer.** Unaffected.

No new auth surface. Existing Phase 1A workflow access controls cover the new UI.

---

## 9. Edge cases + error states

- **No upstream producer for a typed port (orphan input).** Validator emits the existing "input has no producer" error from Phase 1A; the new kind check doesn't fire because there's no producer kind to compare against.
- **Multi-producer ctx key with mixed kinds.** Per D6, every producer must be assignable to every consumer. If two producers write different kinds, both consumers see errors anchored at them.
- **Producer kind unknown (legacy entry).** Treated as `Artifact`. Compatible with everything (picker doesn't dim, validator doesn't error). The kind-aware path lights up only when both sides declare a kind.
- **User-declared ctx variable without `kind` field.** Treated as `Artifact` (legacy). The new "Kind" Select column lets them opt in per row.
- **Cardinality mismatch (`Document` → `Document[]`).** Validator rejects per D3 / D7. Picker dims with reason `"Document — incompatible with this port (expects Document[])"`.
- **`registerArtifactKind` collision in Phase 6 dynamic nodes.** Out of scope for Phase 3 — but the registry should refuse silently-overwriting an existing kind. Throwing is fine.
- **Provider catalog dropdown.** No UI yet — descriptors exist in code only. Phase 5 wires the dropdown.

---

## 10. Open follow-ups

These are filed but explicitly **not blocking Phase 3 landing**:

- **Phase 3.x — full catalog fan-out.** Remaining ~35 entries get `kind` declarations incrementally.
- **Phase 3.5 — auto-bind-on-wire-draw.** Wire-draw auto-creates the matching ctx key + bindings.
- **Concrete kind palette beyond v1 list.** New domains may need additional kinds.
- **Auto-fan-out fixers in the editor** ("you wired `Document[]` into a `Document` slot — add a `map` node?").
- **LSP-style hovers** showing the producer's actual ctxKey path, not just the kind.

---

## 11. References

- Authoritative design: [TYPED_IO_DESIGN.md](../../docs-md/workflow-builder/TYPED_IO_DESIGN.md).
- Plan: [IMPLEMENTATION_PLAN.md §5 Phase 3](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md).
- I/O model decision: [WORKFLOW_NODE_IO_MODEL_DECISION.md](../../docs-md/workflow-builder/WORKFLOW_NODE_IO_MODEL_DECISION.md).
- Session handoff: [SESSION_HANDOFF.md](../../docs-md/workflow-builder/SESSION_HANDOFF.md).
- Phase 2 Track 3 closure (predecessor pattern reference): [feature-docs/20260528-workflow-builder-phase2-versioning-ui/](../20260528-workflow-builder-phase2-versioning-ui/).
- Phase 2 Track 1 + Track 2 closures: [feature-docs/20260526-workflow-builder-phase2-library-workflows/](../20260526-workflow-builder-phase2-library-workflows/), [feature-docs/20260527-workflow-builder-phase2-workflow-as-api/](../20260527-workflow-builder-phase2-workflow-as-api/).
