# Workflow designer — review fixes, 2026-08-14

Two independent reviews arrived the same day. They are kept apart here and in
the eventual illustrated write-up, so each reviewer can read only their own
items.

| Reviewer | Items | Source |
|---|---|---|
| **Inderdeep Singh** (senior UX designer) | I1–I5 | [`source/inderdeep-note.txt`](source/inderdeep-note.txt) + two mock-ups |
| **Dylan** (developer) | D1–D34 | [`source/dylan-workflow-review.pdf`](source/dylan-workflow-review.pdf), text decoded to [`source/dylan-review-extracted.txt`](source/dylan-review-extracted.txt), 6 embedded screenshots extracted alongside |

Dylan's numbering follows the numbered steps of
[`docs-md/workflows/GALLERY.md`](../../docs-md/workflows/GALLERY.md), which is
the walkthrough he was working from; the step number is given on each item.

Status key: `[ ]` not started · `[~]` in progress · `[x]` done ·
`[-]` closed without a code change (answer / not-a-defect — the reason is
written into the item).

---

# Inderdeep — chat agent and error cards

### I1. [x] The agent still doesn't answer for him
**Fixed 2026-08-14 — the drawer had collapsed "the request failed" and "the server has no model" into one branch labelled "Server default model", with the composer left live. Those are opposite facts. Now four states: loading · unknown (request failed, composer stays live) · **unconfigured** · ready. The unconfigured state names the missing variables, points at the new setup doc, and disables send with the reason on a focusable tooltip wrapper — a disabled Mantine button fires neither pointer nor focus events, which is exactly the difference jsdom cannot see. 164 backend and 65 frontend tests pass.**
**Diagnosed 2026-08-14 (`worklogs/agent-credentials.md`) — three separate causes. (1) The error-surfacing he asked for last round shipped 2026-08-08 on this branch only; anything he tested built from `develop` still fails silently. (2) A genuinely silent state remains: an empty model list is collapsed into "Server default model" with the composer left live, so an unconfigured server never says so. (3) A stale generated Prisma client 500'd every send this morning (logged as 201 by the request logger, so nobody noticed); cleared when the client was regenerated. **Fix pass pending** — folded into the chat-drawer work with I2/I3.**
**Area:** Environment / workflow agent
**What he said:** *"The agent is not working for me, as was the case earlier."*
Same symptom as his previous round, which is why every other observation in his
note comes from screenshots rather than from live use.
**Expected:** Establish whether this is his credentials/endpoint or a real
failure path in the agent, and either fix it or give him the exact setup step.

### I2. [-] Send button doesn't become a stop button while a reply is in flight
**Answered 2026-08-14 — **already correct on this branch; no change made.** The only stop affordance in the whole agent-chat surface is the composer's send/stop button, the header renders history/new/close and nothing else, and the swap shipped 2026-08-08 in `5903a414`. `origin/develop` contains no agent-chat code at all and that commit is not an ancestor of it, so his snapshot came from a build that is not this branch. Confirmed in a real browser as well as in tests.**
**Area:** Frontend — workflow agent chat composer
**What he said:** *"From the snapshots it seems like the stop icon is still at
the top. I believe we discussed the send button transitioning to stop when
inflight."*
**Expected:** While a response is streaming, the send arrow itself turns into a
stop control; no separate stop affordance at the top of the panel.

### I3. [x] The bottom strip of the chat composer looks off
**Done 2026-08-14 — composer rebuilt to his mock-up: message on its own line, then one footer strip with attach `+` (was a paperclip) at the left, the model name and tier as a menu trigger with chevron, and send/stop hard right. The menu lists each model with its descriptor beneath and a check on the selected one. **Nothing from the mock-up is hardcoded** — name and tier are derived from the model family, and a deployment whose model matches no known family shows the name alone rather than an invented tier. Verified from real bounding boxes in a browser: attach 968 → picker 1000 → send 1458, one row.**
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
**Fixed 2026-08-14 — Mantine's Badge centres the icon's *box* against the label's *line box*, and a line box is symmetric about the font's ascent and descent while the ink of an all-caps word is not: `ERROR` has cap height above the baseline and nothing below it. Measured live in the browser, the glyph sat 0.5px above the text's optical centre; the fix is a derived `(ascent − descent − capHeight)/2` nudge on the glyph, after which the delta is 0.00px. The nudge is on the glyph, not the label, deliberately — moving the label would have desynchronised this chip's text from every sibling chip (`DYN`, `Deleted`, `ENTRY`, group counts), which are text-only and correctly box-centred.**
**Area:** Frontend — workflow builder node error chip
**What he said:** *"Nitpicking but in the error chip, the icon and the text
aren't aligned."*
**Expected:** Icon optically centred against the first line of the label.

