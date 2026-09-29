# Workflow designer — UX review, batch four (2026-08-06)

Every actionable item from the reviewer's second UX walkthrough of the visual
workflow builder, recorded in
`!Justin/SDPR workshop/2026-08-06 inderdeep workflow ui feedback transcript.txt`
(59 minutes, screen-shared, working from the manual test plan).

He reached the end of the test plan this time. He skipped only the parts that
are `curl`/infrastructure work (14.1–14.6, 14.11–14.13) — see item 33.

Every file path below was checked against the current branch
(`feature/visual-workflow-builder`, head `082ea439`) before being written down.
Where the transcript's diagnosis and the code disagree, the item says so.

---

## Canvas — ports, handles and node affordances

### 1. [x] Ctrl/Cmd+Z does nothing for side-panel changes
**Done 2026-08-08 (batch 5, `f9077fd0`)** — diagnosis held, verified in the
shipped Mantine 8.3.9 source. The guard now stands down only for genuinely
text-editable targets (text-like `<input>` types, `<textarea>`, contenteditable,
and only when not `readOnly`); radio, checkbox, and the date/time family fall
through to the graph undo. Also fixed unreported: a non-searchable Mantine
`Select` is a `readOnly` text input and would still have swallowed undo, and the
old `SELECT` branch suppressed the hotkey for a control with no text undo.
**Area:** Frontend — workflow-builder undo/redo
**Problem:** The reviewer set **Error handling → Follow the error path** in the
settings drawer, pressed Cmd+Z to back it out, and nothing happened; the
top-bar Undo button did work. *"I'm pressing Command Z, nothing is happening,
but if I do this [click Undo] …"* Alex guessed Ctrl+Z was canvas-scoped. It
isn't — the listener is on `window`. The likely real cause is the guard:
`isTextEntryTarget` bails on any `INPUT` element, and Mantine's
`SegmentedControl` (which renders the three error-handling options) is built on
hidden `<input type="radio">`. After a click that radio holds focus, so the
keydown target is an `INPUT`, the hotkey bails, and undo is silently dropped.
The same swallow will hit every Checkbox, Switch, Radio and Select in the
drawer.
**Expected:** Ctrl/Cmd+Z undoes any workflow change, wherever it was made.
Narrow the guard to targets where the browser's *own* text undo is meaningful —
text/textarea/contenteditable — instead of every `INPUT` tag. Non-text form
controls should fall through to the graph undo.
**Key file:** `apps/frontend/src/features/workflow-builder/use-undo-redo-hotkeys.ts`
— `isTextEntryTarget`, the `tag === "INPUT"` branch.

### 2. [x] Undo granularity differs between the title field and drawer fields
**Closed no-change 2026-08-08 (batch 5).** Neither field rebuilds its value per
keystroke — the title keeps a local draft and commits on Enter/blur, and the
drawer's description round-trips losslessly through a synchronous `useState`, so
React writes nothing back to the DOM in either case. The word-vs-character
difference is `<input>` vs `<textarea>` in React itself: `updateTextarea`
assigns `element.defaultValue` on every keystroke, and on a textarea that
property *is* the element's child text, so each keystroke mutates the children
and ends the browser's typing transaction. `updateInput` writes only the `value`
attribute, which the editing host ignores. No application-code cause. Making the
two match would mean rendering the description uncontrolled, a behaviour change
this item did not ask for.
**Area:** Frontend — workflow-builder text inputs
**Problem:** *"On the name field, that's by word. And the side panel is by
character."* Both are browser-native undo, so a difference means one of the two
is rebuilding its value on every keystroke and destroying the native undo stack
(a controlled input that re-sets `value` from state on each change does exactly
this).
**Expected:** Both behave the same. Confirm which field breaks the native stack
and make the two consistent. If the difference turns out to be pure browser
behaviour with no code cause, close this as no-change and record why — do not
leave it open.
**Key file:** `apps/frontend/src/features/workflow-builder/WorkflowTitleField.tsx`
and `apps/frontend/src/features/workflow-builder/settings/` field widgets.

### 3. [x] Unconnected ports render as a bare circle — make them a `+`
**Area:** Frontend — workflow-builder canvas handles
**Problem:** *"Maybe consider adding a small plus sign here … they might not be
able to discover it by themselves that there is something here if they hover."*
An empty circle carries no invitation, so the hover-to-extend popover — the
main way to build a graph — is undiscoverable to anyone handed the tool cold.
**Expected:** Unconnected, non-optional input and output handles render a `+`
glyph rather than a plain circle, so it reads as "click/hover to add
something". Connected and optional handles keep their current treatment.
**Key file:** `apps/frontend/src/features/workflow-builder/canvas/handle-style.ts`,
`canvas/PortRows.tsx`; the popover it should advertise is `canvas/HoverExtendPopover.tsx`.

---

## Error handling — configuration and error state

### 4. [x] Error-handling options don't read as a choice set, and the third is clipped
**Area:** Frontend — workflow-builder settings drawer
**Problem:** The three options (Stop the workflow / Follow the error path /
Skip this step and continue) are a `SegmentedControl`. Alex, looking at it
live: *"it's not obvious to me that those are like the three options … I feel
like they should be radio buttons or something"*, and *"the third option also
doesn't fit on the screen"* — three full sentences do not fit one segmented row
in a drawer-width column.
**Expected:** Present the three as a labelled radio group (one per line, full
label visible) so it reads as a decision, not a toolbar. No option is truncated
at drawer width.
**Key file:** `apps/frontend/src/features/workflow-builder/settings/ErrorPolicySection.tsx`
— `SegmentedControl` at ~L189, options at L83–85.

