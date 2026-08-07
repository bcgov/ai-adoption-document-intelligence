# Workflow designer — Inderdeep UX review, batch four (2026-08-06)

Every actionable item from Inderdeep Singh's second UX walkthrough of the visual
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

### 1. [ ] Ctrl/Cmd+Z does nothing for side-panel changes
**Area:** Frontend — workflow-builder undo/redo
**Problem:** Inderdeep set **Error handling → Follow the error path** in the
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

### 2. [ ] Undo granularity differs between the title field and drawer fields
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

### 3. [ ] Unconnected ports render as a bare circle — make them a `+`
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

### 4. [ ] Error-handling options don't read as a choice set, and the third is clipped
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

### 5. [ ] The error-path handle is an unexplained red dot with no popover
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

### 7. [ ] Failure should be visible at the node's title, not only in the corner
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

### 8. [ ] "Try" and "Run this workflow" are indistinguishable
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

### 9. [ ] Pressing Try resizes nodes, which then overlap
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

### 10. [ ] A node can show a green success check and a red failure message at once
**Area:** Frontend — workflow-builder preview
**Problem:** *"It got a little green checkbox. So it's like both green and red
at the same time."* — a node reporting `succeeded` while its preview pane says
*Preview unavailable — cache evicted*. Two contradictory verdicts on one card;
Inderdeep read the whole node as broken.
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

### 11. [ ] Failure messages are dimmed, unexplained, and offer no action
**Area:** Frontend — workflow-builder preview / node error surface
**Problem:** *"This error message is grayed out, should be similar [to the other
error treatment] … with a red background. And if it failed, there is an action
that the user can take. Explanation, yes, but then there is an action … here
there's nothing. What do I do with this if it failed? What next?"* Alex adds the
missing half: *"why did it fail?"*
**Narrowed 2026-08-07 — it is `NoOutputNotice`, not `CacheEvictedAlert`.**
Looking at both surfaces in a live run: `CacheEvictedAlert` already has the
treatment Inderdeep is asking for — pink error background, red icon, and a
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

### 12. [ ] Reported: an error message in the run-history flow can't be dismissed
**Area:** Frontend — workflow-builder run history
**Problem:** From Inderdeep's written notes: run history → run → *"no way to
cancel the error message"*, i.e. no way to dismiss it. He could not reproduce it
live and Alex agreed to shelve it: *"we'll shelve it and see if it could be
reproduced."*
**Expected:** Reproduce first. Select a past run from run history, start a run
from that state, and drive it to failure; if an undismissable error surface
appears, give it a close affordance. If it cannot be reproduced after a genuine
attempt, close the item with that stated.
**Key file:** `apps/frontend/src/features/workflow-builder/run-history/RunHistoryDrawer.tsx`,
`run/RunWorkflowDrawer.tsx`.

### 13. [ ] The "Replay mode" chip is parked beside Undo and reads as a stray tag
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

### 14. [ ] Title first; retire the Switch button for a chevron on the title
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

### 15. [ ] In the switcher, the current workflow is dimmed — it should be the highlighted one
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

### 16. [ ] The switcher hides most workflows behind "+13 more — refine the search"
**Area:** Frontend — workflow-builder switcher
**Problem:** `MAX_RESULTS = 12`, and anything beyond that becomes the dimmed
line *"+N more — refine the search."* Inderdeep could not find the Standard OCR
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

### 17. [ ] The switcher popover doesn't close on an outside click
**Area:** Frontend — workflow-builder switcher
**Problem:** *"Once I click, if I click outside, this probably should disappear.
I still need to click Switch again to make it disappear."*
**Expected:** Clicking anywhere outside the dropdown dismisses it (Mantine
`Popover` `closeOnClickOutside`), as well as Esc.
**Key file:** `apps/frontend/src/features/workflow-builder/WorkflowSwitcher.tsx`
— the `Popover` props.

---

## Workflows list

