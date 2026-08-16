# Edges and connectors — D9, D10, D28

Dylan's three questions about the connectors on the sides of the cards. They
turned out to be one object seen from three angles: the **node-level pair of
dots** that every card renders, which is where a `normal` edge attaches and
which the legend calls *"Runs after — order only, no data"*.

Worked 2026-08-15. Everything below was reproduced in a real browser against
the running dev stack before anything was changed, because all three are
positional or gestural and jsdom can see none of it.

**Scope owned this pass:** `apps/frontend/src/features/workflow-builder/canvas/**`
(plus one correction to `docs-md/workflows/TYPED_IO_DESIGN.md`, which described
the behaviour that changed). The settings panels, the legend, the palette and
label copy were another agent's; two suggestions for the legend are handed over
at the end rather than made here.

---

## Short answers, for the reviewer

| His question | The answer |
|---|---|
| **D9** — why does a drag from the Segments output make a run-order edge? | It was classified by where it was DROPPED, not where it started. Fixed: the origin decides now. |
| **D10** — can order-of-operations edges be drawn by hand? Is it intentional? | **They always could.** Nothing was disabled — it was undiscoverable, and the control-flow cards actively described the dot as something else. Nothing was enabled; the dot now explains itself. |
| **D28a** — why do only some nodes connect with run-order lines? | A run-order line is drawn only between a pair with **order and no data**. Where data also flows, the data wire carries the order and no second line is drawn. |
| **D28b** — why are the connectors at different heights? | An accident. Activity cards pinned them 18px below the top; every other card left them at the vertical middle. Now 18px everywhere except the switch diamond, whose vertices *are* its middle. |
| **D28c** — does the size of the Poll status connector mean something? | **Yes.** A port dot grows from 12px to 16px and gains a `+` when it is required and nothing is attached. It meant that before and said so nowhere; it says so now. |

---

## D9 — a drag begun on a data port completed as a run-order edge

### Reproduced

Built gallery stop 7's own pair as a scratch workflow — `document.split`
("Split Document") and a `map` ("Run for each item"), no edges — opened
`/workflows/<id>/edit`, and dragged with real mouse events from the violet
**Segments** dot to the loop card's left-hand run-order dot.

```
from {"x":896,"y":483}  ->  to {"x":1073,"y":600}
after edges: [{"dash":"6px, 4px","stroke":"rgb(156, 163, 175)"}]
after toasts: []
```

`rgb(156,163,175)` is `#9CA3AF` = `SEQUENCE_STROKE`, and `6 4` is
`SEQUENCE_DASH` — so the gesture produced the grey dashed *Runs after* wire,
from a drag that started on a data port, silently. Exactly what he described.

A second variant is worth recording because it is **not** the same bug: released
over the middle of the card's body, xyflow reports no target node at all
(`connectionState.toNode == null`, because it only names a node when a handle is
within `connectionRadius`), and the existing §9 behaviour opens the
"what next?" extend picker. That path was already coherent and is untouched.

### The truth

`handleConnect` classified a connection by its **target handle only**
(`WorkflowEditorCanvas.tsx:4004-4014` before the change): both endpoints on
per-port handles → pin a binding; anything else → fall through and create a
`normal` edge. A data-port source with a node-level target satisfies "anything
else", so it created an execution edge. `isValidConnection` agreed with it —
`if (sourcePort === null || targetPort === null) return true` — so xyflow was
never given a reason to refuse the drop.

`deriveWires` then rendered that edge as a `sequence` wire, since the pair
produced no data wire (`derive-wires.ts:321`), and `projectFlowWires` anchored
it at the node-level handles (`WorkflowEditorCanvas.tsx:1854`,
`targetHandle: null`). Nothing in the chain was broken; the classification at
the top of it was.

It was also **asserted as intended behaviour** by a test named *"port-source
dropped on a node-level target falls through to plain edge creation"* — that
test has been rewritten to the new contract, with the reason in a comment.

### What changed

The gesture's **origin** now decides what it can become. New pure module
`canvas/data-drop-target.ts`:

- `resolveDataDropTarget` (`:74`) reads the target's real input rows through
  `computePortRows` — the dots the card actually mounts, not the catalog — and
  returns one of three verdicts: **exactly one compatible input** → complete as
  the data edge that was drawn; **several** → refuse and name them; **none** →
  refuse, distinguishing *"this step has no data inputs at all"* (every
  control-flow step: it reads its values from variables) from *"it has some and
  none takes this kind"*.
- `dataDropRefusalMessage` (`:115`) words the refusal, and names the gesture
  that would have worked — which is where D9 and D10 meet.

All three consumers ask that one function, so they cannot disagree:
`handleConnect` (`:4016`), `isValidConnection` (`:4166`), and the refusal notice
in `handleConnectEnd` (`:4280`). `handleConnect` also returns outright when the
verdict is not a port, so the invariant — *a data-port drag never becomes an
execution edge* — holds even if something reaches it directly.

Drags that START on the node-level dot are untouched: they are authoring run
order, which is D10's gesture.

### Verified after the change

```
after edges: []
after toasts: ["\"Run for each item\" has no data inputs — it reads its values
 from workflow variables. To make it run after this step, drag between the two
 grey run-order dots instead."]
```

---

## D10 — "Cannot seem to manually connect order-of-operations edges. Is this intentional?"

### The factual answer: neither. The gesture works, and always did.

Two drags in a real browser, both producing the dashed grey wire:

| Direction | Result |
|---|---|
| activity `out` dot → map card's run-order dot | `edge-msu9u3z9-8emw`, `dash 6px,4px`, `stroke rgb(156,163,175)` |
| map `out` dot → activity card's run-order dot (which has per-port input dots 27px below it, so snapping was the suspicion) | `edge-msu9v2uf-db6d`, same |

It is not disabled by design and it is not an oversight in the wiring. Both
handles are plain connectable `<Handle>`s and `handleConnect`'s node-level
branch has always created the edge. So the honest answer to *"is this
intentional?"* is: **the behaviour is intentional, the invisibility was not.**

### Why he could not find it — measured, not guessed

1. **The dot did not say it was a run-order dot.** On a **control-flow card**
   (map, join, childWorkflow, humanGate, pollUntil, switch), hovering it read
   **"No typed inputs" / "No typed outputs"** — a sentence about *data ports*,
   on the connector that carries no data. That came from `NodeHandles` painting
   the node-level dot with `computeHandleStyle`'s wildcard result
   (`WorkflowEditorCanvas.tsx:709` before the change). Measured in the browser:

   ```
   TOOLTIP on control-flow flow-in handle: ["No typed inputs"]
   TOOLTIP on activity flow-in handle:     ["Flow — execution order"]
   ```

   Two different explanations of the same dot, and one of them describes a
   different concept entirely.
2. **Neither sentence mentioned that it could be dragged.** "Flow — execution
   order" names the thing; it does not tell you it is an affordance.
3. **Hovering the `out` dot opens a 300×404px picker on top of the canvas.**
   The hover-extend popover fires after 200ms (`use-hover-extend.ts:4`) and is
   anchored at the handle, so it covers the space you would drag across —
   measured at `x:901 y:456 w:300 h:404` while the drag target sat at
   `x:1073 y:600`, i.e. underneath it. The press still lands on the handle and
   the drag still works, but what the UI *says* when you approach that dot is
   "pick a step to add", not "drag me".

### What changed

Nothing was enabled, because nothing was disabled. The dot now explains itself,
in one sentence, on every card, using the legend's own vocabulary
(`canvas/flow-handle.ts`):

- in: *"Runs after — drop a wire here to make this step run after another. Order only, no data."*
- out: *"Runs after — drag from here to another step's matching dot to make it run after this one. Order only, no data."*

Confirmed in the browser on both a control-flow card and an activity card after
the change; both now return the identical strings.

---

## D28 — "Why do some nodes connect with run-order connections, but others don't? These connectors appear at different heights. Is there meaning behind the difference in size of the Poll status connector?"

