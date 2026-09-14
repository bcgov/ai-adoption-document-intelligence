# Workflow builder — review batch three

Seven items from Alex's 2026-08-03 pass, taken *on the batch-two fixes*
(`3f1f0874` … `a1d8022a`). Batch two answered his 2026-08-02 review; this batch
is the second-order feedback on what those fixes produced.

Character of the batch: three items are actively wrong — two of them write
something incorrect into the saved workflow and one destroys work you asked to
keep. Two are design work on surfaces that were built to be *correct* and never
laid out. Two are small.

Every cause below was verified in the running app before this plan was written,
not inferred from reading. Where verification **changed** the diagnosis, the
plan says so.

---

## Rulings that shape the work

**R-1 — Simplified view gets its own persisted arrangement.** Both views write
the same `metadata.position` today. The alternative fix — give the chip a dagre
box the size of the group's true bounding box, so one position set serves both
views — was **rejected**: if a chip reserves the footprint of the group it
hides, simplified view sprawls exactly as much as expanded view and there is no
reason to use it. So the two views get separate geometry.

**R-2 — Backwards wiring: always draw the flow edge, only pin when
unambiguous.** Two layers are involved and only one of them misbehaved.
`ensureEdgeBetween` creates the **flow edge** (execution order — "read blob runs
before poll classify"), which is correct and wanted. `pinPortBinding` creates
the **port pin** (a data binding — "this input takes its value from that
output"), which guessed. The pin becomes conditional; the edge does not.

---

## Phase 1 — The three that are wrong

### W-1 · Auto-arranging in simplified view corrupts the expanded layout

**Where** [`canvas/auto-layout.ts:338`](../../apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts#L338)
`layoutGraphSimplified`, and [`canvas/group-projection.ts`](../../apps/frontend/src/features/workflow-builder/canvas/group-projection.ts).

**Cause** Each group is registered with dagre as a box the size of its *chip* —
`DEFAULT_GROUP_CHIP_WIDTH` 248 × `GROUP_CHIP_HEIGHT` 48 — and once dagre places
that chip, every member is translated rigidly by the chip's delta:

```ts
const dx = position.x - chip.position.x;
const dy = position.y - chip.position.y;
for (const memberId of chip.memberNodeIds) {
  nextPositions.set(memberId, { x: from.x + dx, y: from.y + dy });
}
```

A group whose members really span ~1500×600 is therefore allocated a 248×48
slot; dagre packs the neighbouring ungrouped nodes hard against that slot, and
because the result is written back into `metadata.position` the damage is
**persisted**. Switching to expanded view shows the members at full size, on
top of their neighbours, permanently.

**Fix** Expanded positions stay in `node.metadata.position` and simplified
arrange never touches them. The simplified view stores a position per *visible
box* instead:

- a `position` on the `NodeGroup` itself
  ([`packages/graph-workflow/src/types.ts:114`](../../packages/graph-workflow/src/types.ts#L114)),
  one per chip;
- a `metadata.simplifiedPosition` on ungrouped nodes.

`projectGroupedConfig` reads the stored chip position and falls back to the
member centroid when unset, so every existing workflow opens sensibly the first
time. `layoutGraphSimplified` writes only chip positions and ungrouped
`simplifiedPosition`s. Dragging a chip writes the group's position rather than
translating members.

**Accepted consequence, named up front:** an ungrouped node now has two
positions, so nudging it in one view will not move it in the other. That is the
direct meaning of "own arrangement".

**Blast radius** `NodeGroup` lives in the shared `packages/graph-workflow`
package, so this touches the shared type and its validator, not frontend only.

**Tests** `auto-layout.test.ts`: arranging in simplified view leaves every
`metadata.position` byte-identical; the chip position lands on the group; a
config with no stored chip position still lays out (centroid fallback).

### W-2 · Backwards wiring pins the wrong output

**Where** [`canvas/extend-filter.ts:99`](../../apps/frontend/src/features/workflow-builder/canvas/extend-filter.ts#L99)
`firstMatchingOutputPort`, reached from
[`canvas/WorkflowEditorCanvas.tsx:3944`](../../apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx#L3944).

**Reported** Created poll-classify, hovered its "Result ID" input, picked "Read
Blob" — and the builder pinned Read Blob's `base64` output to `resultId`.

**Cause — verified in the catalog, and deeper than declaration order.** The
first reading was "it takes the first assignable output, so declaration order
decides". Verification shows the kind check carries no information at all here:

- `blob.read` declares exactly **one** output: `base64`, kind `DocumentContent`
  ([`catalog/activities/blob-read.ts`](../../packages/graph-workflow/src/catalog/activities/blob-read.ts));
- `azureClassify.poll` declares `resultId` with kind **`Artifact`**
  ([`catalog/activities/azure-classify-poll.ts:20`](../../packages/graph-workflow/src/catalog/activities/azure-classify-poll.ts#L20));
- `Artifact` is the **root** of the kind lattice —
  [`types/artifact-registry.ts`](../../packages/graph-workflow/src/types/artifact-registry.ts)
  hangs `Document`, `Segment` and everything else off it via `baseKind`, and
  `isElementAssignable` walks that chain upward, so **every** output in the
  catalog is assignable to a port declared `Artifact`. Undefined kinds collapse
  to the same wildcard.

So there was never a set of plausible candidates to rank: `base64` trivially
"matched", it was the only output, and the builder pinned it with full
confidence. **Exact-kind preference alone would not have prevented this**,
because no exact match exists.

**Fix** Replace `firstMatchingOutputPort` / `firstMatchingInputPort` with a
ranked pick that returns a *confidence*, not just a name:

1. exact kind match → pin;
2. name affinity (`resultId` ↔ `resultId` / `id`) → pin;
3. target kind is the root wildcard `Artifact` or undefined → **never pin on
   kind alone**, the match proves nothing;
4. merely-assignable and more than one candidate → **do not pin**.

When we don't pin, `ensureEdgeBetween` still runs, so the flow edge lands. The
input row keeps its normal automatic resolution — which can still resolve by
matching ctx key name — and shows "pick a source" when it can't.

This deliberately does **not** depend on the open identifier-kinds retag
question on this stream (`documentId` / `groupId` / `runId` / `modelId` /
`apimRequestId`, ~40 wildcard ports — `resultId` is one of them). The rule is
correct before that retag and stays correct after it.

**Tests** `extend-filter.test.ts`: `blob.read` → `azureClassify.poll.resultId`
returns no pin; an exact-kind pair still pins; a name-affinity pair still pins.
`WorkflowEditorCanvas.test.tsx`: the unpinned case still produces the edge.

### W-3 · Right-clicking one of several selected nodes acts on one node

**Where** [`canvas/WorkflowEditorCanvas.tsx:3137`](../../apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx#L3137)
`handleNodeContextMenu`.

**Cause** The handler builds the menu from the clicked node alone and never
consults the selection; `deleteNodeFromContextMenu` then removes exactly that
one id. The data is already there and unused — the canvas reports the full
selection upward via `onSelectionChangeMany`, which is what powers the top-bar
"Group selected".

**Fix** When the right-clicked node is *inside* a multi-selection, render a
selection menu instead: **"Delete N steps"**, **"Group these N steps"** (this is
item 6, and it falls out here for free), and "Ungroup" where it applies. Drop
the entries that mean nothing for a set — Change activity type, Edit script.
Right-clicking a node *outside* the current selection keeps the single-node menu
and resets the selection to that node, which is the conventional behaviour.

**Tests** `NodeContextMenu.test.tsx`: a 3-node selection renders "Delete 3
steps" and no type-swap entry; `WorkflowEditorCanvas.test.tsx`: confirming it
removes all three in ONE history entry (so one Ctrl+Z restores them).

---

## Phase 2 — The two design items

### D-1 · Group boxes overhang right and bottom, and collide

**Where** [`canvas/WorkflowEditorCanvas.tsx:1772`](../../apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx#L1772)
`computeGroupBounds`, using the estimates in
[`canvas/port-rows.ts`](../../apps/frontend/src/features/workflow-builder/canvas/port-rows.ts).

**Cause — measured in the running editor** (`standard-ocr-sdpr`, 5 groups). The
box is sized from worst-case *estimates*, never from what is on screen:
`ACTIVITY_NODE_WIDTH = 522` flat for every activity card, `ACTIVITY_BASE_HEIGHT
= 177` including a 120px preview block that isn't rendered on a workflow that
hasn't run, and `GROUP_CONTAINER_PAD = 40` on all four sides. Rendered vs
assumed, in flow units:

| node | type | rendered W×H | assumed W×H | over |
|---|---|---|---|---|
| `azureOcr.extract` | activity | 350×174 | 522×183 | **+172** wide |
| `azureOcr.submit` | activity | 292×130 | 522×199 | **+230** wide |
| `ocr.checkConfidence` | activity | 376×108 | 522×183 | +146 wide |
| `file.prepare` | activity | 452×174 | 522×… | +70 wide |
| `humanReview` | humanGate | 200×**58** | 180×**180** | **+122 tall**, 20 **under** wide |

Because the box's right edge is `max(pos.x) + 522` while the last visible pixel
is `max(pos.x + renderedW)`, the slack lands entirely on the right and bottom —
up to **212px** of empty box to the right (172 over-estimate + 40 pad) and
**162px** below a `humanGate` (122 + 40). Two pairs of boxes in that workflow
overlap on load, which is the reported symptom. The `humanGate` line also shows
the estimate is *under* by 20px on width, so a card can poke out of its own box.

**Fix** Size the box from xyflow's **measured** node sizes (`node.measured`),
which the canvas already harvests for Auto-arrange (`nodeWidths` from the live
instance), falling back to the estimate only for a node xyflow hasn't measured
yet. Cut `GROUP_CONTAINER_PAD` to ~16px on the sides and bottom, keeping extra
room at the top only because the header strip lives there.

**Tests** `WorkflowEditorCanvas.test.tsx`: given measured sizes, the box hugs
the members at the new pad; with no measurement it falls back to the estimate
and still encloses every card.

### D-2 · The Inputs panel value field never sits with its label

**Where** [`settings/InputsSection.tsx:730-846`](../../apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx#L730-L846).

**Cause — measured in the running panel.** Each row is a three-column grid,
`124px | 1fr | auto` = label | source+badge | actions. A row that needs a typed
value renders the field as a **second grid row underneath**, placed into column
2 and capped by it. Measured on a fresh `file.prepare` node: the panel is
**327px** wide and every value field is **159px** wide starting at **x=132** —
under half the available width, on its own line, with 36px wasted to its right.
Committing a value moves the row from "optional inputs" up into "Inputs" but
changes none of that, which is the second half of the report.

Separately, the port description is being used as the field's **placeholder**,
so it is always truncated: `` `pdf` or `image`. Auto-det… ``, `Identifier of the
documen…`, `Auto-detected from the f…`.

**Fix** Make a value-bearing row a proper labelled field:

- label + badge + `⋯` stay on the top line;
- the input moves to a second line spanning **label-through-actions** — full
  panel width, not indented into column 2;
- the two are visually bonded (tight gap, subtle left rule / field wrapper) so
  the relationship reads without hunting;
- the description becomes **helper text under the field**, where it can wrap,
  instead of a truncated placeholder. The placeholder becomes a short generic
  prompt.

Before/after screenshots go in this folder.

**Tests** `InputsSection.test.tsx`: the field spans the full grid width; the
description renders as helper text, not as the placeholder; committing a value
keeps the same layout in the required-inputs list.

---

## Phase 3 — The two small ones

### S-1 · "Group" on the right-click menu

Shipped as part of W-3 — "Group these N steps" on the selection menu. Today the
only path is the top-bar "Group selected"
([`WorkflowEditorV2Page.tsx:1867`](../../apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L1867)).

### S-2 · Workflows list — Name becomes the focus column

**Where** [`pages/WorkflowListPage.tsx:266`](../../apps/frontend/src/pages/WorkflowListPage.tsx#L266).

Today: Name `24%`, Slug `18%`, Description `32%`. The slug cap was added to stop
an unbreakable token stretching the table and over-corrected.

**Fix** Name `36%`, Slug `12%` with the chip truncating and the full value on
hover, Description `26%`. Name carries the visual weight of the primary column.

**Tests** `WorkflowListPage.test.tsx`: header widths; a long slug truncates
rather than widening its column.

---

## Order

W-1 → W-2 → W-3/S-1 → D-1 → D-2 → S-2. W-1 first because it is the one that
silently damages saved work; S-2 last because nothing depends on it.