### I5. [x] Error card uses a destructive-red CTA, and the label overstates what it does
**Fixed and answered 2026-08-14 — **the scope answer: it re-runs the whole workflow from the start.** The handler fetches the run's original initial context and posts a new try, which starts a brand-new Temporal execution from the entry node; there is no re-execute-one-step endpoint. So "Try again" would have been untrue — the label stays, and the card now states the scope in a dimmed line instead of leaving a reader to infer it from a card attached to one step. Restyled to the BC DS inline-alert pattern: 1px danger border from the theme (no hex — Mantine's red is already mapped to the BC scale), the alert-circle icon instead of the triangle (the triangle is BC's *warning* icon), and the CTA changed from filled red to outlined. **One sibling swept:** the cache-evicted alert repeated the same filled-red Re-run, and its variant union no longer permits `filled`. Everything else red in the preview and run panels is either a CTA-less alert, a status badge, or a genuinely destructive Delete/Remove/Ungroup — left alone, because those are what make filled red mean something.**
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
(the **Re-run workflow** button is at line 163).

---

# Dylan — walkthrough review

## Blockers — the walkthrough could not be finished

### D1. [x] Standard workflow fails at the Poll OCR step (GALLERY step 9)
**Fixed 2026-08-14 (`worklogs/poll-ocr-blocker.md`) — the workflow itself runs green end to end on this branch (verified with a live Temporal run against real Azure DI). What actually failed was the **diagnosis**: every failed step reported the literal string `"Activity task failed"`, because that is Temporal's envelope message while the activity's real message sits on `.cause`. That is why he could not tell what broke and had to ask what changed. Two supporting defects found and fixed, both from the demo-rework commit: the poll activity returned `response` while the catalog declared `ocrResponse`, so the runner silently bound `undefined` and the Poll step had no output to preview (the exact subject of step 9); and poll's 404 was a bare status code while its sibling Submit OCR had carried a full diagnostic hint all along. 713 tests pass, `tsc` clean.**
**What he said:** *"Could not complete because standard workflow is failing at
Poll OCR step. What has changed since the develop branch that would affect
this?"*
**Consequence:** Steps 9 (reading results) and 10 (run history) went untested.
**Expected:** Reproduce, find the regression against `develop`, fix or explain.

### D2. [x] Step 10 blocked by the same failure (GALLERY step 10)
**Unblocked by D1 — steps 9 and 10 can now be walked. Two caveats recorded in the worklog: a stale generated Prisma client will fail at the first cached node (`npm run db:generate`, and the generated dirs are gitignored so it is invisible in `git status`), and a developer with no Azure account can set `MOCK_AZURE_OCR=true` to walk stops 8–10.**
Rolls up into D1; kept as its own line because it is a separate unverified step
of the walkthrough.

### D3. [x] Publishing a custom step fails — deno-runner unreachable (GALLERY step 14)
**Fixed 2026-08-15 — the message is now built where the failure happens, with the URL demoted out of the headline: a local runner that is not up says the custom-node checker is not running and gives the command to start it; a deployed sidecar retries and then escalates. The technical detail goes on the response body and a warning log. A dedicated response DTO is wired into both service-unavailable decorators. Verified by stopping the runner container. **One residual, left for the editor's owner:** the dynamic-node editor still appends " — see error markers" to this failure, where there are none, and ignores the new detail field.**
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
**Answered and fixed 2026-08-14 — Azure OpenAI via the BC Gov AI Hub APIM proxy, the same subscription the OCR enrichment uses; four env vars; no self-serve, the key comes from Alex. **The backend no longer dies when it is unset** — the constructor throw is gone, so an unconfigured environment boots with a visibly disabled assistant instead of a dead app. `GET /api/agent/models` now returns the missing variable NAMES (asserted in tests that no value can leak). `.env.sample`'s misleading non-empty placeholders are blanked, and `docs-md/workflows/AGENT_SETUP.md` is written and linked from the manual test plan and the docs index.**
**Answered 2026-08-14 (`worklogs/agent-credentials.md`) — Azure OpenAI via the BC Gov AI Hub APIM proxy, the same subscription the OCR enrichment uses, not a separate one. Four env vars, no self-serve: the working key lives out-of-band and Alex hands it out. Two documentation silences produced this item — `.env.sample` ships non-empty placeholder values, so a copied sample reports itself configured and then fails on a DNS lookup, and the test plan's whole setup answer is one table cell. **Also found: the backend refuses to boot with no provider configured** (DI throw at construction), so a developer without a key gets a dead app rather than a disabled assistant — and the vars are wired into the temporal worker only, never into backend-services, so this branch cannot deploy as-is. See the note to Alex.**

**Wired 2026-08-15, on Alex's approval** (`worklogs/deployment-wiring.md`) — backend-services now gets all four variables in docker-compose, the kustomize base (configmap + secret + deployment), the instance-template overlay, the deploy workflow and script, and the rotation script. **The shared-secret idea was rejected on evidence:** `namePrefix` makes the secret name per-instance, so a rename would have to be coordinated across every instance and `oc apply` does not delete the old one — it would orphan a secret still holding a live Azure key. The worker's secret also carries a platform key backend-services has no business mounting. Duplication is already this repo's pattern for the Document Intelligence and storage keys, and it does not drift because each of the three writers fans one value into both secrets in a single run. Validated with a real generated instance overlay, `kubectl kustomize` and `docker compose config`.
**What he said:** *"I don't think I have the credentials for this. Which
subscription is it meant to be using?"*
**Expected:** Documented answer — which subscription/endpoint the workflow agent
uses locally and how a developer gets access. Overlaps I1.

### D5. [x] Demo workflows are hard to obtain
**Done 2026-08-14 — the walkthrough now carries a four-part prerequisites section, replacing the old claim that "you need no setup, no terminal, and no database". It covers bringing the stack up, seeding the demos, reading the demo names, and which stops need what. **His API-key-and-ENVs step is obsolete** — the seeder now loads the backend env and probes candidate keys itself. Also added: `npm run db:generate` (the generated dirs are gitignored, so `git status` shows nothing wrong while two separate symptoms appear), and `MOCK_AZURE_OCR=true` in `apps/temporal/.env` for developers with no Azure account.**
**What he said:** *"It should be clearer where the Demo workflows come from and
how to load them. I needed to find a separate file about seeding this separate
demo data, then figure out that I had to generate an API key in the app and
update some ENVs."*
**Expected:** One place, referenced from the walkthrough, that gets a developer
from clean checkout to seeded demos.

### D6. [-] The `Demo - Deleted` custom node was never seeded (GALLERY step 15)
**Answered 2026-08-14 — **not a defect.** `demo-deleted-node` IS seeded, and then soft-deleted one second later, deliberately, so the Part 14 demo workflow has a genuinely missing step for the canvas to draw. `GET /api/dynamic-nodes` excludes soft-deleted lineages by design, so its absence from the management page is correct behaviour. Two things made it read as a seeding gap: a stale generated Prisma client made that page 500 outright, and stop 15 never said the node is *supposed* to be missing there. The walkthrough now says it.**
**What he said:** *"Appropriate name, because the Demo - Deleted custom node
doesn't appear to have been seeded."* The step is about what the canvas does
when a step goes missing, so with nothing seeded there is nothing to see.
**Expected:** Seed it, or rewrite the step so it produces the missing-step state
some other way.

## Bugs

### D7. [x] Typing in node config fields is very laggy (GALLERY step 7)
**Fixed 2026-08-15 — three changes: the badge-sync effect now returns the previous node array when nothing changed (the sibling hover effect twenty lines below already did this), the live config no longer sits in the validation memo's dependencies, and free-text fields draft locally and commit on a quiet moment through a new `useDebouncedTextCommit` hook wired into `VariablePicker` and `JsonSchemaForm`. So a keystroke no longer re-runs the auto-wire graph walk, rewrites downstream bindings and re-projects every node on the canvas. 1050 tests pass across the editor page, canvas, graph widgets, schema form and validation; `tsc` clean. **Outstanding: the before/after typing measurement, to be captured with the after-screenshot pass.****
**Diagnosed 2026-08-14 (`worklogs/frontend-bugs-investigation.md`) — his hunch is right and it is the same class as the HITL page. There is no local draft state anywhere: each keystroke replaces the whole workflow config at page level, which re-runs the full auto-wire graph walk **per character**, rewrites downstream bindings, changes the canvas's structural fingerprint, and re-projects every node (defeating xyflow's identity reuse). A second unconditional re-render comes from the validation memo, whose badge-sync effect always allocates a new node array — the sibling hover effect twenty lines below already does the `return prev` guard correctly. Fix order: the one-line guard, then drop `config` from the validation memo deps, then local draft + debounced commit.**
**What he said:** *"Typing in the field is very laggy. I suspect it's the same
problem as the HITL page, where updates are causing a lot of the page to
re-render when it really shouldn't if broken up."*
**Expected:** Keystrokes don't re-render the canvas; profile and scope the
update.

