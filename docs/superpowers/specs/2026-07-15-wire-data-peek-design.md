# Wire Data Peek — Design

**Status:** Approved 2026-07-15. Phase 4 of the port-wiring redesign
(`docs-md/workflow-builder/PORT_WIRING_DESIGN.md` §10).

**Goal:** After a run (Try or replay), clicking a data wire on the canvas opens
a popover at the wire showing the value that actually flowed across it —
rendered with the existing kind widgets where the wire's kind has one, else a
truncated-JSON snippet. This is the moment the "a wire is data" model proves
itself with the user's own document.

**Non-goal:** No change to `GraphWorkflowConfig`, the engine, the resolver, the
preview-cache API, or the canvas wire model. This is a presentation layer over
the existing preview cache and the existing kind widgets.

---

## 1. Background — what exists today

- **Preview cache API** (`backend-services/src/workflow/workflow.controller.ts`):
  `GET /:id/preview-cache-batch?runId=` returns `{ previews: Record<nodeId,
  ActivityOutputPreviewDto> }`; each `ActivityOutputPreviewDto` is
  `{ outputCtx: Record<string, unknown>; outputKind: string | null; createdAt;
  expiresAt }`. `outputCtx` is the **ctx fragment the node wrote, keyed by
  ctxKey** — not by port name. Rows past `expiresAt` return absent (evicted).
- **Frontend hook** (`workflow-builder/preview/useActivityOutputPreview.ts`):
  `useActivityOutputPreview(workflowId, nodeId, runId?)` reads the shared batch
  query (key `["preview-cache-batch", workflowId, runId ?? "latest"]`) and
  `select`s the one node, returning `{ data: ActivityOutputPreview | null,
  isLoading, error }`. Because every observer shares one query, mounting the
  hook for a peek costs no extra network round-trip.
- **Node preview dispatch** (`preview/PreviewWidget.tsx`): `renderForOutputKind`
  switches on `outputKind` and forwards a **fixed ctx slot** to a value-level
  widget:

  | outputKind | widget | ctx slot |
  |---|---|---|
  | `Document` / `MultiPageDocument` / `SinglePageDocument` | `DocumentPreview` | `outputCtx.document` |
  | `Segment[]` | `SegmentArrayPreview` | `outputCtx.segments` |
  | `OcrResult` / `OcrFields` | `OcrResultPreview` | `outputCtx.ocrResult` |
  | `Classification` | `ClassificationPreview` | `outputCtx.classification` |
  | default / null | (renders nothing) | — |

  Every widget already takes a single `value` prop, so it is value-level; only
  the *slot selection* is node-preview-specific.
- **Data wires** (`canvas/derive-wires.ts`): `DataWire` carries `variant:"data"`,
  `source`, `sourcePort`, `target`, `targetPort`, `kind?: KindRef`, `pinned`,
  `auto`, `via?`, `edgeId?`, and **`ctxKey`**. Projected to xyflow edges
  (`WorkflowEditorCanvas.projectFlowEdges`) as `type: "workflow-edge"`,
  `selectable: true`, `data: { wire }`. The custom edge component
  (`canvas/WorkflowEdge.tsx`) renders a native SVG `<title>` tooltip and uses
  `EdgeLabelRenderer` for its label pill — the natural mount point for a
  midpoint popover.
- **Run state** (`run/RunStateContext.tsx`): `{ workflowId, activeRunId, isReplay,
  nodeStatuses }`. `activeRunId === null` means no run has been kicked off.
- **Evicted-cache affordance** (`preview/CacheEvictedAlert.tsx`): existing
  component with a Re-run flow (fetch historical input-ctx → POST /runs → swap to
  the live run), used by the node preview's null-on-replay branch.

### Correction to §10

§10 says the wire "scopes it to `result[port]`". The cache payload is
`outputCtx` keyed by **ctxKey**, so the correct scoping is
**`outputCtx[wire.ctxKey]`**. For source nodes the port name equals the ctxKey
(e.g. `documentUrl`), so they coincide; for activity producers the port and
ctxKey can differ. `DataWire.ctxKey` is exactly the key to use.

---

## 2. Design decisions (locked during brainstorming)