### 18. [ ] The workflows table overflows: delete column truncated, horizontal scroll at full width
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

### 19. [ ] You can't right-click the group itself to ungroup it
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

### 20. [ ] The port/wire colour vocabulary is too large to hold in your head
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
rejected in the call — Inderdeep: *"but then, do we really need the colors
then?"*
**Key file:** `apps/frontend/src/features/workflow-builder/canvas/CanvasLegend.tsx`
(`FAMILY_ROWS`), `canvas/artifact-kind-colour.ts` (`colorForKind`),
`packages/graph-workflow/src/types/artifact-registry.ts` (33 kinds, `color:` fields),
`canvas/handle-style.ts` (where a shape encoding would live).

---

## Agent chat

### 21. [ ] The chat icon appears everywhere but only works in the workflow editor
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

### 22. [ ] The agent fails silently — no error, no feedback, nothing
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

### 23. [ ] The agent must work with the LLMs BC Gov actually has
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

### 24. [ ] "Show past conversations" is empty on the seeded demo
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
**Done 2026-08-07 (batch 1).** Inderdeep's report was accurate and the cause was
app-wide, not chat-specific. Measured in the browser: the enabled send button
rendered `color: rgb(45,45,45)` on `background: rgb(85,149,217)`. A project rule
in `apps/frontend/src/ui/bcds-mantine-fallbacks.css` set
`.mantine-ActionIcon-root { color: var(--icons-color-primary) }` unconditionally,
beating Mantine's `var(--ai-color)` on order and stamping near-black over **every
filled ActionIcon in the app**. Now qualified with `:not([data-variant="filled"])`.
The button also moved from violet to the theme's primary blue, and the
composer's focus ring followed it off a hardcoded `#845ef7`.
**Residual, for Inderdeep's ruling — not a defect:** white on the theme's filled
blue `#5595D9` measures **3.14:1**, which clears WCAG 1.4.11's 3:1 floor for
non-text UI but is marginal, and is *lower* than near-black scored on the same
blue (4.37:1). The change is still right because on the violet that was actually
there, near-black scored 2.47:1 (fails) against white's 5.55:1. Darkening the
filled shade to `blue.7` (`#3470B1`) would take white to 5.12:1 — a design-system
decision across every filled action in the app, so it was not made unilaterally
on one button. See [ILLUSTRATED.md §3](ILLUSTRATED.md).
**Key file:** `apps/frontend/src/ui/bcds-mantine-fallbacks.css`,
`apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx`, `agent-chat.css`.

### 26. [ ] The stop control is detached from the conversation it stops
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
Inderdeep's correction: *"but then that shape probably will be filled and not
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

### 30. [ ] Chat panel layout: model picker belongs at the composer, history at the top
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

### 31. [ ] The Part 14 demo link 404s — the workflow isn't there
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
what Inderdeep hit was a seeding-state problem on his machine: the demos had
never been seeded there, or had been cleared (the seeder opens by deleting the
previous set — *"cleared 17 previous demo(s)"* — so an interrupted run leaves
none).
**Expected:** Confirm with Inderdeep whether re-running `npm run seed:demos`
fixes it on his machine. If it does, the defect is that a stale or empty demo
set fails silently with a bare 404 — the fix is that the test plan says to seed
first, and that a by-slug miss says "this demo is not seeded — run
`npm run seed:demos`" rather than "not found".
**Key file:** `scripts/seed-feature-demos.mjs` L1713;
`docs-md/workflows/MANUAL_TEST_PLAN.md` Part 14 demo link (L645).

### 32. [ ] Manual test plan Part 14 jumps from 14.6 to 14.14
**Area:** Docs — manual test plan
**Problem:** *"After 14.6, it directly comes to 14.14."* Confirmed: **14.14** is
filed at the end of the *Publish / manage (API)* section, while 14.7–14.13 come
after it under *Editor UI* and *Execute + security*. A reviewer working top-down
reads it as six missing steps.
**Expected:** Renumber so the sequence is monotonic, or move 14.14 to the end of
Part 14 where its number puts it.
**Key file:** `docs-md/workflows/MANUAL_TEST_PLAN.md` — Part 14, L651–673.

