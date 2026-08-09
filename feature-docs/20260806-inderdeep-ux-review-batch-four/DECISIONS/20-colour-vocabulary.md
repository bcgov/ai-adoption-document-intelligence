# Decision 20 — the canvas colour vocabulary

> ## Ruled — 2026-08-09
>
> Alex: **"ok, can do #20 now"**, on a recommendation that answered §5's four
> questions as: (1) keep a per-family port colour — Option D, (2) shape rather
> than outline pattern, (3) **fold the node accents in**, (4) fix the three
> drifts regardless. Shipped on that basis. What the build learned that the
> analysis had not:
>
> - **The port palette's own numbers moved.** Re-measured on the exact values
>   about to ship rather than on the doc's candidates, Option D as written held
>   a worst pair of only **ΔE 11.0** (Documents blue vs the merged content
>   violet, deuteranopia) — at the threshold, not clear of it. A search over
>   Mantine shades lifted it to **ΔE 14.2** by moving content to `violet-8`
>   `#6741D9`, pointers to `teal-7` `#0CA678`, and untyped to the theme's
>   `gray-7` `#605E5C`. The doc's `#099268` / `#12B886` teal and `#9F9D9C` grey
>   were the binding pair; `#9F9D9C` against a teal is what forced the change.
> - **The fifth shape is a bar, not a triangle.** Four filled silhouettes plus a
>   hollow one, none using `clip-path` — `clip-path` clips `outline` and
>   `box-shadow` away, and those two draw the array double-ring and the amber
>   needs-a-source ring. `diamond` is a rotated square for the same reason.
> - **The legend went to ELEVEN rows, not nine, and then to sixteen.** §4 said
>   the two ring modifiers would "fold into the family rows"; there is nowhere
>   to fold them, because a family row shows one dot and a ring is a thing that
>   happens *to* a dot of any family. Deleting them would have removed the only
>   explanation of the amber ring in the product. Then card borders got a
>   section of their own — they were never explained anywhere, because until now
>   there were thirteen of them. Four named groups instead of one undifferentiated
>   list; the row count is up, the decodable vocabulary is down from ~24 to 14.
> - **Question 3 could not be answered "fix the collisions".** Measured, the 13
>   accents produced **14 pairs under ΔE 11**, including `#22c55e` used for
>   three unrelated things and one pair at ΔE 0.2. Thirteen hues cannot be
>   separated at all, so the reduction was forced by the measurement, not
>   chosen. The axis it reduced along — what KIND of step this is — collapses
>   the seven activity CATEGORY accents into one. **That is the part Alex has
>   not seen yet**: every activity card is one slate now, and the category it
>   used to encode is carried by the icon, the label and the palette sidebar.
>   Easy to revert to per-category if he disagrees; see the worklog.
> - **Four more copies of the palette were found while wiring it up**, none of
>   them in §1's count: `dynamic-nodes/signature-preview-helpers.ts` (which had
>   `Segment` teal where the registry says violet, and five keys that are not
>   registry kinds at all), `sources/source-catalog-utils.ts`,
>   `sources/SourceNodeRenderer.tsx`, and `WorkflowEditorCanvas.tsx`'s arrowhead
>   markers. All now read one source.
> - **One regression, found by the e2e and not by the tests.** The toast
>   placement fix (a separate ask, same session) moved Mantine's `Notifications`
>   container down to clear the page action bar — which put a 440px-wide
>   `position: fixed` box, *empty*, on top of the canvas, swallowing every node
>   click and wire hover in the top-right quadrant. `pointerEvents: none` on the
>   container, `auto` on the notifications inside it.


**The question:** how many distinct visual signals should the workflow canvas
use to say "this is a piece of data of type X, and it can connect to Y" — and
should any of them be colour alone?

**The recommendation:** cut the seven port/wire family colours to **four typed
colours plus grey**, chosen for colour-vision separation (blue `#5595D9`,
violet `#7950F2`, yellow `#FAB005`, dark teal `#099268`, grey `#9F9D9C` — worst
pair stays ≥13.8 ΔE under both red-blind and green-blind simulation), and add
**one non-chromatic carrier on the port dot itself** so colour is never the only
signal. Do not adopt Inderdeep's inputs/outputs/processing/decision axis — see
Option A, it encodes something the canvas geometry already says.