### D8. [x] Custom-step editor jumps the cursor to the end of the last line (GALLERY step 14)
**Fixed 2026-08-15 — the stale-echo guard is in (`lastEmittedRef`), so the debounced round-trip no longer replaces the whole editor model and throws the caret to the end, and a once-per-slug hydration guard stops the three modal mount sites clobbering text typed while a detail fetch is in flight. The sibling defect is fixed too: select-all + delete no longer re-inserts the whole boilerplate. Note the existing unit test could never have caught either — Monaco is stubbed with a textarea, which preserves the caret.**
**Diagnosed 2026-08-14 — Monaco is driven as a controlled `value` with a 150 ms debounced round-trip through the parent, so a stale echo is written back; when it differs from the live buffer the whole model is replaced with `forceMoveMarkers`, sending the caret to the end and dropping characters typed during the echo window. Fires whenever you pause ≥150 ms and keep typing. His "when it reloads" guess is a real second contributor: three modal mount sites have no once-per-slug guard, so a detail fetch clobbers text typed while it is in flight. Same path has a 100%-reproducible sibling — select-all + delete re-inserts the whole boilerplate. Existing unit tests cannot catch it (Monaco is stubbed with a textarea, which preserves the caret); proving it needs Playwright.**
**What he said:** *"The editor occasionally forces the cursor to the end of the
last line. Maybe this is happening when it reloads? Makes it very frustrating to
type."*
**Expected:** Caret position survives whatever re-mount or revalidation is
firing.

