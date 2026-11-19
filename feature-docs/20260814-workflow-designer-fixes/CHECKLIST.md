# Workflow designer — review fixes, 2026-08-14

Two independent reviews arrived the same day. They are kept apart here and in
[`FIXES.md`](FIXES.md), the illustrated write-up, so each reviewer can read only
their own items.

| Reviewer | Items | Source |
|---|---|---|
| **inderdeepsinghgill** (senior UX designer) | I1–I5 | [`source/inderdeep-note.txt`](source/inderdeep-note.txt) + two mock-ups |
| **dbarkowsky** (developer) | D1–D34 | [`source/dylan-workflow-review.pdf`](source/dylan-workflow-review.pdf), text decoded to [`source/dylan-review-extracted.txt`](source/dylan-review-extracted.txt), 6 embedded screenshots extracted alongside |

dbarkowsky's numbering follows the numbered steps of
[`docs-md/workflows/GALLERY.md`](../../docs-md/workflows/GALLERY.md), which is
the walkthrough he was working from; the step number is given on each item.

Status key: `[ ]` not started · `[~]` in progress · `[x]` done ·
`[-]` closed without a code change (answer / not-a-defect — the reason is
written into the item).

---

# inderdeepsinghgill — chat agent and error cards

### I1. [x] The agent still doesn't answer for him
**Fixed. Three causes.** (1) The assistant exists only on this branch: `develop` has no agent-chat code, so a build from it cannot answer. (2) The drawer collapsed "the request failed" and "the server has no model" into one branch labelled "Server default model", with the composer left live; those are opposite facts. It now has four states: loading · unknown (request failed, composer stays live) · **unconfigured** · ready. The unconfigured state names the missing variables, points at `docs-md/workflows/AGENT_SETUP.md`, and disables send; the reason opens on hover and on keyboard focus, is the button's accessible description, and Enter sends nothing while sending is disabled. (3) A stale generated Prisma client returned 500 on every send that morning; the request logger records those as 201, which is filed as its own defect.
**Area:** Environment / workflow agent
**What he said:** *"The agent is not working for me, as was the case earlier."*
Same symptom as his previous round, which is why every other observation in his
note comes from screenshots rather than from live use.
**Expected:** Establish whether this is his credentials/endpoint or a real
failure path in the agent, and either fix it or give him the exact setup step.

### I2. [-] Send button doesn't become a stop button while a reply is in flight
**Answered — already correct in the app; no code changed.** The composer's send button turns into the stop button while a reply is in flight; it is the only stop control in the agent chat, and the drawer header holds history, new conversation and close. The snapshot he read was most likely the walkthrough's own stop 16 picture, which showed an older panel with a square icon at the top; that picture is re-shot.
**Area:** Frontend — workflow agent chat composer
**What he said:** *"From the snapshots it seems like the stop icon is still at
the top. I believe we discussed the send button transitioning to stop when
inflight."*
**Expected:** While a response is streaming, the send arrow itself turns into a
stop control; no separate stop affordance at the top of the panel.

### I3. [x] The bottom strip of the chat composer looks off
**Done — composer rebuilt to his mock-up.** The message box is on its own line, then one footer strip: attach `+` at the left (was a paperclip), the model name and tier beside it, send/stop hard right. With more than one model the name is a menu with a chevron, listing each model with its descriptor beneath and a check on the selected one; with one model it is a plain label. **Nothing from the mock-up is hardcoded:** name and tier are derived from the model family, and a deployment whose model matches no known family shows its name alone rather than an invented tier. The tier is grey text at 6.5:1 contrast.
**Area:** Frontend — workflow agent chat composer
**What he said:** *"The bottom part of the chat ui looks off. How about this?"*
— with a mock-up: [`source/inderdeep-mockup-composer.png`](source/inderdeep-mockup-composer.png).
The mock-up puts the attach `+` at the far left, the model name and its tier
("Sonnet 4.5 · Balanced") immediately after it as an inline dropdown trigger,
and the send button at the right. The open menu shows each model with a
one-line descriptor underneath — Fast / Balanced / Deep reasoning — and a check
against the selected one.
**Expected:** Composer footer rebuilt to that layout.

