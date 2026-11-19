# Pass C — Static Domain Cross-Product (notes)

52 findings in `findings-c.json`: 1 blocker, 25 major, 26 minor.
By type: 35 design-gap, 10 impl-gap, 7 non-goal.
By disposition: 40 fix, 5 defer, 7 won't-support.

**Revision 2.** One finding (C-041, "active-edge animation is dead code") was WITHDRAWN and one
(C-052) rewritten after re-verification: both rested on a silent-empty `grep` against a file the
tool classifies as binary. See "The NUL-byte trap" below — it is now C-071 and it is the reason
every negative claim in this pass was re-run with `grep -a`.

Branch checked: `feature/visual-workflow-builder`. Every line citation was re-resolved
against the working tree (the validator confirms all 52).

---

## Method

Four grids, each built by reading the enum/type definition first and then every surface
the INVENTORY §2 lists as rendering it. Cells are marked:

- **S** — specified: the domain declares it AND at least one surface renders/enforces it
  consistently with the others.
- **U** — unspecified: the combination is reachable but no rule, message or renderer
  covers it, or two surfaces answer differently. Each **U** has a finding.
- **W** — won't-support: a real decision was made not to cover it. Each **W** has a
  finding, because an unwritten non-decision is the thing that gets rediscovered.
- **n/a** — structurally impossible (the type cannot produce the combination).

Every **U** cell resting on a NEGATIVE result ("X has no caller", "Y is never written",
"Z is not mounted") was re-verified with `grep -a` or by reading the file directly, after the
NUL-byte trap below was found. Negatives that survived are marked; the two that did not are
recorded as withdrawn rather than silently dropped.

I did not follow the mutation axis anywhere. Where a cell only becomes interesting after
a rename/retype/delete (e.g. a `locked` binding whose producer was deleted) I recorded
the static half only and left the rest to Pass D.

`MANUAL_TEST_PLAN.md` was used as a map of surfaces, never as an oracle. Several of the
largest findings (C-001, C-062, C-071) are behaviours the plan does not mention at all.

---

## Axis 1 — Control-flow nesting

**The finding that reframes this axis is C-014.** The model has exactly one containment
construct: `MapNode.bodyEntryNodeId` / `bodyExitNodeId`, plus `childWorkflow`'s embedded
`inline.graph`. Switch branches are plain edges; `pollUntil` repeats one activity;
`join` and `humanGate` are point nodes. So "X nested inside Y" is only meaningful for
three containers, and for everything else it degenerates to edge topology — which is why
so many of the brief's named combinations turn out to have nothing checking them.

### 1a. Container × contained node type

Rows are the three real containers. `S*` = works but only below the 20-item map
threshold (C-001 voids it above).

| contained →       | activity | source | switch | map | join | childWorkflow | pollUntil | humanGate |
|---|---|---|---|---|---|---|---|---|
| **map body**      | S*       | U C-008| S* C-014 | U C-002/C-003 | U C-003 | S*      | U C-001   | U C-006   |
| **switch branch** | S        | U C-008| S       | U C-004 | U C-004 | S             | S         | S         |
| **childWorkflow inline graph** | U C-009 | U C-009 | U C-009 | U C-009 | U C-009 | U C-009 | U C-009 | U C-009 |

Notes per cell family:

- **map body / activity** — the specified happy path (`executeBranchSubgraph`,
  node-executors.ts:968). Voided above 20 collection items: the child-workflow path
  re-enters at `config.entryNodeId` and never reads `bodyEntryNodeId` (**C-001**, the
  pass's only blocker).
- **map body / source** — offered by the body-entry `NodePicker` with no type filter
  (**C-008**). A source node has no inputs and is not an auto-wire producer either
  (C-027), so it can neither start nor feed an iteration.
- **map body / switch** — the one nesting the system genuinely specifies. Dead-end
  branches produce a real author-time warning (`map-body-validation.ts:38`, yellow "Some
  branches never reach the exit") mirroring the runtime's "Branch execution stalled"
  throw. This is the model for what the other cells lack.
- **map body / map** — two synthetic body groups claim the same nodes and two dashed
  green boxes overlap (**C-002**); the inner map's results die with the iteration
  (**C-003**).
- **map body / join** — a join *inside* a body whose source map is *outside* hits the
  same fresh-`mapBranchResults` problem in reverse; a join *outside* pointed at an inner
  map hits C-003. The picker actively offers both (**C-005**).
- **map body / humanGate** — N concurrent iterations register N `setHandler` calls under
  one signal name; last handler wins, one signal frees one branch, the rest block to
  timeout (**C-006**). Compounded by the signal name never being validated (**C-007**).
- **switch branch / map or join** — the brief's "join whose source map is inside a switch
  branch". Nothing static links the two; the join becomes ready off its own incoming
  edge and throws `No results found for map node <id>` (**C-004**).
- **switch branch / humanGate** — the brief's "humanGate in a branch that may not
  execute". This one is **S**: `computeReadySet` (graph-algorithms.ts:90) correctly skips
  unreachable sources, so the gate simply never runs. The *reporting* of that outcome is
  the gap, and it belongs to axis 3 (**C-044**).
- **childWorkflow inline** — one finding for the whole row: no validator pass descends
  into `workflowRef.inline.graph` (**C-009**), so every rule in every other grid is
  unenforced one level down.

### 1b. Per-node-type "is it configured?" coverage

Orthogonal to nesting but load-bearing for it — a nested node that is silently
unconfigured is worse than one that is misconfigured.

| field (skeleton default) | validated? | cell |
|---|---|---|
| `map.bodyEntryNodeId` / `bodyExitNodeId` (`""`) | yes, existence (validator.ts:583/:590) | S |
| `join.sourceMapNodeId` (`""`) | yes, existence + type (`:602`/`:610`) | S |
| `switch.defaultEdge` (absent) | yes (`:544`) | S |
| `pollUntil.activityType` (`""`) | yes (`:401`) | S |
| `map.collectionCtxKey` (`""`) | **no rule anywhere** | U **C-011** |
| `map.itemCtxKey` (`""`) | reserved-namespace check only | U **C-011** |
| `join.resultsCtxKey` (`""`) | **no rule** | U **C-011** |
| `humanGate.signal.name` (`""`) | **no rule** | U **C-007** |
| `childWorkflow.workflowRef.workflowId` (`""`) | **no rule** | U **C-010** |

`computeNodeInputIssues` short-circuits for every non-activity/pollUntil node
(auto-wire-status.ts:37), so none of the unvalidated rows produce a node badge either.

### 1c. Nesting × typed I/O

One cell worth calling out separately because it is where axes 1 and 2 meet:
`resolveMapElementKind` only strips `[]` off an **activity/pollUntil catalog output**.
Chain `map → join → map`, or `source → map`, and the loop variable has no kind, the
`map-item` synthetic producer never fires, and every typed input in the nested body
resolves `unsatisfied` (**C-012**).

### Won't-support recorded here

- **C-013** — `join.strategy: "any"`. The type comment records the reasoning; the map
  awaits every branch eagerly so there is nothing to race.
- **C-014** — no general containment/scope object. Nesting means map bodies and inline
  child graphs, full stop.

---

## Axis 2 — Port kind × binding state

Six binding states (five from `PortResolution`, plus the frontend-only `ctx-bound`),
against the kind families that actually change behaviour. `Artifact` and `undefined` are
separate rows because `shouldAutoWirePort` and `isAssignable` treat them differently, and
`T[]` is separate because `isAssignable` compares `arrayDepth` before it walks `baseKind`.

Cells read as: does the state exist for that kind, and do `settings-panel:inputs`,
`canvas:port-rows` and `canvas:node-badge` agree about it?

| kind family ↓ / state → | auto-bound | ambiguous | unsatisfied | locked | locked-unbound | ctx-bound |
|---|---|---|---|---|---|---|
| `Artifact` (required) | S (name-match only) | U C-022 | S | U C-032 | U C-022 | U C-025 |
| `Artifact` (optional) | U **C-021** | U C-021 | U C-021 | U C-021 | U C-021 | U C-021 |
| `undefined` (no kind) | n/a **C-020** | n/a C-020 | U C-020 | U C-020 | U C-020 | U C-020 |
| `Document` family (scalar) | S | U C-022 | S | U C-032 | U C-022 | U C-025 |
| `Segment` family (scalar) | S | U C-022 | S | U C-032 | U C-022 | U C-025 |
| `OcrResult` family | S | U C-022 | S | U C-032 | U C-022 | U C-025 |
| `Classification` family | S | U C-022 | S | U C-032 | U C-022 | U C-025 |
| `ValidationResult` | S | U C-022 | S | U C-032 | U C-022 | U C-025 |
| `Reference` | S | U C-022 | S | U C-032 | U C-022 | U C-025 |
| `T[]` (any element) | S | U C-022 | U **C-029** | U C-032 | U C-022 | U C-025 |
| unknown / typo'd kind | n/a | n/a | U **C-028** | U C-032 | U C-022 | U C-025 |
| map `collection` pseudo-port | U **C-026** | U C-026 | U C-026 | U C-026 | U C-026 | U C-026 |

Column-level readings, which is where the density actually is:

- **auto-bound** — reachable for every concrete family and, via the name-match path only,
  for required `Artifact`. Unreachable for `undefined` (`resolve-input-port.ts:65` returns
  `unsatisfied` before any walk) and, in practice, for anything downstream of a
  source/join/map/humanGate/childWorkflow, because `outputPortsFor` returns `[]` for six
  of the eight node types (**C-027**). This last one is the widest single gap in the axis:
  producer-hood is defined twice — once in the resolver, once in `derive-wires.ts` — with
  different answers.
- **ambiguous / locked-unbound** — the canvas cannot express either. `computePortRows`
  computes `bound` as "a wire targets me OR any binding row exists", never consulting the
  resolver (**C-022**). The documented ctxKey-less input stub therefore renders as
  satisfied on the card while the settings panel shows the red "Disconnected / Pick a
  source" row.
- **unsatisfied** — the catch-all. A cardinality mismatch (**C-029**) and an unrecognised
  kind string (**C-028**) both land here with the same "Needs a source" copy as a genuinely
  empty upstream. Three causes, one message.
- **locked** — the lock check short-circuits before `port.kind` is read, so a pin to an
  incompatible producer reads "Pinned ← <label>" as if healthy until the save-time
  binding-walk catches it (**C-032**).
- **ctx-bound** — exists only in `input-row-resolution.ts:77`. `auto-wire-status.ts` has
  no such state and reports these ports `unsatisfied`; the drawer/badge rescue them via a
  separately-implemented `manuallyBoundPorts` filter (**C-025**). The canvas has a third
  implementation (`data-from-ctx`) that uses an exact `config.ctx[key]` lookup and so
  misses every dotted key (**C-023**).

The `map collection` row is the one whole-row gap: it participates in the lock-list
namespace and the resolver auto-fills it, but it has no `PortDescriptor`, no kind, no row
in either row-builder, and no `PortResolution` — none of the six states apply to the port
that drives every map (**C-026**).

### Won't-support recorded here

- **C-030** — `ambiguous` / `unsatisfied` intentionally have no badge; the badge column is
  for states, the CTA column is for actions, and a row never needs both.
- **C-031** — `ctx-bound` intentionally has neither badge nor CTA: it is a satisfied state
  the author chose themselves.

---

## Axis 3 — Run status × surface

Three unions, gridded separately as the brief requires, plus the two derived states that
have no backing enum.

### 3a. `NodeRunStatusValue` (frontend, 6 members) × surface

| surface ↓ / status → | pending | running | succeeded | failed | skipped | cancelled | absent |
|---|---|---|---|---|---|---|---|
| `run-status-badge` | S | S | S | S | S | **W C-050** (aliased to pending) | S (≡ pending) |
| `canvas:group-chip` (aggregate) | S | S | S | S | **U C-048** (→ succeeded) | **U C-048** (→ pending) | S |
| `run:active-edges` | S | S | S | S | S | S | S (≡ pending) |
| `canvas:wire` (stamped data + structural wires) | S | S | S | S | S | S | S |
| `canvas:wire` (data wire with no direct normal edge) | **U C-052** | U C-052 | U C-052 | U C-052 | U C-052 | U C-052 | U C-052 |
| `preview-widget` (replay) | S (not-run) | S (not-run) | S (evicted) | S (failed copy) | S (evicted) | S (not-run) | S (not-run) |
| `preview-widget` (live Try) | silent null | silent null | S | **U C-045** | S | silent null | silent null |
| `wire-peek` | **U C-042** | U C-042 | S | U C-042 | S | U C-042 | U C-042 |
| `run:polling` (terminal) | S | S | S | S | S | **U C-049** (never emitted) | S |
| `canvas:source-card` | S | S | S | S | S | W C-050 | S |

**Correction (revision 2).** My first draft marked both wire rows entirely empty, on the strength of a
`grep` for `computeActiveEdges` and `isActive` in `WorkflowEditorCanvas.tsx` that returned nothing. That
grep was lying (C-071). The path is fully wired: `computeActiveEdges(config, nodeStatuses ?? {})` at
`WorkflowEditorCanvas.tsx:2124` inside a `useMemo` over the live status map, patched onto each edge as
`data.isActive` + the top-level `animated` prop at `:2143`–`:2144`, with a 12-line comment at `:2108`–`:2120`
describing the ~1.5 s status-tick cadence. **C-041 is withdrawn.**

What survives is narrower and real. `:2131`–`:2137` resolves a data wire's liveness through the normal edge
stamped onto it, but `upstreamNodesWithDistance` is a multi-hop reverse BFS, so the resolver legitimately
binds a consumer to a producer several edges upstream and `deriveStructuralWires` stamps an `edgeId` only
when a normal edge joins that exact pair. A wire with `edgeId === undefined` is hard-coded inactive for
every status (**C-052**, rewritten and downgraded to minor).

`wire-peek` is the most consequential populated row: it branches on `isReplay` alone and
never reads `nodeStatuses`, so a wire out of an untaken switch branch offers a
"Re-run to repopulate" button that will repopulate nothing (**C-042**) — the exact
misdiagnosis `PreviewWidget.tsx:49` was written to avoid.

### 3b. `NodeStatusValue` (engine, 5 members, uses `completed`) × surface

| surface | pending | running | completed | failed | skipped |
|---|---|---|---|---|---|
| any frontend surface | **U C-040** | U C-040 | U C-040 | U C-040 | U C-040 |

The whole union is orphaned: the runner maintains it in lockstep with the DTO union and
nothing in `apps/frontend` imports it. Not a bug today — it is the reason there is no
single domain definition of run status to grid against (**C-040**).

### 3c. Backend DTO enum (5 members, no `cancelled`) × surface

| surface | pending | running | succeeded | failed | skipped | cancelled |
|---|---|---|---|---|---|---|
| API contract (`node-statuses-response.dto.ts:44`) | S (reserved) | S | S | S | S | **U C-049** |
| `run-row` / `run-history-filters` (`RunSummaryStatus`, run-level) | n/a | S | S | S | n/a | S |
| Temporal `Terminated`/`TimedOut`/`ContinuedAsNew` → run-level | — | — | — | **W C-051** | — | — |

`cancelled` is in the frontend union and in `TERMINAL_NODE_STATUSES` but not in the DTO,
so a cancelled run's nodes stay `running` from the API's point of view and `run:polling`
never satisfies its stop condition (**C-049**, deferred — the cancel UX owns the answer).

### 3d. Derived states with no backing enum

| derived state | named where | typed? | consistent? |
|---|---|---|---|
| "didn't run / branch not taken" | `notRunMessage`, `PreviewWidget.tsx:58` | **no — a copy string** | **U C-044** |
| same concept in `wire-peek` | `state="no-run"`, `WirePeekPopover.tsx:95` | **no — `state: string`** | **U C-043** |
| "control-flow node, nothing to preview" | silent `null`, `PreviewWidget.tsx:162` | no | U C-045 |
| "live-Try miss" | silent `null`, `:199` | no | U C-045 |
| "unsupported kind" | silent `null`, `:203` | no | **U C-045** |
| "evicted" | `data-state="evicted"` + `Mode` enum in `CacheEvictedAlert` | partially | S |

Three of preview-widget's eight outcomes are indistinguishable from each other and from
"no data" (**C-045**), and the one that matters most — a node that DID produce output
whose kind has no widget — is silent. Which kinds fall into that hole is a grid of its own:

| kind form | widget | cell |
|---|---|---|
| `Document` family, scalar | `DocumentPreview` | S |
| `OcrResult` family, scalar | `OcrResultPreview` | S |
| `Classification` family, scalar | `ClassificationPreview` | S |
| `Segment` family, **array** | `SegmentArrayPreview` | S |
| `Segment` family, **scalar** | none | **U C-046** |
| `Document[]`, `OcrResult[]`, `Classification[]`, `PreparedFile[]`, any non-Segment array | none | U C-046 |
| `ValidationResult`, `Reference`, bare `Artifact` | none | U C-046 |
| `LabeledDocumentMap` | `ClassificationPreview` (wrong shape) | **U C-047** |

`preview:json` exists as a generic fallback but only `wire-peek` reaches for it
(`WirePeekPopover.tsx:157`); the node-card dispatcher never does.

### Won't-support recorded here

- **C-050** — `cancelled` deliberately aliased to the `pending` visual until US-141.
- **C-051** — Temporal `Terminated`/`TimedOut`/`ContinuedAsNew` deliberately collapse to
  `failed` in run history; `RunSummaryStatus` is a deliberate 4-member narrowing and
  `pending`/`skipped` have no run-level meaning.

---

## Axis 4 — Validation severity × anchor target

`GraphValidationError.severity` is `error | warning`. Of the 32 anchor shapes in the
INVENTORY, **26 are error-only** and only 6 ever carry a warning:

| anchor | warning source |
|---|---|
| `metadata.ctx` | validator.ts:523 (source.api vs `isInput`) |
| `nodes.<id>` | validator.ts:1046 (unreachable from entry) |
| `nodes.<id>` | validator.ts:1150 (node in multiple groups) |
| `nodes.<id>.inputs.<port>` | auto-wire-validation.ts:42 |
| `nodes.<mapId>.bodyExitNodeId` | map-body-validation.ts:38/:44/:57 |

So the 64-cell severity × anchor product is ~52 cells structurally empty. That is
**C-067**, filed as a `won't-support` non-goal rather than 52 findings: severity is a
property of the RULE, not the path — a dangling `defaultEdge` cannot be "a bit wrong".
What matters is that routing and rendering are identical for both severities, so every
routing gap below spans both cells of its row.

### Routing grid — the 32 anchors by destination

| destination | anchors | clickable? | cell |
|---|---|---|---|
| **deep-link to source picker** | `nodes.<id>.inputs.<port>` (error, validator.ts:1481) and (warning, auto-wire-validation.ts:42) | yes, "Pick a source →" | **S** — the only two |
| **node bucket, "Select node →"** | 21 shapes: `nodes.<id>`, `.label`, `.activityType`, `.inputs`, `.sourceType`, `.parameters<suffix>`, `.errorPolicy.fallbackEdgeId`, `.defaultEdge`, `.cases[i].edgeId`, `.bodyEntryNodeId`, `.bodyExitNodeId`, `.sourceMapNodeId`, `.inputs[i].ctxKey`, `.outputs[i].ctxKey`, `.outputs.<port>`, `.itemCtxKey`, `.indexCtxKey`, `<conditionPath>.operator`/`.operands`/`.operand` | node only, not the field | **U C-060** |
| **workflow bucket, inert** | 9 shapes: `""`, `schemaVersion`, `nodes`, `entryNodeId`, `edges`, `edges[i]`(+`.source`/`.target`), `edges.<edgeId>`(+`.source`), `nodeGroups.<id>.nodeIds`(+`[i]`), `nodeGroups.<id>.exposedParams[i].path`, `ctx.<key>`, `metadata.ctx`, `metadata.inputs[i].path`/`outputs[i].path` | **no — `onClick={undefined}`** | **U C-061** |

Sub-cells worth their own findings:

- `nodeGroups.<id>.…` names a node id and a param path in a form that exists
  (`settings-panel:group`, `exposed-params-editor`) and is inert (**C-064**).
- `ctx.<key>` / `metadata.ctx` name rows the `workflow-settings` ctx table edits, and are
  inert — which means two of the six warning-bearing anchors are unactionable (**C-065**).
- `nodes.<id>.outputs.<port>` is the structural mirror of the one deep-linkable shape and
  the only anchor naming a specific OUTPUT binding; it routes to select-node and the user
  then has to find it under "Show advanced" (**C-068**).
- `nodeIdFromPath` splits at the first dot while `parseInputPortPath` is greedy, so an id
  containing a dot buckets under a node that does not exist (**C-066**, deferred pending
  a node-id charset decision).

### Anchor × canvas surface — where a badge appears

| node/artifact type | ValidationBadge mounted? | cell |
|---|---|---|
| `activity` (`ActivityNodeRenderer`) | yes | S |
| `switch` (`SwitchNodeRenderer`) | yes | S |
| `map`/`join`/`childWorkflow`/`pollUntil`/`humanGate` (`ControlFlowRectangleRenderer`) | yes | S |
| `source` | **no** — explicitly skipped, canvas `:1991` | **U C-062** |
| collapsed group | **no** — explicitly skipped, canvas `:1983` (run status IS aggregated) | **U C-063** |
| edges / wires (`WorkflowEdge`) | **no** | **U C-070** |
| `topbar:validation-button` | counts both severities as one red "N issues" | **U C-069** |

Re-verified with `grep -a`: both omissions are DELIBERATE skips in the badge-sync effect, not renderer
oversights — `:1991` ("Source nodes don't surface a validation badge in US-117") and `:1983` ("Chips don't
render a validation badge — they're a pure visual collapse"). Both stay open cells, because the reasons have
expired: `nodes.<sourceId>.sourceType` (validator.ts:464, :506) and `nodes.<sourceId>.parameters<suffix>`
(:477) are ERROR-severity anchors that appear in the drawer and the top-bar count with no corner badge on
the card, so the canvas shows a clean graph while the top bar says N issues. The group-chip omission means
simplified view hides every member's badge while the top-bar count keeps rising. The edge
row means all five edge-naming anchors are invisible on the canvas *and* inert in the
drawer.

### Won't-support recorded here

- **C-067** — the full severity × anchor cross-product is not a design target; ~52 of the
  64 cells are structurally empty and should stay that way.

---

## The NUL-byte trap — read this before searching this feature

`apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` contains **two raw
NUL bytes**, both on line 2745, where `dataWireSig` joins its parts with literal U+0000 instead of
the `\0` escape:

```
const dataWireSig = (wire: DataWire) =>
  `${wire.source}<NUL>${wire.target}<NUL>${wire.targetPort}`;
```

POSIX `grep` and ripgrep classify any file containing a NUL as **binary** and return nothing with
exit status 1 — silently, and indistinguishably from "no matches". So every `grep` I ran against
the single largest and most-edited file in Parts 3–9 (3180 lines, 119 KB) came back empty and
looked like a confirmed negative. It cost this pass one wrong finding (C-041, withdrawn) and one
overstated one (C-052, rewritten).

**Verified scope of the damage:** I swept every tracked `.ts`/`.tsx` under `apps/**` and
`packages/**` for binary classification. `WorkflowEditorCanvas.tsx` is the **only** affected file,
so every grep-derived negative in this pass that did NOT touch it stands on solid ground.

**How to work around it:** `grep -a` (or `rg --text`, or read the file with Python/the Read tool).
It is filed as **C-071**, major, `impl-gap` — the fix is one character per byte with no behaviour
change, since the string is only an internal de-dup key.

**For future passes:** treat any "X has no caller / is never written / is not mounted" claim about
this file as unproven until re-run with `grep -a`. A zero-result grep here is not evidence.

---

## What I could NOT check, and why

1. **Anything runtime-observable.** No Temporal worker, no backend and no frontend were
   started for this pass, and the brief scopes it to static analysis. C-001, C-003, C-006
   and C-012 are read off the executor source plus the type signatures; they are
   arguments from code, not from an observed run. C-001 in particular deserves an
   integration test against a >20-item collection before anyone acts on the severity I
   gave it — the alternative reading is that the child path was intended to be entered
   only for graphs whose entry node IS the body entry, which nothing in the code says but
   which would make it a narrower bug.
2. **The 41-entry activity catalog, port by port.** I gridded kind *families*, not the 41
   entries' individual `PortDescriptor`s. The claim in C-021 that optional base-`Artifact`
   ports exist in the catalog is inferred from the filter's shape
   (`p.kind === "Artifact" && p.required === true` would be redundant if optional Artifact
   ports never occurred), not from an enumeration. Whether the affected cell is populated
   in practice is a catalog census I did not run.
3. **Dynamic (`dyn.*`) node ports.** They resolve against a per-lineage runtime schema,
   not the static catalog, so `computePortRows` and `resolveWireableInputRows` both return
   empty for them. Every axis-2 cell is therefore vacuous for dynamic nodes. Part 14 owns
   that surface and I did not grid it.
4. **`registerArtifactKind` at runtime.** The frozen-vs-live registry split
   (INVENTORY §5.9) means my kind-family grid describes the 27 frozen kinds. I confirmed
   `resolveKindFamilyRoot` and `isAssignable` both go through the live accessor, so the
   grid should hold for registered kinds too — but no caller of `registerArtifactKind`
   exists in this scope to test against.
5. **`preview:document` / `preview:segments` / `preview:ocr` internals.** I gridded which
   kinds reach a widget, not whether each widget handles malformed values. `C-047` is the
   one shape mismatch I could establish from the registry + the widget's type guard
   without running anything.
6. ~~**Whether `computeNodeStatus` has a live caller.**~~ **Resolved in revision 2.**
   `grep -a` across `apps` + `packages` finds exactly two sites: its own definition
   (auto-wire-status.ts:82) and auto-wire-status.test.ts. It has **no production caller**,
   so C-025 has no user-visible impact today and was downgraded major → minor. The gap is
   that one concept has two implementations and one is unreachable dead code.
7. **The exact 32-row anchor table.** I re-derived the anchor shapes from
   `validator.ts` directly (34 distinct `path:` expressions, several of which the
   INVENTORY collapses into one row) and cross-checked the six warning sites. The routing
   conclusions hold for every shape I found; if the INVENTORY's row-collapsing differs
   from mine, the counts in C-060/C-061 shift by one or two but no cell changes colour.
8. **Pass D's axis, deliberately.** `swap-node-type.ts`'s verbatim `inputs`/`outputs`
   carry-over (INVENTORY §5.14) is visible from C-022's vantage point — a swapped node can
   hold bindings for ports the new catalog entry does not declare, which is exactly the
   `bound = binding !== undefined` blind spot — but the swap itself is a mutation and I
   left it alone.

## Judgement calls

- **C-014 as a `non-goal`, not a gap.** The brief asked for every meaningful nesting
  combination. Most of them are not expressible in the type system, and calling that a
  design-gap 20 times would bury the three cases (C-002/C-003/C-006) where nesting is
  expressible and broken. One non-goal + three real findings is the honest shape.
- **C-067 as one `won't-support` rather than 52 empty cells.** Same reasoning: a grid
  whose emptiness is structural should say so once.
- **C-041 withdrawn outright rather than salvaged.** Its premise (the animation never fires)
  was simply false. I rewrote the one true residual as C-052 and deleted the rest; leaving a
  weakened C-041 in place would have preserved a wrong headline. A false major costs more than
  a missed minor.
- **C-071 (NUL bytes) graded major, not minor.** Nothing about it breaks at runtime — the file
  compiles and ships. I weighted it on blast radius instead: it silently disables the primary
  search tool against the feature's central file for every human and every agent that touches
  it, and it has already produced one confidently wrong analysis in this effort. A defect that
  corrupts the evidence other people reason from is worse than its own footprint.
- **C-062 / C-063 kept open despite explicit skip comments.** Both canvas skips are deliberate
  and documented in-line. I kept them as gaps because the stated reason has expired: source
  nodes now carry error-severity validator rules that US-117 did not anticipate, and validation
  has no aggregate-to-chip rule where run status already does. A recorded decision that no
  longer matches the rules around it is exactly what this pass is meant to surface.
- **C-042 graded major.** It actively misinforms (offers a recovery action that cannot
  work) rather than merely omitting information, which I treated as worse than a silent
  gap of the same size.
- **C-020/C-021 kept separate.** Both are "port renders on canvas, absent from the panel",
  but the causes differ (kindless vs optional-Artifact) and so would the fixes.
- **Severity for the C-011 family.** An unvalidated empty `collectionCtxKey` is a
  save-clean-then-fail-at-runtime path, which I weighted the same as a missing required
  field elsewhere in the form — major, not blocker, because the map settings panel does
  show the field as empty.
