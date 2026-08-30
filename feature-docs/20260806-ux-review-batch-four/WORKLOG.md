# Workflow designer — batch four, worklog

**Branch `feature/visual-workflow-builder` · started 2026-08-07**

What was actually done, in the order it was done, for the 33 items in
[CHECKLIST.md](CHECKLIST.md) from the reviewer's 2026-08-06 UX walkthrough.

Three documents, three jobs:

| Document | What it is |
|---|---|
| [CHECKLIST.md](CHECKLIST.md) | The index. One entry per item, ticked when done. |
| **This file** | The narrative. What changed, where, why, how it was verified — including the things that turned out different from the checklist's diagnosis, and the items that closed as no-change. |
| [ILLUSTRATED.md](ILLUSTRATED.md) | The pictures. After-only screenshots taken from the running app. |

Read this one to know what happened. Read ILLUSTRATED to see it.

---

## How this run was organised

Batches are cut by **file locality**, not by theme. Several batches run at once
in separate subagents against one shared working tree, so two batches must never
own the same file — that is the one failure mode that silently destroys work.
Where two batches wanted the same file, they went into different waves.

Rules the batches ran under:

- A batch edits only the files it owns, runs only its own scoped `vitest` files,
  and never commits.
- `tsc --noEmit`, Biome and the full frontend suite run **once per wave**, in the
  main thread, because a shared `tsbuildinfo` makes concurrent `tsc` runs race.
- Browser verification is reserved for the batches whose correctness is visual —
  jsdom passes things that are invisible in a real browser, which is how the
  disabled-button tooltips got through a previous batch.
- A batch that cannot be verified is **reported, not forced.** "This was already
  fixed" and "this would not reproduce" are findings, and they are written down
  here rather than papered over with a speculative change.

### Wave plan

| Wave | Batches | Browser? |
|---|---|---|
| A | 2 Switcher · 3 Groups · 4 Demos & docs | no |
| B | 5 Undo · 6 Chat layout · 7 Run-result truth | batch 7 only |
| C | 8 Ports & error paths · 9 Workflows list | both |
| D (serial) | 10 Try-reflow → 11 Top bar → 12 Chat reliability | yes |
| Final | screenshots, ILLUSTRATED, full verify | yes |

### Four items are not code

Items **8** (what Try and Run actually differ by), **20** (the canvas colour
vocabulary), **23** (which LLMs BC Gov can actually call) and **33** (getting a
developer through the infrastructure test steps) are forks in the design or
facts about the organisation, not defects with a right answer. Each got a
decision artifact in [DECISIONS/](DECISIONS/) — the question, the evidence,
the options with what each costs, and a recommendation — for Alex to rule on.
None of them was decided unilaterally.

---

## Batch 1 — the icons that don't say what they mean

**Items 6, 25, 27, 28, 29 · commit `f3263a0f` · 2026-08-07**

Landed before this worklog existed; recorded here so the record is complete.
Five glyph and colour fixes with one shared root cause: a meaningful glyph drawn
inside a container that wins the pixel budget. Shown in
[ILLUSTRATED.md §1–§3](ILLUSTRATED.md).

The one that turned out bigger than written was **item 25**, the send button.
The reported near-black-on-purple was real and measured `rgb(45,45,45)` on
`rgb(85,149,217)`, but the cause was not in the agent chat: a project-wide rule
in `bcds-mantine-fallbacks.css` set the BC Design System icon colour on every
`ActionIcon` unconditionally, beating Mantine's own variant colour on cascade
order and stamping near-black over **every filled icon button in the app**. It
is now qualified to leave filled variants alone, so the fix is app-wide.

A residual went to the reviewer rather than being decided here: white on the
theme's filled blue `#5595D9` measures **3.14:1**, which clears WCAG 1.4.11's
3:1 floor for non-text UI but is marginal. Darkening to `blue.7` (`#3470B1`)
takes it to 5.12:1 — and repaints every filled action in the app, so it is a
design-system call, not a button call.

---

## Wave A + B — five batches, five commits

Verified together once the tree was quiet: `tsc --noEmit` clean, Biome clean
(2 warnings, both pre-existing in an untouched test file), and the full frontend
suite at **207 files / 2537 tests passing** — up from 205 / 2496 at the start of
the run, so 41 new tests and 2 new files. Each commit was additionally
lint- and type-checked on its own by the pre-commit hook.

### Batch 2 — the switcher stops hiding workflows · items 15, 16, 17

**Commit `b53d9510`** · `WorkflowSwitcher.tsx`

Three complaints, one mistake underneath: the dropdown behaved like a search
tool over a large corpus when it is a picker over about 29 workflows.

- **16** — `MAX_RESULTS = 12` truncated the list and offered *"+N more — refine
  the search"*, with no filter to refine with. The cap and the dead line are
  gone; the scroll area's max height goes 260 → 320 and the list scrolls.
- **15** — the row you are standing on was `disabled` and dimmed with the
  literal text `(current)` while every other row was bold. *"Its hierarchy is
  lower than the inactive ones, which should be the reverse."* The current row
  now carries the highlight, the weight and a check mark; the others drop to
  regular. The state moved to `aria-current` / `data-current` so it reads as
  current rather than disabled, and the `{slug} · v{version}` subline is gone —
  asked whether it was needed here, the answer was no.
- **17** — the popover would not close on an outside click.

**Where the checklist was wrong.** It blamed item 17 on a missing
`closeOnClickOutside` prop. That prop already defaults to `true`. The real cause
is React Flow's pane: d3-zoom's mousedown handler calls
`stopImmediatePropagation`, and Mantine's `useClickOutside` listens for
`mousedown` and `touchstart` only, so the event never reached the document
listener. Adding `click` to `clickOutsideEvents` fixes it — d3 only suppresses
the click when the pointer actually moved. Esc was broken for a separate reason:
Mantine handles it via `onKeyDownCapture` **on the dropdown**, which needs focus
inside, so `trapFocus` is what makes it work.

**Honest limit.** jsdom has no d3-zoom, so the new outside-click test guards
against `closeOnClickOutside` regressing but cannot reproduce the propagation
bug. Item 17 is confirmed by source reading, not by observation — it is on the
browser pass list.

### Batch 3 — the group right-click · item 19

**No commit — the work moved to batch 8b.** Recorded because the investigation
is the finding.

The agent stopped rather than edit a file it did not own, which was correct, and
in doing so disproved the checklist's diagnosis. Item 19 is **not** the missing
`onContextMenu` on `GroupContainerNode`. The container's right-click *does*
fire; `handleNodeContextMenu` then bails on
`const graphNode = config.nodes[node.id]; if (!graphNode) return;` — a group
container's id is `container-<groupId>` and is never a key in `config.nodes`, so
the event is silently dropped. The fix is three small edits in
`WorkflowEditorCanvas.tsx`, which belongs to a later batch, so the item moved to
wave C rather than being forced through a stub.

**An open question came out of it.** The group box *body* is deliberately
`pointerEvents: "none"`, with a comment explaining that the box must not read as
a drop target and must not swallow pans. So only the group **header** is
reachable for a right-click. Covering the body means either flipping that
decision — which the file argues against — or hit-testing inside the pane
context menu. Header-only ships; the body is a design call, not a mechanical
fix.

### Batch 4 — a missing demo says why · items 31, 32