**Update 2026-08-15 (superseded below) — partly fixed; a second cause remained.** Writing the browser test found it: the echo guard works (every echo was correctly dropped under instrumentation), but `CodePane` still drives Monaco as a *controlled* component locally, so its `value` trails the editor's own model by one React commit whenever two keystrokes land inside a single commit — and the older string is applied as the same full-model replace with `forceMoveMarkers`. The text recovers on the next commit; the caret does not. That is the intermittency he described. Closing it means the editor owning its buffer while the author types, a design change to code shipped a week ago — **proposed, not taken**, and sitting in the tree as a `test.fixme` with the captured evidence in its comment. The two fixed causes now have a passing Playwright check (`tests/e2e/workflow-builder/specs/tier1-code-pane-caret.spec.ts`), both verified failing against the old behaviour — 25 of 26 characters lost with the guard removed.

**Closed 2026-08-15 — Alex approved the design change, and it is done.** The documentation was read first, as he asked: `@monaco-editor/react` applies a `value` mismatch as a full-model `executeEdits` with `forceMoveMarkers`, and Monaco's own guidance is that `setValue` is for wholesale replacement while in-place edits belong to `pushEditOperations`. So `CodePane` now passes **`defaultValue`, never `value`** — the editor owns its buffer while the author types, and re-seeds (load, revert, lineage change) are pushed imperatively behind a guard. The stubbed `<textarea>` in the editor spec could no longer express that contract, so **the stub was rewritten rather than the assertions weakened**. 67 unit tests pass, `tsc` clean, and the third caret test is un-skipped and green: **3 passed** including the two-keystrokes-in-one-commit case that failed before.