1. **Open on click, popover at the wire.** Clicking a data wire selects it
   (native React Flow) and opens a peek popover anchored at the wire midpoint.
   Clicking elsewhere deselects → closes. (Rejected: hover-only card — SVG wire
   paths are thin, hover targeting is fiddly and flicker-prone.)
2. **A "View data" context-menu backup.** `WireContextMenu` gains a **View
   data** item (§7 line 114 already reserves it), shown only after a run
   (`activeRunId !== null`); it selects the edge → same popover. Keeps the
   feature discoverable without relying on users clicking a thin wire.
3. **Kind widget where available, else JSON.** Reuse the existing kind widgets
   when `wire.kind` maps to one; otherwise a truncated-JSON snippet with a
   "View raw" expand.
4. **The rich preview cannot live in the SVG `<title>`.** The native tooltip
   (provenance string) stays as-is for quick hover; the value peek is a separate
   React surface rendered via `EdgeLabelRenderer`.

---

## 3. Interaction & placement

- **Open:** click a data wire → React Flow marks the edge `selected` →
  `WorkflowEdge` renders `<WirePeekPopover wire={wire} />` inside
  `EdgeLabelRenderer` (midpoint). Only for `variant === "data"` edges; sequence
  and error wires render no popover.
- **Close:** click empty canvas / another element (native deselect), or the
  popover's close control.
- **Context menu:** right-click a data wire → `WireContextMenu` now lists **View
  data** (only when `activeRunId !== null`) above Disconnect / Revert. Selecting
  it sets that edge `selected` (and deselects others), opening the popover.

The popover is a Mantine `Paper`/`Card` surface (not a hover `Tooltip`), so it
holds interactive widgets (View-raw modal, Re-run button) and survives mouse
movement.

---

## 4. `WirePeekPopover`

New component `canvas/WirePeekPopover.tsx`.

**Props:**

```ts
interface WirePeekPopoverProps {
  wire: DataWire; // variant:"data" — carries source, ctxKey, kind
}
```

**Behaviour:** resolves `workflowId`/`activeRunId`/`isReplay` from
`useOptionalRunState()` (soft-fails to a minimal "no run" state when no provider
is mounted, mirroring `NodePreviewOverlay`). When a run exists it calls
`useActivityOutputPreview(workflowId, wire.source, activeRunId)` and scopes the
value to `outputCtx[wire.ctxKey]`.

**State matrix:**

| Condition | Render |
|---|---|
| `activeRunId === null` | dimmed text — "Run to see the data flowing here." |
| `isLoading` | `<Skeleton>` |
| `error` | `<Alert color="red">` — "Preview unavailable." |
| replay + `data === null` (evicted) | `<CacheEvictedAlert>` (its Re-run flow) |
| live + `data === null` (not produced yet) | "Run to see the data flowing here." |
| `data` present, `ctxKey` not in `outputCtx` | dimmed text — "No value recorded for this connection." |
| value present | `renderKindValue(wire.kind, value)` ?? `<JsonValuePreview value={value} />` |

Header line names the connection: **"*Producer label → port*"** (from
`config.nodes[wire.source].label` + the catalog port label), so the peek reads as
"this is the data on *this* wire".

testids: `wire-peek-popover` (root, with `data-state` = `no-run` | `loading` |
`error` | `evicted` | `empty` | `ready`), `wire-peek-value`.

---

## 5. `renderKindValue` — shared kind→widget dispatch

The kind→widget mapping is currently inlined in
`PreviewWidget.renderForOutputKind`. Extract the *widget dispatch* (not the slot
selection, which is node-preview-specific) into one helper so the node preview
and the wire peek cannot drift:

```ts
// preview/render-kind-value.tsx
export function renderKindValue(
  kind: KindRef | string | null,
  value: unknown,
): ReactNode | null; // Document/Segment[]/OcrResult/OcrFields/Classification → widget; else null
```

- `PreviewWidget.renderForOutputKind(data)` becomes: pick the slot per
  `outputKind`, then `renderKindValue(outputKind, slotValue)`.
- `WirePeekPopover` calls `renderKindValue(wire.kind, outputCtx[wire.ctxKey])`
  and falls back to `<JsonValuePreview>` when it returns `null`.

`KindRef` values with no widget (`Artifact` wildcard, scalar kinds, `Reference`,
`Segment` singular, `OcrTable`, `ValidationResult`, …) return `null` → JSON
fallback.