**Commit `37e0253b`** · `WorkflowBySlugRedirect.tsx`, `MANUAL_TEST_PLAN.md`

**The checklist's diagnosis was wrong and was disproved before code was
written.** The hypothesis was that the seeder's slug and the test plan's link
had diverged. After `npm run seed:demos` they match character for character.
What the reviewer hit was a seeding-state problem on his machine — the seeder opens
by deleting the previous demo set, so an interrupted run leaves none. The real
defect is that a miss dead-ends on a bare "not found".

The miss now names the cause and the command. It deliberately does **not** branch
on a demo-looking slug: the seeder marks demos with an emoji name prefix, and
the backend slugifier collapses every non-alphanumeric run to a hyphen, so the
emoji is destroyed and `demo-` is not exclusive to seeded demos. Branching on it
would confidently tell someone whose own workflow had vanished to run a command
that *deletes* the demo set. So the message states both causes without guessing.

For item 32, 14.14 **moved** rather than being renumbered — renumbering would
have broken references in three docs and in e2e spec titles, since
`tier3-dynamic-node-security` names 14.11/14.12/14.13 in its test names. Reading
order is now monotonic and zero cross-references changed.

**Also found:** the test plan already said to seed, twice, in a header block 630
lines above Part 14 — including *"Links 404 until the seeder has run."* The note
is now repeated locally where the demo links are, because that is the kind of
thing a reader does not carry that far.

### Batch 5 — Ctrl+Z stops being swallowed · items 1, 2

**Commit `f9077fd0`** · `use-undo-redo-hotkeys.ts`

**Item 1's diagnosis held, and was verified in the shipped Mantine 8.3.9 source
rather than assumed.** `SegmentedControl` renders each option as a real
`<input type="radio">`, so after a click that radio holds focus, the keydown
target is an `INPUT`, and the old `tag === "INPUT"` branch dropped the undo on
the floor.

The guard now stands down only where the browser's own text undo is real: an
`<input>` whose type is one of email/number/password/search/tel/text/url, a
`<textarea>`, or a contenteditable — and in each case only when it is not
`readOnly`. Everything else falls through to the graph undo: radio, checkbox,
range, color, file, the button types, and the whole date/time family, none of
which have an undo stack to protect.

**Two things this fixed that nobody reported.** A non-searchable Mantine
`Select` renders as a `readOnly` text input, so a pure type check would still
have swallowed undo there — hence the `readOnly` clause. And the old `SELECT`
branch is gone: a native `<select>` has no text undo and was suppressing the
hotkey for nothing.

**Item 2 closed as no-change, with the cause identified rather than shrugged
at.** Neither field rebuilds its value per keystroke — the title keeps a local
draft and commits on Enter/blur, and the drawer's description round-trips
losslessly through a synchronous `useState`, so React writes nothing back to the
DOM in either case. The word-versus-character difference is `<input>` vs
`<textarea>` **inside React itself**: `updateTextarea` assigns
`element.defaultValue` on every keystroke, and on a textarea that property *is*
the element's child text, so each keystroke mutates the children and ends the
browser's typing transaction. `updateInput` writes only the `value` attribute,
which the editing host ignores. Making the two match would mean rendering the
description uncontrolled — a behaviour change to a field this batch does not
own, and not what the item asked for.

### Batch 6 — the chat appears where it works, and stop lives in the composer · items 21, 26, 30

**Commit `5903a414`** · `AgentChatDrawer.tsx`, `ConversationSwitcher.tsx`,
`RootLayout.tsx`, plus three references it invalidated elsewhere

- **21** — the chat icon rendered on every route while the agent's tools only
  act on workflows. Both the icon *and* the drawer are now gated on
  `/^\/workflows(\/|$)/`, read off the router rather than guessed. Gating both
  matters: icon-only gating would strand an open drawer on `/documents`.
  Deliberately not narrowed to the editor alone, because the agent's
  `createWorkflow` tool navigates from the list into the editor.
- **26** — the composer's send button becomes the stop button while a turn
  streams and reverts when it ends; the header abort is gone. Stopping still
  does both halves — the client-side stream teardown and the backend abort call.
  Batch one's palette fix is intact: both states stay filled blue, so the button
  changes its job and its glyph, not its identity.
- **30** — model picker down to the composer, past-conversations up to the
  header beside new-conversation and close.

**Where the checklist was wrong.** It says the model `Select` and the
conversation switcher "both sit in the drawer header". The switcher was never in
the header — it was a separate collapsible strip rendered *below* it. That is
why the fix is a lifted `open` prop rather than a move of markup.

**Three references broke outside the batch's files and were fixed in the same
commit:** the e2e page object pointed at the removed `agent-chat-abort` testid
and looked for the history toggle by text inside the switcher; `PHASE7_HANDOFF`
described the old placement; and test-plan step 15.7 named the old testid.
`WALKTHROUGH_PARTS_2_14.md` also mentions it and was left alone — it is a dated
record of a past walkthrough, not a live pointer.

### Batch 7 — a node stops claiming success and failure at once · items 10, 11, 12

**Commit `38e472f7`** · `CacheEvictedAlert.tsx`, `NoOutputNotice.tsx`

**Item 10 reproduced on the first try, in the browser.** On the workflow-as-API
demo the API Endpoint node carried a green check and a red *"Preview
unavailable — cache evicted"* panel in the same frame, while the neighbouring
Prepare File Data node was genuinely failed.

The distinction went into the **panel, not the badge**. The badge was already
telling the truth — the step really did succeed. The contradiction was the panel
borrowing failure semantics for a non-failure: `CacheEvictedAlert` is only ever
reached for `succeeded`/`skipped`, so its resting state can never legitimately
be an error. It now has three presentations — idle and re-running are neutral
grey, a failed re-run is red, and retention-cleaned is yellow, because a dead
end is not a step failure. The copy leads with the verdict: *"This step
completed. Preview unavailable — its output isn't in the preview cache."*
Touching the badge would have meant dimming a correct green check because a
different component was mis-styled.

**Item 11's failure surface now carries a real reason.** `NoOutputNotice` routes
`reason === "failed"` to a red alert with the engine's own
`NodeRunStatus.errorMessage` — the same field feeding the badge tooltip — and a
**Re-run workflow** button. Where that field is absent it says so rather than
fabricating a cause; in the wire-peek popover, which renders from an edge rather
than a node, it omits the reason line rather than guessing whose error it is.
The button says "workflow" deliberately: there is no re-execute-one-step
endpoint, so it must not read as retrying the step alone. Every non-`failed`
reason keeps the grey treatment on purpose — *"the run took a different branch"*
is a fact, not a fault.

**Where the checklist was wrong.** It framed 10 and 11 as *"bring one surface up
to the other."* They pull in opposite directions: item 11 wanted
`CacheEvictedAlert`'s red treatment copied onto `NoOutputNotice`, while item 10
required that same alert to *stop* being red. The treatments **swapped** rather
than converged. Both items are satisfied; the description was not what happened.

**Item 12 was not reproduced, after a genuine attempt.** Opened run history (54
rows), entered replay on the newest run, pressed Try from that state, drove it
to failure, then enumerated every `.mantine-Alert-root` and
`.mantine-Notification-root` on the page: only the two node preview panels, both
with actions, no undismissable surface. Separately forcing the run-list endpoint
to 500 *does* produce a non-dismissable "Failed to load runs" alert — but it
appears before selecting a run, clears itself on the next successful fetch, and
sits inside a Drawer with its own close, so it is not the reported surface. No
speculative close button was added.