### D9. [x] Dragging from the Segments output creates a run-order edge, not a data edge (GALLERY step 7)
**Fixed 2026-08-15 — **a real classification bug, reproduced.** The connection was classified by its *target* handle alone, so a drag begun on a data port and dropped on a node-level target fell into the create-a-plain-edge branch, and validation returned true, so nothing refused the drop. A test even asserted this as intended. The **origin** decides now: a new module resolves the target's real input rows — one compatible input completes as the data edge that was drawn; several refuses and names them; none refuses and distinguishes "has no data inputs at all" from "none accepts this kind". His exact case now refuses with: *"Run for each item" has no data inputs — it reads its values from workflow variables. To make it run after this step, drag between the two grey run-order dots instead.***
**What he said:** *"It's strange that connecting the Split Document to the Run
for Each Item nodes creates the edge between the order-of-operation connectors,
even if I start it from the Segments output."*
**Expected:** A drag begun on a data port completes as a data edge, or refuses —
it must not silently become a different kind of edge.

### D10. [-] Order-of-operations edges cannot be drawn by hand
**Answered 2026-08-15 — **they were always drawable; nothing was disabled.** Drawn by hand in both directions in a browser. Three measured reasons he could not: on control-flow cards the dot's hover said "No typed inputs"/"No typed outputs" — a sentence about *data ports*, on the connector that carries no data; on activity cards it said "Flow — execution order", which names it without saying it can be dragged; and hovering the outgoing dot opens a 300×404px extend picker directly over the space you would drag across. Nothing was enabled — the dot now says *"Runs after — drag from here to another step's matching dot… Order only, no data."* on every card.**
**What he said:** *"Cannot seem to manually connect order-of-operations edges.
Is this intentional?"*
**Expected:** Decide and make it legible — either enable the drag, or make the
refusal say why.

### D11. [x] Restoring an old version just re-tags HEAD (GALLERY step 11)
**Fixed 2026-08-15 — **he was right, and the consequence was worse than the symptom.** Restore did exactly one write (move the head pointer) and created no version. But new versions are numbered `head + 1` against a uniqueness constraint, so with the head parked on v1 while v2 existed, **the next save 500'd** — reproduced on the dev stack with the duplicate-key error in the log. Restore silently made a workflow unsaveable. It now appends the old config as a new version in one transaction, audits both, and leaves the source row and its run counts alone. Verified end to end: head moves to v3, and a save straight afterwards returns 200. The toast now reads "Restored v1 as v3 — The editor is on v3, a new version holding v1's steps. v1 is still in the history."**
**What he said:** *"It did not appear to bring back the old version as a new
version in the UI as the instructions suggest. It looks like it just tags it as
the HEAD."*
**Expected:** Behaviour and documentation agree; if restore really does create a
new version, the UI has to show that it did.

### D12. [x] Dynamic-nodes empty state renders two plus symbols
**Fixed 2026-08-15 — the literal `+` is gone and the button names its object: **"Create your first custom node"**. The bare phrase was a dangling fragment for a screen reader. The file's own header comment repeated the mistake and is corrected. **Outstanding: before/after frames, which need the list API intercepted to return an empty response — the empty state is unreachable on a seeded database without deleting the custom node the Part 14 demo depends on.****
**Diagnosed 2026-08-14 — `DynamicNodesListPage.tsx:181` sets an `IconPlus` left section and `:185` prepends a literal `+ `. Fix drops the literal and names the object ("Create your first custom node"), since the bare phrase is a dangling fragment for a screen reader.**
**What he said:** screenshot
[`source/dylan-double-plus-button.png`](source/dylan-double-plus-button.png) —
the button reads **`+ + Create your first`**. An icon prop and a literal `+` in
the label.

