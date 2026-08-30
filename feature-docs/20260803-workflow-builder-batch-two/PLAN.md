# Workflow builder — review batch two

Fourteen items from Alex's 2026-08-02 pass over the builder, after the UX
walkthrough fix batch shipped (`637c024b` … `4bb70764`). Agreed 2026-08-03.

Batch one answered a UX reviewer's walkthrough. This batch is different in
character: four items are outright defects with identified root causes, one
reopens a model decision batch one settled, and the rest are the interaction
debt that accumulated while the canvas grew features faster than the chrome
around it grew room for them.

---

## Rulings that shape the work

Three questions were open before this plan; all three are now settled.

**R-1 — Group drag switches to ComfyUI semantics.** Drag the group's header to
move the group; drag a member to move only that member. This *reverses* batch
one's item 6 (`363b917c`, "groups move as one"), which made any member's drag
carry its siblings. That rule existed because there was nothing else to grab —
G-1 gives the group a header, so the reason expires. Cohesive drag stops being a
surprise and becomes a target you aim at, and repositioning a node *inside* its
group becomes possible for the first time.

**R-2 — Name and description leave the top bar.** Name becomes a click-to-edit
title beside the switcher; description moves into Workflow settings, where it
can wrap. This reclaims ~560px and is what makes P-3 a layout rather than a
reshuffle.

**R-3 — Constants route through `ctx`, entered on the port row.** No new
`PortBinding` variant. Typing a value on an input row writes a hidden ctx entry
with `defaultValue` set — the same trick auto-wiring already uses for
`__auto.{nodeId}.{port}` keys. The engine needs no change: `context-utils.ts`
already seeds ctx from `defaultValue` and the upload API already overrides it
per run. Optional Artifact ports become visible in the Inputs panel behind a
collapsed **"N optional inputs"** disclosure — folded, not hidden.

---

## Phase 1 — Defects

Independent of each other and of everything below. Ship first.

### B-1 · Deleting a group from its chip cuts wires even on Cancel

