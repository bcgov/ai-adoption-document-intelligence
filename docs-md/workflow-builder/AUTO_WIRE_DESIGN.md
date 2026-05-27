# Auto-Wire — Hiding Port Bindings Behind the Wire

**Status:** Approved 2026-05-26. Supersedes and expands the "Phase 3.5 — auto-bind-on-wire-draw" follow-up filed in [TYPED_IO_DESIGN.md §13](TYPED_IO_DESIGN.md) and [IMPLEMENTATION_PLAN.md §5](IMPLEMENTATION_PLAN.md).
**Why now:** Phase 3's typed-I/O foundation has landed (`KindRef`, the artifact registry, `expectedKind`, `resolveProducerKindFor`). The handle colours and the kind-aware `VariablePicker` exist — but the user still authors `port → ctxKey` rows by hand. That is the layer this design removes. We keep Model A; we keep one handle per side; we keep ctx as the runtime data hop. We simply stop making the user think about any of it.

This document commits to a concrete resolver + UX for hiding port bindings. It is additive: the engine, the validator, the persisted JSON shape, and existing workflow files do not change. The user-facing surface becomes "inputs are connected sources, not ctx keys." The implementation is a frontend convenience layer over the existing `PortBinding[]` model.

---

## 1. Mental model

There is one mental model the user holds:

> *"Each input slot is either a constant I set, or a source I connect from. Most of the time, drawing an execution arrow between nodes is enough — the system figures out the rest."*

That quote is the user-vision framing from [NOTES.md §1.1](NOTES.md). Today the canvas honours the first clause (execution arrow) but not the second (figures out the rest). The settings panel exposes the underlying `port → ctxKey` machinery directly. After this change, the panel exposes the user model directly and treats `ctxKey` as an implementation detail.

Wires remain pure execution-order arrows (Model A is unchanged, per [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md)). Data flow is derived from the graph + the typed-I/O signatures, not from a parallel set of typed handles on the canvas.

---

## 2. The resolver

A pure function in the shared package:

```ts
// packages/graph-workflow/src/auto-wire/resolver.ts
export function resolveBindings(config: GraphWorkflowConfig): GraphWorkflowConfig;
```

Idempotent. Called on every editor mutation (debounced) and on save. Operates only on inputs that are **not locked** by the user (see §3). Produces a new `GraphWorkflowConfig` with `inputs[]` (and `outputs[]` it synthesises along the way) filled in.

### 2.1 Per-port resolution

For each consumer node `C`, for each declared input port `P` with a declared `kind`, when `P` is unlocked:

1. **Collect reachable producers.** Walk upstream from `C` over the graph's execution-order edges. A producer is any node `N` with an output port `Q` whose declared `kind` is assignable to `P.kind` (`isAssignable` from the existing subtype-check module, [TYPED_IO_DESIGN.md §6](TYPED_IO_DESIGN.md)). "Reachable" follows `edges[].source → edges[].target` in reverse; a producer is reachable from `C` iff there is a directed edge path from `N` to `C`.
2. **Compute topological distance.** Each candidate `(N, Q)` gets a distance = the number of edges on the shortest path from `N` to `C`.
3. **Resolve.**
   - **0 candidates** → port is `unsatisfied`. No binding written.
   - **1 candidate** → port is `auto-bound` to `(N, Q)`. Synthesise the ctx key (§2.2), stamp the consumer's `inputs[]` row and the producer's `outputs[]` row.
   - **2+ candidates, unique minimum-distance winner** → port is `auto-bound` to the nearest producer. (The closest typed source is almost always the user's intent in linear-ish chains.)
   - **2+ candidates tied at minimum distance** → port is `ambiguous`. No binding written. User must pick.

The tie rule is deliberate. Silent guessing on ties is the failure mode that erodes trust; users will eventually find the wrong wire and not understand why it was chosen. An ambiguous chip plus a one-click picker is the right escalation.

### 2.2 CtxKey synthesis

When the resolver auto-binds `(P on C) ← (Q on N)`:

- The synthesised ctx key is `__auto.${nodeId}.${outputPortName}`.
- The producer's `outputs[]` gets `{ port: Q, ctxKey: <synthesised> }`, unless an output binding already exists for that port — in which case the existing key is reused (so manually-named outputs still get connected to auto-bound consumers without duplication).
- The consumer's `inputs[]` gets `{ port: P, ctxKey: <synthesised or existing> }`.

The `__auto.` prefix is reserved. Hand-written ctx keys (`config.ctx` declarations, manual output bindings in templates, library workflow ports) never start with it; the resolver never overwrites a non-`__auto.` ctx key on the producer side.

The node id is stable across renames, so synthesised keys are stable. If a node is deleted, every consumer's auto-binding referencing it falls back through resolution (becomes unsatisfied or finds a different producer).

### 2.3 Locked bindings

A binding is *locked* when the user has chosen a source explicitly (an override in the settings panel) or when the workflow file already had a non-`__auto.` ctx key in that slot when the editor loaded it. Locked bindings are never modified by the resolver.

Lock state is tracked on the node:

```ts
// extension to GraphNode metadata — frontend-only, stripped on emit if empty
metadata?: {
  // ... existing fields
  lockedInputPorts?: string[];   // port names whose input binding is user-locked
  lockedOutputPorts?: string[];  // port names whose output binding is user-locked
};
```

`metadata` is a free-form bag in the existing schema; adding optional string-array fields requires no validator change. The on-disk shape stays compatible with templates, library workflows, and the AI agent's catalog reads.

**Load normalisation.** When a workflow loads into the editor, a one-shot pass populates `lockedInputPorts` / `lockedOutputPorts` for every binding whose ctx key does not start with `__auto.`. After this pass, the resolver's single check is `if (lockedInputPorts.includes(port)) skip` — the prefix convention is only consulted once at load time, then the explicit lock list is authoritative for the editor session. Existing templates (which have no `lockedInputPorts` field) end up with every binding locked, which is the desired no-touch behaviour.

### 2.4 What gets resolved vs. left alone

Resolved:
- Activity nodes' typed input ports whose `kind` is declared on the catalog entry.
- Output bindings synthesised on the producer side as a side effect of an auto-bind.

Left alone:
- Manual / locked bindings (anywhere).
- Activity input ports without a declared `kind` (legacy / pre-Phase-3 catalog entries; the existing `VariablePicker` already treats these as wildcards). These continue to be configured manually.
- Static *parameters* (`node.parameters`) — thresholds, model IDs, rule lists, etc. These stay in the schema-driven `JsonSchemaForm`. They are not artifact wiring.
- Control-flow node bindings — see §6 for the per-type rules.

---

## 3. Persistence

No schema change to `PortBinding` or to the workflow JSON shape. The full save round-trip is:

1. Editor state holds the resolved config (with `__auto.`-prefixed bindings + `lockedInput/OutputPorts` in `metadata`).
2. On save, the existing strip-on-emit layer ([commit dd182c3f](https://github.com/.../commit/dd182c3f)) is extended to keep `__auto.` keys but drop empty `lockedInputPorts` / `lockedOutputPorts` arrays. (Non-empty lock lists are persisted so a re-opened workflow remembers user overrides.)
3. The save-time validator (`validateGraphConfig`) walks ctx keys exactly as it does today ([TYPED_IO_DESIGN.md §5](TYPED_IO_DESIGN.md)). It sees `__auto.` keys as ordinary ctx keys; the binding-walk type check works without modification.
4. The Temporal engine sees ordinary ctx keys at runtime. `__auto.` is a string convention, not an engine concept.

Existing workflows on disk have explicit, hand-authored bindings. When loaded:

- Every existing binding's ctx key is treated as **locked** (it didn't start with `__auto.`).
- The resolver leaves them untouched.
- The settings panel renders them as "connected to *<producer node>*" if the ctx key can be matched to an upstream producer's output, or "manual value" if it points at a `config.ctx` declaration.

No migration step. Old workflows behave identically; new ones lean on auto-resolution.

---

## 4. Settings panel UX

The current "Input bindings" / "Output bindings" footer ([NodeSettingsPanel.tsx:621-666](apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx#L621-L666)) becomes a single "Inputs" section. Outputs disappear from the default view.

### 4.1 Default panel — Inputs section

One row per declared input port (catalog-driven). Per-row UI by state:

| State | Row contents |
|---|---|
| **auto-bound** | Port label · ← producer-node label · "auto" pill · chevron menu (Override · Reveal ctx key) |
| **constant / fixed value** | Port label · current value summary · "Edit" button. Only available for ports whose declared kind is a primitive (string, number, boolean) — these can also be set as a static parameter. The value lives in `node.parameters`, not in a binding. |
| **ambiguous** | Port label · amber "Choose source" pill · click opens the producer picker (compatible producers only, no raw ctx keys) |
| **unsatisfied** | Port label · red "Needs source" pill · click opens the producer picker + a "no upstream candidate" hint with a one-click "Add a step that produces *<Kind>*" affordance (palette filtered to activities that emit a compatible kind) |
| **user-locked override** | Port label · "← *<producer node>*" (when the locked ctx key matches an upstream output) or "Manual ctx: *<key>*" (when it points at a `config.ctx` declaration or a key with no producer) · "lock" icon · chevron menu (Edit · Revert to auto) |

Producer labels are the consumer-friendly node label (`node.label`), not the node id. Hovering a row surfaces the canonical port name + kind in a tooltip for the rare case the user needs the engineering signal.

### 4.2 Constant vs. connect

Ports whose `kind` is a primitive (or whose activity also accepts the same field as a static parameter) get a two-mode toggle on the row: **Set value** vs. **Connect from**. This honours the user-vision framing in [NOTES.md §1.1](NOTES.md): *"Some types are adjustable, for example integer — you can set it to a fixed value or connect some integer source into it."* Switching to "Set value" moves the binding into `node.parameters` and locks the port to constant mode; switching to "Connect from" returns it to the resolver.

### 4.3 Override + revert

"Override" on an auto-bound row opens the producer-only picker, filtered by `isAssignable` against `P.kind`, ranked by topological distance. Picking a producer locks the port (adds it to `metadata.lockedInputPorts`) and stamps the binding to that producer's output (creating an output binding on the producer if needed, with a non-`__auto.` ctx key the user can rename if they care).

"Revert to auto" removes the port from `metadata.lockedInputPorts`. The next resolver pass re-derives the binding.

### 4.4 Advanced peek

A single "Show advanced" toggle at the bottom of the panel reveals the raw `port → ctxKey` editor for both inputs and outputs — the current Phase 1A footer, unchanged. This is the escape hatch for power users, templates work, and debugging. It is **not** the default surface; it is collapsed behind a chevron.

### 4.5 Outputs

Outputs are not surfaced in the default view at all. They are derived from downstream consumers' resolved bindings. The advanced peek (§4.4) is where they live for users who care.

A consequence: an output port with no downstream consumer has no synthesised ctx key. That is correct — nothing reads it, the runtime simply doesn't pull the value out of the activity result. (This matches today's engine behaviour: only bound output ports get plucked out of the activity's result object.) The "unused output" state is not surfaced as an error; it's a normal state for sink-shaped activities (`document.updateStatus`, `ocr.storeResults`).

---

## 5. Canvas affordances

A small status dot renders on the left edge of each node:

- **Green / hidden** — every declared input port is satisfied (auto-bound or user-locked).
- **Amber** — at least one port is ambiguous.
- **Red** — at least one port is unsatisfied.

Clicking the dot opens the settings panel scrolled to the offending row. No new edge styles; no new handle types; no draw-time wire rejection. The dot is the only added canvas affordance.

The status colour is computed from the resolved config (it folds in both unsatisfied + ambiguous states). It is purely advisory at the canvas layer — the authoritative error surface remains the existing save-time validator + the red-badge / drawer mechanism from Phase 1A.

---

## 6. Control-flow specifics

The resolver covers activity nodes' typed ports. Control-flow nodes get analogous treatment, but each shape has its own rule:

### 6.1 `map`

`map.collectionCtxKey` is the input the map iterates over. Auto-bind it to the nearest upstream producer whose output `kind` is an array type (`T[]` for any `T`). Ambiguity rule is the same as §2.1.

Inside the map's body, the iteration variable (today `currentSegment` for segment maps via the hardcoded `segment.*` namespace rewrite in [context-utils.ts:41-65](apps/temporal/src/graph-engine/context-utils.ts#L41-L65)) is the implicit input to the body entry node. The resolver treats the map node as a synthetic producer of element type `T` for body-scope consumers, where `T` is derived by stripping the `[]` from the collection producer's output kind (a `Segment[]` collection yields a `Segment` synthetic producer inside the body). This collapses today's hidden `segment.*` dialect into a normal resolver rule.

### 6.2 `switch`

`switch.cases[].condition` is a `ConditionExpression` reading ctx. When a case condition refers to a `ValueRef`, the resolver auto-binds the ref to the nearest upstream output whose kind matches the expected primitive type.

`switch` outgoing edges (one per case + default) remain user-drawn; auto-wiring does not auto-pick branches.

### 6.3 `join`

`join.sourceMapNodeId` already points at a partner `map` node. The resolver doesn't change that, but it does ensure `join.resultsCtxKey` is synthesised (`__auto.${joinNodeId}.results`) and consumed by downstream auto-bindings as an array of the body's exit-node output kind.

### 6.4 `pollUntil`, `humanGate`

Treated as activity nodes for input resolution. Their condition / signal-shape configuration stays manual (it's intrinsic to the node, not artifact wiring).

### 6.5 `childWorkflow`

Library workflows declare typed `LibraryPortDescriptor` ports (Phase 3). A `childWorkflow` node's input ports are the library's declared inputs; the resolver treats them like activity inputs. Output ports are the library's declared outputs; same.

### 6.6 `source` (Phase 8)

Source nodes have no inputs ([SourceNodeSettings](apps/frontend/src/features/workflow-builder/sources/SourceNodeSettings.tsx)) — the resolver never sees one as a consumer. Their outputs are producers like any other node.

---

## 7. Migration + back-compat

Three classes of existing workflow JSON:

1. **Hand-authored / template workflows with explicit bindings** (e.g., `multi-page-report-workflow.json`). Every binding is loaded as locked. The resolver never touches them. The settings panel renders each as "← *<producer node label>*" where the ctx key matches an upstream output, or "Constant: *<ctx declaration>*" where it points at a `config.ctx` entry. No behaviour change.
2. **New workflows authored after this lands.** The resolver fills bindings; users see only the friendly panel. On save, the JSON contains `__auto.`-prefixed ctx keys + optional `metadata.lockedInputPorts/lockedOutputPorts` arrays. Round-trip is byte-stable.
3. **A workflow saved by the new editor, then opened in the old / advanced view.** All `__auto.` keys are visible. The advanced view (§4.4) is the path for users who want to inspect or rename them. The Phase 1A-style footer is unchanged in the advanced view.

The old JSON editor (`WorkflowEditorPage.tsx`) renders the raw JSON. It will show the `__auto.` keys verbatim. That is acceptable — the old editor is power-user / fallback; it doesn't need cosmetic ctx key beautification.

---

## 8. Edge cases + decisions

- **Cyclic graphs.** The schema validator already forbids cycles; the resolver assumes a DAG and would loop on one. Defensive guard: cap reverse-walk depth at the node count.
- **Disconnected consumer.** A node with no upstream edges has zero candidates for every typed input → every port is `unsatisfied` (red dot). This is the correct state for an orphan node.
- **Re-wiring.** When an edge is added, removed, or redirected, the next resolver pass re-evaluates every unlocked port that could be affected. (Pragmatically: re-run on every config mutation. The resolver is O(nodes × ports × edges); the workflows we ship are <100 nodes, so this is fine without incrementalisation.)
- **Multiple inputs of the same kind on one node.** E.g. a future activity with two `Document` inputs (`primary`, `reference`). The resolver picks the nearest upstream `Document` producer for each port — but both ports will tend to resolve to the same producer, which is wrong. **Fix:** when one port has auto-bound to a producer, exclude that producer from the candidate set for the other ports on the *same* node within the same kind family. If that leaves a port with no candidates → mark ambiguous (not unsatisfied — there IS a candidate, but it's already taken). This is the "two-doc" edge case the codebase has so far avoided by collapsing inputs into a single array; once we have typed multi-input activities the rule above handles them.
- **Map body referencing parent ctx.** A body node can legitimately read from a parent-scope ctx key (e.g., a parameter declared at workflow level). The resolver checks `config.ctx` declarations as producers of last resort (kind taken from `CtxDeclaration.kind` per Phase 3). They lose ties against in-graph producers — parent ctx is the fallback, not the default.
- **Templates that import.** A template loaded from `docs-md/graph-workflows/templates/*.json` keeps all its hand-authored bindings (per §7 class 1). The user can choose to "Revert to auto" any of them and the resolver takes over.

---

## 9. Out of scope

- **Draw-time wire kind rejection.** Wires remain execution-order. The kind compatibility check happens via the binding-walk validator + the resolver's candidate filter, not at draw time.
- **ComfyUI-style per-port handles.** The designer vetoed; the [I/O model decision](WORKFLOW_NODE_IO_MODEL_DECISION.md) locks single in / single out.
- **Auto-wrap / auto-unwrap between `T` and `T[]`.** Use `map` / `join`. (Same call as [TYPED_IO_DESIGN.md §11](TYPED_IO_DESIGN.md).)
- **Auto-pick switch branches.** Conditional routing remains user-authored.
- **Engine type checks.** Runtime ctx stays `Record<string, unknown>`.
- **Rewriting hand-authored ctx keys.** The resolver never modifies a non-`__auto.` ctx key. Templates' carefully-named keys stay legible.
- **Renaming auto keys.** `__auto.${nodeId}.${port}` is fixed by convention; users who want pretty names use the advanced view + override the binding.

---

## 10. Reading order for implementation

1. `packages/graph-workflow/src/auto-wire/resolver.ts` — pure function + unit tests covering: empty graph, linear chain, ambiguity tie, locked binding preservation, missing kind (wildcard skip), source-node producer, map iteration variable, child-workflow library ports, the two-doc edge case.
2. Update the strip-on-emit layer ([commit dd182c3f](https://github.com/.../commit/dd182c3f)) so empty `metadata.lockedInputPorts/lockedOutputPorts` arrays are dropped on save and non-empty ones are preserved. `__auto.` ctx keys are ordinary ctx keys and need no strip-layer change.
3. Wire the resolver into `WorkflowEditorV2Page` — debounced (~150ms) on `onConfigChange`. The output of the resolver replaces the editor's working config.
4. Settings panel rewrite — new compact "Inputs" section (per-port row component with the five states from §4.1).
5. Producer-only picker — variant of `VariablePicker` that filters to typed producers (not ctx variables), ranked by topological distance.
6. Canvas status dot — purely advisory; computed from resolver output.
7. Advanced toggle — re-export the existing footer behind a "Show advanced" chevron.
8. Control-flow extensions per §6, in this order: `map`, `join`, `switch`, `pollUntil`/`humanGate`, `childWorkflow`.
9. Tests against `multi-page-report-workflow.json` (locked-binding preservation) and against a fresh template authored entirely via auto-wire (round-trip stability).

---

## 11. Open after this lands

- **Auto-pick on hover-extend.** When the user uses hover-to-extend to add a new node from an existing one, the new node's inputs are immediately resolvable against the source — the panel can open in "all inputs auto-bound" green state without the user touching anything. This is a small UX polish on top of the resolver and is filed for the hover-extend milestone in Phase 1B.
- **Auto-insert helper nodes.** When a port is unsatisfied with no candidate, suggest a catalog activity whose output produces the right kind — and on click, insert + connect it. ("You need a Segment here — add a Splitter?") Bigger lift; deferred.
- **Lineage-aware ctx key minimization.** Today's synthesis is per-port-per-producer-node. A future optimisation could merge ctx keys when the same producer's output feeds multiple consumers (it already does — the producer-side output binding is reused — but the *consumer* side's ctx key is the producer's, so this is mostly already done). Revisit if synthesised keys become noisy in advanced view.
- **AI agent integration.** Phase 7's agent constructs workflows by composing typed activities. The resolver makes the agent's job easier: the agent picks an activity, connects its execution edge, and the resolver fills bindings — the agent doesn't need to author them. Worth re-reading the Phase 7 design once the resolver is in.