### D13. [x] Simplified view toggle distorts the layout
**Fixed 2026-08-15 — the flag now lives in a ref so the arrange callback's dependencies are stable, and a `hydratedFromRef` guard stops the server-hydration effect re-running. Toggling no longer reverts the workflow to the server copy, no longer destroys the measured layout, and no longer discards an unsaved rename.**
**Diagnosed 2026-08-14 — **not a canvas bug: toggling silently reverts the workflow to the raw server copy.** `simplifiedView` is the only unstable dependency of the server-hydration effect, so every flip re-runs the hydrate on any clean workflow — which is exactly the walkthrough's state. The tidy measured layout is replaced by the loose pre-mount fallback and never repaired. **It also reverts an unsaved rename**, records no undo step, and one subsequent edit + Save makes it permanent. Fix: hold the flag in a ref so the arrange callback's deps are stable, plus a hydrated-from guard.**
**What he said:** *"Turning Simplified view on and off does some weird things to
the formatting."*
**Expected:** Toggling either way returns to a clean layout; capture what
actually breaks first.

## The walkthrough document is out of date

These are what made a working app look broken, so they are cheap and high value.
All are in [`docs-md/workflows/GALLERY.md`](../../docs-md/workflows/GALLERY.md).

### D14. [x] Step 8 says "Try"; the button is "Run"
**Done 2026-08-14 — the button is `Run…` (ellipsis). "Try" and "Run this workflow" were merged into one control on 2026-08-08; "Try" now lives inside the drawer as the **Try on canvas** tab. The doc also wrongly said the button "refuses" on click — it is disabled, with the reason in a hover tooltip. Same fix swept into stop 15.**
*"There is no Try button, only Run."*

### D15. [x] Step 8's first instruction is literally "Do this."
**Done 2026-08-14 — not a truncation; the stop only ever told you to *replay*, and on a clean checkout the Standard OCR Workflow has no runs to replay. Now two instructions (start one, watch one), pointing at the Try-in-place demo whose seeded runs need no Azure.**
*"The first actual instruction here is just Do this. What is it asking someone
to do?"*

### D16. [x] Step 8 typo — "skip to stop 11" should be "step 11"
**Done 2026-08-14 — **deliberately not renamed.** "Stop" is the doc's own word for a tour section ("a guided tour in 16 stops", used 14 times); renaming to "step" would collide with the workflow *steps* the tour is about. The word is now defined where it is first used. Swept the file: no "stop N" ever meant a workflow node.**
*"Is it meant to be stop, not step?"* (The word "stop" is used for step
throughout that quoted passage.)

### D17. [x] Step 8 gives no guidance for the Run sidebar
**Done 2026-08-14 — the box is **Initial ctx**, prefilled from the workflow's input schema. `{}` means this workflow declares no inputs. Documented that, plus a real contrasting prefill from the Workflow-as-API demo.**
*"There aren't any instructions on what it wants from a user in the Run sidebar.
Not sure what to do with this text field when it's just an unpopulated `{}`."*
He gave up and ran the workflow from the Upload page instead.

### D18. [x] Step 12 instructions outdated
**Done 2026-08-14 — confirmed `Run…` → **Call from outside** tab. A second stale claim in the same stop fixed: the "Test run" box is now "Start a run".**
*"It is the Run button, followed by the Call from outside tab."*

### D19. [x] Step 13 says "Run this workflow"; the button is just "Run"
**Done 2026-08-14 — `Run this workflow` → `Run…`. Added two verified behaviours the text missed: this workflow shows no tabs, and it is select-then-Run, not drop-to-run.**

### D20. [x] Step 4 wording — "names its kind"
**Done 2026-08-14 — **the app says "kind"**, as a literal field label in three editors, and "Type" is separately taken by the run-spec JSON-schema column. So the word stays and the doc now defines it in the sentence that first uses it. A real error surfaced alongside: the doc claimed segments are green; there is no green family — `Segment` is violet. Replaced with the five real families.**
*"Names its kind of what? Should this be names its type?"*

## Comprehension gaps — correct behaviour, unexplained