**Where** `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
→ `handleBeforeDelete` (~L2779).

**Cause** The chip *node* is vetoed and routed to the confirm modal, but the
handler returns `edges: edgesToDelete` untouched. xyflow sweeps every edge
incident to a deleted node into that list, so the chip's wires are cut
immediately — before the modal is answered, and irreversibly if it is
cancelled.

```ts
const rest = toDelete.filter((n) => groupIdFromChipId(n.id) === null);
return { nodes: rest, edges: edgesToDelete };   // ← edges never filtered
```

**Fix** Drop from `edgesToDelete` every edge whose source or target is a vetoed
chip. Those edges become the confirm path's responsibility.

**Second half — the 2-undo cost.** Today the edge cut is one `onConfigChange`
(via `handleDelete`) and the confirm's node removal is a second, so restoring
takes two Ctrl+Z. Holding the edges back collapses it to a single write, which
is one undo step. No separate fix needed — same change.

**Tests** `WorkflowEditorCanvas.test.tsx`: cancelling a chip delete leaves
`config.edges` byte-identical; confirming produces exactly one history entry.

---

### B-2 · Undo after a delete zooms and pans away

**Where** `WorkflowEditorCanvas.tsx` → the auto-fit effect (~L1938).

**Cause** The effect diffs the node-id set and treats any new id as an
authored addition. Undoing a delete re-adds nodes, which is indistinguishable
from adding one, and the single-node branch calls
`fitView({ nodes: [thatOne] })` — a hard zoom onto one card.

**Fix** The effect must distinguish an authored add from a history restore.
Cleanest available signal is the existing `layoutNonce`, which `undo`/`redo`
already bump ([`WorkflowEditorV2Page.tsx:585-594`]) and nothing else does per
step; suppress the fit on the render that follows a nonce change. Confirm no
other caller bumps it in the same tick before relying on this.

**Tests** `use-config-history.test.ts` / canvas: undo of a single-node delete
fires no `fitView`; adding a node from the palette still does.

---

### B-3 · Right-click menu survives a left click on the canvas

**Where** `NodeContextMenu.tsx` (relies on Mantine `closeOnClickOutside`).

**Cause** Mantine's click-away listens on document `mousedown`. xyflow's pane
runs d3-zoom/d3-drag, which calls `stopImmediatePropagation` on pane mousedown,
so the listener never fires. The menu closes when you click outside the canvas
and not when you click on it — which is where you always click.

**Fix** Close explicitly from `onPaneClick`, `onNodeClick` and `onMove` rather
than depending on click-away. Keep `closeOnEscape`.

**Tests** Canvas test: open the menu, fire `onPaneClick`, assert it unmounts.

---

### B-4 · Demos don't open auto-arranged

**Verify before fixing.** `metadata.arrangeOnLoad` is stamped in exactly one
place — `scripts/seed-feature-demos.mjs` — and the editor reads it off the
*stored* config (`WorkflowEditorV2Page.tsx:889-896`). The gating logic reads
correct on inspection, so the likely answer is that the demos currently in the
dev DB predate the flag.

**Step 1** `GET /api/workflows/<demo>` and look for the flag. If it is absent,
this is a reseed, not a code change, and closes here.

**Step 2, only if the flag is present** — instrument the `nodesAllMeasured`
poll and find out why the arrange either doesn't fire or fires against
unmeasured widths.

No code is written under this item until step 1 answers.

---

## Phase 2 — The group container model

The one item that changes the model. G-1 through G-4 land together; splitting
them ships a half-migrated canvas with two group visuals at once.

### The problem

Three visual languages for one concept:

| | today |
|---|---|
| map body | green dashed container box wrapping its members (`MapBodyContainer.tsx`) |
| user group, expanded | per-node dashed violet outline + label on hover (`workflow-editor-canvas.css:64-83`) |
| user group, collapsed | a chip node (`GroupChipNode.tsx`) |

The map-body box is the one that reads as a group. It is also nearly reusable:
a passive backdrop sized from the members' bounding box, `pointerEvents: none`
except its label.

### G-1 · User groups render as container boxes

Generalise `MapBodyContainer` to serve authored groups as well as synthetic
map bodies. Retire the per-node dashed-outline treatment and its
`--wb-group-label` hover chip. The box carries the group's label, colour and
icon in a header strip.

Membership stays **explicit**, not spatial. Dragging a node into the box's
area does not join it to the group — the box re-renders around wherever its
declared members are. This is the deliberate departure from ComfyUI: group
membership is a config fact the engine can read, not an artifact of where two
rectangles overlap.

### G-2 · Drag by the header (implements R-1)

The header strip becomes the group's drag handle: dragging it moves every
member by the same delta. Dragging a member moves only that member, and the box
re-renders to fit.

`group-drag-cohesion.ts` is mostly retained — `resolveGroupDragExtras`,
`captureGroupDragCohort` and `applyGroupDragDelta` are exactly the maths a
header drag needs. What changes is the trigger: today the cohort is captured on
any member's `onNodeDragStart`; it should be captured only on a header drag.
The module's header comment documents the superseded rule and must be rewritten
rather than left describing behaviour that no longer exists.

### G-3 · Grouping no longer flips to simplified view

Remove `setSimplifiedView(true)` from `handleGroupSelected`
(`WorkflowEditorV2Page.tsx:750`) and reword the toast.

**This reverses a logged decision** (2026-08-02: *"Grouping nodes should switch
the canvas to the simplified/collapsed view — a toast alone is not enough
visual feedback"*). The reasoning was sound against the weak dashed-outline
cue. G-1 removes the premise: a box drawn around the members is the feedback,
so the mode change is cost without benefit. **G-3 must not ship before G-1** —
alone, it returns grouping to a toast and a faint outline, which is the exact
state the walkthrough complained about.

### G-4 · Auto-arrange works in simplified view

**Cause** Chips sit at the *centroid* of their members' positions
(`group-projection.ts:127-149`). Auto-arrange lays out the member-level graph,
so chip centroids land at the middle of each member chain — not a layout of the
graph on screen. It looks like nothing happened because, for the visible nodes,
nothing did.

**Fix** When simplified, run dagre over the **projected** graph (chips +
ungrouped nodes), then translate each group's members by their chip's delta so
the expanded view stays coherent. Chip box size feeds dagre the same way
measured node widths already do.

**Tests** `group-projection` / `auto-layout`: arranging a simplified config
moves chips to non-overlapping positions and preserves each group's internal
member geometry.

---

## Phase 3 — Interaction and chrome

Independent of each other; any order.

### P-1 · Shipped templates stop carrying stale positions

`standard-ocr` and siblings load from `docs-md/workflows/templates/*.json`
(`apps/shared/prisma/seed.ts:505`) with coordinates hand-placed against
~300px-wide cards. Cards now render up to 522px (`auto-layout.ts:110-127`), so
the old grid overlaps.

**Strip the positions from the template JSON** rather than adding
`arrangeOnLoad` to them. `layoutGraphIfMissingPositions` already lays out a
config with zero positions on hydration (`WorkflowEditorV2Page.tsx:876-878`).
A shipped template with no baked coordinates cannot drift again the next time
card widths change; one carrying stale coordinates plus a flag telling the
editor to ignore them can.

Touches shipped templates only. Any workflow a person saved keeps its layout —
`layoutGraphIfMissingPositions` no-ops the moment *any* node has a position.

### P-2 · Workflow list columns

`WorkflowListPage.tsx:281-285` — `lineClamp={1}` → `2`, plus explicit widths
(Name ~25%, Description ~35%). Two lines caps row height while giving Name
room.

### P-3 · Top bar (implements R-2)

Current problems, from the code and screenshot 07:

- Name/Description are `TextInput`s with labels *above* them
  (`WorkflowEditorV2Page.tsx:1430-1443`), making the row ~1.5× taller than the
  buttons need and putting nothing on a shared baseline.
- Description truncates mid-word at `maxWidth: 280` — unreadable while editing.
- Four consecutive input boxes (switcher, Name, Description, Find-a-node) read
  as one form, so node search looks like workflow metadata.
- Simplified view is a `Switch` nested inside a `Menu.Item` with
  `closeMenuOnClick={false}` (`:1623-1640`) — a mode toggle two levels deep.

**Target** one row, one baseline, four divider-separated groups:

```
[ switcher · name (click-to-edit) ] │ [ find-a-node · simplified · auto-arrange · fit ] │ [ undo/redo · validity ] │ [ Save · Try · Run · More ]
```

Simplified view leaves the More menu and becomes a visible segmented control —
it changes what you are looking at, which is not a menu item's job.

### P-4 · Right-click anywhere on the canvas

`onPaneContextMenu` is not registered, so empty canvas gets the browser menu
while nodes get ours. Add a pane menu: Add node here, Paste, Auto-arrange,
Fit view, Select all. Shares the close-on-left-click fix from B-3.

### P-5 · Constants on input rows (implements R-3)

**Not a prerequisite for anything.** `fileType`, `fileName` and `contentType`
on `file.prepare` are `required: false` and auto-derived from the blob key. A
new workflow runs with all three empty. This item is about *override*, and
about the canvas and the panel telling the same story.

**The honesty gap, fixed first.** `computePortRows` renders a row and an
`in-<port>` handle for every declared input (`port-rows.ts:161-173`), so the
card advertises `fileType`, its kind and its description. The panel hides it —
`isEditableInputPort` excludes optional `Artifact` ports
(`input-row-resolution.ts:180-187`). The card says "here is a port that takes
`pdf` or `image`"; the only surface that could accept an answer pretends it
does not exist. Surface these behind a collapsed **"N optional inputs"**
disclosure: folded by default so the panel stays short, never secret.

**Then the value field.** An unbound port row gets an inline field, empty, with
the auto-detect note as placeholder (*"auto-detected from the extension"*).
Typing a value writes a hidden ctx entry carrying `defaultValue` and binds the
port to it.

**Then promotion.** A **"Make this a workflow input"** action on a constant row
converts the hidden entry into a named ctx declaration with `isInput: true`, at
which point it appears in the Run drawer and the run-spec.

The ctx editor in Workflow settings also gains a **Default value** field — but
as the surface for values worth naming and sharing, not as the way in.

Three states, no hoops in the common one:

| you want | you do |
|---|---|
| auto-detection | nothing |
| force `image` on one node | type it on the port row |
| let the caller choose per run | type it, then *Make this a workflow input* |

**Engine changes: none.** `CtxDeclaration.defaultValue` exists
(`types.ts:97`), `context-utils.ts:50-51` seeds ctx from it, `derive-input-schema.ts`
emits it as a JSON Schema default, and the upload API documents per-run
override. Rejected alternative: a `{ port, value }` variant on `PortBinding` —
more direct, but a schema change across engine, validator, resolver, canvas,
drawer and run-spec, and a third answer to "where does this input come from".
Still open if ctx proves insufficient.

### P-6 · Save-with-errors toast

`WorkflowEditorV2Page.tsx:189-201` dumps up to three `path — message` pairs plus
"…and N more" into a notification. Replace with one line — *"Saved as a draft.
3 issues to fix before it can run."* — and a **Review issues** action that opens
the validation drawer, which is the surface built for this.

### P-7 · Node icons move to Tabler

`catalog-utils.ts:31` maps `iconHint` to emoji, with a comment saying so
explicitly (*"real icons will land in Phase 1A polish"*). Group icons already
use Tabler components (`group/group-icons.ts`). Emoji also render differently
per OS, which for a GBC product is a small accessibility and consistency
problem. ~25 mappings, mechanical.

**Note:** the tofu box in batch one's screenshot 06 is *not* this bug — that
capture box has zero emoji fonts installed, so headless Chromium renders `📄`
as a missing glyph. It renders correctly in a real browser. P-7 stands on its
own merits.

---

## Phase 4 — Documentation

### D-1 · Re-shoot the screenshots

After Phase 2 and P-1/P-3, which change most frames anyway. Same document,
`feature-docs/20260802-ux-walkthrough-fix-batch/ILLUSTRATED_REVIEW.md`, with
each section tagged by origin — `UX walkthrough 2026-07-29` vs
`Alex review 2026-08-02` — so provenance survives the merge. New *Try it*
blocks for anything added here.

**Install an emoji font on the capture box first**, or P-7 lands before the
re-shoot and it stops mattering.

### D-2 · Docs to update

- `docs-md/workflows/WORKFLOW_BUILDER_GUIDE.md` — group gesture table (R-1
  reverses what it currently documents), toolbar layout, constants on ports.
- `docs-md/workflows/MANUAL_TEST_PLAN.md` — cases for B-1 (cancel preserves
  wires), B-2 (undo does not re-fit), G-2 (header drag vs member drag), P-5
  (constant survives save/reload and reaches the activity).
- `docs-md/workflow-builder/PORT_WIRING_DESIGN.md` — §4.2/§6.4 describe the
  optional-Artifact hiding rule P-5 replaces.

---

## Order

1. **Phase 1** — four defects, independent, smallest. B-4 may close without code.
2. **Phase 2** — G-1 → G-2 → G-4, with G-3 gated behind G-1.
3. **Phase 3** — any order. P-1 and P-3 have the largest effect on D-1.
4. **Phase 4** — last.

## Out of scope

- Spatial group membership (drag a node into a box to join it) — explicitly
  rejected under G-1.
- Per-port literal bindings — deferred under P-5.
- Reducing the workflow list's column count beyond P-2's widths.
- Anything in the three unrelated `feature-docs/` folders in the working tree.

## Risks

- **R-1 reverses shipped, tested, documented behaviour.** `group-drag-cohesion.ts`
  keeps its maths and loses its trigger; its header comment and the guide's
  gesture table both assert the old rule and must be rewritten, not amended.
- **G-3 reverses a logged decision** and is unsafe alone. Gate it on G-1.
- **B-2's fix leans on `layoutNonce`** meaning "history moved". Verify nothing
  else bumps it in the same tick before relying on it.
- **P-1 changes shipped template JSON.** Confirm no test or integration fixture
  asserts the current coordinates.
- **P-5 changes what the Inputs panel populates**, which
  `resolveWireableInputRows` shares with `ConnectSummaryPopover`. Both surfaces
  move together by construction; the badge and drawer counts must be checked
  against the new population.

---

## Outcome

All fourteen items shipped across `3f1f0874` (Phase 1 + Phase 3), `2df24f4a`
(G-1/G-2/G-3) and `6124f7d5` (G-4). Two of them turned out to have the wrong
diagnosis above — **do not trust the P-1 and B-4 sections as written**.

**B-4 — "demos don't open auto-arranged" was not about the flag.** Step 1 of the
plan was the right instinct and the answer was blunter than expected: there is
no demo workflow in the dev DB **at all**. All 17 `demo-*` links in
`docs-md/workflows/FEATURE_DEMO_GUIDE.md` 404, so "the demos don't
auto-arrange" was downstream of the demos not existing. `metadata.arrangeOnLoad`
and the gating logic were both correct on inspection and remain unchanged. This
closes as a reseed (`npm run seed:demos`), not a code change.

**P-1 — the shipped templates never carried stale positions.** The plan asserts
that `standard-ocr` and siblings hold coordinates hand-placed against ~300px
cards. They do not: all 15 templates under `docs-md/workflows/templates/` were
checked and carry **zero** `metadata.position` entries, and no commit ever added
one. So there was nothing to strip and the "shipped template JSON changes" risk
never materialised.

The real cause of "a template loads spread out and tightens after Auto-arrange"
is a timing difference, not stale data: `layoutGraphIfMissingPositions` runs at
**hydration, before mount**, so dagre sees only the uniform 482px fallback
width, while the Auto-arrange button feeds it the live measured widths of the
rendered cards. Two layouts of the same graph against different widths look like
drift. The fix landed as a behaviour change rather than a data change — the
measured-width pass now also runs for **any** config that arrived without
positions, not only for demos carrying `metadata.arrangeOnLoad`.

Two smaller deviations, recorded so the plan and the code agree:

- **P-4 ships without Paste.** §P-4 lists it; nothing in the builder copies
  anything, and cloning a node needs auto-ctx-key remapping nobody has ruled on.
  An item that can never be enabled is worse than an absent one.
- **P-7 mapped two hints the plan didn't count** — `gauge` and `code`. Both were
  emitted by the catalog and resolved by nothing, and `code` is the default for
  every `dyn.*` node, so all custom nodes rendered identically.