### I4. [x] Error chip — icon and text aren't aligned
**Fixed — the × sat 0.71px low, and moves up by exactly that.** Mantine's Badge centres the icon's box and the label's line box on one row, but neither paints where its box says: Chromium rounds BC Sans Bold's ascent and descent to whole pixels, and paints the 11px icon from a whole pixel. The nudge is computed from the font's own metrics, and on the rendered chip at 1×, 2× and 4× the two centres are within 0.01px. The glyph moves, not the label, so this chip's text stays in line with the card's text-only chips (`DYN`, `Deleted`, `ENTRY`, the counts).
**Area:** Frontend — workflow builder node error chip
**What he said:** *"Nitpicking but in the error chip, the icon and the text
aren't aligned."*
**Expected:** Icon optically centred against the first line of the label.

### I5. [x] Error card uses a destructive-red CTA, and the label overstates what it does
**Fixed and answered — it re-runs the whole workflow from the start.** The handler fetches the run's original input and starts a new try from the entry node; there is no re-run-one-step endpoint, so "Try again" would be untrue and the label stays. The card states the scope in a grey line at 5.4:1 contrast. Restyled to the BC DS inline-alert pattern: a 1px danger border from the theme (no hex), the alert-circle icon instead of the warning triangle, and an outlined button instead of filled red. The cache-evicted alert's Re-run is outlined too, carries the same scope line, and its variant type no longer permits `filled`. Everything else red in the preview and run panels is a CTA-less alert, a status badge, or a genuinely destructive Delete/Remove/Ungroup, and is left alone.
**Area:** Frontend — workflow builder preview error card
**What he said:** *"In the error message, the CTA button is in red. Normally,
red button means a destructive action whereas re-run workflow isn't
destructive."* He points at the B.C. Design System
[inline alert component](https://www2.gov.bc.ca/gov/content/digital/design-system/components/inline-alert)
as the pattern to follow, and mocks it up in
[`source/inderdeep-mockup-error-card.png`](source/inderdeep-mockup-error-card.png).
Second half of the item is a product question: *"Not sure if clicking Re-run
workflow would re-run only this step or complete workflow from start. If only
this step, maybe 'Try again' might be better."*
**Expected:** Restyle to the inline-alert pattern (no destructive red on a
recoverable action), and make the button label match its real scope.
**Key file:** `apps/frontend/src/features/workflow-builder/preview/NoOutputNotice.tsx`
(the **Re-run workflow** button).

---

# dbarkowsky — walkthrough review

## Blockers — the walkthrough could not be finished

### D1. [x] Standard workflow fails at the Poll OCR step (GALLERY step 9)
**Fixed — the model, on his path, and the error message hid it.** He ran Standard OCR Workflow from the Upload page, which starts the run with the model picked there. This branch's template gave Prepare a typed-in `sdpr_synth_test`, which Submit used, while Poll read the upload's model; any other model was submitted under one model and polled under another, and Azure answered the poll with 404. Every failed step also reported Temporal's envelope message, "Activity task failed", instead of the activity's own; it now shows the activity's message. Prepare, Poll and Extract all read the run's `modelId`, a declared run input defaulting to `sdpr_synth_test`; a template test and a workflow run against a model-aware fake Azure guard it. Two more defects from the same template rework are fixed: Poll's output port (the activity returned `response` where the catalog declares `ocrResponse`, so `ocrResponseRef` was never written) and Poll's bare 404, which now names the request id and the model. Checked on his path: the Upload page, model `prebuilt-layout`, real Azure; the run completed in 11 seconds.
**What he said:** *"Could not complete because standard workflow is failing at
Poll OCR step. What has changed since the develop branch that would affect
this?"*
**Consequence:** Steps 9 (reading results) and 10 (run history) went untested.
**Expected:** Reproduce, find the regression against `develop`, fix or explain.

### D2. [x] Step 10 blocked by the same failure (GALLERY step 10)
**Unblocked by D1.** An uploaded document's run is followed on the **Documents** page; the editor's Run history lists the runs started from the editor. A developer with no Azure account can set `MOCK_AZURE_OCR=true` in the root `.env` to walk steps 8–10, and a stale generated Prisma client, which fails a run at its first step, is cured by `npm run db:generate`.
Rolls up into D1; kept as its own line because it is a separate unverified step
of the walkthrough.

### D3. [x] Publishing a custom step fails — deno-runner unreachable (GALLERY step 14)
**Fixed.** The message is built where the failure happens, with the URL demoted to a `details` field and a warning log: a local runner that is not up says the custom-node checker is not running and gives the command to start it; a deployed sidecar says retry, then escalate. A dedicated response DTO is wired into both service-unavailable decorators. In the editor, " — see error markers" is appended only when markers exist, and the failure raises a notification and a persistent alert with **Show technical details**. The walkthrough now says to start the deno-runner. Verified by stopping the runner container.
**What he said:** screenshot
[`source/dylan-publish-failed.png`](source/dylan-publish-failed.png) —
*"Publish failed — Failed to reach deno-runner /check at
http://localhost:9099 — see error markers."*
**Diagnosis to confirm:** the deno-runner is a separate process in the stack and
his was not running. Nothing in the walkthrough tells the reader to start it,
and the error names an internal service rather than saying what to do.
**Expected:** Walkthrough gains the prerequisite; the error message tells a
human what to start.

### D4. [x] No credentials for the assistant (GALLERY step 16)
**Answered and fixed.** Azure OpenAI through the BC Gov AI Hub APIM proxy, the same subscription the OCR enrichment uses; four environment variables; no self-serve: Alex hands out the key, and it goes in the root `.env`, the only env file the backend reads. **The backend no longer dies when they are unset:** an unconfigured environment boots with a visibly disabled assistant, and `GET /api/agent/models` returns the missing variable names, never values (tests assert it). `.env.sample` lists the four with empty values, and `docs-md/workflows/AGENT_SETUP.md` is linked from the manual test plan and the docs index.

**Deployment:** backend-services gets the four variables from docker-compose, the kustomize base (configmap, secret and deployment), the instance-template overlay, the deploy workflow and script, and the rotation script, each optional, so an instance without a key boots with the assistant disabled. **A shared secret was rejected on evidence:** `namePrefix` makes the secret name per-instance, so a rename would have to be coordinated across every instance, and `oc apply` does not delete the old secret, which would be left holding a live Azure key. The worker's secret also carries a platform key backend-services has no business mounting. Duplication is already this repo's pattern for the Document Intelligence and storage keys, and it does not drift because each of the three writers fans one value into both secrets in a single run. Validated with a real generated instance overlay, `kubectl kustomize` and `docker compose config`.
**What he said:** *"I don't think I have the credentials for this. Which
subscription is it meant to be using?"*
**Expected:** Documented answer — which subscription/endpoint the workflow agent
uses locally and how a developer gets access. Overlaps I1.

### D5. [x] Demo workflows are hard to obtain
**Done.** The walkthrough opens with a four-part **Before you start**: bring the stack up, seed the demos, read the demo names, and what each stop needs. **His API-key-and-ENVs step is obsolete:** the seeders read the root `.env` and try the keys the database could have been seeded with, and `npm run seed:demo-runs` names the group the demos are seeded into. Also covered: `npm run db:generate` (the generated client is gitignored, so `git status` shows nothing wrong while two unrelated-looking symptoms appear), and `MOCK_AZURE_OCR=true` in the root `.env` for a developer with no Azure account.
**What he said:** *"It should be clearer where the Demo workflows come from and
how to load them. I needed to find a separate file about seeding this separate
demo data, then figure out that I had to generate an API key in the app and
update some ENVs."*
**Expected:** One place, referenced from the walkthrough, that gets a developer
from clean checkout to seeded demos.

### D6. [-] The `Demo - Deleted` custom node was never seeded (GALLERY step 15)
**Answered — not a defect.** `demo-deleted-node` is seeded and then soft-deleted, deliberately, so the Part 14 demo workflow has a genuinely missing step for the canvas to draw. `GET /api/dynamic-nodes` excludes soft-deleted lineages by design, so its absence from the management page is correct. Two things made it read as a seeding gap: a stale generated Prisma client made that page 500 outright, and stop 15 never said the node is *supposed* to be missing there. The walkthrough now says it.
**What he said:** *"Appropriate name, because the Demo - Deleted custom node
doesn't appear to have been seeded."* The step is about what the canvas does
when a step goes missing, so with nothing seeded there is nothing to see.
**Expected:** Seed it, or rewrite the step so it produces the missing-step state
some other way.

## Bugs

### D7. [x] Typing in node config fields is very laggy (GALLERY step 7)
**Fixed.** Every free-text and number box in a step's settings keeps what is typed locally and writes it into the workflow once typing pauses or the box is left, through one `useDebouncedTextCommit` hook, so a keystroke no longer re-runs the auto-wire graph walk, rewrites downstream bindings and re-projects every card. The badge-sync effect returns the previous node array when nothing changed, the validation memo no longer depends on the live config, and the problem badges take their counts from the latest validation results, so they stay on screen while typing. Measured on the dev build, key press to painted frame, median per round: Node label 74–160 ms before, 5–6 ms after; a condition's typed value 52–193 ms before, 7–14 ms after; a group label, a poll interval and a keyword pattern 47–96 ms before, 6–9 ms after.
**What he said:** *"Typing in the field is very laggy. I suspect it's the same
problem as the HITL page, where updates are causing a lot of the page to
re-render when it really shouldn't if broken up."*
**Expected:** Keystrokes don't re-render the canvas; profile and scope the
update.

### D8. [x] Custom-step editor jumps the cursor to the end of the last line (GALLERY step 14)
**Fixed — both causes.** A stale-echo guard (`lastEmittedRef`) drops the debounced round-trip's late echo, and `CodePane` passes `defaultValue`, never `value`, so the editor owns its buffer while the author types and deliberate re-seeds (load, revert, a change of lineage) are pushed in imperatively. Select-all + delete no longer re-inserts the boilerplate. The editor mounts only once the step's script has loaded, so **Edit script** from the canvas holds the step's own code. Covered by browser tests of the caret and of Edit script opened from the canvas on a fresh load, and a unit test under React's StrictMode.
**What he said:** *"The editor occasionally forces the cursor to the end of the
last line. Maybe this is happening when it reloads? Makes it very frustrating to
type."*
**Expected:** Caret position survives whatever re-mount or revalidation is
firing.

### D9. [x] Dragging from the Segments output creates a run-order edge, not a data edge (GALLERY step 7)
**Fixed.** The drag's origin decides what it becomes: a drag begun on a data port completes as the data edge to the one input that can take its kind, or is refused, naming the candidates or saying the step has no data inputs. The same verdict applies wherever it is released on the target card — its run-order dot or its body; only on empty canvas does the drop open the "pick a step" list. His exact case refuses with: *"Run for each item" has no data inputs — it reads its values from workflow variables. To make it run after this step, drag between the two grey run-order dots instead.*
**What he said:** *"It's strange that connecting the Split Document to the Run
for Each Item nodes creates the edge between the order-of-operation connectors,
even if I start it from the Segments output."*
**Expected:** A drag begun on a data port completes as a data edge, or refuses —
it must not silently become a different kind of edge.

### D10. [x] Order-of-operations edges cannot be drawn by hand
**Answered and fixed — dot to dot they were always drawable; nothing was disabled.** Four reasons he could not find the gesture: on control-flow cards the dot's hover described *data ports*, on the connector that carries no data; on activity cards it named the dot without saying it can be dragged; hovering the outgoing dot opens the "pick a step" list over the space you would drag across; and letting go over the other card, rather than on its dot, drew nothing and said nothing. Every run-order dot now says *"Runs after — drag from here to another step's matching dot to make it run after this one. Order only, no data."*, beside the dot and never while that list is open; the list opened from a run-order dot repeats the sentence at its top. A run-order drag let go anywhere over another step's card gets what a drop on its dot gets: the wire, or the reason it can't be drawn.
**What he said:** *"Cannot seem to manually connect order-of-operations edges.
Is this intentional?"*
**Expected:** Decide and make it legible — either enable the drag, or make the
refusal say why.

### D11. [x] Restoring an old version just re-tags HEAD (GALLERY step 11)
**Fixed — he was right, and the consequence was worse than the symptom.** Restore moved the head pointer and created no version, and new versions are numbered `head + 1` against a uniqueness constraint, so the next save 500'd: restore made a workflow unsaveable. It now appends the old config as a new version in one transaction, audits both, and leaves the source row and its run counts alone; head moves to v3, and a save straight afterwards returns 200. Unsaved canvas edits are discarded by a restore, as its confirmation says: the editor reloads onto the restored version, so the next save builds on it. The toast reads "Restored v1 as v3 — The editor is on v3, a new version holding v1's steps. v1 is still in the history."
**What he said:** *"It did not appear to bring back the old version as a new
version in the UI as the instructions suggest. It looks like it just tags it as
the HEAD."*
**Expected:** Behaviour and documentation agree; if restore really does create a
new version, the UI has to show that it did.

### D12. [x] Dynamic-nodes empty state renders two plus symbols
**Fixed.** The literal `+` is gone and the button names its object: **"Create your first custom node"**; the bare phrase was a dangling fragment for a screen reader. The file's header comment is corrected too. The before/after frames in FIXES.md are intercepted into the empty state, because the seeded group owns the custom node the Part 14 demo depends on.
**What he said:** screenshot
[`source/dylan-double-plus-button.png`](source/dylan-double-plus-button.png) —
the button reads **`+ + Create your first`**. An icon prop and a literal `+` in
the label.

### D13. [x] Simplified view toggle distorts the layout
**Fixed — toggling reverted the workflow to the raw server copy.** `simplifiedView` was the server-hydration effect's only unstable dependency, so every flip re-ran the hydrate on a clean workflow — exactly the walkthrough's state — replacing the measured layout with the pre-mount fallback and discarding an unsaved rename. The flag now lives in a ref and a `hydratedFromRef` guard stops the re-hydrate. The round trip is identity: cards, wires and both group boxes come back as they were, and an unsaved rename survives.
**What he said:** *"Turning Simplified view on and off does some weird things to
the formatting."*
**Expected:** Toggling either way returns to a clean layout; capture what
actually breaks first.

## The walkthrough document is out of date

These are what made a working app look broken, so they are cheap and high value.
All are in [`docs-md/workflows/GALLERY.md`](../../docs-md/workflows/GALLERY.md).

### D14. [x] Step 8 says "Try"; the button is "Run"
**Done.** The button is `Run…` (with an ellipsis): "Try" and "Run this workflow" are one control, and "Try" is the **Try on canvas** tab inside the drawer. The doc also said the button "refuses" on click; it is disabled, with the reason in a hover tooltip, which the doc quotes. Swept into stop 15; the stop 8 and stop 15 pictures are re-shot.
*"There is no Try button, only Run."*

### D15. [x] Step 8's first instruction is literally "Do this."
**Done.** Not a truncation: the stop only ever told you to replay, and a clean checkout had nothing to replay. It now has two instructions, on the Try-in-place demo, which needs no Azure: start a run by giving the **Run…** drawer a PDF, and watch one by replaying a green row in **Run history**.
*"The first actual instruction here is just Do this. What is it asking someone
to do?"*

### D16. [x] Step 8 typo — "skip to stop 11" should be "step 11"
**Done — deliberately not renamed.** "Stop" is the doc's own word for a tour section; renaming it to "step" would collide with the workflow *steps* the tour is about. The word is defined where it is first used, and no "stop N" in the file means a workflow node.
*"Is it meant to be stop, not step?"* (The word "stop" is used for step
throughout that quoted passage.)

### D17. [x] Step 8 gives no guidance for the Run sidebar
**Done.** The box is **Initial ctx**, prefilled from the inputs the workflow declares. Standard OCR Workflow declares `modelId` with a default, so it opens as `{"modelId": "sdpr_synth_test"}`; its first step also needs a `documentId` and a `blobKey`, which an upload supplies. Documented, with the Workflow-as-API demo's prefill as the contrasting example, and with where an uploaded document's run is followed: the **Documents** page.
*"There aren't any instructions on what it wants from a user in the Run sidebar.
Not sure what to do with this text field when it's just an unpopulated `{}`."*
He gave up and ran the workflow from the Upload page instead.

### D18. [x] Step 12 instructions outdated
**Done.** `Run…` → **Call from outside** tab, confirmed. The "Test run" box is **Start a run**. A run started there makes no document and is not a try, so neither the Documents page nor Run history lists it; the stop says so, and the drawer shows the run's id.
*"It is the Run button, followed by the Call from outside tab."*

### D19. [x] Step 13 says "Run this workflow"; the button is just "Run"
**Done.** `Run this workflow` → `Run…`. Added two behaviours the text missed: this workflow shows no tabs (a file is its only way in, so the drawer opens on **Upload a file**), and it is select-then-Run, not drop-to-run.

### D20. [x] Step 4 wording — "names its kind"
**Done — the app says "kind".** It is a literal field label in three editors, and "Type" is taken by the run spec's JSON-schema column, so the word stays and the doc defines it where it is first used. The doc's claim that segments are green was false; it lists the five real families.
*"Names its kind of what? Should this be names its type?"*

## Comprehension gaps — correct behaviour, unexplained

### D21. [x] Pinned inputs have no incoming edge, so who chose the value? (GALLERY step 2)
**Fixed — the old tooltip was wrong, not just unclear.** It said "Pinned by you", and a pin carries no author: the lock list holds port names and nothing else, and loading a seeded workflow makes pins from its own bindings. All three places that show a pin — the settings panel badge, the canvas wire tooltip and the connect-summary popover — say what the pin does and name the undo, the input's ⋯ menu; the wire tooltip adds that right-clicking the wire hands it back too.
*"Inputs listed as Pinned don't have any input edges, so who is choosing this
connection? The docs say someone chose it deliberately, but is that someone the
user or a developer?"*

### D22. [x] The Ref picker doesn't read as "previous nodes and their outputs" (GALLERY step 6)
**Fixed.** The mode switch reads **From a step** / **Typed value**, and a heading over the rows says what they are — *"Outputs of earlier steps"*, each row one output of a step that runs before this one — with the upstream-distance detail kept. On his panel the value being checked is the poll step's own Poll status, which no earlier step produces: a poll step's condition now lists the step's own outputs first, under **This step's result**, with the row the condition reads marked.
*"I think this has to be clearer. It wasn't immediately apparent that the Ref
options were previous nodes and their outputs."* See
[`source/dylan-ref-picker-operators.png`](source/dylan-ref-picker-operators.png).

### D23. [x] Operator dropdown uses developer shorthand (GALLERY step 6)
**Fixed.** Every operator has a human label with the symbol after it in the dropdown (`is greater than or equal to (≥)`), and the canvas chips and a condition group's summary take their words from the same labels: the symbol for a comparison, the words otherwise (`is empty`). The stored values are unchanged, and tests pin that.
*"The dropdown of operators currently contains things like gte, which I imagine
would be confusing if users weren't familiar with that shorthand. Maybe use the
symbols instead?"*

### D24. [x] `currentSegment` is unexplained and possibly redundant (GALLERY step 7)
**Answered, and the field fills itself in.** The key is free text — a seeded workflow uses `currentDoc` — but the `segment.<field>` shorthand always reads `ctx.currentSegment`, so another name silently disables it; the field's help text says both. Approved by Alex: a new loop arrives with `currentSegment` and declares it as a workflow variable in the same change, so a step inside the loop can read it straight away, and one Undo removes both; no saved workflow is rewritten. A second loop reusing the same item variable raises a **warning, not an error**, and still lets you save; when both loops carry the same label the warning says "another loop on this canvas".
*"Why currentSegment? Is this what the node looks for? That should be made clear
to the user, and if it's always this, why do we specify it?"*

### D25. [-] Wire colour — expected green, got purple (GALLERY step 7)
**Answered — the doc was wrong, not the app.** There is no green family; `document.split` emits `DocumentSegment[]`, and `DocumentSegment` is violet in the colour registry. His aside resolves too: the wire's `#6741D9` (data family) and the Run-for-each-item card's `#6B21A8` (the node accent the legend calls *"Repeats over a list, or gathers results"*) are two purples from two independent registries; the resemblance is coincidence. Stop 7's text, picture and alt text are corrected.
*"The wire is not green, it is purple, but so is the Run for Each Item node, so
maybe that's just an expected change."* Either the doc or the colour is wrong.

### D26. [x] Validation tick sits below, not beside — and never turns red (GALLERY step 14)
**Answered and fixed.** What turns the strip red is breaking the `@workflow-node` comment block, and only that: Monaco's TypeScript checker is off, and the code is checked at Publish, so editing the code never turns it red. A **What is checked?** popover lists both sets; its as-you-type list has a line for every error the header parser can report, and a test fails if the parser gains a message without one. On position, the doc was wrong and the UI is right: the strip's error lines jump the caret into the editor above it, so the strip stays under the editor, and stop 14 says so.
*"Instructions make it sound like the green tick should be on the right, but
it's below. Couldn't get it to turn red. What's it looking for?"*

### D27. [x] No way to see what a kind such as `Document` contains (GALLERY step 14)
**Answered and fixed.** `Document` contains nothing, deliberately: it is a schema-free family, and six subkinds carry the real shapes. A popover on a kind says which of four it is — a kind with fields (listed); a family (with its members that have a known shape); a kind no other kind extends, such as Document ID (named by the registry, no members); or unregistered — read from the live registry, nothing hardcoded per kind.
*"How can a user know what the Document type contains?"*

### D28. [x] Run-order connectors are inconsistent and their size looks meaningful
**Answered and fixed — one accident, one real signal, one explanation.** **(a)** A run-order line is drawn only where order is the *only* thing between two steps; where data flows, the coloured wire carries the order too. **(b)** The heights and fills differed by which renderer drew the card; both come from one module now: the dashed wire's grey at 18px on every rectangular card, and the switch diamond's vertices, which *are* its midpoint. **(c)** A port dot is 16px with a `+` when the port is required and unused; for an output, unused means nothing in the graph reads it — by a wire, a condition, a loop's list, a sub-workflow mapping or a reference into one of its fields. His Poll status was drawn large because only wires counted; its own stop condition reads it, so it is an ordinary dot. The `+` is drawn in black or white, whichever stands out against the dot, and the row's tooltip explains the larger dot.
*"Why do some nodes connect with the run-order connections, but others don't?
These connector nodes also appear at different heights on the nodes. Is there
meaning behind the difference in the size of the Poll status connector?"*
Screenshots
[`source/dylan-run-order-connectors.png`](source/dylan-run-order-connectors.png)
and [`source/dylan-poll-ocr-connectors.png`](source/dylan-poll-ocr-connectors.png).

### D29. [x] Legend category names aren't intuitive
**Fixed.** The two labels that did not say what they are: *"Judgements about a document"* → **"Labels and check results"** (the family holds classifications and validation results — a label the app applied and a check it ran), and *"Pointers — IDs and lookups"* → **"IDs that point at something stored elsewhere"**.
*"Some of the categories in this legend could be more intuitive. Like, what's a
'Judgement about a document'?"* See
[`source/dylan-card-borders-legend.png`](source/dylan-card-borders-legend.png).

### D30. [x] Poll OCR Results has far more fields than Extract OCR Results
**Answered and fixed — neither OCR activity declares a parameter of its own.** Poll OCR Results is a poll-until loop wrapping an activity, while Extract is a plain activity, so every extra field is loop machinery. The panel leads with that sentence, and the three limits the engine has defaults for start folded behind a toggle that names any that are set, with their values.
*"Why does a node like Poll OCR Results have so many more fields than something
like Extract OCR Results?"* Screenshot
[`source/dylan-ref-picker-operators.png`](source/dylan-ref-picker-operators.png)
shows the field stack he means.

## Suggestions

### D31. [x] Compare to Head should show a real diff (GALLERY step 11)
**Done — a real diff, with no new dependency added.** None existed in the frontend's tree, and a text diff is the wrong tool for configs whose key order means nothing. A structural config-diff walks both versions to their leaves; list items are matched by identity — a wire by its `id`, an input or output by its `port` — so deleting a step reports that step and its own wires; one-sided subtrees expand into added or removed leaves; and the derived config hash is excluded, which the UI states. The modal opens on a **Changes** tab — summary line, one row per difference with both values, unchanged fields folded — and keeps the side-by-side JSON as **Both versions in full**.
*"The Compare to Head feature could be clearer if it showed an actual diff, not
just both versions in full."*

### D32. [x] Reuse the card-border legend colours in the sidebar node list
**Fixed.** The palette rows, and the canvas's "pick a step" list, take their colours from the same accent registry as the card borders rather than copied hex, so the lists and the canvas mean the same thing.
*"Could we use these colours in the sidebar list of nodes?"*

### D33. [x] The workflow list needs a search bar
**Done — client-side**, because the list endpoint has no paging and the whole list is already in memory; a keystroke round-trip would only add flicker. It uses the existing house search component, matches name, slug and description, and the caption reads `1 of 35 workflows match "versioning"`. The empty state names the term, points at the Workflows/Libraries/All filter, and offers Clear search. A test asserts no extra fetch happens while filtering.
*"Even with this number of workflows, it can be hard to find the one you want."*

### D34. [x] Demo workflow names reference "parts" that don't match the walkthrough
**Done.** The suffixes are Parts of `MANUAL_TEST_PLAN.md`, not gallery stops. **Nothing renamed:** the title feeds the stable slug the guide links to, and `seed-demo-runs.mjs` finds workflows by name. Documented instead, including that the gallery abbreviates the full seeded names.
*"What do the parts reference on the demo workflow names? They don't correspond
with the parts of the walkthrough seemingly."*