### 5. [x] The error-path handle is an unexplained red dot with no popover
**Area:** Frontend — workflow-builder canvas
**Problem:** Choosing *Follow the error path* adds a second source handle
(`id="error"`) at the bottom of the node. *"I don't even know first what the red
dot is … and then like even if I notice it, then it doesn't do anything."*
Hovering it does not open the node selector, unlike every other handle he had
been trained by, and there is no tooltip.
**Expected:** The error handle gets (a) a tooltip naming it — "Error path: runs
when this step fails" — and (b) the same hover-extend popover as other output
handles. Alex's framing: the popover should say *what* you are selecting for,
so picking an error-path target is visibly a different act from normal wiring.
**Key file:** `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
— the `id="error"` handles at ~L651 and ~L855; popover at `canvas/HoverExtendPopover.tsx`.

### 6. [x] Status badges are illegible — the ring eats the glyph
**Done 2026-08-07 (batch 1)** — bare `IconCheck`/`IconX`, glyph 12→15px, disc
16→20px, stroke 2.6. Shown in [ILLUSTRATED.md §1](ILLUSTRATED.md). Regression
test added: `succeeded`/`failed` must never render a circle-wrapped icon.
**Area:** Frontend — workflow-builder run status
**Problem:** *"To notice the cross within the circle is very hard … the more I
zoom out, all I see is the circle, which is not the intent."* Same complaint for
the green success mark: *"the checkbox is very, very small."* The badge uses
`IconCircleCheck` / `IconCircleX`, so a large share of the pixel budget is spent
on a ring that carries no meaning while the glyph that does is reduced to a
smudge.
**Expected:** Drop the enclosing circle and render a bare check / bare cross at
a larger glyph size, so the shape survives at the zoom levels people actually
work at. Applies to `succeeded` and `failed` at minimum.
**Key file:** `apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.tsx`
— `STATUS_STYLES`.

### 7. [x] Failure should be visible at the node's title, not only in the corner
**Area:** Frontend — workflow-builder canvas node renderer
**Problem:** *"If it's an error, maybe it's better to mention it alongside the
node name or the title, because you will probably start reading from here and
then you know which step is an error — rather than at the top right of it."*
Reading order is title-first; the failure marker is in the last place the eye
goes.
**Expected:** A failed node shows an error chip beside its title (e.g. a red
"Error" chip), in addition to whatever corner badge survives item 6.
**Key file:** `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`
— the activity node renderer header.

---

## Try / Run and the in-canvas preview

### 8. [x] "Try" and "Run this workflow" are indistinguishable
**Done 2026-08-08 — Option A, per Alex's ruling of the same day.** See
[DECISIONS/08-try-vs-run.md](DECISIONS/08-try-vs-run.md) for the full trace. The
finding held: both buttons opened the **same** `RunWorkflowDrawer`, differing
only in which existing tab was pre-selected, and the one real difference — a
server-side `RunTrigger` stamp of `"try"` vs `"api"` that makes a try
**disposable**, since every run start cancels in-flight runs stamped `"try"` —
was stated nowhere in the UI. The top bar now carries **one** `Run…` button;
the tabs read **"Try on canvas"** and **"Call from outside"** instead of "Try"
and "Run", naming *where the answer appears* rather than a strength of
commitment that does not exist (both are real Temporal executions on the saved
version and both land in run history); the Try tab states in place that *"A try
is disposable — starting another run cancels a try that is still going."*; and
the second tab's run box is headed **"Start a run"**, not "Test run" — a run
begun there is stamped `"api"` and nothing later sweeps it up, so the old
heading read backwards. **Which tab opens is derived from the workflow, not
from a click:** "Try on canvas" when there is a non-upload input path (a
`source.api` node, an `isInput`-flagged ctx key, or no `source.upload` at all),
"Call from outside" when a file upload is the sole way in — the same input
analysis that used to decide whether the separate Try button was *shown*
(`runDrawerOpenMode`, was `tryButtonVisible`). **No backend change:** the
trigger stamp, both endpoints and the cancel rule are untouched.
**One deliberate departure from the brief**, flagged for a ruling: the surviving
button is **shown for every workflow**, where the old Try button was hidden for
upload-only ones. Porting that hide would have left an upload-driven workflow
with *no* top-bar path to the Run drawer at all — the drawer's upload dropzone
and e2e 13.6 both reach it only through this button — so the "no canvas try for
upload-only workflows" rule is kept where it actually lives: the drawer already
suppresses the tabs entirely for those and shows the dropzone instead.
**Area:** Frontend — workflow-builder top bar
**Problem:** *"Two options pretty much doing the same thing. And even if I
choose one, I still have the option to go to the other."* Nothing in the UI
states the difference. Alex: *"at some point I asked what's the difference
between run and try and it gave me some sensible answer, but now I don't
remember what it was."* If the author can't recall it, no user will infer it.
**Expected:** Decide the distinction, then make the UI carry it. Alex's
proposal in the call: one button that opens a surface with two tabs, each
labelled with what that mode is for. Failing that, at minimum the two buttons
must state their difference in place (tooltip/subtitle) and stop offering each
other as an equivalent alternative.
**Key file:** `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`
— top-bar actions ~L1784 (Try) and ~L1804 (Run this workflow);
`features/workflow-builder/run/RunWorkflowDrawer.tsx`.

### 9. [x] Pressing Try resizes nodes, which then overlap
**Done 2026-08-08 (`b6877863`, `033664cf`) — Option C, as ruled.** See
[DECISIONS/09-try-reflow.md](DECISIONS/09-try-reflow.md) for the ruling and
[ILLUSTRATED.md §18](ILLUSTRATED.md) for the before/after. Mechanism measured:
`estimateNodeHeight` made no allowance for the preview, dagre separates ranks by
60px, and the pane was capped at 200px — so a card grew up to 200px into a 60px
gap, twice (skeleton, then content). Every card that can produce output now
carries a fixed-height one-line result strip at all times, including at rest
("Not run yet"); the full preview opens in a popover behind it off the same
shared query. Control-flow nodes draw no strip — zero height is as constant as
30px is. The height constants were re-measured in Chromium rather than adjusted.

**Verified in a browser**, because jsdom runs no layout: every card's
`offsetHeight` and `offsetWidth` on `standard-ocr`, sampled before a Try, 24
times during, and after — **0px drift in both axes on all 15 nodes**. The
capture script's overlap hunt now runs as an assertion and fails loudly if two
cards ever overlap again.

**Two defects found while fixing it, both fixed here.** `evicted` was reachable
during a live run, so a node that had just gone green reported "cached output
has expired · Re-run" — blaming a TTL that had not expired and offering a
Re-run that would have cancelled the run producing the output (this is how item
10 was reproduced on a first, non-replay Try). And the strip itself widened the
card: 200px → 606px when a long value landed, an axis auto-layout never checks.
**Area:** Frontend — workflow-builder canvas / preview
**Problem:** Alex, watching the shared screen: *"when you hit try, it also
resized the boxes and they started to overlap in a strange way … it's kind of
jarring."* Preview content mounts inside the node card, so every card changes
size mid-run and the persisted layout no longer fits.
**Expected:** Running must not reflow the graph. Either reserve the preview's
space in the node's resting layout, or let the card grow downward only so
horizontal neighbours are never displaced. No node overlaps another as a result
of pressing Try.
**Key file:** `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx`,
`canvas/WorkflowEditorCanvas.tsx` node sizing, `canvas/auto-layout.ts` for the
size constants layout uses.

### 10. [x] A node can show a green success check and a red failure message at once
**Done 2026-08-08 (batch 7, `38e472f7`)** — the distinction went into the panel,
not the badge. The badge was already correct: the step really did succeed.
`CacheEvictedAlert` is only ever reached for `succeeded`/`skipped`, so its
resting state can never legitimately be an error; it now presents neutral grey
at idle, red only when a re-run itself fails, and yellow for retention-cleaned
(a dead end, not a step failure). Copy leads with the verdict: *"This step
completed. Preview unavailable — its output isn't in the preview cache."*
**Area:** Frontend — workflow-builder preview
**Problem:** *"It got a little green checkbox. So it's like both green and red
at the same time."* — a node reporting `succeeded` while its preview pane says
*Preview unavailable — cache evicted*. Two contradictory verdicts on one card;
the reviewer read the whole node as broken.
**Reproduced live 2026-08-07** while shooting the batch-1 screenshots — see the
second image in [ILLUSTRATED.md §1](ILLUSTRATED.md), where the API Endpoint node
carries a green check and a red *"Preview unavailable — cache evicted"* panel in
the same frame. No hunting required; it happens on the workflow-as-API demo's
first Try.
**Expected:** A step that succeeded but whose preview is no longer cached is not
an error. Distinguish "the step failed" from "we no longer hold the preview
payload" visually, so the badge and the panel never contradict.
**Key file:** `apps/frontend/src/features/workflow-builder/preview/CacheEvictedAlert.tsx`,
`preview/useActivityOutputPreview.ts`, `run/NodeStatusBadge.tsx`.

### 11. [x] Failure messages are dimmed, unexplained, and offer no action
**Done 2026-08-08 (batch 7, `38e472f7`)** — `NoOutputNotice` routes
`reason === "failed"` to a red alert carrying the engine's own
`NodeRunStatus.errorMessage` (the field already feeding the badge tooltip) plus
a **Re-run workflow** button. Absent detail says so rather than fabricating a
cause; in the wire-peek popover, which renders from an edge, the reason line is
omitted rather than guessed. Non-`failed` reasons keep the grey treatment on
purpose — "the run took a different branch" is a fact, not a fault.
**Note the framing here was wrong:** "bring one surface up to the other" is not
what happened. Items 10 and 11 pull in opposite directions, so the treatments
**swapped** — `NoOutputNotice` took the red, `CacheEvictedAlert` gave it up.
**Area:** Frontend — workflow-builder preview / node error surface
**Problem:** *"This error message is grayed out, should be similar [to the other
error treatment] … with a red background. And if it failed, there is an action
that the user can take. Explanation, yes, but then there is an action … here
there's nothing. What do I do with this if it failed? What next?"* Alex adds the
missing half: *"why did it fail?"*
**Narrowed 2026-08-07 — it is `NoOutputNotice`, not `CacheEvictedAlert`.**
Looking at both surfaces in a live run: `CacheEvictedAlert` already has the
treatment the reviewer is asking for — pink error background, red icon, and a
**Re-run** button. The one that matches his description exactly is the grey,
action-free *"This step failed — no output was produced to preview."*
(`NoOutputNotice`), visible in the first image of
[ILLUSTRATED.md §1](ILLUSTRATED.md). So the work is smaller than written: bring
one surface up to the other, rather than redesign both.
**Expected:** One error treatment used consistently across the node's error
surfaces: red styling (not dimmed), a plain statement of *why* it failed, and at
least one call to action — Retry, or Edit inputs. Alex's read of the whole
surface: *"this whole feature needs to be fleshed out more."* Treat this as a
design pass over the run-result state, not a colour swap: open a workflow, press
Try, and iterate until the rendered result reads correctly.
**Key file:** `apps/frontend/src/features/workflow-builder/preview/NoOutputNotice.tsx`
(the offender), with `preview/CacheEvictedAlert.tsx` as the pattern to match;
`run/NodeStatusBadge.tsx` (`errorMessage` tooltip).

---

## Run history and replay

### 12. [x] Reported: an error message in the run-history flow can't be dismissed
**Closed not-reproduced 2026-08-08 (batch 7), after a genuine attempt.** Opened
run history (54 rows), entered replay on the newest run, pressed Try from that
state, drove it to failure, then enumerated every `.mantine-Alert-root` and
`.mantine-Notification-root` on the page: only the two node preview panels, both
carrying actions, no undismissable surface. Separately forcing the run-list
endpoint to 500 *does* produce a non-dismissable "Failed to load runs" alert —
but it appears before a run is selected, clears itself on the next successful
fetch, and sits inside a Drawer with its own close, so it is not the reported
surface. No close affordance was added speculatively.
**Area:** Frontend — workflow-builder run history
**Problem:** From the reviewer's written notes: run history → run → *"no way to
cancel the error message"*, i.e. no way to dismiss it. He could not reproduce it
live and Alex agreed to shelve it: *"we'll shelve it and see if it could be
reproduced."*
**Expected:** Reproduce first. Select a past run from run history, start a run
from that state, and drive it to failure; if an undismissable error surface
appears, give it a close affordance. If it cannot be reproduced after a genuine
attempt, close the item with that stated.
**Key file:** `apps/frontend/src/features/workflow-builder/run-history/RunHistoryDrawer.tsx`,
`run/RunWorkflowDrawer.tsx`.

### 13. [x] The "Replay mode" chip is parked beside Undo and reads as a stray tag
**Done 2026-08-08 — Option A, the banner, per Alex's ruling on
[DECISIONS/13-replay-mode.md](DECISIONS/13-replay-mode.md).** `Badge`
`TopBarReplayIndicator` is gone; `ReplayModeBanner` renders a full-width strip
between the top bar and the canvas, only while `isReplay`. Each of the three
states is now a headline plus a sentence instead of a squeezed label: **"Replay
mode — you are looking at v2, the graph this run used"**, **"…version unknown,
so this is the graph the run recorded"**, and the loud one, **"…v2 could not be
loaded, so this is the current graph"** followed by *the workflow as it stands
today, which may differ from what actually ran*. All three say the canvas is
read-only and that **edits, Undo and Redo do nothing until you leave replay** —
the thing that was previously unexplained anywhere, since the three
`if (isReplay) return;` guards drop work silently. Those guards are unchanged;
the transient "your edit was discarded" note floated in the decision doc was
**not** built — it is still an open question to Alex.
`replay-mode-indicator` and `replay-mode-clear` testids are kept (the clear
button now reads **Leave replay**), and `data-version-number` survives with a
new `data-version-unavailable` beside it. Layout: the banner is a `flexShrink:
0` sibling of the top bar, so its height comes out of the canvas and the bar's
own horizontal budget is *reduced* rather than spent — removing the chip gives
`topbar-group-state` its width back, so item 14's overflow fix is not at risk.
Tests: `WorkflowEditorV2Page.test.tsx` gains a placement pin (the banner is not
inside `topbar-zone-right`, and absent entirely outside replay) and a
`versionNumber: 0` case proving it says "unknown" rather than printing a v0
that does not exist; 122 pass in that file, 2116 across
`src/features/workflow-builder`. jsdom runs no layout, so the banner's real
height and the canvas not jolting are browser-only — logged as MANUAL_TEST_PLAN
**9.9d**, unticked.
**Area:** Frontend — workflow-builder top bar
**Problem:** Clicking a run-history row puts the editor into read-only replay
mode, announced by a chip next to the Undo button. Alex, seeing it: *"there's
like a weird tag there … it makes sense for it to be an indicator somewhere, but
perhaps not there and not like that."*
**Expected:** Replay mode is a *mode*, so it should read as one — a banner or
top-bar state region that clearly says the canvas is read-only and how to leave
it, not a chip lost among the action buttons.
**Key file:** `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`
— replay indicator ~L2178–2232.

---

## Workflow editor top bar and switcher

### 14. [x] Title first; retire the Switch button for a chevron on the title
**Done 2026-08-08** — the left zone is now `[ name ⌄ · counts ]`: the title
leads, and `WorkflowSwitcher` renders a chevron `ActionIcon` in its own tight
group beside it. The labelled Switch button is gone; the
`workflow-switcher-button` testid is kept because e2e reaches for it by id.
Items 15/16/17 are untouched and still pass.

**It also fixed the top bar's sub-1600px overflow** (the defect the capture
script's header documents). Measured in Chromium at 1920 → 1024 before and
after. Before: from **1512px** down the centre zone's controls spilled out of
their box and Undo/Redo landed on top of the Simplified switch; at 1280px the
bar itself overflowed by 15px. Cause was three flex rules — left zone
`flexShrink: 0` (never yielded), centre zone `minWidth: 0` (a nowrap flex
container allowed to shrink below its own content spills its children), right
zone with no shrink rule at all. Now: right `flexShrink: 0`, centre floored at
`min-content`, left absorbs the pressure with a truncating title and counts,
and `NodeSearchBox` gives up 30px of its floor so the name keeps more of it.
**No overlap and no overflow from 1920px down to 1280px**; the first overlap is
now at 1024px, where the left zone is fully collapsed. Nothing is hidden and
nothing is duplicated into a menu — the controls just get narrower.

**Area:** Frontend — workflow-builder top bar
**Problem:** *"The title, where I am, probably should be the first thing.
Switch probably should be somewhere else. I don't think it should be a
button."* His model — demonstrated live in Figma — is the Google Sheets /
Microsoft 365 pattern: the document name is the leftmost thing, you click it to
rename (which already works), and a chevron beside it opens the list of other
documents. *"In that case we will also save this real estate, so it will look
less messy."*
**Expected:** Top bar left zone becomes: **workflow name (click-to-edit) +
chevron**, with the chevron opening the switcher. The standalone **Switch**
button goes away.
**Key file:** `apps/frontend/src/features/workflow-builder/WorkflowSwitcher.tsx`,
`WorkflowTitleField.tsx`, `WorkflowEditorV2Page.tsx` (top-bar zones ~L1598).

### 15. [x] In the switcher, the current workflow is dimmed — it should be the highlighted one
**Done 2026-08-08 (batch 2, `b53d9510`)** — current row takes the highlight, the
weight and a check mark; others drop to regular. State moved to
`aria-current`/`data-current` so it reads as current rather than disabled. The
`{slug} · v{version}` subline is gone.
**Area:** Frontend — workflow-builder switcher
**Problem:** *"The current workflow is kind of grayed out … all the others are
highlighted with a bold, and the one that I am on is actually disabled — its
hierarchy is lower than the inactive ones, which should be the reverse."* The
code disables the current row (`disabled={isCurrent}`) and appends the literal
text `(current)`, while every other row is `fw={600}`.
**Expected:** The current workflow is the visually dominant row — highlighted
background and/or a trailing check mark. Other rows lose the bold and use a
regular weight. Also drop the `{slug} · v{version}` secondary line: *"do we
need that here? No."*
**Key file:** `apps/frontend/src/features/workflow-builder/WorkflowSwitcher.tsx`
— L141–158.

### 16. [x] The switcher hides most workflows behind "+13 more — refine the search"
**Done 2026-08-08 (batch 2, `b53d9510`)** — cap and dead "+N more" line removed;
scroll-area max height 260 → 320 and the list scrolls.
**Area:** Frontend — workflow-builder switcher
**Problem:** `MAX_RESULTS = 12`, and anything beyond that becomes the dimmed
line *"+N more — refine the search."* the reviewer could not find the Standard OCR
workflow he had just been working in: *"it says 13 more — it feels like if I
click it, it will show me more. That doesn't happen. And then it says refine the
search, but there is no filter or something that I can clear and see all."*
Alex: *"just show all of them, there's not going to be hundreds of thousands of
workflows."*
**Expected:** The list shows every match, scrolling as needed (the dropdown
already uses `ScrollArea.Autosize`). Remove the cap and the dead "+N more"
line.
**Key file:** `apps/frontend/src/features/workflow-builder/WorkflowSwitcher.tsx`
— `MAX_RESULTS` L33, `shown` L55, the "+N more" text L165–171.

### 17. [x] The switcher popover doesn't close on an outside click
**Done 2026-08-08 (batch 2, `b53d9510`) — and this item's diagnosis was wrong.**
`closeOnClickOutside` already defaults to `true`. The real cause is React Flow's
pane: d3-zoom's mousedown handler calls `stopImmediatePropagation`, and Mantine's
`useClickOutside` listens for `mousedown`/`touchstart` only, so the event never
reached the document. Adding `click` to `clickOutsideEvents` fixes it. Esc was
broken separately — Mantine handles it via `onKeyDownCapture` on the dropdown,
which needs focus inside, so `trapFocus` is what makes it work. jsdom has no
d3-zoom, so the test guards the prop but cannot reproduce the bug; confirmed by
source reading and on the browser pass.
**Area:** Frontend — workflow-builder switcher
**Problem:** *"Once I click, if I click outside, this probably should disappear.
I still need to click Switch again to make it disappear."*
**Expected:** Clicking anywhere outside the dropdown dismisses it (Mantine
`Popover` `closeOnClickOutside`), as well as Esc.
**Key file:** `apps/frontend/src/features/workflow-builder/WorkflowSwitcher.tsx`
— the `Popover` props.

---

## Workflows list

### 18. [x] The workflows table overflows: delete column truncated, horizontal scroll at full width
**Area:** Frontend — `WorkflowListPage`
**Problem:** *"The delete icon is outside of this row and it's truncated …
there's no horizontal view, I'm at full view, I'm not zoomed in or zoomed out."*
Zooming out brings it back. He checked both screenshot passes in the review doc
and the second pass is cut off too — Alex: *"so that workflows table is still
messed up and there's a horizontal scroll bar and columns are still not
optimally spaced out."*
**Expected:** At a normal desktop width the table fits with no horizontal
scrollbar and the actions column is fully inside the row. Note commit
`2e55d262` ("Name is the focus column, and the widths actually bind") already
touched these percentage widths — **re-test in a browser first** and record
whether this is still live before changing anything.
**Key file:** `apps/frontend/src/pages/WorkflowListPage.tsx` — the `DataTable`
column widths at L271–279 (they sum to 100%, leaving the 4% actions column no
room for the icon's padding).

---

## Grouping

### 19. [x] You can't right-click the group itself to ungroup it
**Area:** Frontend — workflow-builder groups
**Problem:** *"I was trying to ungroup it … I'm just right clicking [the group].
Nothing is happening. And then I realized, oh, I need to be on a particular
node."* Right-clicking a member is also misleading, because the action it offers
ungroups the whole group, not that node: *"it removes everything."* His
conclusion: *"if the whole group gets ungrouped, it probably makes sense to have
the right click on the group as well."* (He also raised, and left open, whether
per-node removal from a group is wanted at all — see the note below.)
**Expected:** Right-clicking the group container or its header offers **Ungroup**
with the same behaviour as the member-node entry.
**Key file:** `apps/frontend/src/features/workflow-builder/canvas/GroupContainerNode.tsx`
(no `onContextMenu` today), `canvas/NodeContextMenu.tsx` (`onUngroup`, L204–210
and L268–271), `canvas/PaneContextMenu.tsx`.

---

## Colour system and the legend

### 20. [x] The port/wire colour vocabulary is too large to hold in your head

**Done 2026-08-09 (Wave H).** Seven port families → five, each carrying a shape
as well as a colour (worst CVD pair ΔE 5.2 → 14.2). Thirteen node accents → five
by role (worst pair ΔE 0 → 12.9). Seven copies of the palette collapsed to one.
The collapse of the seven activity CATEGORY accents into a single slate is the
one judgement Alex has not seen on screen yet.
**Premise settled 2026-08-08; decision artifact awaiting Alex's ruling.** See
[DECISIONS/20-colour-vocabulary.md](DECISIONS/20-colour-vocabulary.md). The
legend renders **exactly 13 rows** (4 wire + 7 family + 2 ring-modifier), so
"12–13" is precisely what was on screen — but they are not 13 colours. The full
vocabulary is **32 rendered hex values carrying ~24 decodable meanings**, plus
37 icon glyphs, and the registry has 32 kinds not the 33 stated below. So the
count was right and the interpretation understated the load. Collisions were
measured, not asserted: under deuteranopia the Untyped grey and References teal
are effectively the same dot (1.02:1 luminance), and activity blue vs
childWorkflow purple are visually identical. Recommended: 4 typed colours plus
grey, with a handle-**shape** carrier so colour is never the only signal.
**Area:** Frontend — workflow-builder canvas colour + legend · **design decision**
**Problem:** *"Do you remember what this color means? … I don't know how many of
these are, 12 to 13 different colors, and then different shapes as well, dotted
lines or solid lines. And I think it's way too much."* The cost he names is
context loss: *"I have to search through all of this — okay, purple is OCR
results — and then I'm losing the context of what I was concentrating on."* Two
distinct asks came out of it:
  - **Reduce the vocabulary.** *"Maybe we could classify into something else,
    like inputs, outputs, processing, decision … it need not be that granular
    that OCR result needs to be purple."* Alex's own constraint reinforces it:
    the kind list *"is going to keep growing."*
  - **Stop relying on colour alone.** *"That will be more accessible as well,
    because now we are only relying on colours, and people who are colourblind
    might not see the exact colour the same way."* His suggestion: an outline
    or a shape difference that says "these two can connect."
  **Check the premise before acting:** the registry defines 33 kinds but already
  collapses them to **7** colours (gray/blue/green/violet/yellow/teal/cyan), and
  the legend shows 7 family rows plus wire styles plus node accents. So "12–13
  colours" is what the legend *reads* as, not what the palette *is* — count the
  full on-screen visual vocabulary (family swatches + edge styles + node-type
  accents) before deciding what to cut.
**Expected:** A decision, then the work. Alex's ruling is needed on whether
compatibility keeps a per-family colour at all, and what the non-chromatic
carrier is (handle shape, outline). Deleting the legend alone was raised and
rejected in the call — the reviewer: *"but then, do we really need the colors
then?"*
**Key file:** `apps/frontend/src/features/workflow-builder/canvas/CanvasLegend.tsx`
(`FAMILY_ROWS`), `canvas/artifact-kind-colour.ts` (`colorForKind`),
`packages/graph-workflow/src/types/artifact-registry.ts` (33 kinds, `color:` fields),
`canvas/handle-style.ts` (where a shape encoding would live).

---

## Agent chat

### 21. [x] The chat icon appears everywhere but only works in the workflow editor
**Done 2026-08-08 (batch 6, `5903a414`)** — both the icon and the drawer are
gated on `/^\/workflows(\/|$)/`, read off the router. Gating both matters, or an
open drawer strands on `/documents`. Not narrowed to the editor alone: the
agent's `createWorkflow` tool navigates from the list into the editor.
**Area:** Frontend — agent chat mounting
**Problem:** *"I just pressed here to come to the main screen and then I saw
chat. I'm like, okay, let's do this … and then nothing is stopping me. Nothing
is telling me that I need to be on that screen."* `AgentChatIcon` is mounted in
`RootLayout`, so it renders on every route. Alex's ruling in the call: *"I think
that idea was that in the future this chat would be able to do other things, but
given our current scope, we should probably put it just in the workflows for
now."*
**Expected:** The chat entry point appears only where the agent can act — the
workflow routes.
**Key file:** `apps/frontend/src/layouts/RootLayout.tsx` — `<AgentChatIcon />`
L232, `<AgentChatDrawer />` L465.

### 22. [x] The agent fails silently — no error, no feedback, nothing
**Done 2026-08-08 (batch 12).** Two silences, not one, and both were real.
(1) `ProviderResolver.resolve` threw a bare `Error`, which Nest can only
render as `{"statusCode":500,"message":"Internal server error"}` — the cause
was destroyed at the boundary. It now throws
`AgentProviderNotConfiguredException` (503) carrying `code`, `provider` and
the environment variable **names** that are missing. (2) Anything that fails
*after* the response headers are sent — a bad key, a missing deployment, a
429 — went through the AI SDK's default masker, which writes the literal
string "An error occurred."; `pipeUIMessageStreamToResponse` now gets an
`onError` that says which HTTP status the provider returned and what it said.
The frontend never rendered either: `useChatRuntime` had no `onError`, so
every rejection was dropped on the floor. It now stores the failure and
renders it as a red alert at the end of the thread (`agent-chat-error`),
clearing when the next turn starts. Never echoes a URL, header or body — only
the provider's own message, truncated to 400 chars.
**Area:** Frontend/Backend — agent chat
**Problem:** *"I ran the prompt. Nothing. Why is it not working?"* and *"No
error message, no feedback."* He hit this on both the editor and
`/workflows/create`, and it is why he could not test Part 15 at all. Likely
cause named in the call: the configured model is Azure GPT-5.4, for which BC Gov
has no API key, so the backend rejects the request — but nothing surfaces.
**Expected:** A failed or unconfigured request renders a visible error in the
conversation, naming the cause (e.g. "Provider 'azure' is not configured").
Silence is never the response.
**Key file:** `apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx` (the
runtime/transport wiring, ~L207–250), and the agent module's error path in
`apps/backend-services`.

### 23. [x] The agent must work with the LLMs BC Gov actually has
**Done 2026-08-08 (engineering half), to Alex's ruling of the same day: one
credential set in the repo-root `.env`, no per-app env files, no new provider
variables, and Anthropic kept in the code and in the docs but not offered
while it has no key.** Four pieces. (1) **A blank variable is not a
credential.** `AgentEnv` read every setting with `?? null`, so
`ANTHROPIC_API_KEY=""` — exactly what the repo-root `.env` holds — counted as
configured; `hasProvider("anthropic")` said yes, the resolver handed the SDK
an empty key, and the user got a mid-stream HTTP 401 instead of item 22's
typed refusal. Every setting is now trimmed and empty-means-absent, which also
stops a blank numeric bound becoming `Number("") === 0`. (2) **`GET
/api/agent/models`** returns `{ items: [{ provider, model, label, isDefault }] }`
— one entry per configured provider, carrying that provider's single
configured model, because `AZURE_OPENAI_DEPLOYMENT` names one deployment and
no multi-deployment variable was invented. (3) **The picker renders that list
and nothing else.** `AGENT_MODEL_OPTIONS` (six hardcoded strings, default
`[0]` = `gpt-5.4`) is gone; the selection is the entry the backend flags
`isDefault`. One entry renders as a static label rather than a dropdown that
cannot change anything; while the list is loading, or if it fails to load, the
composer stays live and the turn omits `provider`/`model` so the backend
applies its own default. (4) Docs: `MANUAL_TEST_PLAN.md` Part 15 env table +
15.2 (re-opened for manual verification), `AI_AGENT_DESIGN.md` §2.2 + §12b,
`PHASE7_HANDOFF.md`. **Still Alex's to find out:** which deployments this
project may call through the AI Services Hub's APIM — one question to Shabari
Kunnumel, per the decision artifact. Re-pointing at the answer is now an env
change with no rebuild.
**Decision artifact written 2026-08-08.** See
[DECISIONS/23-bcgov-models.md](DECISIONS/23-bcgov-models.md). The backend is
**already APIM-aware**, so re-pointing at a BC Gov deployment is a
three-environment-variable config change, not code. The code-shaped blocker is
that the frontend model list is six hardcoded strings and the default is simply
the first array element. The store does not record which deployments this
project can call — that needs one question to one named person.
**Area:** Backend — agent providers
**Problem:** Alex: *"it should also work with models other than 5.4 that is
currently set up for my personal account, and it should instead work with the
BC Gov available LLMs."* Today the picker defaults to Azure GPT-5.4, which
nobody but Alex can call.
**Expected:** Establish which models are available through BC Gov's Azure
OpenAI/APIM, and make the default model one of them so a second person can run
the feature.
**Key file:** `apps/frontend/src/features/agent-chat/` model options
(`AGENT_MODEL_OPTIONS`); provider config documented in
`docs-md/workflows/MANUAL_TEST_PLAN.md` Part 15 env table.

### 24. [x] "Show past conversations" is empty on the seeded demo
**Done 2026-08-08 (batch 12).** Diagnosis held: `ChatConversation` rows are
private to `createdBy`, so a transcript seeded under `SEED_USER_SUB` was
invisible to every other identity — including the API-key identity, which is
why a reload did not help. Fixed by encoding the distinction the review names:
`ChatConversation.isDemo` (migration
`20260808000000_add_chat_conversation_is_demo`), set by the seeder. A demo row
is visible to every member of **its own group** and read-only for everyone —
`POST /api/agent/chat` on one returns 403 `demo-conversation-read-only` rather
than putting one reader's follow-up into everybody else's demo. Per-user
scoping of real conversations is untouched: the visibility filter is
`groupId = caller's group AND (createdBy = caller OR isDemo)`, and delete
stays owner-only. The switcher badges a demo **demo replay** and withholds its
delete control.
**Area:** Frontend/Seed — agent chat history
**Problem:** He opened the seeded agent demo, clicked *Show past conversations*,
and got nothing — twice, including after a reload. Alex expected a seeded
conversation there: *"it should show a past conversation just to demonstrate —
it will show the prompt and the commands that ran … when you want to demo it,
you don't have to run through actual live chat every time."* The test plan
already flags the constraint: the demo *"opens for the seeded user
(`SEED_USER_SUB`); re-seed as your identity if the drawer is empty."*
**Expected:** The seeded chat replay is visible to whoever opens the demo, not
only to the identity that seeded it — or the demo tells you plainly why it is
empty and how to fix it.
**Key file:** `apps/frontend/src/features/agent-chat/ConversationSwitcher.tsx`,
`scripts/seed-feature-demos.mjs` (agent conversation seeding),
`docs-md/workflows/MANUAL_TEST_PLAN.md` Part 15 header.