### D21. [x] Pinned inputs have no incoming edge, so who chose the value? (GALLERY step 2)
**Fixed 2026-08-15 — **the old tooltip was wrong, not just unclear.** It said "Pinned by you", and a pin carries no author at all: the lock list holds port names and nothing else, and loading a seeded workflow mints pins from its own bindings — so "by you" was false on the very screenshot he took. The copy now describes the act and names the undo, in the panel and on the canvas wire tooltip and the connect-summary popover.**
*"Inputs listed as Pinned don't have any input edges, so who is choosing this
connection? The docs say someone chose it deliberately, but is that someone the
user or a developer?"*

### D22. [x] The Ref picker doesn't read as "previous nodes and their outputs" (GALLERY step 6)
**Fixed 2026-08-15 — the Ref list is now framed as what it is (earlier steps and their outputs) at a glance, without hiding the upstream-distance detail that was already useful.**
*"I think this has to be clearer. It wasn't immediately apparent that the Ref
options were previous nodes and their outputs."* See
[`source/dylan-ref-picker-operators.png`](source/dylan-ref-picker-operators.png).

### D23. [x] Operator dropdown uses developer shorthand (GALLERY step 6)
**Fixed 2026-08-15 — every operator now has a human label, with the stored values untouched (tests pin that). **The app had already been disagreeing with itself:** canvas chips drew `≥` while the dropdown said `gte`, and a third vocabulary in the legacy viewer leaked `pages gte 5`. All three now read from one shared label module.**
*"The dropdown of operators currently contains things like gte, which I imagine
would be confusing if users weren't familiar with that shorthand. Maybe use the
symbols instead?"*

### D24. [x] `currentSegment` is unexplained and possibly redundant (GALLERY step 7)
**Answered 2026-08-15 — **no, it is not always the same value:** the key is free text with no default, and a seeded workflow uses `currentDoc`. But the `segment.<field>` shorthand is hard-wired to read `ctx.currentSegment`, so any other name silently disables it. Both halves are now in the field's help text. **Alex approved the structural change on 2026-08-15 and it is done:** the key is pre-filled with `currentSegment` at creation time only — no saved workflow is rewritten, and the seeded one using `currentDoc` is untouched — and a second loop reusing the same item variable now raises a **warning, not an error**, so it tells you and still lets you save. One thing only the browser check caught: the first draft named the incumbent loop by label, and since both palette maps carry the same default label it rendered as *"Run for each item" … which "Run for each item" already writes*. It now says "another loop on this canvas" when the labels match. 1094 graph-workflow tests, 2244 frontend tests and a new 3-test e2e spec pass.**
*"Why currentSegment? Is this what the node looks for? That should be made clear
to the user, and if it's always this, why do we specify it?"*

### D25. [-] Wire colour — expected green, got purple (GALLERY step 7)
**Answered 2026-08-14 — **the doc was wrong, not the app.** There is no green family; `document.split` emits `DocumentSegment[]`, and `DocumentSegment` is violet in the colour registry. His own aside is also resolved: the wire's `#6741D9` (data family) and the Run-for-each-item card's `#6B21A8` (the fan-node accent, "Fans out or back in") are two different purples from two independent registries — the resemblance is coincidence, not a shared meaning. Stop 7 and the image alt text both corrected.**
*"The wire is not green, it is purple, but so is the Run for Each Item node, so
maybe that's just an expected change."* Either the doc or the colour is wrong.

### D26. [x] Validation tick sits below, not beside — and never turns red (GALLERY step 14)
**Answered and fixed 2026-08-15 — **what makes it go red: breaking the `@workflow-node` comment block, and only that.** Monaco's TypeScript checker is deliberately off, and the real checks run server-side at Publish, so he could not turn it red because he was editing the code rather than the header. A "What is checked?" popover now lists both sets. On position, **the doc is wrong and the UI is right**: the strip's error lines jump the caret into the editor above it, so adjacency is load-bearing.**
*"Instructions make it sound like the green tick should be on the right, but
it's below. Couldn't get it to turn red. What's it looking for?"*

### D27. [x] No way to see what a kind such as `Document` contains (GALLERY step 14)
**Answered and fixed 2026-08-15 — **`Document` contains nothing, deliberately.** It is a schema-free family wildcard; six subkinds carry the real shapes. A popover now says exactly that and names the members, read from the live registry rather than hardcoded per kind.**
*"How can a user know what the Document type contains?"*

