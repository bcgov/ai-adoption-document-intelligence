# Decision 09 — pressing Try reflows the graph

**The question:** the preview pane mounts *inside* the node card, so every card
that produces output grows mid-run and the persisted layout no longer fits.
Alex, watching the shared screen: *"when you hit try, it also resized the boxes
and they started to overlap in a strange way … it's kind of jarring."* The
checklist names two ways out — reserve the space in the resting layout, or grow
downward only. There is a third the checklist does not mention, and it is the
one I would take.

**The recommendation:** **Option C — a fixed-height result strip in the card,
with the full preview in the popover that already exists.** The card's height
becomes the same whether a run has happened or not, so nothing can reflow; the
strip carries the at-a-glance signal (status, kind, a one-line value); the full
scrollable preview opens in `WirePeekPopover`, which already renders this exact
widget from the same query.

---

## The mechanism, measured

Layout heights are estimated, not observed — `estimateNodeHeight`
([port-rows.ts:270](apps/frontend/src/features/workflow-builder/canvas/port-rows.ts#L270))
returns `ACTIVITY_BASE_HEIGHT` (177) plus 22px per port row plus a 6px margin.
It routes by node type and mirrors what the canvas mounts at rest. **It makes no
allowance for the preview pane at all**, because at rest there isn't one.

Dagre then separates ranks with `DEFAULT_NODESEP = 60`
([auto-layout.ts:115](apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts#L115)) —
so vertical neighbours sit 60px apart.

At run time the card mounts `<NodePreviewOverlay>`
([WorkflowEditorCanvas.tsx:998](apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx#L998)),
whose pane is capped at `PREVIEW_MAX_HEIGHT_PX = 200`
([PreviewWidget.tsx:57](apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx#L57)),
and whose loading state is a 120px skeleton. Despite the name, the "overlay"
renders inline in the card body — it is a `<Box>` in the normal flow, not an
absolutely-positioned layer.

**So a card grows by up to 200px into a 60px gap.** Up to ~140px of overlap with
the node below, appearing the moment output lands and changing again when the
skeleton is replaced by real content. That is the "strange way" — cards don't
just get bigger, they get bigger *twice*, at different times, per node.

## Options

**A — reserve the preview's space at rest.** Add a preview allowance to
`estimateNodeHeight` for every node that produces output. Layout is then correct
at both moments and nothing ever moves.
*Cost:* every graph is permanently ~200px taller per output-producing node, in
the state authors spend most of their time in — building, not running. A
six-node chain gains roughly 1,200px of empty space. Auto-arrange spreads
accordingly, so the resting graph fits less on screen. This makes the common
case worse to fix the rare one.

**B — grow downward only, never displace.** Take the preview out of flow
(absolute, anchored under the card) so the node's layout box never changes.
*Cost:* nothing reflows, but the preview still lands *on top of* whatever is
below it — including the next node's card. Overlap becomes occlusion. It is
better than today (stable positions, predictable direction) but it does not
satisfy the checklist's own acceptance line, "No node overlaps another as a
result of pressing Try". It also needs a z-order rule for a run where several
adjacent nodes preview at once.

**C — fixed-height strip in the card, full preview in the popover.** Reserve a
small, *constant* band in the resting card — enough for a status line and one
line of value — and move the scrollable body to a popover on click.
*Why it is cheap:* the popover already exists and already renders this widget.
`WirePeekPopover` ([WirePeekPopover.tsx](apps/frontend/src/features/workflow-builder/canvas/WirePeekPopover.tsx))
is documented as sharing "the same batch-preview query as the node-card
`PreviewWidget`", so the data layer needs nothing new — this is a presentation
change, not a re-architecture.
*Cost:* the full value is one click away instead of visible in the frame. During
a run you see *that* each node produced something and roughly what, not the
whole payload of every node at once. The constant band is a real but small
resting-height increase (one line, not 200px).

**D — a docked results panel.** Every node's output in a side panel, nothing in
the card. Rejected without a long write-up: it splits attention away from the
graph, which is the opposite of what "try in place" was built for
(`docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md`).

## Recommendation — Option C

The reason to prefer C over A is whose time it spends. A pays a permanent cost
in the building state to make the running state stable. C pays a small constant
cost in both and keeps the graph readable in each. The reason to prefer C over B
is that B trades reflow for occlusion and still fails the acceptance line.

There is a second payoff. Shot 1 in the illustrated review is currently **two
tight crops** rather than one wide frame, and the script says why: *"a wide frame
of this graph is unreadable right now because the preview panels grow the cards
mid-run and they overlap their neighbours"*. Whichever option lands, that shot
should be re-taken as one wide frame — under C it would actually be legible.

**What I need from you:** A, B or C. If C, one follow-up — should the strip show
the value's first line, or only the kind and status? The first is more useful and
more likely to look ragged across kinds.