### 25. [x] Send button: black icon on purple fails contrast and is off-palette
**Done 2026-08-07 (batch 1).** The reviewer's report was accurate and the cause was
app-wide, not chat-specific. Measured in the browser: the enabled send button
rendered `color: rgb(45,45,45)` on `background: rgb(85,149,217)`. A project rule
in `apps/frontend/src/ui/bcds-mantine-fallbacks.css` set
`.mantine-ActionIcon-root { color: var(--icons-color-primary) }` unconditionally,
beating Mantine's `var(--ai-color)` on order and stamping near-black over **every
filled ActionIcon in the app**. Now qualified with `:not([data-variant="filled"])`.
The button also moved from violet to the theme's primary blue, and the
composer's focus ring followed it off a hardcoded `#845ef7`.
**Residual, for the reviewer's ruling — not a defect:** white on the theme's filled
blue `#5595D9` measures **3.14:1**, which clears WCAG 1.4.11's 3:1 floor for
non-text UI but is marginal, and is *lower* than near-black scored on the same
blue (4.37:1). The change is still right because on the violet that was actually
there, near-black scored 2.47:1 (fails) against white's 5.55:1. Darkening the
filled shade to `blue.7` (`#3470B1`) would take white to 5.12:1 — a design-system
decision across every filled action in the app, so it was not made unilaterally
on one button. See [ILLUSTRATED.md §3](ILLUSTRATED.md).
**Key file:** `apps/frontend/src/ui/bcds-mantine-fallbacks.css`,
`apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx`, `agent-chat.css`.