### (a) Why only some pairs are joined by a run-order line

Because a run-order line is drawn **only where order is the only thing between
two steps**. `deriveStructuralWires` (`derive-wires.ts:294-326`) emits a
`sequence` wire for a `normal` edge only when the pair produced no data wire; if
data does flow, the edge id is stamped onto the data wire instead and no second
line is drawn. So on his screenshot the dashed grey lines are the pairs that
pass control but no values (`Check OCR Confidence → Needs review?`,
`Human review → Store results`), and the coloured lines are pairs that pass
both — the colour is the kind of data, and the order is implied by it.

Two consequences worth stating plainly, because they look like exceptions:

- A **source card** has no incoming run-order dot at all
  (`sources/SourceNodeRenderer.tsx:12` — *"No `Handle type="target"` on the
  left"*). Nothing can run before the start.
- Every other card has both dots whether or not a wire is attached.

This one is an explanation, not a defect: no code changed for (a). The place it
belongs is the legend, which is another agent's file — see the handover below.

### (b) The different heights — an accident, now removed

Measured in the browser, before, on the seeded **Standard OCR Workflow** (his
screenshot's own graph). `dy` is the dot's centre below the card's top edge, at
the canvas's fitted zoom:

```
prepareFileData (activity) dy=3  bg=rgb(96, 94, 92)     <- solid grey
storeResults    (activity) dy=3  bg=rgb(96, 94, 92)
pollOcrResults  (pollUntil) dy=9  bg=rgb(255, 255, 255) <- hollow, and lower
humanReview     (humanGate) dy=4  bg=rgb(255, 255, 255)
reviewSwitch    (switch)    dy=13 bg=rgb(255, 255, 255)
```

Two independent causes, both accidents of which renderer a card goes through:

- **Position.** `ActivityNodeRenderer` pinned its pair at `top: 18`
  (`WorkflowEditorCanvas.tsx:974,984` before the change) while `NodeHandles` —
  used by every control-flow card *and* by pollUntil — passed no `top` at all,
  so xyflow's default `50%` applied. The height therefore varied with the card's
  own height, which is why his Poll OCR Results dot sits noticeably lower than
  Extract OCR Results' beside it.
- **Fill.** The activity pair was painted `handleBackground("gray")`, which is
  `portDotColor("gray")` = `#605E5C` — **the wildcard DATA port colour**. The
  control-flow pair went through `portShapeStyle`, whose `gray` family is the
  *hollow* silhouette, so it came out white with a grey ring. Whichever one you
  looked at, it resembled a data port.

Fixed by giving the pair one definition (`canvas/flow-handle.ts`): one anchor
(`FLOW_HANDLE_TOP = 18`, `:43`), one fill (`FLOW_HANDLE_COLOR = SEQUENCE_STROKE`,
`:50` — the dashed wire's own grey, imported rather than re-picked, and a grey
no port family uses), one pair of sentences. Measured after:

```
submitOcr, storeResults, extractResults, postOcrCleanup, checkConfidence,
prepareFileData, updateApimRequestId (activity)  dy=3  bg=rgb(156, 163, 175)
pollOcrResults (pollUntil)                       dy=3  bg=rgb(156, 163, 175)
humanReview    (humanGate)                       dy=3  bg=rgb(156, 163, 175)
reviewSwitch   (switch)                          dy=13 bg=rgb(156, 163, 175)
```

The switch is the one remaining difference and it is **forced by geometry, not
chosen**: the card is a rotated square, and its left and right vertices are at
its vertical midpoint, so an 18px offset would float the dots off the shape.
That is the only value of `flowAnchor="middle"` in the file
(`WorkflowEditorCanvas.tsx:1490`), and the reason is written where it is set.

### (c) The size of the Poll status connector — real meaning, no words

**Yes, it means something.** A port dot is drawn at `UNCONNECTED_HANDLE_SIZE`
(16px) rather than `BASE_HANDLE_SIZE` (12px), and carries a `+`, exactly when
`invitesConnection` holds — the port is `required` and nothing is attached
(`PortRows.tsx:208,243-244`). Measured on his own node before any change:

```
pollOcrResults  out-ocrResponse  12x12  invites=false
pollOcrResults  out-status       16x16  invites=true    <- "Poll status"
checkConfidence out-averageConfidence 16x16 invites=true
```

So his instinct was right and the app was at fault for a different reason: the
meaning was carried by 4px and a glyph that reads as a smudge at working zoom,
and **hovering the dot said nothing at all** (deliberately — the dot's hover is
already spoken for by the extend picker, which is why `PortRows` scopes the
tooltip to the label instead).

Fixed by putting it in words on the row's own tooltip (`PortRows.tsx:120-150`):

> `status: Artifact — running | succeeded | failed. Nothing reads this yet — the larger dot with a + is where to drag one from.`

Inputs get the mirrored sentence ("Nothing is connected here yet — …where to
drop a wire"). Optional ports say nothing extra, exactly as they draw no glyph.
Read back from a live browser on `document.split`'s Segments output:

```
ROW TOOLTIP out-segments: ["segments: DocumentSegment[] — List of produced
 segments — each with segmentIndex, pageRange, blobKey, and pageCount. Nothing
 reads this yet — the larger dot with a + is where to drag one from."]
```

(The first draft of that string ended `pageCount.. Nothing`, because catalog
descriptions already end in a full stop. Handled, and pinned by a test.)

---

## Files

| File | Change |
|---|---|
| `canvas/flow-handle.ts` | **new** — the run-order dot's one geometry, fill and copy, with the three drifts recorded in the docstring |
| `canvas/data-drop-target.ts` | **new** — where a data-port drag may land, and the wording when it may not |
| `canvas/WorkflowEditorCanvas.tsx` | both renderers use the shared run-order pair; `flowAnchor` prop on `NodeHandles`; origin-aware `handleConnect` / `isValidConnection` / `handleConnectEnd` |
| `canvas/PortRows.tsx` | the row tooltip explains the enlarged dot |
| `canvas/flow-handle.test.ts` | **new**, 8 tests |
| `canvas/data-drop-target.test.ts` | **new**, 8 tests |
| `canvas/WorkflowEditorCanvas.run-order.test.tsx` | **new**, 12 tests across D9/D10/D28 |
| `canvas/PortRows.test.tsx` | +5 tests for the invitation copy; the Tooltip mock now stamps its label |
| `canvas/WorkflowEditorCanvas.test.tsx` | 2 tests rewritten — both asserted the D9 behaviour as correct |
| `docs-md/workflows/TYPED_IO_DESIGN.md` | §4 note: the single-port colouring rule governs the per-port row dots; the node-level pair is the run-order connector and is not kind-coloured |

### Test output

```
$ npx vitest run src/features/workflow-builder
 Test Files  156 passed (156)
      Tests  2307 passed (2307)

$ npx tsc --noEmit -p tsconfig.json      # clean
$ npx @biomejs/biome check src/features/workflow-builder/canvas/
Checked 74 files. No fixes applied.
```

Browser verification used a scratch workflow created through the API and
deleted afterwards; nothing was left in the dev database, and no seeded demo
was modified.

---

## Handed over, not done here

1. **The legend should carry D28(a)'s answer** (another agent owns
   `CanvasLegend.tsx`). Its current line is *"Runs after — order only, no
   data"*. What is missing is the corollary Dylan actually asked about: **a
   run-order line is drawn only between steps that pass no data; where data
   flows, the coloured wire carries the order too.** One clause would have
   answered his first question without anyone opening the code.
2. **`computeHandleStyle` / `HandleStyle` in `canvas/handle-style.ts` now have
   no production caller.** They were the node-level dot's kind colouring, which
   this pass removed; the rule they implement lives on for the per-port dots via
   `colorForKind` in `PortRows`. They are still covered by 23 tests in
   `handle-style.test.ts` and still described by `TYPED_IO_DESIGN.md` §4, so
   deleting them is a decision about a documented design surface rather than a
   cleanup — flagged rather than taken.
