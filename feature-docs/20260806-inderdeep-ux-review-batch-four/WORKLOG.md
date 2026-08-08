# Workflow designer — batch four, worklog

**Branch `feature/visual-workflow-builder` · started 2026-08-07**

What was actually done, in the order it was done, for the 33 items in
[CHECKLIST.md](CHECKLIST.md) from Inderdeep Singh's 2026-08-06 UX walkthrough.

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

A residual went to Inderdeep rather than being decided here: white on the
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
What Inderdeep hit was a seeding-state problem on his machine — the seeder opens
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

## Discovered during implementation — not on Inderdeep's list

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

## The four decisions

Written overnight, filed to the review queue as one item with four separate
rulings. Each leads with the question and a recommendation; the full evidence is
in [DECISIONS/](DECISIONS/). Three of the four turned up findings that change
what the work *is*, not just how to do it.

### Item 8 — Try and Run are the same feature

[08-try-vs-run.md](DECISIONS/08-try-vs-run.md)

Both top-bar buttons call `setRunDrawerMode` and open the **identical**
`RunWorkflowDrawer`, differing only in which of its two existing tabs is
pre-selected. Inderdeep's *"even if I choose one, I still have the option to go
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

The steps Inderdeep skipped are not nine unverified steps. 14.1–14.6 are covered
by the dynamic-nodes controller, service and repository specs and run on every
CI build — including the exact criteria the plan states in prose. 14.11–14.13
are covered by an `@infra` e2e suite that exists, passes, and is excluded from
every default run because `playwright.config.ts` drops the tag unless
`RUN_INFRA` is set.

What automation does not cover is whether the documented commands work for a
second person on a machine that has never built this repo — which is what bit
Inderdeep three separate times, including the demo 404 that turned out to be an
unseeded database rather than a broken link. So the recommendation inverts the
ask: run the two suites yourself, and give a developer the cold-setup walk,
choosing someone who has *not* set the repo up, because anyone who has will
silently skip the steps that break.

---