### 26. [x] The stop control is detached from the conversation it stops
**Done 2026-08-08 (batch 6, `5903a414`)** — the composer's send button becomes
the stop button while a turn streams and reverts when it ends; the header abort
is gone. Stopping still does both halves, the client-side stream teardown and
the backend abort call. Batch one's palette fix is intact — both states stay
filled blue, so the button changes its job and its glyph, not its identity.
**Area:** Frontend — agent chat
**Problem:** *"The option is right at the top here, which is outside of the
conversation … generally what happens with other AI agents is this send button
changes to stop when it's working, and once it's done it reverts back to send."*
With more than one conversation open the placement is also ambiguous: *"which
one would this stop? It only says 'about current request', but because it is
placed at the workflow-agent level, it tells me it might just do everything."*
**Expected:** While a turn is streaming, the composer's send button becomes the
stop button and reverts when the turn ends. The header-level abort icon goes
away.
**Key file:** `apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx` —
`agent-chat-abort` at L321–332.

### 27. [x] The stop icon is an outlined square
**Done 2026-08-07 (batch 1)** — `IconPlayerStopFilled`. The button's *placement*
is item 26 and is untouched; the glyph travels with it.
**Area:** Frontend — agent chat
**Problem:** *"This does not say abort or stop … the icon is a square. I don't
know what it represents."* Alex noted a square is used elsewhere for stop;
the reviewer's correction: *"but then that shape probably will be filled and not
outlined."*
**Expected:** A filled stop glyph (or a recognised pause/stop pair), not an
outline.
**Key file:** `apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx` —
`IconPlayerStop` L330.