---

## Wave C — the canvas batches, verified and committed 2026-08-08

Wave C's code was written in the previous session and left uncommitted. This
session verified it before committing anything: `tsc --noEmit` silent, Biome
clean, and **684 tests across 35 files** passing on the wave's scope. Then four
commits, cut so that no commit breaks the build.

### Batch 8a — a port says there is something to add · items 3, 4

**Commits `166a5aae` (item 3, with 5 and 7) and `0b9400fe` (item 4)**

Item 3 needed a field that did not exist. `bound` is input-only in practice and
hard-coded `true` for outputs, so nothing in the port model could answer "does
anything actually leave this port". `connected` was added to
[port-rows.ts](../../apps/frontend/src/features/workflow-builder/canvas/port-rows.ts),
derived for outputs from a real data wire leaving that exact port.

The glyph is a **knockout**: two bars in the canvas body colour cut across the
family-coloured disc, the same treatment as the 2px body ring the dot already
wears. Two constraints drove that. The hue encodes what can connect to what, so
the drawing must not fight it — hence a knockout rather than a coloured glyph.
And batch one's status-badge finding was that a glyph *inside* a ring loses at
small sizes, so the plus is not drawn inside the existing 12px dot: an inviting
handle grows to 16px, leaving a 12px disc inside the ring, with 8px arms at 2px
thick. Two thirds of the disc is glyph. The dot grows by width/height rather
than `transform: scale()`, which matters because xyflow's own handle classes
apply `translate(-50%, -50%)` — percentages resolve against the handle's own
box, so a bigger box stays centred on the same anchor for free.

Item 4 became a radio group with the help text moved onto each option. The
reason is not decoration: a single line of help below a vertical list reads as
describing *the list*, not *the selection*.

### Batch 8b — the error path, and failure at the title · items 5, 7, 19

**Commits `166a5aae` (items 5, 7) and `ab16d4b6` (item 19)**

The red dot at the bottom of a node now opens the same hover-extend popover
every other output handle opens, in an error-path mode with a red banner
(`hover-extend-error-path-banner`) naming what you are picking for. The pick
lands a genuinely `error`-typed edge with `fallbackEdgeId` recorded — not an
ordinary wire painted red. Failure is announced beside the node's name
(`node-failure-chip-<nodeId>`) as well as in the corner, so scanning a failed
graph tells you which step broke without hunting corners.

Item 19 shipped **header-only**, and declined the pane hit-test that batch 3's
investigation had left open. The reason: making the group's interior open a
group menu would take "Add node here" away from a large part of the canvas, and
adding a node inside a group's area is an ordinary thing to want.
Discoverability came from a header tooltip instead.

### Batch 9 — the workflows table fits · item 18

**Commit `ffc14683`**

Widths are now pixels derived from the buttons' actual dimensions rather than
percentages that need re-tuning whenever a column changes. Name carries no width
at all, so under fixed layout it absorbs the remainder and stays the focus
column. **Honest limit:** jsdom runs no table layout, so the tests pin the rule —
pixels not percentages, and a floor on the table — while the browser
measurements are the real evidence. This one is on the browser pass list.

---

## Wave D — the top bar · item 14, and a defect found while measuring it

**Commit `fe6051fe`** · `WorkflowSwitcher.tsx`, `WorkflowEditorV2Page.tsx`,
`NodeSearchBox.tsx`

The name is the leftmost thing in the top bar, click to rename as before, with a
chevron beside it opening the switcher. The standalone Switch button is gone —
the Google Sheets pattern Alex demonstrated in Figma. Items 15, 16 and 17 were
checked not to regress, in the browser as well as in vitest.

**The overflow defect, measured before anything was touched.** At seven widths
in Chromium: from **1512px down** the centre zone's controls spilled out of
their own box and Undo/Redo sat on top of the Simplified switch — at 1440 the
overlap was exactly the reported `simplified-view ↔ undo/redo` — and at 1280 the
bar itself overflowed by 15px. Three flex rules caused it: a left zone with
`flexShrink: 0` that never yielded despite being mostly truncatable, a centre
zone with `minWidth: 0` (which lets a `nowrap` flex container shrink below its
own content while its children stay put and spill), and a right zone with no
shrink rule at all. The shrink order is now stated explicitly. Retiring the
Switch button returned ~93px and `NodeSearchBox` gave up 30px of its floor.
**After: no overlap and no overflow at 1920 / 1600 / 1440 / 1366 / 1280 / 1152.**
First overlap is now at 1024px, with the left zone fully collapsed. Nothing
hidden, nothing duplicated into a menu.

**Honest limit.** jsdom gives every box 0×0, so the overlap is not reproducible
there. The tests pin the three flex rules so a revert fails in CI rather than in
a screenshot months later; the Chromium measurements above are the evidence. The
1280px degradation — "Standard …" truncating, the counter squeezed out — is a
judgement call worth a look on a real screen.

### Batch 12 — the agent says why it failed · items 22, 24

**Commit `c83884ce`** · `apps/backend-services/src/agent/`,
`apps/frontend/src/features/agent-chat/`, a Prisma migration, the seeder

**Item 22 was two silences, and neither was where the checklist guessed.**
`ProviderResolver.resolve` threw a bare `Error`, which Nest can only render as
`{"statusCode":500,"message":"Internal server error"}` — the cause was destroyed
at the HTTP boundary before the frontend ever saw it. Separately, anything
failing *after* the response headers were sent (bad key, missing deployment,
429) went through the AI SDK's default masker, which writes the literal string
`"An error occurred."`. And `useChatRuntime` was given no `onError`, so even that
string was dropped on the floor.

Now `AgentProviderNotConfiguredException` (503) carries `code` / `provider` /
`missingConfig` — environment variable **names** only, never values — and
`pipeUIMessageStreamToResponse` gets an `onError` that names the HTTP status and
what the provider said, forwarding no URL, header or body and truncating at 400
characters. Both render through one describer into a red `agent-chat-error`
alert at the end of the thread, which clears when the next turn starts. The
budget refusal was folded into the same structured shape.

**Item 24 was per-user scoping doing its job.** `ChatConversation` rows are
private to `createdBy`, so a transcript seeded under `SEED_USER_SUB` was
invisible to every other identity — including the API-key identity, which is why
a reload did not help. The fix encodes the distinction rather than the
workaround: `ChatConversation.isDemo`, set by the seeder. Visibility is
`groupId = caller's group AND (createdBy = caller OR isDemo)`, with the group
filter a **sibling** of the OR rather than a branch of it, and a test guarding
exactly that. Demo rows are read-only for everyone — `POST /api/agent/chat` on
one returns 403 `demo-conversation-read-only` rather than putting one reader's
follow-up into everybody else's demo, surfaced through item 22's alert. Delete
stays owner-only; the switcher badges a demo replay and withholds delete.

**State of the local box.** The migration has been applied to the dev database,
and one row updated so the already-seeded demo works without `npm run seed:demos`
— a re-seed would have recreated demo workflows and disturbed the screenshot
pass running at the time.