### 33. [ ] Get a developer through the infrastructure-level test steps
**Area:** Process — no code change
**Problem:** Inderdeep completed the plan from a UX lens but could not execute
the `curl`/infra items: *"this network egress blocked, I had no clue. Remote
import blocked, environment isolation … mostly the technical stuff, I could
not."* That leaves 14.1–14.6 and 14.11–14.13 unverified by anyone but Alex.
**Action:** Alex: *"it would be good to get some of the technical walkthrough —
maybe some of the guys can help me. Developers."* Assign the API and security
steps of Part 14 to a developer and record the results in the plan's checkboxes.

---

## Key Files Reference

| Area | Files |
|------|-------|
| Undo / redo | `apps/frontend/src/features/workflow-builder/use-undo-redo-hotkeys.ts`, `use-config-history.ts`, `WorkflowTitleField.tsx` |
| Canvas handles & ports | `.../workflow-builder/canvas/handle-style.ts`, `canvas/PortRows.tsx`, `canvas/HoverExtendPopover.tsx`, `canvas/WorkflowEditorCanvas.tsx` |
| Error policy & error state | `.../workflow-builder/settings/ErrorPolicySection.tsx`, `run/NodeStatusBadge.tsx`, `canvas/WorkflowEditorCanvas.tsx` (`id="error"` handles) |
| Try / Run / preview | `.../workflow-builder/WorkflowEditorV2Page.tsx`, `run/RunWorkflowDrawer.tsx`, `preview/PreviewWidget.tsx`, `preview/CacheEvictedAlert.tsx`, `preview/NoOutputNotice.tsx`, `preview/useActivityOutputPreview.ts` |
| Run history & replay | `.../workflow-builder/run-history/RunHistoryDrawer.tsx`, `WorkflowEditorV2Page.tsx` (replay chip ~L2178) |
| Top bar & switcher | `.../workflow-builder/WorkflowEditorV2Page.tsx` (top-bar zones ~L1598), `WorkflowSwitcher.tsx`, `WorkflowTitleField.tsx` |
| Workflows list | `apps/frontend/src/pages/WorkflowListPage.tsx` |
| Groups | `.../workflow-builder/canvas/GroupContainerNode.tsx`, `canvas/NodeContextMenu.tsx`, `canvas/PaneContextMenu.tsx` |
| Colour & legend | `.../workflow-builder/canvas/CanvasLegend.tsx`, `canvas/artifact-kind-colour.ts`, `packages/graph-workflow/src/types/artifact-registry.ts` |
| Agent chat | `apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx`, `AgentChatIcon.tsx`, `ConversationSwitcher.tsx`, `apps/frontend/src/layouts/RootLayout.tsx` |
| Demos & docs | `scripts/seed-feature-demos.mjs`, `docs-md/workflows/MANUAL_TEST_PLAN.md`, `docs-md/workflows/FEATURE_DEMO_GUIDE.md` |

---

## Raised in the call and deliberately NOT listed as work

- **Per-node removal from a group.** Inderdeep questioned whether the
  right-click-a-member gesture should exist at all: *"I don't know if we need
  that option … if that is the requirement, then this might make sense."* That
  is a requirements question, not a defect — it needs Alex's ruling before
  anything is built, and it interacts with the still-open question from the
  2026-07-29 walkthrough about whether deleting one node deletes the group.
- **Accessibility of the canvas overall.** Alex flagged the general constraint
  in the call — *"accessibility on this thing is going to be challenging, we
  haven't worked specifically with React Flow on that"* — but no specific
  accessibility item beyond item 20 was raised, so none is invented here.