### 28. [x] "New conversation" uses a refresh icon
**Done 2026-08-07 (batch 1)** — `IconPlus`.
**Area:** Frontend — agent chat
**Problem:** *"This says new conversation, while the icon probably says a
refresh."* Confirmed: `IconRefresh`.
**Expected:** A plus icon.
**Key file:** `apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx` — L339.

### 29. [x] The chat close button is a cross inside a circle, too small to read
**Done 2026-08-07 (batch 1)** — plain `IconX` at 18px.
**Area:** Frontend — agent chat
**Problem:** *"The same issue, the cross is way too small — probably should only
be a cross rather than a cross within the circle."* Confirmed: `IconCircleX`.
Same root cause as item 6.
**Expected:** A plain `IconX` at a legible size.
**Key file:** `apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx` — L349.

### 30. [x] Chat panel layout: model picker belongs at the composer, history at the top
**Done 2026-08-08 (batch 6, `5903a414`)** — model picker moved down beside the
composer; past-conversations became a header button beside new-conversation and
close. **One detail here was wrong:** the switcher was never *in* the header —
it was a separate collapsible strip rendered below it, which is why the fix is a
lifted `open` prop rather than a move of markup.
**Area:** Frontend — agent chat layout
**Problem:** *"The model selector should be at the bottom, because this is where
I'm generally typing, I'll be generally interacting with this, and this is where
I'm more likely as a user to see which model I'm using. And the show past
conversations should be somewhere here [at the top], next to the plus, along
with the close."* Today the model `Select` and the conversation switcher both
sit in the drawer header.
**Expected:** Model picker moves down beside the composer; show/hide past
conversations moves to the header group with new-conversation and close.
**Key file:** `apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx` —
`agent-chat-model-picker` L355–366; `ConversationSwitcher.tsx`.

