# Conditions From Node Outputs — Design

**Status:** Approved 2026-07-15. Phase 5 of the port-wiring redesign
(`docs-md/workflow-builder/PORT_WIRING_DESIGN.md` §11).

**Goal:** Let a business user reference an upstream step's output inside a
condition by picking **step → output port**, instead of typing a raw ctx key
like `__auto.extract.result`. This is the last surface in the workflow builder
where raw ctx keys leak to the business/ops persona.

**Non-goal:** No change to the `ValueRef` schema, the condition evaluation
semantics, save-time validation, or the canvas. This is a presentation +
wiring layer over the existing `ValueRef { ref }` storage.

---

## 1. Background — what exists today

The condition editor (`graph-widgets/ConditionExpressionEditor.tsx`) renders the
`ConditionExpression` discriminated union. Every leaf value is a `ValueRef`,
edited by the internal `ValueRefEditor`, which offers a two-way
**Ref | Literal** `SegmentedControl`:

- **Ref** → a free-text `VariablePicker` autocomplete over ctx keys
  (`config.ctx` declarations + other nodes' output ctx keys). The user sees and
  types raw keys.
- **Literal** → a `TextInput` parsed as JSON-or-string.

`ValueRef` slots appear in comparison (`left`/`right`), null-check (`value`),
and membership (`value`/`list`).

The condition editor is nested inside two settings forms, both of which own an
`onConfigChange` path (that is how the existing `onCreateCtxKey` declares keys):

- `settings/control-flow/SwitchNodeSettings.tsx` — one editor per switch case.
- `settings/control-flow/PollUntilNodeSettings.tsx` — the loop termination
  condition.

A `graph-widgets/ProducerPicker.tsx` already exists, used by the input-port
"Change source" modal in `InputsSection`. It lists upstream output ports but
**filters** them: it skips kind-less outputs (`if (!out.kind) continue`) and
keeps only ports assignable to the consumer's `expectedKind`. That contract is
relied on by the input-port modal and must not change.

---

## 2. Design decisions (locked during brainstorming)

1. **Control layout — nested, not flattened.** Keep the top **Ref | Literal**
   toggle. Within **Ref**, default to a step-picker, with a quiet advanced
   escape to the raw-key autocomplete. (Rejected: a flat 3-way
   `Step | Variable | Literal` control.)
2. **A separate `ConditionProducerPicker`**, not an overload of the existing
   `ProducerPicker`. The existing one's kind-filter contract stays intact for
   the input-port modal.
3. **List every output port — no kind filter, kind-less ports included.**
   Conditions legitimately read scalars (counts, flags, status strings) out of
   any output, and those may be declared without a kind. Each row shows the kind
   (or "any") as a hint; nothing is hidden or dimmed.
4. **Auto-open manual mode for unresolved refs.** If a stored `ref` does not
   resolve to any producer port (hand-authored key, deleted producer, legacy
   condition), the Ref field opens in the advanced manual mode so the value
   stays visible and editable.

---

## 3. Control layout

Inside every `ValueRef` slot, the top `Ref | Literal` toggle is unchanged.
Within **Ref**:

```
[ Ref | Literal ]
┌────────────────────────────────┐
│ From a step ▾                  │   ← default: ConditionProducerPicker
│   extract  → text              │
│   classify → category          │
└────────────────────────────────┘
Enter a variable manually  (advanced)   ← link → raw-key VariablePicker
```

- **Default sub-mode = step-picker** (`ConditionProducerPicker`).
- **Advanced sub-mode = manual** — the existing free-text `VariablePicker`,
  reached via the "Enter a variable manually" link. A "Back to steps" link
  returns to the picker.
- **Initial sub-mode selection** on mount / when an external value loads:
  - `ref` empty → step-picker.
  - `ref` resolves to a producer port (per §6) → step-picker, showing the
    resolved selection.
  - `ref` does not resolve → manual mode (decision 4).

Sub-mode is local UI state in `ValueRefEditor` (like the existing literal-text
local state); it is never persisted.

---

## 4. `ConditionProducerPicker`

New component `graph-widgets/ConditionProducerPicker.tsx`, sibling to
`ProducerPicker`.

**Props:**

```ts
interface ConditionProducerPickerProps {
  config: GraphWorkflowConfig;
  /** The control-flow node the condition belongs to (its switch `from` node
   *  or the pollUntil node) — used to scope "upstream" and to exclude self. */
  currentNodeId: string;
  /** The currently-stored ref, so the matching row can render selected. */
  value: string;
  onChange: (selection: { producerNodeId: string; producerPort: string }) => void;
}
```

**Rows:** for each upstream `activity`/`pollUntil` node (via
`upstreamNodesWithDistance`), emit one row per catalog output port — **no kind
filter, kind-less ports included**. Row content:

```
<Node label>  →  <port> · <kind or "any"> · N step(s) upstream
```

sorted nearest-first (ascending distance), matching `ProducerPicker`'s ordering.
The row whose `producerCtxKey(config, nodeId, port)` equals `value` renders as
selected.

**Empty state** (no upstream producer nodes): dimmed text —
"No upstream steps yet — add one, or enter a variable manually." — the advanced
link in §3 is the escape.

---

## 5. Picking a producer → storage

Two pure helpers in a new `graph-widgets/condition-producer-binding.ts`:

```ts
/** The deterministic ctx key a producer port maps to: the producer's existing
 *  output binding for that port if present, else the synthesized
 *  `__auto.<producerNodeId>.<port>` key the resolver already understands. */
function producerCtxKey(
  config: GraphWorkflowConfig,
  producerNodeId: string,
  port: string,
): string;

/** Idempotent. Returns a config in which the producer's output port is bound to
 *  `producerCtxKey(...)`. If the binding already exists, returns config
 *  unchanged (referential equality preserved). Mirrors §6.1's
 *  "ensure the producer's output binding exists". */
function ensureProducerOutputBinding(
  config: GraphWorkflowConfig,
  producerNodeId: string,
  port: string,
): GraphWorkflowConfig;
```

On pick, `ValueRefEditor`:

1. calls a new `onEnsureProducerBinding(producerNodeId, port)` callback, which
   applies `ensureProducerOutputBinding` upward via the settings-level
   `onConfigChange`;
2. sets `ValueRef.ref = producerCtxKey(config, producerNodeId, port)` via the
   existing `onChange`.

Because `producerCtxKey` is deterministic, step 2 computes the correct key from
the *current* config without waiting for step 1's mutation to land — no ordering
hazard. **`ValueRef` schema unchanged. No canvas wire is derived** — conditions
are not input ports, consistent with PORT_WIRING_DESIGN §15's control-flow-node
limitation.

---

## 6. Display resolution

```ts
/** Reverse-resolve a stored ctx key to its producing step + port for display.
 *  Scans node output bindings for a binding whose ctxKey === the key; also
 *  parses the `__auto.<node>.<port>` synthesized-key prefix. Returns null when
 *  nothing matches (→ raw-key fallback, manual sub-mode). */
function resolveCtxKeyToProducer(
  config: GraphWorkflowConfig,
  ctxKey: string,
): { producerNodeId: string; nodeLabel: string; port: string; portLabel: string } | null;
```

A resolved ref renders as **"*Extract → text*"** (node label → port label). An
unresolved ref renders as the raw key and opens the field in manual mode.

When several producers write the same ctx key (rare; a shared declared key),
resolve to the nearest upstream producer by `upstreamNodesWithDistance`,
matching the picker's own ordering.

---

## 7. Plumbing

Thread one new optional callback, `onEnsureProducerBinding(producerNodeId,
port)`, from the two settings forms down to each `ValueRefEditor`:

```
SwitchNodeSettings / PollUntilNodeSettings
  → ConditionExpressionEditor (+ ExpressionBody, per-kind bodies)
    → ValueRefEditor
```

Both settings forms already build config mutations and call `onConfigChange`;
`onEnsureProducerBinding` is implemented there as
`onConfigChange(ensureProducerOutputBinding(config, id, port))`. The condition
editor and `ValueRefEditor` stay presentational — all mutation flows up. When
the callback is absent (e.g. a future caller that does not wire it), the Ref
field falls back to manual mode only (the step-picker is hidden), so the
component remains usable without it.

---

## 8. Testing (TDD)

**Unit (frontend, vitest):**

- `condition-producer-binding.ts`:
  - `producerCtxKey` — returns an existing output binding's ctxKey; synthesizes
    `__auto.<node>.<port>` when none exists.
  - `ensureProducerOutputBinding` — adds the missing binding; is idempotent
    (returns the same config reference when already present).
  - `resolveCtxKeyToProducer` — binding match; `__auto` prefix parse; no match →
    null; nearest-producer tiebreak on a shared key.
- `ConditionProducerPicker` — lists every port including kind-less; sorted
  nearest-first; empty state; selected-row marking; emits
  `{producerNodeId, producerPort}`.
- `ValueRefEditor` — defaults to step sub-mode for empty/resolvable refs; opens
  manual for unresolved refs; advanced link swaps modes; picking a producer
  emits the resolved ref and calls `onEnsureProducerBinding`; Literal mode
  unaffected.
- `ConditionExpressionEditor` — `onEnsureProducerBinding` reaches every
  `ValueRef` slot (comparison left/right, null-check value, membership
  value/list, and nested operands).

**E2E (`tests/e2e/workflow-builder`):** extend the switch-condition flow — open a
switch case, pick a step output in the condition, save, reload; assert the field
displays "*Node → Port*" and the stored `ref` persisted (the producer output
binding is present in the saved config).

**Docs (project convention):** update MANUAL_TEST_PLAN condition section, the
FEATURE_DEMO_GUIDE entry for any switch/pollUntil demo, and the seeder step
texts for demos that touch a condition; mark PORT_WIRING_DESIGN §15 phase 5
complete with any limitations found during implementation.

---

## 9. Known limitations (recorded up front)

- The input-port `ProducerPicker` still offers no ctx-variable option — Phase 5
  gives the *condition* picker a manual-variable escape but does not retrofit the
  input-port modal (PORT_WIRING_DESIGN §15 item 3, unchanged).
- The step-picker lists ports with no kind as "any" but cannot advertise the
  *value type* a kind-less scalar carries; the author judges comparability. This
  is inherent to kind-less outputs, not introduced here.