**The premise verdict:** the legend renders **exactly 13 rows**, so Inderdeep's
"12 to 13" is precisely what he counted — but they are not 13 colours, and the
full canvas vocabulary is **far larger than 13**: **32 distinct rendered colour
values carrying ~24 separate meanings**, plus 37 icon glyphs. He was right about
the number on screen, right that it is too much, and understating the problem.

---

## 1. The hard count

"Colour-vision deficiency" below means the inherited conditions where one cone
type is missing — **deuteranopia** (no green-sensitive cone, ~1% of men) and
**protanopia** (no red-sensitive cone, ~1% of men). "ΔE" is CIEDE2000 perceptual
colour distance: below ~11 two colours read as the same colour to most people.

| Bucket | Where it lives | Count | What a user must decode |
|---|---|---:|---|
| Artifact kinds in the registry | [artifact-registry.ts](packages/graph-workflow/src/types/artifact-registry.ts) | **32** (not 33) | nothing directly — kinds are named in tooltips |
| Port-dot / data-wire **family colours** | `color:` fields, read via [colorForKind](apps/frontend/src/features/workflow-builder/canvas/artifact-kind-colour.ts#L37) | **7** | grey, blue, green, violet, yellow, teal, cyan |
| Port-dot **ring modifiers** | [handleArrayOutline](apps/frontend/src/features/workflow-builder/canvas/handle-style.ts#L80), [NEEDS_SOURCE_RING](apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx#L108) | **3** | pale ring = list; amber ring = unconnected input; 7px amber ring = both |
| Handle **positions** | [NodeHandles](apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx#L570) | **3** | left = in, right = out, bottom red = error out |
| Edge **variants** | [resolveStyle](apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx#L197) | **4** | data (solid, kind-coloured), sequence (grey dashed `6 4`), error (red + `on error` pill), conditional (`#facc15` + `if …`/`otherwise`/`(unmatched)` pill) |
| Edge **run-state overlays** | [WorkflowEdge.tsx:125–137](apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx#L125) | **3** | active (blue + marching-ants animation), taken (pale blue), selected (3.5px + glow) |
| Node **shapes / forms** | [control-flow-visual-hints.ts:34](apps/frontend/src/features/workflow-builder/control-flow-visual-hints.ts#L34), [GroupContainerNode.tsx](apps/frontend/src/features/workflow-builder/canvas/GroupContainerNode.tsx#L96) | **4** | rectangle, diamond (switch), dashed group box, group chip |
| Node **accent colours** (6px left border) | [COLOR_TOKENS](apps/frontend/src/features/workflow-builder/catalog-utils.ts#L54) + [HINTS](apps/frontend/src/features/workflow-builder/control-flow-visual-hints.ts#L49) | **12 distinct hexes** | 7 activity-category accents in use + 6 control-flow accents (one hex shared) |
| Group outline colours | [GroupContainerNode.tsx:78](apps/frontend/src/features/workflow-builder/canvas/GroupContainerNode.tsx#L78) | **2** | violet = authored group, green = map body |
| Run status badges | [NodeStatusBadge.tsx:78](apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.tsx#L78) | **6** | pending/running/succeeded/failed/skipped/cancelled — colour **and** glyph |
| Icon glyphs | [ICON_COMPONENTS](apps/frontend/src/features/workflow-builder/catalog-utils.ts#L80) | **37** | 31 activity icons + 6 control-flow icons |
| **Legend rows** | [CanvasLegend.tsx:120–185](apps/frontend/src/features/workflow-builder/canvas/CanvasLegend.tsx#L120) | **13** | 4 wire rows + 7 family rows + 2 modifier rows |

**Totals.** 32 distinct hex values are rendered on the canvas; stripping
duplicates by meaning, a user faces roughly **24 decodable distinctions** before
icons, and 61 with icons. The legend teaches 13 of them.

### Three drifts found while counting (small, fixable, not the decision)

The theme overrides Mantine's `blue`, `gray` and `red` scales
([appTheme.ts:83](apps/frontend/src/theme/appTheme.ts#L83)), and several
hardcoded fallbacks were written against stock Mantine, so the legend and the
canvas disagree:

1. The legend's "runs after" sample paints `gray-5` → **`#C6C5C3`**, but the
   real sequence wire is the literal `NORMAL_STROKE = "#9ca3af"`
   ([WorkflowEdge.tsx:117](apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx#L117)) — different greys.
2. The error **wire** is `red-6` → the theme's dark **`#822623`**; the error
   **handle dot** is the literal `#e03131`
   ([WorkflowEditorCanvas.tsx:511](apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx#L511)) — two reds for one concept.
3. The legend's "data flows" wire sample is `blue-6`, which is *also* the
   Documents family colour — so the row that means "any data" is painted in the
   colour that means "a document".

---

## 2. Accessibility, measured

Simulated with the Viénot 1999 dichromat transform on the **actually rendered**
hexes, scored with CIEDE2000. Anything under ΔE ≈ 11 is a collision.

**Deuteranopia (green-blind):**

| Pair | Rendered | Simulated | ΔE | |
|---|---|---|---:|---|
| Documents **blue** vs Identifiers **cyan** | `#5595D9` / `#15AABF` | `#8686DA` / `#9292C0` | **8.1** | collides |
| Untyped **grey** vs References **teal** | `#9F9D9C` / `#12B886` | `#9E9E9C` / `#9E9E89` | **8.6** | collides |
| Segments **green** vs References **teal** | `#40C057` / `#12B886` | `#A7A75C` / `#9E9E89` | 13.4 | marginal |
| Segments **green** vs Classification **yellow** | `#40C057` / `#FAB005` | `#A7A75C` / `#C9C900` | 14.1 | marginal |

**Protanopia (red-blind):**

| Pair | Rendered | Simulated | ΔE | |
|---|---|---|---:|---|
| Segments **green** vs Classification **yellow** | `#40C057` / `#FAB005` | `#B7B756` / `#BABA0C` | **6.6** | collides |
| Segments **green** vs References **teal** | `#40C057` / `#12B886` | `#B7B756` / `#AFAF86` | **10.9** | collides |
| Documents **blue** vs Identifiers **cyan** | `#5595D9` / `#15AABF` | `#9090D9` / `#A1A1BF` | **11.0** | collides |

**Worse: the *lightness* is nearly identical too.** Every collided pair above
sits between 1.02:1 and 1.17:1 contrast against each other, so there is no
brightness cue to fall back on. `grey` and `teal` simulate to `#9E9E9C` vs
`#9E9E89` — a 1.02:1 ratio. They are the same dot.

**Node accents are worse than the ports.** Under deuteranopia, `humanGate` red
`#EF4444` and `join` green `#16A34A` land ΔE **5.4** apart — the classic
red/green collapse, on two node types with opposite meanings. `activity blue`
`#3B82F6` and `childWorkflow` purple `#A855F7` land ΔE **0.6** apart: literally
indistinguishable. And `map` green, the activity "green" category, and the
map-body group outline are all the *same* hex `#22C55E` meaning three different
things.

**Conclusion:** Inderdeep's accessibility objection is correct and the evidence
is stronger than his phrasing. Three port-family pairs and two node-accent pairs
collapse, with no lightness difference to rescue them.

---

## 3. Options

| | What it changes | Files | What it breaks | Migration |
|---|---|---|---|---|
| **A. Inderdeep's functional grouping** — recolour by inputs / outputs / processing / decision | Replaces the `color:` axis on all 32 kinds with a role axis | `artifact-registry.ts`, `CanvasLegend.tsx`, ~6 tests | **The connectivity signal.** A port dot today answers "will these two plug together?" Role does not: `Document` is not "an input" — it appears on both sides of nodes. And "which side is this" is already carried by handle geometry (left/right). This trades a signal we have for one we already have twice. | none (colour is presentation-only, never persisted) |
| **B. Keep 7 colours, add a non-chromatic carrier** — handle **shape** per family | `handle-style.ts` gains `shape`; `WorkflowEditorCanvas` `NodeHandles`, `PortRows`, `CanvasLegend.Swatch` render it | 4 source + 4 test files | Nothing structural; `data-port-color` assertions gain a sibling `data-port-shape`. **But**: at a 10px handle only ~4 shapes (circle / square / diamond / triangle) are reliably told apart, so 7 families cannot each get one. This option silently forces the reduction anyway. | none |
| **C. Shrink the legend only** — 13 rows → ~6, families behind a disclosure | `CanvasLegend.tsx` + its test | nothing | Fixes the number he *reacted to* and none of the problem underneath. The canvas still paints 7 colliding colours. | none |
| **D. Recommended — 4 typed colours + grey, plus a shape carrier** | `color:` on all 32 kinds remapped to 5 values; `handle-style.ts` emits `shape`; renderers + legend follow | `artifact-registry.ts`, `handle-style.ts`, `WorkflowEditorCanvas.tsx`, `PortRows.tsx`, `CanvasLegend.tsx` + ~6 test files | Tests asserting `data-port-color="cyan"`/`"teal"`/`"green"`; the legend snapshot. No runtime, API or persisted-graph impact. | none — colour is derived at render time from the live registry |

---

## 4. The recommendation, in detail

**Four typed families plus grey**, each with a shape so colour is never load-bearing:

| Family (merges) | Kinds | Colour | Handle shape |
|---|---:|---|---|
| Documents & files (`Document` family) | 6 | blue `#5595D9` | circle |
| Content taken out of a document (`Segment` + `OcrResult`) | 15 | violet `#7950F2` | square |
| Judgements about a document (`Classification` + `ValidationResult`) | 4 | yellow `#FAB005` | diamond |
| Pointers — ids and lookups (`Identifier` + `Reference`) | 6 | dark teal `#099268` | triangle |
| Untyped / mixed / wildcard (`Artifact`, multi-port, unknown) | 1 | grey `#9F9D9C` | circle, hollow |

**Why these five and not any other five.** I searched fifteen candidate
Mantine shades for a fifth colour that keeps every pair apart under both
deficiencies. The set above holds a worst pair of **ΔE 13.8** (blue vs violet)
under deuteranopia *and* protanopia — the same worst pair as the four-colour set
alone, meaning the fifth slot is free. Every alternative fifth (stock `teal-6`,
`cyan-6`, `green-6`, `orange-6`, `indigo-6`) drops the worst pair to between 2.4
and 8.6, i.e. straight back into collision.

**Why this beats Inderdeep's axis while honouring his intent.** He asked for
about four buckets, and four is exactly what the colour maths permits. What he
got wrong is only the *axis*: bucket by what the data **is**, not by what the
step **does**, because the dot's job is to predict connections.

**What is lost, said plainly.** You will no longer see at a glance that an
`OcrResult` output will not fit a `Segment` input — both are violet. That
information does not disappear: the handle tooltip reads the kind literal
verbatim ([handle-style.ts:105](apps/frontend/src/features/workflow-builder/canvas/handle-style.ts#L105)),
the per-port pill row names it on selection, and validation still refuses the
connection. Colour degrades from *"tells you the exact type"* to *"tells you the
neighbourhood"* — which is what makes it survivable as the kind list grows,
which is your stated constraint.

**Sequencing.** Do the palette merge and the shape carrier together in one
change; they are the same files and shipping the merge alone removes distinctions
without replacing them. Legend rows drop from 13 to 9 as a consequence (4 wires +
5 families), with the two ring modifiers folded into the family rows.

---

## 5. What needs your ruling

1. **Does a per-family port colour survive at all?** Option D keeps it. The
   alternative nobody proposed but the evidence permits: make every port dot grey
   and carry the family purely by shape. That is maximally accessible and
   maximally dull, and it makes the "can these connect" read slower. I do not
   recommend it, but it is your call whether colour earns its place here.
2. **Is the non-chromatic carrier a shape or an outline pattern?** I recommend
   shape (four are legible at 10px; outline patterns are not). Inderdeep offered
   both.
3. **Node accents are a second, larger problem** — 12 hexes across 10 activity
   categories and 6 control-flow types, with a red/green collapse at ΔE 5.4 and a
   blue/purple collapse at ΔE 0.6. This decision does not touch them. Should it
   be a separate item, or folded in here?
4. **The three drifts in §1** are unambiguous bugs (two greys for one wire, two
   reds for one error, blue meaning both "any data" and "document"). I will fix
   them regardless unless you say otherwise.