**Not verified.** The alert's appearance in the drawer at 540px, and the demo
replay opening for a second identity, are on the browser pass list. The chat
endpoint was deliberately not probed live: with Azure configured on this machine
that would have started a real billable turn.

---

## Wave E — the two items Alex ruled on the same day

### Item 23 — the picker offers what the backend can serve

**Commit `ad14c24e`**

**Alex's ruling:** one credential set in the repo-root `.env`, BC Gov values, no
per-app split (the env-splitting option was explicitly rejected). Anthropic is
not in use for now — out of the picker, but kept in the code and documented as
supported. Default to the deployment the platform already has configured.

The picker was six hardcoded strings with the default being `[0]`, so every turn
asked for `gpt-5.4` — a deployment nobody but Alex could call — while the
configured deployment was `gpt-4o`. Nothing validated the model name and nothing
told the frontend what the backend had. A read-only endpoint now reports the
configured provider and model, derived from the same source of truth the
provider guard uses, and the picker renders that with the backend's default
selected.

**Honest about cardinality:** `AZURE_OPENAI_DEPLOYMENT` holds *one* name, so the
truthful list today is one entry. It renders as a label rather than a dropdown
whose only option is already chosen. No multi-deployment list variable was
invented — that would be a configuration-shape decision nobody asked for.

**A bug had to be fixed first, and it explains the silence.** Credentials were
read with `?? null`, so a variable that is present but **empty** counted as
configured. The root `.env` carries an empty Anthropic key and no default-provider
setting, so the old code resolved the default to Anthropic and handed the SDK a
blank credential — failing as a mid-stream 401 rather than the typed error added
in `c83884ce`. Every setting is now trimmed, and blank reads as absent. That also
caught a quieter one: a blank numeric bound parsed as zero, so an empty
`AGENT_MAX_STEPS` meant the agent could make **no tool calls at all**.

**Still broken, flagged not fixed:** `docker-compose.yml` gives the LLM
credentials to `temporal-worker` and none to `backend-services`, so the agent
would refuse to boot in a container. This change makes that stricter, not looser.

### Item 13 — replay mode reads as a mode

**Commit `8bcaf7eb`**

Built to the ruling in [13-replay-mode.md](DECISIONS/13-replay-mode.md): a
banner between the top bar and the canvas, not a top-bar region. Each state gets
sentences rather than a compressed label — including the run that recorded no
version, which says *unknown* rather than inventing a `v0`, and the unavailable
case, which now has room to say plainly that the graph on screen may differ from
the one that actually ran.

Retiring the chip gives the top bar its width back, so item 14's overflow fix is
strengthened rather than risked. The banner is `flexShrink: 0` in the page
column, so its height comes out of the canvas.

**Not built, deliberately:** the transient "your edit was discarded" note when a
blocked edit is dropped. That was a follow-up question in the decision doc and
Alex has not answered it; the three `if (isReplay) return;` guards are untouched.

**Honest limit.** jsdom runs no layout, so the banner's real height, the canvas
not jolting on entry, and the top bar still fitting from 1920 down are browser
evidence — manual test plan 9.9d, deliberately left unticked.

### Item 8 — one `Run…` button, and a try admits it is disposable

**Commit `9cf679ff`**

**Alex approved the recommendation.** Two buttons opened the same drawer and
differed only in which existing tab was pre-selected, so the reviewer's *"even if I
choose one, I still have the option to go to the other"* was literally true.

The trace behind that ruling is worth keeping, because it is stronger than the
decision doc could claim. `RunTrigger` is a Temporal **search attribute** — a
label used for querying — and it is read in exactly **one** place in the whole
codebase: the query that finds in-flight tries to cancel. It is never passed into
the workflow input, so the worker **cannot know** which it was, which makes every
downstream behaviour provably identical: same outputs, same cache, same
documents, same human gates. Tries appear in run history exactly like runs, and
the run summary carries no trigger field, so nothing can tell them apart
afterwards. Both endpoints fire the cancel, so starting a Run also kills your
in-flight tries; a Run is simply immune to being killed.

There is a further irony. The only path that creates a `Document` row from the
builder is the **upload** endpoint — and that one stamps `"try"`. The Run tab's
JSON box creates none. So "Run puts it in a queue" is exactly backwards.

Shipped: one `Run…` button; tabs renamed **"Try on canvas"** and **"Call from
outside"**; the second tab's box relabelled from *"Test run"*, which sat on the
non-disposable path and read backwards; and the disposability finally stated
under the Try button — the one genuinely useful property of the distinction,
which until now only the source code knew. Which tab opens is derived from the
workflow rather than from which button was pressed.

**One deliberate departure, recorded for Alex.** The surviving button is shown
for every workflow rather than inheriting Try's hide rule. Hiding it for
upload-driven workflows would leave them with **no top-bar route to the drawer at
all**, and the drawer is the only way to reach the upload dropzone; it would also
have killed an existing e2e test. The rule's intent survives where it already
lived — those workflows get the dropzone and no tabs.

### A regression this batch introduced, caught in a browser

**Commit `001ec032`**

Item 14 traded a button labelled **"Switch"** for a bare chevron, leaving
`aria-label` as the only explanation — which serves screen readers and nobody
else. A sighted mouse user hovering it got nothing. That is the same complaint
items 15, 16 and 17 were about, so it got the same remedy item 19's group header
got: name the affordance on hover, and stand down once the list is open.

Worth noting **how** it was found: not by a test, but by the agent taking the
screenshots, because it was the only one that looked at the thing in a browser.
No unit test could have caught it — jsdom will happily render a tooltip a real
browser does not.

---

## The @infra suites, actually run — 2026-08-08

Item 33 recommends running the two `@infra` dynamic-node suites rather than
walking nine `curl` steps. They were run, with the Playwright database reset
skipped so the seeded demos survived. **Four passed, two failed, both
reproducible.**

- **14.11, the allowlist test** — with the host granted, the sandboxed script
  fetches it and expects a clean exit; exit code was −1. The runner's own log
  shows that `/execute` taking **5,006ms**, i.e. a timeout rather than a
  rejection. The test assumes a fetch to a non-existent host fails fast; on this
  machine the lookup appears to hang. Reads as environmental — and note the
  permission gate itself was fine, since the failing assertion is the exit code,
  not the "no permission denial" check. The companion test proving the allowlist
  *blocks* an ungranted host passed.
- **The dynamic-node run test** — a published node fails in 55ms with a bare
  `Activity task failed`. Too fast to be the sandbox, which is healthy and
  executes scripts elsewhere in the same run. **Undiagnosed**: the real error is
  in the Temporal worker's output, and the worker does not run in Docker here, so
  its console could not be read.

The finding is itself the point of item 33: these steps are not unverified, they
are **automated but never run**, and the first time anyone ran them, two failed.

---

## Verification of the whole branch, 2026-08-08

Final run, after every batch above had landed, on an idle machine:

- **Backend** `jest` — **2863 tests, 153 suites, all passing.**
- **Frontend** `vitest run` — **2614 tests, 210 files, all passing.**
- `tsc --noEmit` clean on both; Biome clean on every changed file.

Two honest notes on method, both recorded because a green number that followed a
red one is worth explaining rather than quietly keeping:

- An earlier full frontend run reported 5 failures while the backend suite and a
  browser-driving agent were competing for the same machine (79s against a normal
  46s, with import time alone at 495s). Clean on re-run.