---

## Demos, docs and the test plan

### 31. [x] The Part 14 demo link 404s — the workflow isn't there
**Done 2026-08-08 (batch 4, `37e0253b`)** — the by-slug miss now names both
possible causes and the `npm run seed:demos` command. It deliberately does *not*
branch on a `demo-`-looking slug: the seeder marks demos with an emoji name
prefix that the backend slugifier destroys, so `demo-` is not exclusive to
seeded demos, and branching on it would tell someone whose own workflow vanished
to run a command that *deletes* the demo set. No seeder change was needed — the
seeder was correct all along. The test plan now repeats the seed instruction
locally at Part 14; it already said it twice, 630 lines earlier.
**Area:** Seed / demo data
**Problem:** *"This link was not working for me … not found."* The test plan
links to
`/workflows/by-slug/demo-dynamic-custom-code-node-dyn-pill-script-editor-part-14/edit`.
Alex checked the workflows list live and it was absent: *"okay, I misplaced
somewhere."*
**The slug-divergence hypothesis is wrong — checked 2026-08-07.** After
`npm run seed:demos` the workflow list contains
`demo-dynamic-custom-code-node-dyn-pill-script-editor-part-14`, character-for-
character the slug the test plan links to. So the link and the seeder agree, and
what the reviewer hit was a seeding-state problem on his machine: the demos had
never been seeded there, or had been cleared (the seeder opens by deleting the
previous set — *"cleared 17 previous demo(s)"* — so an interrupted run leaves
none).
**Expected:** Confirm with the reviewer whether re-running `npm run seed:demos`
fixes it on his machine. If it does, the defect is that a stale or empty demo
set fails silently with a bare 404 — the fix is that the test plan says to seed
first, and that a by-slug miss says "this demo is not seeded — run
`npm run seed:demos`" rather than "not found".
**⚠ This item's own acceptance criterion was never met — noted 2026-08-08.**
Nobody asked the reviewer whether re-seeding fixed it, and nothing in this batch
records a check of his machine. What *was* demonstrated is the negative: the
link, the route and the seeder are all correct (the slug matches character for
character after seeding), and the row was absent from the workflows list, not
merely unreachable. "Unseeded database" is therefore the best remaining
explanation **by elimination**, not a measured one, and the batch's own wording
elsewhere ("turned out to be an unseeded database") states it a register more
confidently than the evidence supports.
The shipped fix does not depend on the diagnosis — it names both causes in the
copy, so it is right either way. But there is a residual risk worth naming: if
the row was *invisible* rather than *absent* — the exact failure mode item 24
turned out to be, where a seeded demo was private to `createdBy` — the new
message sends the reader to a command that deletes and re-creates the whole demo
set for nothing. Ask the reviewer when showing him this batch.
**Key file:** `scripts/seed-feature-demos.mjs` L1713;
`docs-md/workflows/MANUAL_TEST_PLAN.md` Part 14 demo link (L645).

