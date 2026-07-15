# Port-Level Data Wires — Making the Wire Carry the Data

**Status:** Phases 1–3 implemented 2026-07-14 (plans: [`docs/superpowers/plans/2026-07-12-port-wiring-phase-1-2.md`](../../../docs/superpowers/plans/2026-07-12-port-wiring-phase-1-2.md), [`docs/superpowers/plans/2026-07-13-port-wiring-phase-3.md`](../../../docs/superpowers/plans/2026-07-13-port-wiring-phase-3.md)); Phases 4–5 pending.
**Supersedes:** the *canvas-surface* portion of [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) (Model A's single-handle canvas). The *engine* portion of that decision — ctx blackboard, node-level edges, single normal outgoing edge per activity — is unchanged and re-affirmed here.
**Builds on:** [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md) (kinds, registry, `isAssignable`) and [AUTO_WIRE_DESIGN.md](AUTO_WIRE_DESIGN.md) (resolver, locks, `__auto.` ctx keys). Both stay in force; this design changes what the user *sees and touches*, not how bindings work.

---

## 1. Why revisit Model A

Model A (single input handle / single output handle, wires are execution-order only) was decided on 2026-04-27 against the repo state of that time. Its three load-bearing arguments have since dissolved:

| 2026-04 argument for Model A | State today |
|---|---|
| "Activities aren't typed at the registry level; a parallel I/O contract registry doesn't exist — substantial addition for zero ROI" | The registry exists: catalog `PortDescriptor`s with `kind` ([catalog/types.ts:43](../../packages/graph-workflow/src/catalog/types.ts#L43)), the artifact-kind registry, `isAssignable` ([subtype-check.ts:37](../../packages/graph-workflow/src/types/subtype-check.ts#L37)). It was built for typed I/O + auto-wire + the agent. |
| "Typed wires would create a UI fiction the engine doesn't honor" | The save-time binding-walk validator enforces kind compatibility on every producer/consumer ctx-key pair ([validator.ts](../../packages/graph-workflow/src/validator/validator.ts) `walkCtxKeyBindings`). A rendered port-to-port wire is a faithful picture of a real `PortBinding` — not fiction. |
| "The frontend canvas is read-only" | The V2 editor is a full authoring surface. |

What changed on the demand side: the primary persona for *manual* building is a **business/ops user**, not a developer. For that persona the current split — canvas wires mean execution order, actual data wiring happens invisibly (auto-wire) or in a settings-panel modal (`ProducerPicker`) — inverts the mental model every comparable tool (n8n, Make, Node-RED) has trained: **the wire is the data**. Auto-wire made agent-built workflows cheap; this design makes human-built workflows match human expectations, using the same machinery.

## 2. Mental model

> A wire carries data from one step's output to another step's input. Drawing it both pipes the data and orders the steps. Fields that want a typed-in value are settings on the node, never wires.

One wire concept for the user. Execution order is implied by data flow; the rare order-only relationship renders as a visibly-secondary dashed wire (§5.3). Conditional (switch) and error edges keep their existing distinct rendering — they are routing, and users already read them correctly.

## 3. Architecture decision: presentation layer, no schema change

The persisted model is untouched: `GraphEdge` stays node-level `{source, target, type}`; data flow stays `PortBinding {port, ctxKey}` against the ctx blackboard; `resolveBindings` keeps running exactly as designed in [AUTO_WIRE_DESIGN.md](AUTO_WIRE_DESIGN.md). The canvas becomes a **view + gesture layer over bindings**:

- **Rendering:** wires are *derived* from bindings (§5). The stored `edges[]` remain the source of truth for execution order; bindings remain the source of truth for data.
- **Gestures:** a port-to-port drag *writes a binding* (plus ensures a control edge), using the same code path as today's settings-panel Change source (§6).

Consequences: runtime, validator, agent tools, templates, seeded demos, and every saved workflow work unchanged. Agent-built graphs (nodes + edges → resolver fills bindings) render correctly on the new canvas with zero agent changes — the auto-wire result simply becomes visible. All risk is in the frontend.

The rejected alternative — moving ports onto `GraphEdge` (`sourcePort`/`targetPort`) and compiling bindings from edges — was declined: it forces a hard migration of every stored config plus validator/engine/agent rework, for the same user-visible result.

## 4. Per-port handles

### 4.1 Node card layout

An activity node renders one **port row** per wireable port: inputs down the left edge, outputs down the right, each row = kind-colored handle + human label. Kind colors and the array double-outline reuse the existing family palette from [handle-style.ts](../../apps/frontend/src/features/workflow-builder/canvas/handle-style.ts); the "gray = multiple ports, select the node" compromise (`computeHandleStyle`'s multi-port branch) is deleted along with the single-handle model.

### 4.2 Which ports get handles

- **Handles:** every catalog output; every input that is wireable — typed ports (`shouldAutoWirePort`) plus base-`Artifact` identifier ports (the name-match set from [resolve-input-port.ts](../../packages/graph-workflow/src/auto-wire/resolve-input-port.ts)).
- **No handles:** static parameters (`node.parameters` — model IDs, thresholds, rule lists). These render inside the card as a compact `⚙︎ label: value` summary line (click → settings form at that field). A business user is never offered a wire for something that wants a typed-in value.
- A **required input with no source** shows an amber ring on its port. *As shipped in Phase 2 the ring is deliberately broader than the problems badge/drawer:* the ring fires for ANY required unbound catalog port (including base-`Artifact` identifier ports like `documentId`), while `autoWireIssuesToValidationErrors` only counts auto-wireable (typed) ports — so an identifier port can wear the ring with no badge/drawer entry and a clean Save. Reconciling the two (either counting required identifier ports as problems, or scoping the ring to the badge set) was a Phase-3 UX decision — **resolved in Phase 3**: required identifier ports now count as problems, so the ring and badge agree (see §15 item 3).

### 4.3 Density

Nodes get taller (worst current case: Azure OCR extract, 5 inputs). Mitigations, in order of application: only wireable ports get rows (§4.2 removes the config-param rows that dominate most nodes); optional untyped ports collapse behind a `+N more` row until hover/selection; the existing Simplified view collapses groups as today. No preemptive virtualization — revisit after the first prototype if 15+-node graphs feel heavy.

### 4.4 Control-flow nodes

- **switch** — one input handle; per-case + default source handles as today (conditional edges unchanged).
- **map** — input handle for `collection` (typed `T[]`); inside the body the map's synthetic element producer ([resolver §6.1](AUTO_WIRE_DESIGN.md)) renders as an `item (T)` output port on the map node so body-node wires have a visible origin.
- **join** — `results` output port (`T[]`).
- **pollUntil / humanGate / childWorkflow** — activity-like port rows (childWorkflow's ports are the library's declared ports).
- **source** — output ports only, as today.

## 5. Wire derivation

A pure selector `deriveWires(config): Wire[]` in the frontend (unit-testable, no React):

### 5.1 Data wires

For each node `C`, each input binding `{port P, ctxKey K}`:

1. If some node `N` has an output binding `{port Q, ctxKey K}` → **data wire** `N.Q → C.P`, colored by the producer port's kind.
2. Else if `K` matches a source node's emitted field (source.upload `ctxKey`, source.api field name) → data wire from that source port.
3. Else if `K` is a `config.ctx` declaration → **no wire**; the port row shows a `from workflow variable: <key>` chip (it has a value; not a problem state).
4. Else → no wire; the port is unbound (amber ring if required).

A data wire renders whether or not an execution path exists between the nodes — a binding with no upstream path is exactly what the reachability/validator warnings already flag, and hiding the wire would hide the mistake.

### 5.2 Special wires (unchanged)

`conditional` edges (labeled, from switch case handles) and `error` edges (red, from the fallback handle) render exactly as today.

### 5.3 Sequence wires

A `normal` edge between a node pair with **no** derived data wire renders as a thin dashed gray wire ("runs after"). This is the rare order-only case; it stays visible and individually deletable so execution order is never invisible state.

### 5.4 Auto vs pinned

Wires derived from `__auto.` ctx keys are *auto* wires; wires whose consumer port is in `metadata.lockedInputPorts` are *pinned*. Same visual weight; the difference surfaces in the wire tooltip and context menu (§7).

## 6. Gestures

### 6.1 Drag port → port

Creates the binding through the existing Change source mechanics (stamp consumer `inputs[]` row; `ensureProducerOutputBinding` on the producer; add the port to `lockedInputPorts`) **and** ensures a `normal` control edge exists between the two nodes (skip if any edge already connects them; switch sources keep stamping `conditional` as today). One gesture = data + order + pin.

### 6.2 Connect-time validation (first appearance of `isValidConnection`)

While dragging from an output of kind `K`: ports where `isAssignable(K, expected)` holds highlight/enlarge; incompatible ports dim. Dropping on an incompatible port is rejected with a notification naming both kinds in plain language. **Shipped copy** (2026-07-14): a kind mismatch reads *"This input needs `<TargetKind>` — `<SourceKind>` can't be used here"* (e.g. "This input needs Document — Segment (list) can't be used here"); dropping an output back onto an input on the same node reads *"A step can't feed itself"*. Wildcard (`Artifact`) ports accept any drop — a manual drag is an explicit choice, so no name-match restriction applies. Node-body drops (not on a port) fall through to §6.4.

### 6.3 Deleting a wire

- **Data wire:** removes the consumer's input binding and adds the port to `lockedInputPorts` *without* a binding — "pinned unbound" — so the resolver doesn't instantly re-create the same wire (which would make deletion feel broken). The port shows its amber ring; "Revert to automatic" (§7) hands it back to the resolver. `resolveInputPort` needs one small extension: a locked port with no `inputs[]` row reports `locked-unbound` instead of assuming a ctx key exists.
- If it was the **last data wire between the pair**, the control edge remains as a dashed sequence wire, with a transient hint: "Execution order kept — delete the dashed wire to fully detach."
- **Sequence / conditional / error wires:** delete the underlying edge, as today.

### 6.4 Node-to-node still works

Dropping an edge on a node body (or using hover-to-extend / palette drop) keeps today's behavior — create edge, `resolveBindings` runs — but the result is now narrated: a transient popover on the new connection summarizes what auto-wire did: *"✓ fileData ← Prepare · ✓ apimRequestId ← Submit (name match) · ⚠ ocrResponse needs a source [Fix]"*. Fix reuses the existing badge deep-link into the `ProducerPicker`. This popover replaces silence — the single biggest trust problem with invisible auto-wiring.

## 7. Auto-wire becomes explainable

Resolver semantics are untouched (nearest kind-assignable; exact-unique name match for base-`Artifact` identifier ports; ambiguity never guessed). Additions:

- **Wire tooltip states the provenance:** "connected automatically — nearest Document producer" / "connected automatically — name match `apimRequestId`" / "pinned by you".
- **Wire context menu:** *Revert to automatic* (removes the lock; resolver re-derives), *Disconnect* (§6.3), *View data* (§10, after a run).
- The settings-panel `InputsSection` survives unchanged as the details/override view; "Revert to automatic" now exists in both places.

## 8. Workstream: catalog kind + label coverage

**The enabler — kind coverage already landed.** Catalog-wide `kind` coverage exists today: every registered `ActivityCatalogEntry` port declares `kind` on 100% of inputs/outputs, enforced by the US-103 all-or-nothing invariant test (`catalog.test.ts`). `kind: "Artifact"` is the deliberate wildcard for identifier/scalar ports (e.g. `apimRequestId`, the whole `benchmark.*` family) — not a gap. §8's remaining scope is (1) the label/description invariant, (2) `parametersSchema` field titles, and (3) the identifier-kinds open question below. Acceptance criteria:

1. ~~Every `ActivityCatalogEntry` input/output `PortDescriptor` declares `kind` unless it is genuinely wildcard~~ — **done** (US-103 invariant, above). Every port also carries a human `label` and one-sentence `description` — **done**, enforced by the "port copy invariant" test added in commit e3a552f1 (`label` is required in spirit: the UI never falls back to the raw port name on canvas).
2. Every `parametersSchema` field carries a human title/description (feeds the `⚙︎` summaries and settings forms) — **deferred** to the phase that renders per-field `⚙︎` summaries.
3. Dynamic nodes already declare kinds via JSDoc `@inputs`/`@outputs` — unchanged.

**Open question (recommendation: yes, as a follow-up):** mint registry kinds for stable identifier chains — e.g. an opaque-reference family under `Reference` for `apimRequestId`-style tokens — so those ports gain color, compatibility filtering, and typed auto-wire instead of relying on exact-name matching. Deferred from this spec because it changes resolver behavior for those ports; the name-match path keeps working meanwhile.

## 9. Workstream: port-aware extend popover

*Status: implemented 2026-07-14 (§9).*

Hover-to-extend (and drag-to-empty-canvas release) becomes kind-aware: dragging from an output of kind `K` filters/ranks the popover to catalog entries with an input assignable from `K` ("what can I do with an OcrResult?"), with flow-control and a "show all" escape below. Picking an entry places the node **and** wires the matching port via §6.1 (satisfying [AUTO_WIRE_DESIGN §11](AUTO_WIRE_DESIGN.md)'s "auto-pick on hover-extend" follow-up). Dragging from an untyped port shows today's unfiltered popover.

## 10. Workstream: wire data peek

After a run (Try or replay), hovering/clicking a data wire shows what actually flowed across it: the producer port's value from the existing preview cache (`GET /preview-cache?nodeId=` returns the node's cached output object; the wire scopes it to `result[port]`). Rendered with the existing preview widgets where a kind-specific widget exists, else a truncated JSON snippet. No run yet / cache evicted → "Run to see the data flowing here" (with the existing re-run affordance in the evicted case). This is the moment the wire-is-data model proves itself with the user's own document.

## 11. Workstream: conditions from node outputs

The condition editor's `Ref` mode is the last surface where raw ctx keys leak to business users. Add a **"From a step"** picker as the default Ref experience: pick an upstream node + output port (a `ProducerPicker` variant; no kind filter — conditions legitimately read scalars out of any output). Under the hood it stores the ctx path exactly as today (ensuring the producer's output binding exists, same as §6.1) — `ValueRef` schema unchanged. Display resolves stored ctx paths back to "*Node label → Port label*" where a producer matches, falling back to the raw key. The raw-key entry mode remains behind an "advanced" toggle, consistent with `InputsSection`.

## 12. Vocabulary

Plain-language copy wherever port state is shown (rows, tooltips, drawer entries):

| Internal | User-facing |
|---|---|
| auto-bound | Connected automatically |
| locked | Pinned by you |
| unsatisfied | Needs a source — choose where this comes from |
| ambiguous | Multiple possible sources — pick one |
| (new) locked-unbound | Disconnected by you |

Ports render their catalog `label` everywhere on canvas; the raw port name + kind literal live in tooltips (the "engineering signal" per [AUTO_WIRE_DESIGN §4.1](AUTO_WIRE_DESIGN.md)).

## 13. Validation interplay

Nothing about validation semantics changes. The save-time binding-walk, reachability, single-source, and auto-wire-issue folding all stay; the new surfaces are additional *anchors* (amber port rings, wire tooltips) feeding the same unified badge + drawer. Connect-time rejection (§6.2) is a UX preemption of errors the validator would catch anyway — the validator remains the authority.

## 14. Testing

- **Unit (frontend):** `deriveWires` (data/source/ctx-chip/sequence/conditional/error cases; binding-without-path still renders; `__auto` vs pinned classification), drag-to-bind writer (binding + edge + lock; switch-source stamps conditional), `isValidConnection` matrix, delete-wire semantics (pinned-unbound; last-wire leaves sequence wire).
- **Unit (package):** `resolveInputPort` locked-unbound extension; regression suite for resolver untouched paths.
- **E2E:** rewrite `tier2-typed-io` (handles are now per-port; the gray-wildcard test dies) and `tier2-autowire` (states now also visible on canvas); new `tier2-port-wiring` — drag-to-bind round-trip, incompatible-drop rejection, wire delete → pinned-unbound → revert-to-auto, connect-summary popover, port-aware popover filtering. Wire data peek extends `tier3-try-preview` (`@infra`).
- **Docs (required per project convention):** MANUAL_TEST_PLAN Parts 7/8 + 16.4, FEATURE_DEMO_GUIDE entries for Parts 7/8, and the demo seeder step texts must be updated in the phase that changes each surface. Seeded demo *configs* stay valid (schema unchanged).

## 15. Phased delivery

Each phase ships independently and leaves the editor coherent:

1. **Catalog coverage + vocabulary** (§8, §12) — pure data + copy; immediately improves the *current* UI too.
2. **Per-port handles + derived wires, render-only** (§4, §5, §7 tooltips) — the canvas starts telling the truth; gestures still node-level. Biggest e2e/docs churn lands here.
   *Status: complete 2026-07-13.* Landed:
   - `deriveWires` (`canvas/derive-wires.ts`) + `computePortRows`/`estimateNodeHeight` (`canvas/port-rows.ts`, the single definition of the per-port handle-id formula) + the `PortRows` renderer inside `ActivityNodeRenderer` — one kind-coloured handle per catalog port (`port-row-<id>-<in|out>-<port>` testids), amber needs-source ring, `· from <ctx>` provenance chip, `name: Kind — description` tooltip. Type pills retired on activity nodes; node-level handles (unnamed target / `out` / `error`) remain the connect-gesture + edge anchors.
   - Data bindings render as port-to-port wires: `data-wire-variant="data"`, stroke by producer kind, `data-provenance` (`auto:<via>` / `pinned` / `manual`), a hoverable native `<title>` tooltip stating provenance ("Connected automatically — matched by name …" / "Pinned by you") plus an ariaLabel mirror. Order-only `normal` edges render as dashed gray `sequence` wires. Error edges now anchor at the red error handle.
   - Auto-arrange uses measured per-node sizes instead of the old fixed box (`ACTIVITY_BASE_HEIGHT` 177 + 22px/row + 6px margin; control-flow 180; source 165; dagre node width widened to 482 to fit port-row cards).
   - `tier2-typed-io` rewritten to 4 tests, including a real hover-tooltip regression guard.
   - Fixed a resolver bug (`732945ed`) where jsonb key-order normalization during write-back could clobber a producer's already-written output binding, silently dropping a downstream wire (surfaced as a missing extract→clean wire) — regression-tested in `resolver.test.ts`.

   **Known limitations of this slice, documented rather than silently deferred:**
   - ~~Data wires are render-only this phase — not deletable/selectable; drag-to-bind + delete semantics are Phase 3 (§6).~~ **Resolved in Phase 3** — see item 3 below.
   - Control-flow nodes (incl. pollUntil) and source nodes still render a single node-level handle per side — no port rows yet (§4.4 partially deferred).
   - Simplified view intentionally renders edge-only — group chips have anonymous handles, no data wires.
   - Node-to-node drag still creates control edges + triggers auto-wire underneath it, unchanged.
   - The uniform 482px dagre node width makes narrow/few-port graphs lay out sparsely; per-node width estimation is deferred.
   - Map-body container sizing still assumes fixed footprints, so a wide member card can protrude past the container border (pre-existing).
   - The activity height estimate calibrates to the preview-skeleton state — never-run cards render ~120px shorter, ready-state previews up to ~80px taller than estimated.
   - ~~The amber needs-source ring is broader than the problems badge/drawer: it also fires for required base-`Artifact` identifier ports, which the auto-wire issue pipeline (and Save validation) deliberately skip — reconcile in Phase 3 (§4.2 note).~~ **Resolved in Phase 3** — see item 3 below.
   - Map-body item data flow renders as a plain sequence wire — the resolver feeds the loop item through `itemCtxKey` without materializing a map-node output binding, so no map-item wire derives until §4.4's `item (T)` port lands (the `via: "map-item"` tooltip branch is forward-looking).
3. **Gestures** (§6) + **port-aware popover** (§9) — drag-to-bind, connect-time validation, delete semantics, connect summary.
   *Status: complete 2026-07-14.* Landed:
   - Drag-to-bind (§6.1): per-port handles are connectable; a port-to-port drag writes the binding through `pinPortBinding` + ensures a control edge via `ensureEdgeBetween` (skips if one already connects the pair) — one gesture pins data + order in a single step.
   - Connect-time kind validation (§6.2, `isValidConnection`): compatible input ports highlight/enlarge and incompatible ports dim while dragging from an output; dropping on an incompatible port is rejected with a yellow notice (kind-mismatch copy above); dropping an output back onto an input on the same node is rejected with a distinct self-drop notice ("A step can't feed itself"). Wildcard base-`Artifact` inputs accept any drop.
   - Wire delete → `locked-unbound` (§6.3): deleting a data wire adds the target port to `lockedInputPorts` with no binding — a new resolver status, `locked-unbound` ("pinned unbound") — so the resolver doesn't silently re-create the wire. The port renders amber (`data-needs-source="true"`) and the settings drawer shows a "was disconnected" warning. If the pair's control edge survives (no other data wire between the nodes), a one-shot "Execution order kept — delete the dashed wire to fully detach." notification fires. Node deletion was also consolidated into a single `onDelete` pass (wires + edges + node in one mutation) rather than several sequential ones.
   - Wire context menu (§7): right-click a data wire → **Disconnect** (always) / **Revert to automatic** (pinned wires only).
   - Connect summary popover (§6.4): a node-level connect opens a transient popover narrating what auto-wire did — ✓ rows for auto-bound/pinned/ctx-bound ports, ⚠ rows for needs-a-source/ambiguous/disconnected ports with **Fix** deep-links — auto-dismissing after ~8s. Row resolution is shared with the settings panel via `settings/input-row-resolution.ts` so the two surfaces can't drift.
   - Kind-aware extend popover (§9, `extend-filter.ts`): hovering a typed `out-<port>` handle (or releasing a port-to-port drag on empty canvas) opens the hover-extend popover filtered + ranked to catalog activities accepting that kind, with a "Show all" escape (`hover-extend-show-all`); picking a filtered entry places the node pre-wired (pinned) via the drag-to-bind writer.
   - **Amber-ring reconciliation** (Alex's decision, closes the Phase-2 divergence noted above): required base-`Artifact` identifier ports (e.g. `file.prepare`'s `documentId`) now also count as problems — warnings in the unified badge/drawer, never blocking Save. The settings panel renders a ctx-bound identifier port as "from `<var>`" (not a false "Needs a source"), and a `locked-unbound` port as a "Disconnected" badge + Pick a source + Revert to automatic.
   - New e2e suite `tier2-port-wiring` (5 tests) + a `dragConnectPorts` helper exercising the drag-to-bind round trip, incompatible-drop rejection, wire delete → revert, connect-summary popover, and kind-aware popover filtering.

   **Known limitations of this slice:**
   1. Reverse drags — a connect gesture *started from an input handle* — get no highlight/dim and no rejection notice; §6.2's highlight/notice only fire when dragging from an output. `isValidConnection` still blocks an incompatible drop either direction, so nothing invalid can be wired, but the drag-in-progress feedback is one-directional.
   2. The settings panel still shows a yellow "Pick a source" pill for an `ambiguous` port that *also* carries a manual (non-auto) ctx binding, while the drawer stays quiet for the same port — a narrow panel/drawer divergence.
   3. `ProducerPicker` offers no ctx-variable option, so "Change source" on a ctx-bound identifier port is a one-way door — once replaced with a producer, the original ctx binding can't be re-selected through the picker.
   4. A stale auto-binding whose producer node was deleted keeps the amber ring **off** while the problems badge correctly warns — the badge is the truthful surface in that case, the ring is not.
   5. "Revert to automatic" on a port pinned to a non-auto ctx key can re-lock across a save/reload via `normaliseLocks` (pre-existing behaviour, not introduced this phase).
   6. Control-flow nodes (incl. `pollUntil`) and source nodes still render a single node-level handle per side — drag-to-bind covers activity nodes only. Simplified view stays edge-only (group chips have anonymous handles). Map-item wires remain deferred, unchanged from Phase 2 (§15 item 2's limitation above).
4. **Wire data peek** (§10).
   *Status: complete 2026-07-15.* Landed:
   - Clicking a data wire on the canvas after a run opens a `WirePeekPopover` (`canvas/WirePeekPopover.tsx`) anchored at the wire midpoint. The popover mounts inside `WorkflowEdge` (`canvas/WorkflowEdge.tsx`) whenever the edge is `selected` and its wire is `variant: "data"`, so the trigger is plain React Flow edge selection — no bespoke hit-testing. Testid `wire-peek-popover`, `data-state` on the surface, value in `wire-peek-value`.
   - **Value scope correction:** the peek reads the producer node's `outputCtx[wire.ctxKey]` from the shared batch preview query (`useActivityOutputPreview`, keyed on the wire's `source` node + run), **not** `result[port]`. §10's original `result[port]` wording predates the batch-cache shape (`outputCtx` is the node's whole ctx write-back keyed by ctx key) — `outputCtx[wire.ctxKey]` is the correct slot and is what ships.
   - Kind-widget reuse via the new shared `renderKindValue` (`preview/render-kind-value.tsx`) — the single kind→widget dispatch the node-card `PreviewWidget` and the peek both call, so they can't drift — with a `JsonValuePreview` (`preview/JsonValuePreview.tsx`) truncated-JSON fallback for kinds that have no widget.
   - Full state matrix on `data-state`: `no-run` ("Run to see the data flowing here.") / `loading` (skeleton) / `error` ("Preview unavailable") / `evicted` (→ `CacheEvictedAlert` with the re-run affordance, replay only) / `empty` (ctx key absent from the run's output) / `ready`.
   - A **"View data"** entry on the wire right-click menu (`WireContextMenu`, testid `wire-menu-view-data`) — shown **only after a run** (`canViewData`, gated on a live `activeRunId`) — opens the same popover by selecting the edge (`handleWireViewData`), so both the click and the menu route through one surface.
   - The `@infra` e2e extends `tier3-try-preview`: after the `source.upload → file.prepare` run completes it discovers the derived data-wire edge (`wire:prep:blobKey`), right-clicks it, picks **View data**, and asserts the popover reaches `data-state="ready"`. The peek is exercised **before** the reload the preview-widget assertion needs, because `RunStateProvider` starts each mount with `activeRunId = null` and never restores it — post-reload the peek renders `no-run` and "View data" is hidden.

   **Known limitations of this slice:**
   1. Kind-widget reuse only helps **object-valued** ports — scalar / URL / `Artifact`-wildcard wires (the majority today, including the `source.upload` `documentUrl` this e2e peeks) fall to the `JsonValuePreview` snippet rather than a rich widget.
   2. **Data wires only:** a condition (§11) draws no wire, so it gets no peek; and the simplified (chip) view stays edge-only, so peeks don't appear there either.
   3. The popover is **midpoint-anchored**, so on a long wire it can overlap other cards — there's no collision avoidance or drag-to-reposition.
5. **Conditions from node outputs** (§11).
   *Status: complete 2026-07-15.* Landed:
   - Condition **Ref** value fields now default to a **step→port picker** sub-mode instead of a raw-key field: a quiet **"Enter a variable manually"** link swaps to the old ctx-key autocomplete and **"Back to steps"** returns. A hand-typed ref that resolves to no producer auto-opens manual mode so the author isn't stranded on an empty picker. The top `Ref | Literal` toggle is unchanged; **Literal** is untouched.
   - `ConditionProducerPicker` (`graph-widgets/ConditionProducerPicker.tsx`) lists **every upstream output port** with **no kind filter** — a condition can compare any produced value, so the picker doesn't pre-judge assignability. Each entry shows the producer kind as a hint (`"any"` for a kind-less port).
   - **Single-mutation + reconcile:** picking a step emits **only** the ref change (the producer's ctx key into `ValueRef.ref`); on commit each control-flow settings form runs `ensureConditionProducerBindings(config, nodeId)` (`graph-widgets/condition-producer-binding.ts`) to materialise the producer's `outputs[]` binding in the **same committed config**. The reconcile is idempotent and self-heals hand-typed keys that happen to name a producer. **Why it's needed:** the Temporal executor writes activity outputs to ctx **only via persisted `node.outputs`**, so a producer consumed *solely* by a condition (never wired to a downstream input port) would otherwise never emit its value — the binding must be persisted for the condition to read anything at run time. Wired into `switch` case conditions (`settings/control-flow/SwitchNodeSettings.tsx`) and `pollUntil` termination conditions (`settings/control-flow/PollUntilNodeSettings.tsx`); both pass `currentNodeId` and both reconcile.
   - **Display resolution:** a stored ref renders back as *"Node label → Port label"* via `resolveCtxKeyToProducer`; a ref that resolves to no producer falls back to the raw ctx key.
   - **No `ValueRef` schema change** (the ref is still a ctx-key string), and **no canvas wire is derived** — a condition isn't an input port, so it draws nothing on the graph. The step-picker is gated on the condition editor receiving a `currentNodeId`.

   **Known limitations of this slice:**
   1. The input-port `ProducerPicker` still offers no ctx-variable option (unchanged — this phase gave the manual escape only to the **condition** picker, §15 item 3 limitation 3 stands for input ports).
   2. The step-picker labels a kind-less port's kind as `"any"` and can't advertise the underlying value type, so the author judges comparability. In practice every catalog output declares a kind today (often the `Artifact` wildcard), so the real effect is that the assignability filter is *dropped* here versus the input-port picker — not that untyped ports actually appear.
   3. Minor pre-existing smell surfaced by the new per-field manual/step sub-mode state: `LogicalBody` operands use **index-based React keys**, so removing a *middle* operand while a sibling field sits in manual-override mode could carry the stale override onto the reused instance. This is pre-existing index-key behaviour, not introduced by this phase; low impact.

## 16. Risks & open questions

- **Canvas density** (§4.3) — watched, mitigations staged, judged at the Phase-2 prototype.
- **Designer sign-off** — this supersedes a recorded veto of per-port handles ([WORKFLOW_NODE_IO_MODEL_DECISION.md §4](WORKFLOW_NODE_IO_MODEL_DECISION.md)); the superseding rationale is §1, but the original stakeholder should confirm.
- **Delete-feel** (§6.3) — "pinned unbound + dashed remainder" is predictable but two-step; e2e now covers the delete → revert round-trip (`tier2-port-wiring`), but validating the *feel* with an actual user is still owed.
- **Identifier kinds** (§8 open question) — deferred; decide after Phase 1 exposes how many `Artifact` wildcard ports remain.
- **Multi-binding pairs** — several wires between the same two nodes are visually parallel (distinct port anchors); if long chains look noisy, bundle only at low zoom (deferred until seen).

## 17. Out of scope

- Any change to `GraphWorkflowConfig`, the engine, the resolver's binding semantics, or agent tools.
- Auto-wrap/unwrap between `T` and `T[]` (unchanged from [TYPED_IO_DESIGN §11](TYPED_IO_DESIGN.md) — use map/join).
- Auto-picking switch branches; engine-level type enforcement.
- Renaming/beautifying `__auto.` ctx keys.
- Template gallery / onboarding improvements (worth doing for the business persona, separate effort).