- A later run reported 1 failure, again while a browser agent was driving the
  same box; two clean re-runs followed. In neither case did the failing test
  reproduce in isolation.

**What tests do not cover, stated once rather than per item.** jsdom runs no
layout: every box is 0×0, tables are not laid out, and a tooltip renders that a
real browser may not. So for the workflows table, the top-bar overflow, the
replay banner's height and the switcher's tooltip, the tests pin the *rule* and
the browser evidence is the screenshots and the measured Chromium runs. Each of
those items says so in its own entry.

---

## Wave F — item 9, the Try reflow · 2026-08-09

Alex ruled **Option C** and said "go with recommendations" on the open
sub-question, so the strip shows the value's first line rather than only kind
and status.

**What shipped.** Every card that can produce output carries a fixed-height
one-line result strip at all times, including before any run, where it says
*Not run yet*. The full scrollable preview moved into a popover behind it,
reading the same shared batch query, so opening one costs no extra request.
Control-flow nodes draw no strip at all — zero height is as constant as 30px is,
and a row of identical "doesn't produce output" bands would paper the canvas.

New: `preview/NodeResultStrip.tsx`, `preview/strip-metrics.ts`,
`preview/summarize-output.ts` (kind-agnostic, bounded at 72 characters,
following blob pointers into the server's excerpt map so an OcrResult
summarises its text rather than its `blobPath`), and
`preview/select-preview-output.ts` — the port selection shared by the strip and
the widget, so the card's one-line summary and the panel it opens cannot
resolve to different values.

**The constants were re-measured, not adjusted.** `ACTIVITY_BASE_HEIGHT` was
177 and carried a 120px allowance for a pane that actually rendered anywhere
from 0 to 200px; its own docblock admitted the number was "a deliberate
mid-point, not a universal fact". In Chromium every activity card on
`standard-ocr` decomposes to exactly 58px of chrome — six cards, one to five
rows, no variance — so the base is now 58 + the 30px strip, and an
`azureOcr.extract` card estimates at 204px instead of 293px. The estimate is a
fact now rather than an average.

**Verified where jsdom cannot go.** Every card's `offsetHeight` and
`offsetWidth`, sampled before a Try, twenty-four times during it, and after.
0px drift in both axes on all fifteen nodes. An earlier run of the same
measurement caught 5px on the one node that failed, which is the failure chip
appearing, not the strip — recorded here rather than quietly kept out of the
number.

### Two defects found while fixing it

**`evicted` was reachable during a live run.** `noOutputReasonForNode` returned
it for any `succeeded`/`skipped` node with no cache row, regardless of whether
the run had finished — so in the 250ms gap between a node going green and the
worker writing its row, the card said *"This step's cached output has expired.
Re-run to repopulate it."* That blames a TTL that had not expired and offers a
Re-run that would cancel the run producing the very output being waited for.
`PreviewWidget`'s docblock had said since it was written that the alert "must
only appear in replay mode"; nothing enforced it. **This is how item 10 was
reproduced on a first, non-replay Try.** There is now an `awaiting-cache`
reason for that gap, and `evicted` requires a finished run.

Its copy is deliberately true in both readings, because a live run cannot tell
them apart — the row may be seconds away, or the run may be over and the row
never written. `RunStateContext` has no run-level status to distinguish them,
and "every node is terminal" is not derivable (a node in an untaken branch stays
`pending` forever). So the message says what is known and names the surface that
can settle it: re-open the run from history, which is replay, where the same
absence is classified as an eviction and offers the Re-run that works.

**The strip widened the card**, which is the same bug turned sideways and was
found by photographing the fix rather than by any of the 2,685 tests. A node
card is shrink-to-fit, so a child with `width: 100%` still offers its content as
its preferred width: the upload card measured 200px at rest and **606px** the
moment its DocumentRef landed, covering the node beside it. Auto-layout never
sees that axis — it estimates width per node *type*, not per value. Fixed with
`width: 0` + `minWidth: 100%`, pinned by the same table that pins the height.

That measurement also killed the kind label. On the 200px upload card
"DocumentRef" took so much of the one line that the DocumentRef itself rendered
as "seedd…" — labelling a value with something the card already shows on its
output port pill, at the cost of the value Alex asked to see. The strip names
the port instead, and only when a node has more than one.

### A third `@infra` failure, found not caused

`tier3-try-preview` fails, and it failed identically at `ebd52e1b` — checked by
running it at the previous commit, where it dies *earlier*, at the wire peek
(line 201), before it ever reaches the node preview. So the known-broken
`@infra` set is **three**, not the two recorded above. Its later assertion is
also unsound on its own terms: it reloads the editor and then expects a preview,
but `RunStateProvider` starts every mount with `activeRunId = null`, which the
strip correctly reports as *Not run yet*. Item 33's problem, recorded here so it
is not rediscovered.

### Screenshots

Shot 1 became **one wide frame**. It was two tight crops, and the capture
script's own comment said why: a wide frame "is unreadable right now because the
preview panels grow the cards mid-run and they overlap their neighbours". That
was item 9. Shot 11 — which hunted for the worst overlap and framed it — now
runs the same search as an **assertion** and fails loudly if two cards ever
overlap again; `12-BEFORE-try-reflow-overlap.png` is kept as the before-picture
and never re-taken. Shot 18 is new: the same card at rest, after a run, and with
the popover open.

## Wave G — item 33, the `@infra` tests · 2026-08-09

Alex: *"just fix the tests."* Three were failing out of eleven. The useful part
is that the three causes had nothing in common, and only one of them was a
mistake in the test's own logic.

**`tier3-dynamic-node-run` (both tests) — configuration, exactly as diagnosed.**
The worker had no `PLATFORM_API_KEY`, so `dyn.run` refused in about 50ms before
it ever reached the sandbox. Set in `~/.config/bcgov-di/temporal.env` — the
loader's first source, ahead of the repo-root `.env`, so it survives a restart —
and both went green. What the fix left behind is the reason it took a worker-log
read to find: Temporal reports the activity's cause to node-statuses as a bare
`Activity task failed`, so the assertion showed nothing. The spec's failure
message now names the prerequisite and where to set it, because the next person
will hit this and will not have the log open.

**`tier3-dynamic-node-security` 14.11 (the grant half) — the test was timing
DNS.** It granted `blocked.example.com` and expected the fetch to fail fast.
Inside the runner container, a lookup for a non-existent public host takes
**8.1 seconds** — six search domains and corporate forwarders — which overruns
the runner's own 5s timeout, so the result came back `timedOut: true` /
`exitCode: -1`, a failure that says nothing whatever about permissions. The
assertion was sound; its clock was somebody else's network.