---

## 6. `JsonValuePreview` — the truncated-JSON fallback

New small component `preview/JsonValuePreview.tsx`. Today no generic
truncated-JSON fallback exists (unknown kinds render nothing on node cards); §10
requires one for the peek.

```ts
interface JsonValuePreviewProps {
  value: unknown;
}
```

- Renders a compact one/two-line preview: primitives shown inline (long strings
  truncated with an ellipsis); objects/arrays shown as a truncated
  `JSON.stringify` snippet.
- A **"View raw"** `Anchor` opens a Mantine `Modal` with a read-only
  `JsonInput` of `JSON.stringify(value, null, 2)` — the same affordance
  `OcrResultPreview` already uses internally, lifted into a reusable component.

testids: `json-value-preview`, `json-value-preview-raw` (the View-raw trigger).

---

## 7. Plumbing

- `WorkflowEdge.tsx`: when `props.selected && data.wire?.variant === "data"`,
  render `<EdgeLabelRenderer><WirePeekPopover wire={data.wire} /></EdgeLabelRenderer>`
  at the computed midpoint (`labelX`/`labelY` already available). The native
  `<title>` provenance tooltip is unchanged.
- `WireContextMenu.tsx`: add an `onViewData` prop and a **View data** item,
  rendered only when the caller passes `canViewData` (wired to `activeRunId !==
  null`). `WorkflowEditorCanvas` supplies `onViewData` = select this edge.
- `WorkflowEditorCanvas.tsx`: no new `onEdgeClick` needed — native selection
  drives the popover. The context-menu path calls `setEdges` to mark the target
  edge `selected` (deselecting others).

No change to `derive-wires.ts`, `projectFlowEdges`, the preview hook, or the API.

---

## 8. Testing (TDD)

**Unit (frontend, vitest):**

- `renderKindValue` — each mapped kind returns its widget; unmapped kind / null
  returns `null`. Refactored `renderForOutputKind` still renders the same widget
  per `outputKind` (regression).
- `JsonValuePreview` — primitive inline; long string truncated; object → snippet
  + "View raw" opens the raw modal with pretty-printed JSON.
- `WirePeekPopover` — the full state matrix (§4) with a mocked
  `useActivityOutputPreview` and a stub `RunStateContext`: no-run, loading,
  error, evicted (replay+null → `CacheEvictedAlert`), empty (`ctxKey` absent),
  ready with a kind value (→ kind widget), ready with a scalar (→
  `JsonValuePreview`). ctxKey scoping: value read from `outputCtx[wire.ctxKey]`,
  including a source-node case where port === ctxKey.
- `WorkflowEdge` — renders `WirePeekPopover` only when `selected` and the wire is
  `variant:"data"`; not for sequence/error wires, not when unselected.
- `WireContextMenu` — **View data** present only when `canViewData`; fires
  `onViewData`.

**E2E (`tests/e2e/workflow-builder`, `@infra`):** extend `tier3-try-preview` —
after the existing `source.upload → file.prepare` run completes and the editor
reloads, click the `upload1 → prep` data wire (edge id `wire:prep:blobKey`),
assert `wire-peek-popover` reaches `data-state="ready"` and `wire-peek-value`
shows the flowed value. One added block, same fixture; no Azure/OCR needed.

**Docs (project convention):** mark PORT_WIRING_DESIGN §15 phase 4 complete with
any limitations found; add a MANUAL_TEST_PLAN wire-peek section and a
FEATURE_DEMO_GUIDE entry. Seeded demo configs are unchanged (no schema change).

---

## 9. Known limitations (recorded up front)

- **Kind-widget reuse only helps object-valued ports.** Scalar/URL/`Artifact`-
  wildcard wires — the majority in practice (`documentUrl`, identifiers, counts)
  — fall to the JSON snippet. That is inherent to those kinds, not a gap here.
- **Data wires only.** Control-flow and source nodes still render node-level
  handles; source→activity data wires exist and peek fine, but a condition (§11)
  draws no wire and thus has no peek. The simplified view is edge-only (no data
  wires) and gets no peek.
- **Popover is midpoint-anchored.** For long wires crossing other nodes the
  midpoint can overlap unrelated cards; acceptable for a click-to-open transient
  surface, revisited only if it reads as noisy.