### D28. [x] Run-order connectors are inconsistent and their size looks meaningful
**Answered and fixed 2026-08-15 — one accident, one real signal, one explanation. **(a)** A run-order line is drawn only where order is the *only* thing between two steps; where data flows, the coloured wire carries the order too. **(b)** The heights differed because activity cards pinned the pair at `top:18` while every other card left the default 50% — and the fills differed too, solid `#605E5C` (which is the *wildcard data-port* grey) against hollow white. Both now come from one module: the dashed wire's own grey at 18px on every rectangular card, with the switch diamond keeping centre because its vertices *are* its midpoint. **(c) The size difference is meaningful and said so nowhere** — 16px with a `+` means required and unconnected. The row tooltip now spells it out.**
*"Why do some nodes connect with the run-order connections, but others don't?
These connector nodes also appear at different heights on the nodes. Is there
meaning behind the difference in the size of the Poll status connector?"*
Screenshots
[`source/dylan-run-order-connectors.png`](source/dylan-run-order-connectors.png)
and [`source/dylan-poll-ocr-connectors.png`](source/dylan-poll-ocr-connectors.png).

### D29. [x] Legend category names aren't intuitive
**Fixed 2026-08-15 — the two labels that did not say what they are: *"Judgements about a document"* → **"Labels and check results"** (the family holds classifications and validation results — a label the app applied and a check it ran), and *"Pointers — IDs and lookups"* → **"IDs that point at something stored elsewhere"**.**
*"Some of the categories in this legend could be more intuitive. Like, what's a
'Judgement about a document'?"* See
[`source/dylan-card-borders-legend.png`](source/dylan-card-borders-legend.png).

### D30. [x] Poll OCR Results has far more fields than Extract OCR Results
**Answered and fixed 2026-08-15 — **neither OCR activity declares a single parameter of its own.** Poll OCR Results is a poll-until loop wrapping an activity while Extract is a plain activity, so every extra field is loop machinery. The panel now leads with that sentence and folds the three defaulted limits — nothing removed, and the toggle names anything already set.**
*"Why does a node like Poll OCR Results have so many more fields than something
like Extract OCR Results?"* Screenshot
[`source/dylan-ref-picker-operators.png`](source/dylan-ref-picker-operators.png)
shows the field stack he means.

## Suggestions

### D31. [x] Compare to Head should show a real diff (GALLERY step 11)
**Done 2026-08-15 — a real diff, with **no new dependency added**: none existed in the frontend's tree, and a text diff is the wrong tool for configs whose key order is not meaningful. A new config-diff walks both versions to their leaves, expands one-sided subtrees into added/removed leaves, and excludes the derived config hash (stating the exclusion in the UI). The modal opens on a **Changes** tab — summary line, one row per difference with both values, unchanged collapsed — and keeps the old side-by-side JSON as **Both versions in full**.**
*"The Compare to Head feature could be clearer if it showed an actual diff, not
just both versions in full."*

### D32. [x] Reuse the card-border legend colours in the sidebar node list
**Fixed 2026-08-15 — the palette entries now carry the same colour vocabulary as the cards, sourced from the same registry rather than copied hex, so the sidebar and the canvas mean the same thing.**
*"Could we use these colours in the sidebar list of nodes?"*

### D33. [x] The workflow list needs a search bar
**Done 2026-08-15 — client-side, because the list endpoint has no paging and the whole list is already in memory; a keystroke round-trip would only add flicker. Uses the existing house search component, matches name, slug and description, and the caption reads `1 of 35 workflows match "versioning"`. The empty state names the term, points at the Workflows/Libraries/All filter, and offers Clear search. A test asserts no extra fetch happens while filtering.**
*"Even with this number of workflows, it can be hard to find the one you want."*

### D34. [x] Demo workflow names reference "parts" that don't match the walkthrough
**Done 2026-08-14 — the suffixes are Parts of `MANUAL_TEST_PLAN.md`, not gallery stops. **Nothing renamed**: the title feeds the stable slug the guide links to and `seed-demo-runs.mjs` finds workflows by name. Documented instead, including that the gallery abbreviates the full seeded names.**
*"What do the parts reference on the demo workflow names? They don't correspond
with the parts of the walkthrough seemingly."*