Rewritten as an A/B on **one script and one host**, a closed loopback port
(`127.0.0.1:9`): denied without `allowNet`, permitted with it, ~40ms either way,
no resolution involved. Deno gates loopback exactly as it gates any other host,
so the gate under test is unchanged — only the environmental dependency is gone.
Manual step 14.11 told a human to do the same misleading thing ("add the host to
`allowNet` → same script succeeds") and was corrected with the measurement.

One detail worth keeping: the first attempt at the A/B asserted a non-zero exit
for the denied half and failed, because the shared script *catches* its own
error. The denial surfaces in the returned value, not the exit code. The
preceding test covers the uncaught form, so the pair now covers both.

**`tier3-try-preview` — pre-existing, and unsound as written.** It reloads the
editor to get a deterministic post-commit cache fetch, which is right, but the
reload costs the run and nothing paid it back: `RunStateProvider` starts every
mount with `activeRunId = null` and restores nothing, so the result strip
correctly reported "Not run yet" for ever. The fix is the product's own answer —
re-open the run from **Run history**, which is what the `awaiting-cache` copy
written in Wave F already tells authors to do. Side benefit: that surface had
**no** e2e coverage at all, and now has some.

Result: `RUN_INFRA=1 PLAYWRIGHT_SKIP_DB_RESET=1 npx playwright test
tests/e2e/workflow-builder/ --grep "@infra"` → **11 passed**, three consecutive
runs, no flake.

### What running the default suite next turned up — and its own fix

The `@infra` set is opt-in; the *default* one is supposed to be the hermetic
green one. It was not: **12 tests failing** on this branch, across
`tier2-validation`, `tier2-typed-io`, `tier2-sources`,
`tier2-coupling-invariants` and all five of `tier3-agent-stubbed`. Proven
pre-existing by stashing this wave's changes and re-running — the same tests
failed without them.

Now green (`ef977a50`): **65 passed**, and the `@infra` eleven still pass with
the shared helpers changed. Eleven of the twelve were **specs describing a UI
this batch had deliberately changed**, which is the finding: the UX work shipped
and nobody re-ran the suite against it. One was a real defect.

**The real one — the orphaned-delete toast outlives the step it describes.** It
says *"Deleted `<node>` — N variables lost their source"* and its Undo link
re-enters the same `undo`; nothing retired it when the author undid by any other
route, so for the rest of its 8-second life the sentence was false and the link
would have rewound a **different, unrelated** edit. It also sits directly over
the top bar's right-hand controls, which is how a test found it at all —
`topbar-more-button` was pointer-intercepted. Both the `undo` and `redo`
wrappers now hide it; they are the single choke point for the top-bar buttons,
the hotkeys and the canvas. Three unit tests.

The eleven stale ones, and what had actually moved under them:

| Spec | What moved |
|---|---|
| `tier3-agent-stubbed` (5) | Item 21 gated the chat to `/workflows*` (*"the chat only appears where it works"*, `5903a414`) — the shared setup still landed on the app root, where there is no icon. One test also asserted the standing header stop button item 26 deleted; send *becomes* stop mid-turn now, so it could never pass again. |
| `tier2-typed-io` (2) | The identifier retag (`b6b86d40`) gave both ends of the asserted hop a concrete `RequestId`, so auto-wire resolves it in the typed pass, not the name-match pass. Same wire, same producer — the provenance label is now the honest one. |
| `tier2-validation` (2) | The "valid" fixture stopped being valid once the kind taxonomy could see a `RequestId` feeding a `DocumentId` port; and a node badge now opens the drawer **node-scoped** (`Problems on <node>`, `83c036fe`). |
| `tier2-sources` (1) | Draft-save (`b76d651c`) moved semantic refusal from create to run, so the one-source-per-subtype rule is reported in the save response instead of a 400. Still enforced, still asserted, different surface. |
| `tier2-sources` (1) | **Wave F's own result strip** covers the geometric centre of a *short* card: a `source.upload` card is 38.6 screen px tall at a two-node fitView and the strip's top edge sits 0.3px above the centre, so the shared click helper opened the preview popover instead of selecting the node. `bringNodeIntoClear` now aims above the strip when the strip covers the centre. |

That last row is worth keeping: item 9 was measured to 0px in both axes and still
changed where a click lands. Geometry that does not move can still move what is
*under the cursor*.

One stale claim was corrected while in there: the validation spec's header said
`POST /api/workflows` rejects error-severity configs. True when written, false
since draft-save — create now refuses only a config the store cannot physically
hold (`assertConfigStorable`), and the refusal moved to the run path
(`assertConfigRunnable`). So an on-load red fixture *is* buildable now; it just
isn't built.

**Left undone deliberately:** a *live* orphaned-delete toast still covers the top
bar for its 8 seconds, and because `<Notifications position="top-right" />` is
global it does the same to the app header on every page. Fixing that means
deciding where toasts live app-wide — a design call, not a bug fix. The
recommendation is a top offset that clears the header and the page action bar.

## Where the batch stands at close

**32 of 33 items done.** The one open item is not code that anybody failed to
write:

- **Item 20** (the colour vocabulary) — deferred by Alex until the rest landed.
  The measurement is done and the recommendation is written; it needs a session
  of its own because it changes how every saved workflow looks.

Item 33's *test* half is done (above). Its remaining half is a **cold-setup walk
of 14.1–14.6 by a person who has never built this repo** — that needs a name,
not a commit, and the name is Alex's to give.

Five earlier decisions — items 8, 9, 13, 23 and 20 — were ruled on during the
session and are recorded in their own entries above.

## Discovered during implementation — not on the reviewer's list

Two real defects surfaced that nobody reported. Neither was fixed, because
neither is in scope for the item that found it, and inventing work is how a
review batch stops converging. Both are Alex's call.

**The settings drawer floods the undo stack.** The drawer's Description
`Textarea` and Version `TextInput` call `setConfig` on *every keystroke*, so
typing one word pushes roughly eight entries onto the 50-deep graph undo stack —
meaning eight Ctrl+Z presses to back out one word, and a stack that forgets real
graph edits after a couple of sentences. Every other text field in the feature
(`ConstantValueField`, the ctx name and default-value fields) commits on blur
specifically to avoid this. Found while fixing item 1.

**The cache-evicted alert fires during a live run, contradicting its own spec.**
`PreviewWidget`'s docblock states that the recovery alert "must only appear in
replay mode", but the code branches on `copy.offersRerun && hasRun` with no
replay check — which is exactly how item 10 was reproduced on a first,
non-replay Try. So the preview row was very likely never written rather than
TTL-evicted, which is why the new copy says "isn't in the preview cache" instead
of "has expired": the expiry claim is not safe. Found while fixing item 10;
`PreviewWidget.tsx` belongs to batch 10, which is where it would be fixed.

---

## The six decisions

Four were written overnight and filed to the review queue as one item with four
separate rulings. **Two more were added on 2026-08-08** — items 9 and 13, which
were on the batch list as fixes and turned out to be forks once the code was
read. Each leads with the question and a recommendation; the full evidence is in
[DECISIONS/](DECISIONS/). Most turned up findings that change what the work *is*,
not just how to do it.

### Item 9 — the Try reflow is a fork, not a fix

[09-try-reflow.md](DECISIONS/09-try-reflow.md)

The mechanism was measured rather than described. `estimateNodeHeight` makes no
allowance for the preview pane — at rest there isn't one — dagre separates ranks
by `DEFAULT_NODESEP = 60`, and the pane caps at `PREVIEW_MAX_HEIGHT_PX = 200`.
So a card grows **up to 200px into a 60px gap**, and does it twice: once for the
120px loading skeleton, again when real content replaces it. That is the "strange
way" in the transcript — cards don't merely get bigger, they get bigger at two
different moments, per node. Despite its name, `NodePreviewOverlay` renders
inline in the card body, not as a positioned layer.

Both options the checklist names cost something real: reserving the space makes
every graph permanently ~200px taller per output-producing node in the state
authors spend most of their time in, and growing downward-only trades reflow for
occlusion while still failing the item's own acceptance line. Recommended
instead: a fixed-height result strip in the card with the full preview in
`WirePeekPopover`, which already renders this widget from the same batch-preview
query — a presentation change, not new plumbing.

### Item 13 — the replay chip is the only thing explaining a dead editor

[13-replay-mode.md](DECISIONS/13-replay-mode.md)

The badge already carries three states, one of them a sentence saying you are
looking at the *current* graph for an *older* run — the single most important
thing the editor can tell you at that moment, rendered in a control sized for a
word. Meanwhile replay's real effect is scattered across controls that just go
quiet: Undo and Redo disabled, and config edits dropped by `if (isReplay) return;`
in three handlers. An author in replay can drag a node, type in a field, press
Ctrl+Z, and nothing happens — with no explanation except the chip they read as a
stray tag.

Recommended: a banner over the canvas rather than a region in the top bar,
because a top-bar region spends exactly the real estate item 14 just reclaimed.
It should be built *after* batch 11 merges — same file, same region.

### Item 8 — Try and Run are the same feature

[08-try-vs-run.md](DECISIONS/08-try-vs-run.md)

Both top-bar buttons call `setRunDrawerMode` and open the **identical**
`RunWorkflowDrawer`, differing only in which of its two existing tabs is
pre-selected. The reviewer's *"even if I choose one, I still have the option to go
to the other"* is literally accurate — the other button's destination is one
tab-click inside the surface the first button opened.

There *is* a real difference, but not the one the labels imply. Try posts to
`/tries` and Run to `/runs`; both reach the same `startLineageRun` handler with
one differing argument, a server-side `RunTrigger` stamp of `"try"` vs `"api"`.
That stamp decides **disposability**: every run start cancels in-flight runs
stamped `"try"`, so a Try is killed by your next click while a Run always
completes. Nothing in the UI says so. Everything a user would guess is different
— real execution, the saved version, the block gate, run history — is identical.

Recommended: one `Run…` button over the existing tabbed surface, tabs renamed to
name where the answer appears rather than a fictional strength of commitment.

### Item 20 — the premise, settled

[20-colour-vocabulary.md](DECISIONS/20-colour-vocabulary.md)

The legend renders **exactly 13 rows** — 4 wire, 7 family, 2 ring-modifier — so
"12 to 13" is precisely what was on screen. But they are not 13 colours. The
full canvas vocabulary is **32 distinct rendered hex values carrying about 24
decodable meanings**, plus 37 icon glyphs. Right about the number counted, wrong
about what it was, and *understating* the real load.

The accessibility point was measured rather than asserted, by simulating
dichromatic vision (colour blindness where one of the three cone types is
missing) on the hexes the app actually renders — the theme overrides Mantine's
defaults, so reading the palette file would have given wrong answers. Under
deuteranopia (no green cone) the Untyped grey and References teal score 8.6 on
a perceptual-difference scale at a 1.02:1 luminance ratio — literally the same
dot. The node accents are worse: activity blue and childWorkflow purple score
0.6, effectively identical.

Three genuine drifts also surfaced: two greys for one sequence wire, two reds
for one error concept, and blue meaning both "any data" and "document" in the
same legend.

### Item 23 — the code is readier than assumed

[23-bcgov-models.md](DECISIONS/23-bcgov-models.md)

The backend is **already APIM-aware** — it normalises the base URL, uses
deployment-based URLs, and forces the legacy `chat/completions` endpoint because
proxies often forward only that one. So re-pointing at a BC Gov deployment is a
three-environment-variable config change, not code. The one code-shaped blocker
is that the frontend model list is six hardcoded strings and the default is
simply the first array element — GPT-5.4 wins because it is first, not because
anything chose it.

The store answers the organisational half only partly, and the artifact says so:
GPT is effectively the only family lit up, Claude is blocked on region, and the
only concrete deployment the corpus names belongs to another ministry's
workload. What deployments *this* project can call is not recorded anywhere —
it needs one question to one named person.

### Item 33 — seven of the nine steps are already machine-verified

[33-infra-test-steps.md](DECISIONS/33-infra-test-steps.md)

The steps the reviewer skipped are not nine unverified steps. 14.1–14.6 are covered
by the dynamic-nodes controller, service and repository specs and run on every
CI build — including the exact criteria the plan states in prose. 14.11–14.13
are covered by an `@infra` e2e suite that exists, passes, and is excluded from
every default run because `playwright.config.ts` drops the tag unless
`RUN_INFRA` is set.

What automation does not cover is whether the documented commands work for a
second person on a machine that has never built this repo — which is what bit
the reviewer three separate times, including the demo 404 that turned out to be an
unseeded database rather than a broken link. So the recommendation inverts the
ask: run the two suites yourself, and give a developer the cold-setup walk,
choosing someone who has *not* set the repo up, because anyone who has will
silently skip the steps that break.

---
## Wave H — item 20, the colour vocabulary · 2026-08-09

Alex, after the batch-four report: *"ok, can do #20 now, i also like your idea
of toast moving down below the header."* Two asks in one line, and they turned
out to be connected — the toast fix broke the canvas, and the canvas e2e is what
caught it.

The ruling and everything the build learned that the analysis had not are
recorded in [DECISIONS/20-colour-vocabulary.md](DECISIONS/20-colour-vocabulary.md).
This is what shipped.

### The port palette: seven families → five, each with a shape

The reviewer counted the legend — *"there are like 12 to 13 of them"* — and the
legend really did render 13 rows. The canvas underneath was worse: **32 distinct
hex values carrying about 24 meanings**.

Seven port families became **five**, and the merge is by what the data *is*:

| Family | Was | Now | Shape |
|---|---|---|---|
| Documents & files | blue | `#5595D9` blue | filled circle |
| Content taken out of a document | Segment green **+** OcrResult violet | `#6741D9` violet | filled square |
| Judgements about a document | yellow | `#FAB005` yellow | diamond |
| Pointers — IDs and lookups | Identifier cyan **+** Reference teal | `#0CA678` teal | vertical bar |
| Untyped / wildcard | grey | `#605E5C` grey | hollow circle |

**Why the merge was forced.** Simulated with the Viénot 1999 dichromat
transform and scored with CIEDE2000, on the values actually rendered:

| Pair, as shipped before today | Deuteranopia | Protanopia | Luminance ratio |
|---|---:|---:|---|
| References teal vs Untyped grey | **ΔE 5.2** | 11.0 | **1.06 : 1** |
| Documents blue vs Identifiers cyan | **ΔE 6.4** | 8.5 | 1.13 : 1 |
| Identifiers cyan vs Untyped grey | 9.9 | **ΔE 6.9** | **1.03 : 1** |

Anything under ΔE ≈ 11 reads as one colour, and those pairs have no brightness
difference to fall back on either — grey and teal simulate to `#9E9E9C` against
`#9E9E89`. They are the same dot. The five that shipped hold a worst pair of
**ΔE 14.2 under both deficiencies**.

**The shape is the half that makes the merge honest.** Shipping the merge alone
would have removed distinctions without replacing them. Each family draws a
different silhouette on the port dot, so a reader who cannot separate two hues
can still separate two ports. None of the five uses `clip-path`, deliberately:
`clip-path` clips `outline` and `box-shadow`, which are exactly what draw the
array double-ring and the amber needs-a-source ring. The diamond is a rotated
square for the same reason — and it carries the side's own translate in the
composed transform, because xyflow's `.react-flow__handle-left`/`-right` classes
already set one and an inline `transform` replaces rather than composes with it.
The "+" invitation counter-rotates inside a diamond, or it renders as a ×, which
means the opposite of what that glyph is for.

**What it costs, said plainly.** An `OcrResult` and a `Segment` are both violet
squares now. You cannot tell them apart by dot. The kind literal is still on the
handle tooltip verbatim, on the per-port pill row, and in the validator's
refusal. Colour went from "the exact type" to "the neighbourhood".

### Node accents: thirteen → five, and this one needs Alex's eye

The decision doc asked whether to fold the node accents in and I recommended
yes. Measured, they could not be fixed any other way:

| Accent pair, before | Worst ΔE | |
|---|---:|---|
| activity "green" vs `map` | **0** | the same hex `#22c55e` — which ALSO painted the map-body group outline. One colour, three meanings. |
| activity violet vs `childWorkflow` | **0.2** | protanopia |
| activity indigo vs activity violet | **0.7** | |
| activity blue vs `childWorkflow` | **0.7** | deuteranopia |
| `humanGate` red vs `join` green | **8.5** | opposite meanings |

Fourteen pairs under ΔE 11 in total. Thirteen hues cannot be pulled apart, so
re-picking the hexes was not an option — the count had to come down. It came
down along the axis the canvas already draws: **what kind of step this is**.

| Role | Colour | Which nodes |
|---|---|---|
| Does work | `#64748B` slate | **every activity, and every source** |
| Decides where to go next | `#D97706` amber | `switch`, `pollUntil` |
| Fans out or back in | `#6B21A8` purple | `map`, `join`, and the map-body group outline |
| Waits for a person | `#B91C1C` red | `humanGate` |
| Runs another workflow | `#065F46` green | `childWorkflow` |

Worst pair **ΔE 12.9**. A coloured card is now exactly a card that does
something structurally unusual.

**The part to look at before agreeing:** this collapses the seven activity
*category* accents into one. Every OCR / validation / storage / transform card
is the same slate. The category is still carried by the icon (31 distinct
glyphs), the card's own label, and the palette sidebar's grouping — but it is a
visible change to every saved workflow, and it is the one judgement here that is
taste as much as measurement. Reverting to per-category accents is a one-line
change in `catalog-utils.ts`; the collisions come back with it.

### The two codes are measured separately, on purpose

Port dots say what the DATA is; card borders say what the STEP is. Ten
mutually-separable hues do not exist under dichromacy, so each code is scored
against itself. They are different elements, in different places, never asked to
be compared. Stated rather than assumed, because the cross-code pairs *are*
close in places and a future reader will otherwise think it was missed.

### Seven copies of the palette, and the drifts they had already caused

§1 of the decision doc found three drifts. Wiring the change up found four more
copies of the palette nobody had counted:

1. **Two greys for one wire** — the legend sampled `gray-5`, which the app theme
   overrides to `#C6C5C3`, while the real sequence wire is `#9CA3AF`.
2. **Two reds for one concept** — the error *wire* read `var(--mantine-color-red-6)`
   → the theme's dark `#822623`; the error *handle dot* was a hardcoded
   `#e03131`. Now one exported `ERROR_STROKE`, imported by both.
3. **Blue meaning two things** — the legend's "Data flows — colour = data family"
   sample was painted `blue-6`, which is also the Documents family colour. It is
   now drawn as a run of all five family colours, which is what that sentence
   looks like.
4. **`dynamic-nodes/signature-preview-helpers.ts`** — a hand-written kind→colour
   map that had `Segment` teal where the registry says violet and
   `ValidationResult` green where it says yellow, plus five keys (`OcrPage`,
   `OcrLine`, `OcrToken`, `QualityReport`, `ReferenceData`) that are not registry
   kinds at all and could never match anything. Deleted; reads the registry now.
5. **`sources/source-catalog-utils.ts`** — a private copy of the activity
   `COLOR_TOKENS`, mapping the source subtypes onto two of the retired hexes.
6. **`sources/SourceNodeRenderer.tsx`** — its own `handleBackground`, which once
   the palette became literal would have painted a source's output dot a
   different colour from an identical port anywhere else.
7. **`WorkflowEditorCanvas.tsx`** — arrowhead marker colours re-declared "to
   match `WorkflowEdge`'s palette", already not matching it.

The root cause in every case is the same: `var(--mantine-color-<token>-6)`. The
app theme overrides Mantine's `blue`, `gray` and `red` scales, so code written
against stock Mantine paints one colour and reads another. **The five family
values are literal hexes now**, in one file, with a unit test that fails if any
of them turns back into a variable, and a registry test that fails if any kind
declares a sixth family token.

`ACTIVE_STROKE` and `TAKEN_STROKE` were the last two and are now literals as
well. `ACTIVE_STROKE` is the same value as the Documents family — a collision on
paper that is not one in practice, because an active wire is the only thing on
the canvas that *moves*, and motion is a carrier no colour deficiency touches.
Written down in the source rather than left to be rediscovered.

### The toast, and the regression it caused

Separately ruled the same message: *"i also like your idea of toast moving down
below the header."* Measured in Chromium at 1280×720 and 1280×800 — identical at
both, all of this chrome being fixed-height:

```
app header (.mantine-AppShell-header)   0 →  65
workflow editor top bar                65 → 112
toast, before this change              16 → 110   ← covers both
```

So `top: 120px` — the bar's bottom plus an 8px gap.

**And that broke the canvas.** Mantine's `Notifications` root is a 440px-wide
`position: fixed` box that exists whether or not anything is in it. At 16px it
overlapped only the app header; moved down to clear the action bar it lands on
the canvas, and an *empty* toast container was swallowing every node click and
wire hover in the top-right quadrant. Twenty-six e2e tests went red. The fix is
`pointerEvents: "none"` on the container and `auto` on the notifications inside
it, which the toasts need for their close button and Undo link.

Worth naming the sequence: **2,706 unit tests and a clean type-check all passed
with that bug in.** Nothing that runs in jsdom can see a fixed-position overlay,
because jsdom runs no layout. The e2e found it in one run.

### Verified

- frontend unit — **2,706 passed / 213 files** (up 20: the shape carrier, the
  five accent roles, the registry family guard, and the source-accent rebase)
- `@ai-di/graph-workflow` — **1,082 passed / 48 suites**
- default workflow-builder e2e — **65 passed**
- `RUN_INFRA=1` e2e — **11 passed**
- `tsc --noEmit` clean; `biome check src` clean (2 pre-existing warnings in
  `data/services/builder-fetch.test.ts`, untouched)

Stale assertions were rebased rather than deleted. Where a test used to say "these
two kinds have different colours" and they are now deliberately one family, it
says that instead, and asserts the kind literal as the surviving distinction.
Two tests that compared a helper against the map it read — `resolveKindColor(k)`
vs `KIND_COLOR_TOKENS[k]`, which passes no matter what either says — were
rewritten to assert the thing that actually matters: that the signature preview
and the canvas agree.

---