### 32. [x] Manual test plan Part 14 jumps from 14.6 to 14.14
**Done 2026-08-08 (batch 4, `37e0253b`)** — 14.14 **moved** to the end of Part 14
under its own heading rather than renumbering. Renumbering would have broken
references in three docs and in e2e spec titles, since
`tier3-dynamic-node-security` names 14.11/14.12/14.13 in its test names. Reading
order is monotonic and zero cross-references changed.
**Area:** Docs — manual test plan
**Problem:** *"After 14.6, it directly comes to 14.14."* Confirmed: **14.14** is
filed at the end of the *Publish / manage (API)* section, while 14.7–14.13 come
after it under *Editor UI* and *Execute + security*. A reviewer working top-down
reads it as six missing steps.
**Expected:** Renumber so the sequence is monotonic, or move 14.14 to the end of
Part 14 where its number puts it.
**Key file:** `docs-md/workflows/MANUAL_TEST_PLAN.md` — Part 14, L651–673.

### 33. [x] Get a developer through the infrastructure-level test steps — *tests fixed; the cold walk still needs a name*
**Alex ruled 2026-08-08: *"just fix the tests."* Done 2026-08-09 — all eleven
`@infra` tests in the workflow-builder suite pass, three consecutive runs, no
flake.** Three were failing; each had a different cause and only one was in the
product's own test logic:

1. **`tier3-dynamic-node-run` (both tests) — worker configuration.** The worker
   had no `PLATFORM_API_KEY`, so `dyn.run` refused in ~50ms before reaching the
   sandbox. Set it in `~/.config/bcgov-di/temporal.env` (the loader's first
   source, ahead of the repo-root `.env`) and restarted the worker. No code
   defect. Because Temporal reports the cause to node-statuses as a bare
   `Activity task failed`, the spec's assertion message now carries the
   prerequisite — the diagnosis cost a worker-log read that the failure itself
   should have told us.
2. **`tier3-dynamic-node-security` 14.11 (grant half) — the test depended on
   DNS.** It granted `blocked.example.com` and expected the fetch to fail fast;
   inside the runner container a lookup for a non-existent host takes **8.1s**
   (six search domains, corporate forwarders), overrunning the runner's own 5s
   timeout → `timedOut: true`, exit −1. Nothing to do with permissions.
   Rewritten as an A/B on **one script and one host** — a closed loopback port
   (`127.0.0.1:9`), which refuses in ~40ms with no resolution at all: denied
   without `allowNet`, permitted with it. The manual step 14.11 gave the same
   misleading instruction and was corrected too.
3. **`tier3-try-preview` — pre-existing, and unsound on its own terms.** It
   reloads the editor for a deterministic post-commit cache fetch, but
   `RunStateProvider` starts every mount with `activeRunId = null` and restores
   nothing, so the strip correctly reported "Not run yet" for ever. Fixed by
   re-opening the run from **Run history** — the product's own answer, and the
   one its preview copy points authors at. Side benefit: that surface had **no**
   e2e coverage at all before this.

Verified: `RUN_INFRA=1 PLAYWRIGHT_SKIP_DB_RESET=1 npx playwright test
tests/e2e/workflow-builder/ --grep "@infra"` → 11 passed, ×3.

**Still open, and it is the half that produces new information:** the cold walk
of 14.1–14.6 by a developer who has *not* built this repo. Naming that person is
Alex's. The reasoning is in
[DECISIONS/33-infra-test-steps.md](DECISIONS/33-infra-test-steps.md).

<details><summary>Original entry (2026-08-08)</summary>

**Decision artifact written 2026-08-08 — awaiting Alex's ruling.** See
[DECISIONS/33-infra-test-steps.md](DECISIONS/33-infra-test-steps.md). The nine
skipped steps are **not** nine unverified steps: 14.1–14.6 run on every CI build
via the dynamic-nodes controller/service/repository specs, and 14.11–14.13 have
an `@infra` e2e suite that passes but is excluded from every default run.
Recommended inversion of the ask: run the two suites yourself (one command), and
give a developer the **cold-setup walk** of 14.1–14.6 — choosing someone who has
*not* built this repo, since anyone who has will silently skip the steps that
break.
**Area:** Process — no code change
**Problem:** The reviewer completed the plan from a UX lens but could not execute
the `curl`/infra items: *"this network egress blocked, I had no clue. Remote
import blocked, environment isolation … mostly the technical stuff, I could
not."* That leaves 14.1–14.6 and 14.11–14.13 unverified by anyone but Alex.
**Action:** Alex: *"it would be good to get some of the technical walkthrough —
maybe some of the guys can help me. Developers."* Assign the API and security
steps of Part 14 to a developer and record the results in the plan's checkboxes.

</details>

---

## Key Files Reference

| Area | Files |
|------|-------|
| Undo / redo | `apps/frontend/src/features/workflow-builder/use-undo-redo-hotkeys.ts`, `use-config-history.ts`, `WorkflowTitleField.tsx` |
| Canvas handles & ports | `.../workflow-builder/canvas/handle-style.ts`, `canvas/PortRows.tsx`, `canvas/HoverExtendPopover.tsx`, `canvas/WorkflowEditorCanvas.tsx` |
| Error policy & error state | `.../workflow-builder/settings/ErrorPolicySection.tsx`, `run/NodeStatusBadge.tsx`, `canvas/WorkflowEditorCanvas.tsx` (`id="error"` handles) |
| Try / Run / preview | `.../workflow-builder/WorkflowEditorV2Page.tsx`, `run/RunWorkflowDrawer.tsx`, `preview/PreviewWidget.tsx`, `preview/CacheEvictedAlert.tsx`, `preview/NoOutputNotice.tsx`, `preview/useActivityOutputPreview.ts` |
| Run history & replay | `.../workflow-builder/run-history/RunHistoryDrawer.tsx`, `WorkflowEditorV2Page.tsx` (`ReplayModeBanner`, and its mount point just below the top bar) |
| Top bar & switcher | `.../workflow-builder/WorkflowEditorV2Page.tsx` (top-bar zones ~L1598), `WorkflowSwitcher.tsx`, `WorkflowTitleField.tsx` |
| Workflows list | `apps/frontend/src/pages/WorkflowListPage.tsx` |
| Groups | `.../workflow-builder/canvas/GroupContainerNode.tsx`, `canvas/NodeContextMenu.tsx`, `canvas/PaneContextMenu.tsx` |
| Colour & legend | `.../workflow-builder/canvas/CanvasLegend.tsx`, `canvas/artifact-kind-colour.ts`, `packages/graph-workflow/src/types/artifact-registry.ts` |
| Agent chat | `apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx`, `AgentChatIcon.tsx`, `ConversationSwitcher.tsx`, `apps/frontend/src/layouts/RootLayout.tsx` |
| Demos & docs | `scripts/seed-feature-demos.mjs`, `docs-md/workflows/MANUAL_TEST_PLAN.md`, `docs-md/workflows/FEATURE_DEMO_GUIDE.md` |

---

## Raised in the call and deliberately NOT listed as work

- **Per-node removal from a group.** The reviewer questioned whether the
  right-click-a-member gesture should exist at all: *"I don't know if we need
  that option … if that is the requirement, then this might make sense."* That
  is a requirements question, not a defect — it needs Alex's ruling before
  anything is built, and it interacts with the still-open question from the
  2026-07-29 walkthrough about whether deleting one node deletes the group.
- **Accessibility of the canvas overall.** Alex flagged the general constraint
  in the call — *"accessibility on this thing is going to be challenging, we
  haven't worked specifically with React Flow on that"* — but no specific
  accessibility item beyond item 20 was raised, so none is invented here.
