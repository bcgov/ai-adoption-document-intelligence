# Workflow designer — your review, answered

**[Pull request #271](https://github.com/bcgov/ai-adoption-document-intelligence/pull/271)
(branch `feature/workflow-builder-cumulative`) · reviews received 2026-08-14**

Two reviews arrived the same day and they are kept apart on purpose.
**[Part 1](#part-1--inderdeepsinghgill) is inderdeepsinghgill's five items. [Part 2](#part-2--dbarkowsky)
is dbarkowsky's thirty-four.** Neither of you needs to read the other's half; nothing
in Part 2 is required to understand Part 1 or the reverse.

Item ids (`I1`, `D22`, …) come from
[`CHECKLIST.md`](CHECKLIST.md) and are on every entry so you can point at one.
They are not the headline, and the entries are **not in numeric order** — within
each part they run from what blocked you, through real bugs, to questions and
polish.

---

## Before you read: three things that apply to both parts

### Running it yourself

Every "how to see it" below assumes the local stack is up. After the usual
setup that takes a few commands from the repo root, and it runs seven processes —
Postgres, MinIO, Temporal (a workflow engine that actually executes the steps),
the deno-runner (a sandbox container that type-checks custom steps), plus the
backend, the frontend and the Temporal worker:

```bash
docker compose --profile infra --profile temporal up -d
docker compose -f deployments/local/docker-compose.deno.yml up -d
npm run db:generate      # see D5 — this one bites
npm run dev              # backend, frontend and worker; leave it running
```

Then, from a second terminal once the backend answers, seed the
**🎯 Demo — …** workflows and their runs:

```bash
npm run seed:demos && npm run seed:demo-runs
```

The full, verified version of that is the **Before you start** section of
[`docs-md/workflows/GALLERY.md`](../../docs-md/workflows/GALLERY.md) — which is
dbarkowsky's item D5, and it did not exist when he walked the tour.

### Where the pictures came from

Every image is a screenshot of that stack, taken by
[`capture-screenshots.mjs`](capture-screenshots.mjs) at 1920×1080, with the same
route, the same crop and the same canvas zoom rule in both phases, so a
before/after pair differs by the fix and not by the framing. Where a pair
differs in anything else, the item says so. Nothing is a mock-up and nothing is
composited.

**Four frames are not straight photographs, and each one says so where it is
used:** `I1` and both `D12` frames need one API route intercepted to reach a
state this database cannot otherwise be in, and the `D12` *before* frame is
additionally a **reconstruction** of the old button label. The full accounting is
in [`screenshots/before/MANIFEST.md`](screenshots/before/MANIFEST.md) and
[`screenshots/after/MANIFEST.md`](screenshots/after/MANIFEST.md).

### What the status words mean

- **Fixed** — code changed, and the change is visible.
- **Answered** — the app was already right; what was missing was the answer, the
  documentation, or the words on screen. Where nothing changed at all, it says
  so.

---

# Part 1 — inderdeepsinghgill

Five items. The first is the one that mattered: it is why four of the five came
from screenshots rather than from using the thing.

---

## I1 · The assistant still didn't answer for you — **Fixed**

> *"The agent is not working for me, as was the case earlier."*

**Three separate causes, and only one of them was yours.**

1. **The build.** The error-surfacing you asked for last round shipped on
   2026-08-08 **on this branch only**. `origin/develop` contains no agent-chat
   code at all — `git ls-tree origin/develop -- apps/frontend/src/features/agent-chat/`
   is empty — so anything built from `develop` still fails silently.
2. **A genuinely silent state, and this was ours.** The drawer collapsed two
   opposite facts into one branch. `if (isError || options.length === 0)` both
   rendered the reassuring label *"Server default model"* with the composer left
   live. But "the request failed" means we don't know what the server has, while
   "the list is empty" means the server told us, successfully, that it has
   **nothing** — and an unconfigured server therefore never said so.
3. **A stale generated Prisma client** (the database access layer, regenerated
   per-developer and gitignored) was returning a 500 on every send that morning.
   Logged as `201` by the request logger, which is why nobody noticed. Cleared by
   regenerating; the mislabelled log line is filed as its own defect.

**What changed.** The drawer now has four states instead of two: *loading* ·
*unknown* (the request failed — composer stays live, the backend can still pick)
· **unconfigured** · *ready*. The unconfigured state names the environment
variables that are missing, points at a new setup page
(`docs-md/workflows/AGENT_SETUP.md`), and disables send. The reason is on a
tooltip that opens when the send button is hovered **or reached with the
keyboard**, and the same sentence is the button's accessible description. A
disabled Mantine button fires neither pointer nor focus events, so a tooltip on
the button itself is unreachable by mouse *and* by keyboard; the tooltip sits on
a wrapper round it instead. Pressing **Enter** in the message box sends nothing
while sending is disabled, and keeps what you typed. jsdom cannot see any of
this, so all of it was checked in a real browser: two presses of Tab reach the
button and open the reason.

Only variable **names** ever reach that response. The backend never puts a value
in it and the test suite asserts that.

| After |
|---|
| ![The chat drawer showing a grey notice, "The assistant isn't configured on this server", naming the variables to set and disabling send](screenshots/after/I1-assistant-unconfigured.png) |

**⚠ This frame is intercepted, and here is exactly why.** The state is real code
on a real page, but it only renders on a backend with *no* model provider
credentials — and this dev stack has Azure OpenAI configured, so
`GET /api/agent/models` correctly answers with a model. The script therefore
fulfils that one route with the body an unconfigured backend really sends. There
is **no before frame**: the pre-fix build rendered "Server default model" and is
not in the tree to photograph.

**See it yourself.** `http://localhost:3000/workflows` → the speech-bubble icon
in the header opens the drawer. To reach the unconfigured state for real, unset
the Azure and OpenAI variables on the backend and restart it.

**Deployed instances:** the four `AZURE_OPENAI_*` variables reach the
backend-services container on every deployment path, each optional, so an
instance with no key boots with the assistant visibly disabled rather than
failing to start. The details are under *Residuals* at the end.

---

## I5 · The red CTA on the error card — **Fixed, and your question answered**

> *"In the error message, the CTA button is in red. Normally, red button means a
> destructive action whereas re-run workflow isn't destructive."*
>
> *"Also, not sure if the clicking Re-run workflow would re-run only this step or
> complete workflow from start. If only this step, maybe "Try again" might be
> better button label…"*

**Your question first, because it decides the label: it re-runs the whole
workflow from the start.** Traced end to end — the handler fetches the run's
*original* input (`GET /workflows/:id/runs/:runId/input-ctx`, which is per-run,
not per-node), posts a new try, and the backend starts a brand-new Temporal
execution from the entry node. There is no re-execute-one-step endpoint anywhere
in the workflow controller. So **"Try again" would have been the untrue label**
and "Re-run workflow" stays. What was wrong is that a card sitting on one failed
step left you to infer that, so the card now states the scope in a line of grey
text under the reason, at 5.4:1 contrast: *"Runs the whole workflow again from
the start, with the same input."*

**On the colour, you were right.** Filled red is this UI's destructive treatment
— it is what the Delete, Remove and Ungroup buttons use — and re-running deletes
nothing. Restyled to the B.C. Design System inline-alert pattern you linked: a
1px danger border taken from the theme token rather than pasted as a hex (the
theme already maps Mantine's red to the BC scale), the **alert-circle** icon in
place of the triangle (the triangle is BC's *warning* icon, not its danger one),
and the button changed from filled red to outlined.

**One sibling swept.** The cache-evicted alert repeated the same filled-red
Re-run when a re-run itself failed; it is outlined now, its variant type no
longer permits `filled` at all, and its Re-run button carries the same scope
line. Everything else red in the preview and run panels
was checked and left alone — they are alerts with no CTA, status badges, or
genuinely destructive Delete/Remove/Ungroup buttons. Those are what make filled
red mean something.

| Before | After |
|---|---|
| ![The failed-step notice with a filled red "Re-run workflow" button and a warning triangle](screenshots/before/I5-no-output-error-card.png) | ![The same notice with a 1px danger border, an alert-circle icon, a new scope line and an outlined button](screenshots/after/I5-no-output-error-card.png) |

The after frame is 39px taller; that difference is the scope line.

**See it yourself.**
`http://localhost:3000/workflows/by-slug/demo-typed-i-o-coloured-handles-type-pills-part-7/edit`
→ **Run…** → **Try** with the ctx left as `{}` → wait for **Prepare** to go red
→ click that card's result strip (the one-line band that read "Not run yet"). The
notice is inside the strip's expanded detail, not on the card face. It has to be
a live failed run: this is a *preview* surface and renders nothing without one.

---

## I3 · The composer footer — **Rebuilt to your mock-up**

> *"I believe the bottom part of the chat ui looks off. How about this?"*

Rebuilt to [`source/inderdeep-mockup-composer.png`](source/inderdeep-mockup-composer.png):
the message box on its own line, then one footer strip — attach `+` hard left
(was a paperclip), the model name and tier beside it, send/stop hard right.
When the server offers more than one model, the name is a menu with a chevron,
and the open menu lists each model with its one-line descriptor underneath and
a check on the selected one. When it offers one, the name is a plain label,
with a tooltip saying it is the only model this server is configured for. The
tier is grey text at 6.5:1 contrast.

**Nothing from the mock-up is hardcoded, and that is the part worth knowing.**
Your "Sonnet 4.5 / Haiku 4.5 / Opus 4.6" are not in the code. The picker renders
whatever `GET /api/agent/models` returns; a new backend module derives the short
name and the tier from the model *family* using each vendor's own published
positioning. An Azure deployment name is shown verbatim, because renaming
somebody's deployment in the UI would hide the one string they have to match
against their portal — and a deployment whose id names no recognised family gets
**no tier at all** rather than an invented one. On the machine the after frame
was taken on, that is one entry, `gpt-4o` · `Balanced`, so the frame shows the
plain label.

| Before | After |
|---|---|
| ![Composer: paperclip, textarea, send arrow, with "Azure OpenAI — gpt-5.4" as a dimmed caption below the row](screenshots/before/I3-chat-composer-footer.png) | ![Composer: message on its own line, then one footer strip — plus, "gpt-4o Balanced" as a plain label, send hard right](screenshots/after/I3-chat-composer-footer.png) |

The two frames name different models because each shows the deployment its
server was configured with when it was taken.

Measured from real bounding boxes in a browser rather than from the DOM order:
attach x=968 → picker x=1000 → send x=1458, all on one row.

**See it yourself.** `http://localhost:3000/workflows` → chat bubble in the
header → look at the bottom strip.

---

## I2 · Send-becomes-stop — **Already correct in the app. The walkthrough's picture is re-shot.**

> *"From the snapshots it seems like the stop icon is still at the top. I believe
> we discussed the send button transitioning to stop when inflight."*

**It already does, and no code was changed for this item.** Four independent
checks agree:

- There is exactly **one** stop affordance in the whole agent-chat surface, and
  it is the composer's send button swapping `IconSend2` for
  `IconPlayerStopFilled` while a turn is running.
- The drawer header renders exactly three buttons — history, new conversation,
  close. There is no abort control up there and no test id for one anywhere in
  the tree.
- `develop` has no agent-chat directory at all, so the composer's stop button,
  like the rest of the assistant, exists only on this branch.
- Four tests assert the behaviour and still pass, and it was driven in a real
  browser as well.

**Where the snapshot most likely came from: the walkthrough's own stop 16
picture.** It showed an older version of the panel, with a square icon at the
top and an older model menu, and that square reads as a stop button. The
picture is re-shot from the current panel. To use the assistant itself you need
a build of this branch, for the reason in I1.

| Idle | In flight |
|---|---|
| ![The composer with nothing sent — the primary action is a send arrow](screenshots/before/I2-composer-idle.png) | ![The same composer with a turn in flight — the send arrow has become a filled stop square, header unchanged](screenshots/before/I2-composer-in-flight.png) |

**These are filed under `before/` and they are also the *after*.** Re-shooting
them would produce two identical files and imply a change that was never made.

**One caveat you need in order to read the second frame.** The agent errors here
in about a tenth of a second, so the in-flight state is real but too brief to
photograph. The capture script therefore **delays the outgoing POST by nine
seconds**. Nothing about the response is faked — the same request reaches the
same backend and fails the same way a moment later.

**See it yourself.** Open the drawer from any page, type anything, press send,
watch the bottom-right button.

---

## I4 · The error chip's icon and text — **Fixed**

> *"Nitpicking but in the error chip, the icon and the text aren't aligned."*

You were right: the × sat low. Mantine's Badge centres the icon's *box* and the
label's *line box* on one row, but neither one paints where its box says, and
the cause is worth a sentence. In the chip's 14px row, Chromium rounds BC Sans
Bold's ascent and descent to whole pixels and puts the odd pixel of leading
below the text, so the capitals of `ERROR` centre 7.79px from the chip's top
edge. The icon's 11px box is centred in the row, so its top falls on a half
pixel, and the svg is painted from the next whole pixel down, which centres the
× at 8.5px. The × sat **0.71px low**.

The fix moves it up by exactly that, computed from the font's own metrics
(`hhea` and `OS/2`) and that whole-pixel painting rather than tuned by eye.
Measured on the rendered chip in BC Sans at 1×, 2× and 4×: the two centres are
within **0.01px**.

**The nudge is on the glyph, not on the label, and that was the decision.**
Moving the label would have aligned this chip and desynchronised its text from
every sibling chip on the same card — `DYN`, `Deleted`, `ENTRY`, the group node
counts, the validation error count — all of which are text-only and therefore
correctly box-centred today.

| Before | After |
|---|---|
| ![The red × ERROR chip at 2× zoom, glyph sitting slightly low](screenshots/before/I4-node-error-chip.png) | ![The same chip at the same 2× zoom, glyph on the label's optical centre](screenshots/after/I4-node-error-chip.png) |

**This difference is sub-pixel by design.** At this zoom it reads; it is not a
frame that will survive being looked at on a phone.

**See it yourself.**
`http://localhost:3000/workflows/by-slug/demo-typed-i-o-coloured-handles-type-pills-part-7/edit`
→ **Run…** → **Try** with the ctx left as `{}`. Its **Prepare** step needs a file
the empty ctx does not give it, so it fails within seconds. Zoom in on the failed
card's title row. It has to be a live run — the chip renders nothing without an
active run id, because a design-time canvas deliberately shows no statuses. The
before frame was taken on a probe workflow whose `file.prepare` step failed the
same way; a seeded database does not have it.

---

# Part 2 — dbarkowsky

Thirty-four items. Ordered by what they cost you: the five that stopped the
walkthrough, then six real bugs, then the questions where the app was right and
would not say so, then the three suggestions (all built), then the walkthrough
text itself.

Vocabulary you will meet below, defined where it first appears: a **run-order
edge**, a **kind**, a **ctx key**, **auto-wire**, a **lineage**, a **pin**.

---

## What stopped the walkthrough

### D1 + D2 · Standard OCR Workflow failing at Poll OCR — **Fixed** (GALLERY stops 9, 10)

> *"Could not complete because standard workflow is failing at Poll OCR step.
> What has changed since the develop branch that would affect this?"* — and, for
> stop 10, *"Same issue as #9"*.

**What failed was the model, on the path you took, and the error message hid
it.** That is the answer to "what has changed". You ran Standard OCR Workflow
from the Upload page, which starts the run with the model you pick there. In
this branch's template, the Prepare step carried a typed-in model,
`sdpr_synth_test`, which Submit OCR used, while Poll OCR read the model the
upload chose. An upload naming any other model was submitted under one model and
polled under another, and Azure answers a poll for the wrong model with 404. A
run on the default model went green end to end, because there every step
agreed. `develop` wires every OCR step to the run's model, so this was a
regression on this branch, from the rework of the demos and templates into real
working chains.

And every failed step in the canvas, the run-history drawer and the node-status
API reported the literal string **`"Activity task failed"`** — for every failure
mode. That is the message Temporal puts on its own `ActivityFailure` envelope;
the activity's real message hangs off `.cause`, and the runner was reading
`error.message`. A missing credential, a wrong model id, a code defect and a
missing blob were indistinguishable. The per-node status map *itself* is new on
this branch, so `develop` never surfaced a per-step message at all and the
defect arrived with the surface that shows it. All three now show the
activity's own message.

Two more defects were found and fixed, from the same rework:

- **A phantom output port.** The catalog — the shared contract the builder, the
  validator and auto-wire all read — declared the poll activity's output as
  `ocrResponse`. The activity actually returned `response`. The runner binds
  outputs by reading `result[port]` and writes whatever it finds, **including
  `undefined`, without complaint**. So `ocrResponseRef` was never written, and
  nothing after Poll could read the OCR response. The runtime was renamed to
  match the catalog (renaming the catalog instead would have broken auto-wire's
  ability to connect poll → extract by name), and five templates plus three docs
  were corrected. The Poll card itself shows no result line: it is drawn as a
  waiting step, which stop 9 says.
- **Poll's 404 said nothing.** It threw a bare `Status: 404` while its sibling
  Submit OCR had carried a full diagnostic hint for the identical status code
  since before this branch. Poll now names the request id and the model,
  explains that an analyze result belongs to the model it was submitted with,
  points at the endpoint variable, and mentions Azure's 24-hour result retention.

Before and after, on the same reproduced failure:

```
before:  Activity task failed
after:   Failed to poll OCR results. Status: 404 No analyze result
         "e8387e24-…" under model "prebuilt-layout". An analyze result belongs
         to the model it was submitted with, so check that this step polls the
         SAME model id the Submit OCR step used, and that
         AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT points at the resource the
         document was submitted to. Azure also discards analyze results after
         24 hours.
```

No before/after screenshot: the change is a string inside a run that has to
fail, and the two strings above are the evidence.

**The model now reaches every OCR step by one route.** Prepare takes its model
as an input, as Poll and Extract do, and all three read the run's `modelId`. The
workflow declares `modelId` as a run input with `sdpr_synth_test` as its
default, and the Upload page's **Processing model** is what fills it. Two tests
guard this: every shipped template's Prepare, Poll and Extract must read one
declared variable, none of them a typed-in value; and a real workflow run of the
template, on a non-default model, against a fake Azure that answers a poll only
for the model the document was submitted under. The local mock ignores the
model, so it cannot catch this kind of mismatch; the fake can.

Checked on your path: the Upload page, model `prebuilt-layout`, Standard OCR
Workflow, against real Azure. Prepare, Submit, Poll and Extract all ran under
`prebuilt-layout`, and the run completed in 11 seconds.

**See it yourself.** `http://localhost:3000` → **Upload** in the left nav →
choose a **Processing model**, pick **Standard OCR Workflow** under **Workflow
(optional)**, add a PDF and press **Upload**, then follow the document on the
**Documents** page. The editor's **Run history** lists only runs started from
the editor, so an uploaded document's run is not there. If you have no Azure
account, set `MOCK_AZURE_OCR=true` in the root `.env` and restart the worker —
Submit and Poll then short-circuit to canned responses and the whole thing runs
green, which is enough to walk stops 8–10.

**One environment requirement you would have hit anyway**, now in the
walkthrough: regenerate the Prisma client (`npm run db:generate` — see D5). And
the workflow's default model, `sdpr_synth_test`, is a **custom-trained** Azure
model, not a prebuilt: a run left on the default, against an endpoint whose
resource does not have that model, 404s at *Submit*, naming the model.

### D3 · "Publish failed — Failed to reach deno-runner /check" — **Fixed** (stop 14)

> Screenshot: *"Publish failed — Failed to reach deno-runner /check at
> http://localhost:9099 — see error markers."*

Your diagnosis was right: the **deno-runner** — the sandbox container that
type-checks a custom step before it is published — is a separate process in the
stack and yours was not running. Nothing in the walkthrough told you to start it,
and the error named an internal service instead of saying what to do.

**Both halves are fixed.**

*The message is now built where the failure happens*, and the URL is demoted out
of the headline onto a `details` field and a WARN log. A loopback URL means a
developer's own machine, so it names the command; any other URL is a deployed
sidecar the caller cannot start, so it says retry-then-escalate. Neither wording
contains a URL. A dedicated response DTO is wired into both service-unavailable
Swagger decorators. Verified by actually stopping the container:

```json
HTTP 503
{"code":"DENO_RUNNER_UNAVAILABLE",
 "message":"The custom-node checker is not running, so this script could not be
            type-checked. Start it with `docker compose -f
            deployments/local/docker-compose.deno.yml up -d`, then publish again.",
 "details":"POST http://localhost:9099/check could not be reached: fetch failed"}
```

*The editor caught up in a second pass the same day* — this was listed as a
residual on the checklist and is now closed. It had been wrong twice over: it
appended `" — see error markers"` to **every** publish failure, and for an
unreachable checker there are no markers at all (the script is perfectly valid;
the *service* is what failed). It also discarded `details` entirely. The marker
sentence is now appended only when markers actually exist. The failure still
raises a notification, and also renders as a **persistent** alert in the editor,
because a notification is gone in a few seconds and a failure whose remedy is
"start this service and publish again" has to survive long enough to be acted
on. The alert stays until you close it, and its **Show technical details**
expands the endpoint diagnostic.

*And the walkthrough gained the prerequisite*, which is where D5 comes in.

**See it yourself.** `http://localhost:3000/dynamic-nodes/new`, write anything
valid, stop the deno-runner container, press **Publish**.

### D5 · Where the demo workflows come from — **Fixed** (documentation)

> *"It should be clearer where the Demo workflows come from and how to load them.
> I needed to find a separate file about seeding this separate demo data, then
> figure out that I had to generate an API key in the app and update some ENVs."*

The walkthrough opened by claiming *"You need no setup, no terminal, and no
database"*, which was simply false and is the root of this item and half of D3.
It now says somebody has to bring the stack up and seed it first — about ten
minutes of terminal, once — and carries a four-part **Before you start** section:
bring the stack up, seed the demos, read the demo names, and a table of which
stop needs what.

**Your API-key step is obsolete and that is worth knowing.** The seeders read the
root `.env` — the one env file the backend, the worker and the database seed
read — and try the keys the database could have been seeded with until one
authenticates. No key value is logged and none appears in the doc.

**Two additions you did not report but would have hit.** First,
`npm run db:generate` after any pull that touches the schema — the generated
Prisma client is written into two directories and **both are gitignored**, which
is what makes a stale one so baffling: `git status` is clean, the branch is
right, and what goes wrong looks unrelated (a run dies at its first step with
`Cannot read properties of undefined (reading 'findUnique')`, and the
dynamic-nodes endpoint 500s, which the palette renders as a calm *"No custom
nodes yet"* — identical to genuinely having none). Second, `MOCK_AZURE_OCR=true`
in the root `.env` for anyone with no Azure account.

**See it yourself.** [`docs-md/workflows/GALLERY.md`](../../docs-md/workflows/GALLERY.md),
the **Before you start** section.

### D4 · Credentials for the assistant — **Answered, and the crash fixed** (stop 16)

> *"I don't think I have the credentials for this. Which subscription is it meant
> to be using?"*

**The answer: Azure OpenAI through the BC Gov AI Hub APIM proxy — the same Azure
OpenAI subscription key the OCR-enrichment code already uses, not a separate
one.** Four environment variables gate it (`AZURE_OPENAI_ENDPOINT`,
`AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`).
Anthropic is fully implemented as a second provider but is configured nowhere in
this repo, so in practice there is one path.

**There is no self-serve route.** Alex hands out the key, and it goes in the root
`.env`, the only env file the backend reads. So this was not a gap in your setup — it was
a gap in the repo, and two documentation silences produced it: `.env.sample`
shipped **non-empty placeholder values**, so a copied sample reported itself
configured and then died on a DNS lookup of a hostname that does not exist; and
the test plan's entire setup answer was one table cell.

**What changed.** The four Azure placeholders in `.env.sample` are blanked.
`docs-md/workflows/AGENT_SETUP.md` is written — which service, which variables,
where to put them, what an unconfigured environment looks like, and how to ask
for access — and linked from the test plan and the docs index.
`GET /api/agent/models` now returns the missing variable **names** (asserted by
tests that no value can leak).

**And the backend no longer refuses to boot.** With no provider configured at
all, the agent module threw at construction — a dependency-injection failure at
startup, in a module the app imports unconditionally. A developer without a key
got a **dead app**, and the error named the agent module, so it read as the agent
having broken the build. The throw is gone; an unconfigured environment boots
with a visibly disabled assistant. See I1's after frame for what that looks like.

### D6 · `Demo - Deleted` "wasn't seeded" — **Answered: it was, deliberately** (stop 15)

> *"Appropriate name, because the Demo - Deleted custom node doesn't appear to
> have been seeded."*

**Not a defect.** `demo-deleted-node` *is* seeded — published, referenced by the
Part 14 demo workflow, and *then* soft-deleted one second later. That order is
the whole fixture: a workflow has to reference a step before the step can become
a tombstone, which is what gives the canvas a genuinely missing step to draw.

```
 slug              | group_id         | deleted_at
 demo-deleted-node | seeddefaultgroup | 2026-08-09 23:35:23.967
```

`GET /api/dynamic-nodes` excludes soft-deleted lineages **by design** — a
*lineage* being the versioned history of one custom step, the thing that survives
across publishes — and the endpoint's own Swagger says so. So the management page
correctly does not list it. Its absence there *is* the state stop 15 is
demonstrating.

Two things made it read as a seeding gap, and both are answered rather than
coded: the stale Prisma client made that page 500 outright, so nothing could be
confirmed either way; and stop 15 never said the node is *supposed* to be missing
there. The walkthrough now spells out that the management page deliberately
hides it while the workflow's canvas is where it shows up — plus how to tell
"working as designed" from "seeding actually failed" (if the canvas has no such
step either, the deno-runner was down at seed time and the seeder printed
`– deleted-dyn    skipped (deno-runner unavailable)`).

**Check it yourself, read-only:**

```bash
docker exec postgres psql -U postgres -d ai_doc_intelligence \
  -c "select slug, group_id, deleted_at from dynamic_node where slug like 'demo-%';"
```

---

## Bugs

### D11 · Restore just re-tags HEAD — **Fixed, and it was worse than you saw** (stop 11)

> *"It did not appear to bring back the old version as a new version in the UI as
> the instructions suggest. It looks like it just tags it as the HEAD."*

**You were right, and the consequence was worse than the symptom.** Restore
performed exactly one database write — it moved the lineage's head pointer onto
the existing old row. No new version was created. Confirmed against the running
stack: after a revert the lineage still had two rows and head pointed at v1.

The part nobody had noticed: **new versions are numbered from the head, not from
the maximum** (`nextNum = head.version_number + 1`), against a uniqueness
constraint on `(lineage, version_number)`. With head parked on v1 while v2
existed, the next save asked Postgres for a second `(lineage, 2)`. Reproduced on
the dev stack — HTTP 500, three passes of the retry loop, then
`duplicate key value violates unique constraint`. **Restoring an old version
silently made the workflow unsaveable.**

Two documents disagreed about which behaviour was intended, and the tie-break was
not editorial: only the append reading keeps head at the highest version number,
which is the invariant the rest of the versioning code already assumes. So the
behaviour is what changed. Restore now, in one transaction, copies the selected
version's config forward as a new version at `head + 1`, moves head to it, and
audits both. The source row is untouched, so its run counts stay attached to the
version that produced them.

| After |
|---|
| ![A green notification reading "Restored v1 as v3 — The editor is on v3, a new version holding v1's steps. v1 is still in the history."](screenshots/after/D11-restore-toast.png) |

The old toast said *"Reverted to v1"*, which is precisely what read as a re-tag.
**There is no before frame** — the before pass did not shoot D11 and the old
toast is not in the tree.

**⚠ This frame was shot against a scratch lineage, not the seeded demo.**
Restoring *writes*, and doing it to the Part 12 demo would leave it sitting on a
v3 nobody seeded. The script creates its own lineage, reaches v2, restores v1
through the real UI, and deletes the lineage in a `finally`. The version numbers
in the toast are the backend's own answer to a real `revert-head` call.

Verified end to end: head moves to v3, and a save straight afterwards returns
**200** where it used to 500.

**Unsaved edits on the canvas are discarded by a restore, as its confirmation
says.** After a successful restore the editor reloads onto the restored version:
the canvas shows its steps, nothing is left unsaved, and the next save builds on
the restored version instead of storing the discarded edits over it.

**See it yourself.**
`http://localhost:3000/workflows/by-slug/demo-versioning-history-revert-part-12/edit`
→ **More → Version history** → **Revert to this version** on the older row →
confirm. Then save — that is the half that used to fail. To see unsaved edits
discarded, move a card or rename a step first, without saving, and then
restore.

### D7 · Typing in node config is very laggy — **Fixed** (stop 7)

> *"Typing in the field is very laggy. I suspect it's the same problem as the HITL
> page, where updates are causing a lot of the page to re-render when it really
> shouldn't if broken up."*

**Your hunch is right and it is the same class of defect.** There was no local
draft state anywhere on the input path, so **one keystroke wrote a whole new
workflow config at page level**, and three things then did work proportional to
the size of the graph:

- **auto-wire** — the resolver that connects a step's inputs to earlier steps'
  outputs automatically — re-ran an upstream graph walk *per typed port, per
  character*, and **rewrote downstream bindings from the half-typed value**:
  typing `c` → `cu` → `cur` bound the loop body's input to ctx key `c`, then
  `cu`, then `cur`;
- those bindings are part of the canvas's structural fingerprint, so the canvas
  re-projected the whole graph per character, allocating a fresh object per node
   — which defeats xyflow's identity reuse and re-renders every card;
- independently, the validation hook handed out a brand-new errors map on every
  edit, 300 ms before the debounced validator it belongs to had even run, and
  the canvas's badge-sync effect **always allocated a new node array** off it.
  The sibling hover effect twenty lines below already did the `return prev`
  guard correctly — it was the model, not an invention.

Three changes, cheapest first: the badge-sync guard; the validation result now
carries its own node-id snapshot so the live config leaves the memo's
dependencies; and **every free-text and number box in a step's settings keeps
what you type locally and writes it into the workflow once typing pauses**, and
when you leave the box, through one `useDebouncedTextCommit` hook. That covers
your field, *Item ctx key*, and Node label, the variable boxes, a condition's
typed value, keyword patterns, classification and validation rules, page ranges,
a group's label and description, the poll step's interval and limits, the
human-gate and sub-workflow settings, and the schema form's text and number
fields. The canvas does not redraw while you type, and the problem badges on the
cards stay on screen: they take their counts from the latest validation results.
Selecting another step writes any pending text to the step it was typed for.

**This cannot be photographed, so it was measured**: the time from each key
press to the next painted frame, with the browser's own event timing alongside.
24 keys typed 60 ms apart, three rounds, before and after the change, on the
11-step Standard OCR workflow unless the row says otherwise. Dev build — Vite dev
server and a development React, which is the build you were typing into. The
median per round:

| Field | Before | After |
|---|---|---|
| Node label (Prepare File Data) | 74–160 ms, up to 0.96 s | 5–6 ms |
| A poll step's stop condition, typed value | 52–66 ms | 7–14 ms |
| A branch's case, typed value (16-step multi-page report) | 79–193 ms | 12–13 ms |
| A group's label | 75–93 ms | 6–8 ms |
| A poll step's interval | 54–96 ms | 6–8 ms |
| A keyword pattern (multi-page report) | 47–56 ms | 6–9 ms |

A frame at 60 Hz is about 17 ms. Before, every key in these fields took longer
than one; after, none does. *Item ctx key* measures 9–13 ms.

**See it yourself.** Open **Standard OCR Workflow**, click **Prepare File Data**
and type into **Node label**: the box keeps up with you, and the card's title on
the canvas changes once you pause.

### D8 · The custom-step editor jumps the caret to the end — **Fixed, both causes** (stop 14)

> *"The editor occasionally forces the cursor to the end of the last line. Maybe
> this is happening when it reloads? Makes it very frustrating to type."*

Monaco — the code editor component — is driven as a fully controlled `value`
with a 150 ms debounced round-trip through the parent, so the text prop is
**the editor's own text echoed back late**. When that echo differs from the live
buffer, `@monaco-editor/react` applies it as a single full-model `executeEdits`
with `forceMoveMarkers: true` — caret to the end of the document — and suppresses
the change event for that programmatic edit, so nothing ever self-corrected.
Pause for 150 ms mid-sentence, keep typing, and the stale echo wins: characters
gone, caret moved.

**Your "when it reloads" guess was a real second contributor.** The hydration
effect had no once-per-lineage guard, and three modal mount sites render the
editor while the detail fetch is still in flight.

Fixed on both sides. A `lastEmittedRef` records what was emitted *before* the
parent can echo it, so a stale echo is always recognised and dropped while a
genuine external change — an undo, a revert, an agent write — still lands. A
`hydratedSlugRef` hydrates once per lineage, and in edit mode the editor is **not
rendered at all** while the detail fetch is loading: nothing may be typed into a
buffer that is about to be replaced.

**A sibling defect went with it**, 100% reproducible: select-all + delete
round-tripped an empty string, hit a `script || BOILERPLATE` fallback, and
re-inserted the whole boilerplate. It stays cleared now.

**No screenshot — a caret is not photographable — so the evidence is a browser
test.** `tests/e2e/workflow-builder/specs/tier1-code-pane-caret.spec.ts` drives
real Monaco in Chromium and reads the caret out of the rendered cursor layer,
because this app bundles Monaco locally and never exposes `window.monaco` for a
test to reach. Two checks pass: select-all + delete stays deleted with the caret
on the one empty line, and 26 pause-and-resume typing cycles swept across the
150 ms debounce boundary keep every character *and* the caret. Both were
confirmed to fail against the old behaviour — with the guard removed, 25 of the
26 characters were lost.

**And writing that test found a second cause of the same symptom — now fixed
too.** The echo guard worked, but `CodePane` still drove Monaco as a *controlled*
component, so its `value` trailed the editor's own model by one React commit
whenever two keystrokes landed inside a single commit; the library applied the
older string as the same full-model replace, and the caret went with it. The text
recovered on the next commit; the caret did not. That is exactly the
intermittency you described — it fires whenever a commit runs long, which a large
script makes routine.

The fix follows what the library and Monaco actually prescribe rather than a
tighter guard: `CodePane` now passes **`defaultValue`, never `value`**, so the
editor owns its buffer while you type, and deliberate re-seeds — first load, a
revert to an older version, a change of lineage — are pushed in imperatively.
The unit-test stub was a controlled `<textarea>`, which cannot express that
contract at all, so **the stub was rewritten rather than the assertions
weakened**. The third browser test, which reproduced this case, is un-skipped and
passes.

**The editor mounts only once the step's script has loaded**, so **Edit script**
opened from the canvas holds the step's own code, never the starter script. A
browser test opens that window from the settings panel and from the right-click
menu on a freshly loaded page, and checks the editor holds the step's latest
published script.

**See it yourself.** `http://localhost:3000/dynamic-nodes/new` — type a sentence,
pause about a second mid-word, keep typing. Then select all and delete. And in a
workflow with a custom step, select the step and choose **Edit script** in its
settings.

### D9 · A drag from the Segments output makes a run-order edge — **Fixed** (stop 7)

> *"It's strange that connecting the Split Document to the Run for Each Item nodes
> creates the edge between the order-of-operation connectors, even if I start it
> from the Segments output."*

**A real classification bug, reproduced.** Two kinds of connection live on these
cards: a **data edge**, drawn between two per-port dots, which carries a value
from one step to another; and a **run-order edge** (the dashed grey one, also
called the order-of-operations connector), drawn between the node-level dots,
which carries only "this runs after that" and no data at all.

The connection was classified by its **target handle alone**: both endpoints on
per-port handles → pin a binding; anything else → fall through and create a plain
run-order edge. A data-port source dropped on a node-level target satisfies
"anything else". And the validity check agreed with it —
`if (sourcePort === null || targetPort === null) return true` — so xyflow was
never given a reason to refuse the drop. **A test even asserted this as intended
behaviour.**

Reproduced with real mouse events before anything was changed:

```
from {"x":896,"y":483} -> to {"x":1073,"y":600}
after edges: [{"dash":"6px, 4px","stroke":"rgb(156, 163, 175)"}]   ← the run-order wire
after toasts: []                                                    ← silently
```

**The origin decides now.** A new module resolves the *target's real input rows*
— the dots the card actually mounts, not the catalog — and returns one of three
verdicts: exactly one compatible input → complete as the data edge you drew;
several → refuse and name them; none → refuse, distinguishing *"this step has no
data inputs at all"* from *"it has some and none accepts this kind"*. Every path
that handles the drop asks that one function, so they cannot disagree, and the
handler returns outright on a non-port verdict, so the invariant holds even if
something reaches it directly. The answer is the same wherever you let go on the
card, on its run-order dot or on its body; only on empty canvas does the drop
open the "pick a step" list. Your exact case now:

```
after edges: []
after toasts: ["\"Run for each item\" has no data inputs — it reads its values
 from workflow variables. To make it run after this step, drag between the two
 grey run-order dots instead."]
```

Drags that *start* on the node-level dot are untouched — that gesture is
authoring run order, which is D10.

**No screenshot: this is a gesture and its refusal, and the two readouts above
are the evidence.**

**See it yourself.** Any workflow with a Split Document and a Run-for-each-item
step: drag from the violet **Segments** output onto the loop card.

### D13 · Simplified view distorts the layout — **Fixed**

> *"Turning Simplified view on and off does some weird things to the formatting."*

**Not a canvas bug. Toggling the switch silently reverted the whole workflow to
the raw server copy.**

The `simplifiedView` flag was captured by the auto-arrange callback, whose
identity flowed into the dependency array of the server-hydration effect — and it
was that effect's **only** unstable dependency, changing for exactly one reason:
the toggle flipped. The effect's guards are "edit mode with a workflow" and "no
unsaved changes", and the arrange-on-load path deliberately re-bases its
reference so demos do not open dirty — so a freshly arranged workflow is *clean*
and therefore unprotected. Which is exactly the walkthrough's state.

Every flip re-ran the hydrate. The measured arrange-on-load layout was replaced
by the loose pre-mount fallback and never repaired; an unsaved rename was
reverted; neither left an undo step, and one subsequent edit plus Save would make
it permanent. It reads as "on **and** off" because of effect ordering: the ON
flip re-projects from the still-good config, and only the OFF flip re-projects
from the reverted one.

Fixed with both changes the diagnosis proposed: the flag now lives in a ref read
at call time, so the arrange callback's dependencies are stable; and a
`hydratedFromRef` guard means hydration is driven by *the server copy changing*
and never by the identity of anything inside the component.

| Before — Simplified off | Before — Simplified on |
|---|---|
| ![Fit view, five cards inside two group containers](screenshots/before/D13-simplified-off.png) | ![Immediately after switching Simplified on — two group chips stranded at the old zoom](screenshots/before/D13-simplified-on.png) |

| After — Simplified off | After — Simplified on |
|---|---|
| ![The same crop, Simplified off](screenshots/after/D13-simplified-off.png) | ![The same crop, Simplified on, the two group chips filling the view](screenshots/after/D13-simplified-on.png) |

**That first pair cannot show this fix, and saying so is the point.** What the
toggle broke was never the simplified projection — it was the revert, and that
is only observable on the way *back*. The before pass stopped at "on". The two
"on" frames differ only in zoom: each switch of the view refits the camera to
what is on screen. Two unpaired frames carry the evidence:

| The round trip | The unsaved rename |
|---|---|
| ![Simplified switched back off — the five cards return at their measured positions inside their two group boxes](screenshots/after/D13-simplified-off-again.png) | ![The top bar after renaming without saving and toggling twice — the edited title is still there](screenshots/after/D13-unsaved-rename-survives.png) |

**The round trip is identity.** The cards, the wires and both group boxes come
back exactly as they were on arrival. The frame is zoomed slightly further out
than the first one, because each switch refits the camera; the layout is the
same.

**See it yourself.**
`http://localhost:3000/workflows/by-slug/demo-grouping-simplified-view-node-swap-part-6/edit`
→ **Fit view** (the ⛶ button) → flick **Simplified** on, then off. For the second
frame: rename the workflow in the top bar, press Enter, do *not* save, then flick
Simplified on and off and read the title.

### D12 · Two plus symbols on the empty-state button — **Fixed**

> *"Dynamic nodes page. Button contains two + symbols:"*
> ([`source/dylan-double-plus-button.png`](source/dylan-double-plus-button.png))

One plus came from `leftSection={<IconPlus />}`, the other was a literal `+ ` at
the head of the label. The literal is gone and the button names its object:
**"Create your first custom node"**. The bare phrase was a dangling fragment,
and a button's accessible name is all a screen reader gets — the surrounding
"No custom nodes yet" is not read with it. The file's own header comment repeated
the mistake and is corrected. The test asserts the *accessible name*, because
the doubled plus was a rendering artefact of the icon plus the label, which is
exactly what the accessible name composes.

| Before | After |
|---|---|
| ![The empty-state card with a button reading "+ + Create your first"](screenshots/before/D12-empty-state-cta.png) | ![The same card with a button reading "+ Create your first custom node"](screenshots/after/D12-empty-state-cta.png) |

**⚠ Both frames are intercepted into the empty state, and the before frame is
additionally a reconstruction. Read this before you read the pictures.**

1. **Intercepted.** The empty state only renders when the calling group owns no
   custom node, and this database's single group owns `demo-uppercase`, which the
   Part 14 demo depends on. Deleting it to take a screenshot is not on, and there
   is no second group to switch to (one row in the `group` table, and the API key
   resolves to it). So `GET /api/dynamic-nodes` is fulfilled in the browser with
   `{"items": []}` — the exact body the endpoint returns for a group with none.
   No row is read or written; the interception dies with the browser context.
2. **Reconstructed.** The fix is already in the working tree and `git stash` is
   not available here (the tree is shared with other agents), so the old label
   cannot be checked out. The shipped button is photographed with **one string
   put back** — the string the diff changed — on the same button, the same icon,
   the same theme. The script asserts it is rewriting the *fixed* label first, so
   it cannot silently "reconstruct" a build that already had the old text. **It
   is a faithful render of the old markup, not a photograph of the old build.**

**See it yourself.** `http://localhost:3000/dynamic-nodes`, on a group that owns
no custom node.

---

## Questions where the app was right and would not say so

### D10 · Order-of-operations edges can't be drawn by hand — **Answered: they always could**

> *"Cannot seem to manually connect order-of-operations edges. Is this
> intentional?"*

**Neither. The gesture works, and always did — nothing was disabled and nothing
was enabled.** Drawn by hand in a real browser in both directions, both producing
the dashed grey wire. Both handles are plain connectable handles and the
node-level branch of the connect handler has always created the edge. **The
behaviour was intentional; the invisibility was not.**

Three measured reasons you could not find it:

1. **The dot did not say it was a run-order dot.** On a control-flow card (map,
   join, sub-workflow, human gate, poll-until, switch) hovering it read
   **"No typed inputs" / "No typed outputs"** — a sentence about *data ports*, on
   the connector that carries no data. On an activity card the same dot read
   **"Flow — execution order"**. Two different explanations of the same dot, and
   one of them describes a different concept entirely.
2. **Neither sentence said it could be dragged.** "Flow — execution order" names
   the thing; it does not tell you it is an affordance.
3. **Hovering the outgoing dot opens a 300×404px picker on top of the canvas.**
   The hover-extend popover fires after 200 ms anchored at the handle, so it
   covers the space you would drag across — measured at `x:901 y:456 w:300 h:404`
   while the drag target sat at `x:1073 y:600`, i.e. underneath it. The press
   still lands and the drag still works, but what the UI *says* when you approach
   that dot is "pick a step to add", not "drag me".

Both dots now carry one sentence, identical on every card, in the legend's own
vocabulary:

> *"Runs after — drag from here to another step's matching dot to make it run
> after this one. Order only, no data."*

The sentence opens beside the dot. It never shows while the "pick a step" list
is open, so the two do not cover each other, and the list opened from a
run-order dot repeats the sentence at its top.

**No screenshot: the change is a tooltip that requires a hover, and a
hover-held frame would cover the connectors it is about.** Confirmed after the
change on both a control-flow card and an activity card, returning identical
strings.

**See it yourself.** Any workflow editor: hover either grey node-level dot, then
drag from one card's outgoing dot to another card's incoming dot.

### D28 · Run-order connectors — inconsistent, different heights, different sizes — **One accident, one real signal, one explanation**

> *"Why do some nodes connect with the run-order connections, but others don't?
> These connector nodes also appear at different heights on the nodes. Is there
> meaning behind the difference in the size of the Poll status connector?"*

**(a) Why only some pairs are joined.** A run-order line is drawn **only where
order is the only thing between two steps**. Where data also flows, the edge is
stamped onto the coloured data wire and no second line is drawn — the colour says
what kind of data it is, and the order is implied by it. So on your screenshot
the dashed grey lines are the pairs that pass control but no values
(`Check OCR Confidence → Needs review?`, `Human review → Store results`) and the
coloured lines are pairs that pass both. Two consequences that look like
exceptions but are not: a **source** card has no incoming run-order dot at all
(nothing can run before the start), and every other card has both dots whether or
not a wire is attached. **No code changed for this half** — it is an explanation.

**(b) The different heights were an accident, and so were the fills.** Measured
before, on your own graph — `dy` is the dot's centre below the card's top edge:

```
prepareFileData (activity)  dy=3   bg=rgb(96, 94, 92)     <- solid grey
pollOcrResults  (pollUntil) dy=9   bg=rgb(255, 255, 255)  <- hollow, and lower
reviewSwitch    (switch)    dy=13  bg=rgb(255, 255, 255)
```

Two independent causes, both accidents of which renderer a card goes through.
Activity cards pinned the pair at `top: 18` while every other card passed no top
at all, so xyflow's default 50% applied and the height varied with the card's own
height. And the activity pair was painted `#605E5C` — which is the **wildcard
data-port** grey — while the control-flow pair came out hollow white with a grey
ring. Whichever one you looked at, it resembled a data port. Both now come from
one module: 18px on every rectangular card, filled in the dashed wire's own grey
(imported, not re-picked, and a grey no port family uses). Measured after, every
card reads `dy=3 bg=rgb(156, 163, 175)`.

The switch is the one remaining difference and it is **forced by geometry, not
chosen**: the card is a rotated square whose left and right vertices *are* its
vertical midpoint, so an 18px offset would float the dots off the shape.

**(c) The size difference is a real signal, and on the dot you asked about it
was wrong.** A port dot is drawn at 16px instead of 12px, with a `+` on it, when
the port is **required and nothing uses it yet**: no value arrives at the input,
or nothing in the graph reads the output. Measured on your own node:

```
pollOcrResults  out-ocrResponse  12x12  invites=false
pollOcrResults  out-status       16x16  invites=true    <- "Poll status", as you saw it
pollOcrResults  out-status       12x12  invites=false   <- "Poll status" now
```

Poll status was drawn large because only wires counted as readers, and no wire
leaves it: the poll step's own stop condition reads it. A condition, a loop's
list, a sub-workflow's input mapping and a reference into one field of an output
all read a value without a wire, and they all count now, so Poll status is an
ordinary dot. Where the `+` does show, it is drawn in black or white, whichever
stands out against the dot; on a hollow dot it was white on white. The meaning
is also on the row's tooltip, since a 4px difference is easy to miss at working
zoom and hovering the dot itself opens the extend picker: *"…Nothing reads this
yet — the larger dot with a + is where to drag a wire from."*

| Before | After |
|---|---|
| ![Poll OCR Results and Extract OCR Results at 1.1× — black run-order dots at visibly different heights and sizes](screenshots/before/D28-run-order-connectors.png) | ![The same pair at 1.04× — run-order dots at the same height and size, in the dashed wire's grey, and Poll status an ordinary port dot](screenshots/after/D28-run-order-connectors.png) |

The two frames are at 1.1× and 1.04×: the same zoom rule, applied to cards whose
size has changed since.

**See it yourself.** `http://localhost:3000/workflows/by-slug/standard-ocr/edit`,
pan to the Poll → Extract pair, and hover a port's *label*.

### D25 · The wire is purple, not green — **Answered: the doc was wrong, not the app** (stop 7)

> *"The wire is not green, it is purple, but so is the Run for Each Item node, so
> maybe that's just an expected change."*

**There is no green family.** A **kind** is the builder's word for the sort of
thing that travels a wire — `PreparedFile`, `DocumentSegment`, `OcrResult` — and
each kind belongs to one of five colour families. Split Document emits
`DocumentSegment[]`, so one item off that list is a `DocumentSegment`, which is
registered **violet**. The doc's claim that segments are green was simply false,
and it was false in two places: stop 4's colour list and stop 7's "green wire".
Both are corrected, and so is stop 7's picture with its alt text, which is what a
screen-reader user gets instead of the picture.

**Your aside is the more interesting half, and it resolves too.** The wire is
`#6741D9` — the violet *data* family, saying what is travelling it. The
Run-for-each-item card is `#6B21A8` — the `fan` *node accent*, saying what sort
of step it is (*"Repeats over a list, or gathers results"*, in the legend's
words). Two independent registries, two
vocabularies, one hue family. **The resemblance is coincidence, not shared
meaning**, and the walkthrough now says so rather than leaving the next reader to
re-discover it.

**No code changed.** The change is in
[`docs-md/workflows/GALLERY.md`](../../docs-md/workflows/GALLERY.md): the text of
stops 4 and 7, and stop 7's picture.

### D26 · The validation tick is below, not beside — and never turns red — **Answered and fixed** (stop 14)

> *"Instructions make it sound like the green tick should be on the right, but
> it's below."* · *"Couldn't get it to turn red. What's it looking for?"*

**On position: the doc is wrong and the UI is right.** There are two surfaces and
stop 14 described them as one — the signature *preview card* on the right, and
the *parse strip* full-width below the editor. The tick is on the strip, and the
strip belongs there: its error lines are click-to-jump, moving the editor's caret
to that line and column. That gesture depends on adjacency to the editor it
points into. Moving it right would have broken a working affordance to fix a
sentence, so the sentence was fixed instead.

**On red — what makes it go red is breaking the `@workflow-node` comment block,
and only that.** The strip runs a signature parse and nothing else: the marker is
present, the required tags are all there and decode, the name matches its
pattern, **every declared kind exists in the registry**, and each parameter is a
string/number/boolean/enum. Monaco's own TypeScript checker is **deliberately
disabled**, because publish-time `deno check` is the source of truth — so
mangling the code does nothing visible, which is exactly why you could not turn
it red. The compile check and the network allowlist run server-side at Publish
and arrive as gutter markers instead. None of that was stated anywhere.

The strip now carries the clarifier and a **What is checked?** popover listing
both sets — checked as you type, and checked at Publish. The as-you-type list
has a line for every error the header parser can report (a non-boolean
`@deterministic` or a non-numeric `@timeoutMs` turns the strip red too), and a
test reads the parser's messages and fails if one of them has no line in the
list.

| Before | After |
|---|---|
| ![The code editor with a green ✓ strip running full width underneath it](screenshots/before/D26-validation-tick-position.png) | ![The same strip in the same place, now carrying "The signature is the @workflow-node comment block — this strip checks that, not the TypeScript below it" and a "What is checked?" link](screenshots/after/D26-validation-tick-position.png) |

**The position did not change, and that is the answer rather than an omission.**
The after frame is 18px taller; that is the added line.

**See it yourself.** `http://localhost:3000/dynamic-nodes/new`. The starter file
validates clean, so the tick is green on arrival — click **What is checked?**. To
turn it red, break the comment header (for example change an `@inputs` kind to
one that does not exist), not the TypeScript.

### D30 · Poll OCR Results has far more fields than Extract OCR Results — **Answered and fixed**

> *"Why does a node like Poll OCR Results have so many more fields than something
> like Extract OCR Results?"*

**Because they are not the same shape of thing, and the badge on your own
screenshot says it: `POLLUNTIL` versus `ACTIVITY`.** Extract OCR Results is a
plain activity — one card, one step. Poll OCR Results is a **poll-until loop**, a
control-flow node that *wraps* an activity and repeats it until a condition
holds. Its panel therefore carries the activity's fields plus the loop's own:
which activity to run each iteration, the termination condition, and the
schedule.

**And the punchline: neither OCR activity declares a single parameter of its
own.** Both parameter schemas are empty objects, which is why both panels read
*"No additional fields"* under Parameters. **Every extra field you counted is
loop machinery, not OCR configuration.** Nothing is inconsistent.

The panel now leads with that sentence, and the three optional limits (max
attempts, initial delay, timeout — the three the engine has defaults for) start
folded behind a toggle. **Nothing is hidden:** interval stays visible because it
is required, and the toggle names every limit that is set, with its value. On
your panel it reads *"Show limits — max 20 attempts, starts after 5s, gives up
after 10m"*. The boxes behind it keep what you type and write it once you
pause, like every other box in the panel (see D7).

| Before — Poll OCR Results | After — Poll OCR Results |
|---|---|
| ![The poll panel: Node label, Activity, Termination condition, Schedule with four stacked fields](screenshots/before/D30-poll-ocr-fields.png) | ![The same panel led by "This is a loop, not a single step…", then Activity with "Parameters: No additional fields"](screenshots/after/D30-poll-ocr-fields.png) |

| Before — Extract OCR Results | After — Extract OCR Results |
|---|---|
| ![The extract panel: Node label, Parameters "No additional fields", Error handling, five pinned Inputs](screenshots/before/D30-extract-ocr-fields.png) | ![The same panel, unchanged](screenshots/after/D30-extract-ocr-fields.png) |

Two frames because the item is a comparison; one panel on its own answers
nothing. Extract is here as the control. Its after frame also shows, under each
input, where the input's value comes from; that line is on every step's inputs
and is not part of this item.

**See it yourself.** `http://localhost:3000/workflows/by-slug/standard-ocr/edit`,
click **Poll OCR Results**, read the right panel, then click **Extract OCR
Results** and read it again.

### D21 · Pinned inputs have no incoming edge — so who chose the value? — **Answered; the old copy was a lie** (stop 2)

> *"Inputs listed as Pinned don't have any input edges, so who is choosing this
> connection? The docs say someone chose it deliberately, but is that someone the
> user or a developer?"*

**Both — and the app cannot tell which, which is exactly why the old tooltip was
wrong.** It said **"Pinned by you"**, and on every seeded workflow you were
looking at that is false.

A **pin** is two pieces of state: the binding itself (`{ port, ctxKey }`, always
a reference, never a literal on the binding), and a lock list on the node's
metadata that tells **auto-wire** — the resolver that connects inputs
automatically — to keep its hands off. **That list holds port names and nothing
else.** No author, no timestamp, no provenance. So the app has no basis on which
to say "you".

And here is the case that made it a lie: a workflow authored elsewhere — a seed,
a template, the AI assistant — writes explicit bindings, and on load the app
*infers* the lock list from them. Your own screenshot
([`screenshots/before/D30-extract-ocr-fields.png`](screenshots/before/D30-extract-ocr-fields.png))
shows five inputs all badged **PINNED** on a workflow you had never edited, each
one telling you that you had done it.

The copy now describes the **act**, not the actor, and names the undo, which the
old two-word tooltip did not:

> *"Pinned — someone editing this workflow chose this source by hand, so
> automatic wiring leaves it alone. Change it or hand it back with the ⋯ menu."*

All three places that show a pin say what it does and name the undo. The
settings panel's badge carries the sentence above. The canvas wire's tooltip
says the same and adds where that ⋯ menu is — on the input, in the settings of
the step it feeds — and that right-clicking the wire also hands it back
(**Revert to automatic**). The connect-summary popover's line reads *"Automatic
wiring leaves it alone. Change it or hand it back with the ⋯ menu on this input
in this step's settings."*

**No screenshot: the change is a tooltip.** The strings above are verbatim, and
each was read back from the running app.

**See it yourself.** Open any seeded demo, click a step with pinned inputs, and
hover the **PINNED** badge in the right-hand panel; then hover the wire on the
canvas.

### D27 · No way to see what a kind such as `Document` contains — **Answered and fixed** (stop 14)

> *"How can a user know what the Document type contains?"*

Until now you could not — a kind was a bare word on a dot, a tooltip and a
dropdown option. **And the honest answer has a twist: `Document` contains
nothing, on purpose.** It is a schema-free ancestor, a wildcard for its whole
family, and the shape-honest subkinds carry the schemas. Exactly six kinds have a
machine-readable shape (`OcrResult`, `PreparedFile`, `DocumentSegment`,
`TypedSegment`, `ClassifiedPageSegment`, `LabeledSegment`), and their fields are
derived from the runtime types rather than hand-written, so they cannot drift.

Rendering "no fields" for `Document` would read as *we don't know*, when the
truth is *it deliberately accepts anything in this family, and here are the
members that are pinned down*. So the popover has four variants — fields; a
family, such as `Document`; a kind no other kind extends, such as Document ID,
which says the registry names it without describing its contents and that it has
no members; and unregistered — and nothing is hardcoded per kind; every string
comes from the live registry. `Document` reads:

> **Document** · A kind of Artifact.
> Document has no fixed shape on purpose — it stands for a whole family, so a
> step that asks for one accepts any member of it.
> **Members with a known shape:** PreparedFile

**No screenshot — it is a popover that needs a click.** The readout above was
taken from the running app.

**See it yourself.** `http://localhost:3000/dynamic-nodes/new` → the signature
preview panel on the right → click the kind on the row reading
`document : Document`.

### D24 · Why `currentSegment`, and why specify it at all? — **Answered, and the field now fills itself in** (stop 7)

> *"Why currentSegment? Is this what the node looks for? That should be made
> clear to the user, and if it's always this, why do we specify it?"*

**No, it is not always this — but there is a real reason it looks that way, and
the field never mentioned it.** The field is a loop's *item ctx key*: **ctx** is
the bag of named values a run carries, and this names the variable each iteration
puts one item into. Its type is a bare string, and one seeded workflow uses
`currentDoc`. So it is genuinely free.

What makes `currentSegment` look mandatory is a coupling somewhere else entirely:
the `segment.<field>` shorthand available in condition expressions is
**hard-wired** to read `ctx.currentSegment`. Name the key anything else and that
shorthand silently stops working — `segment.segmentType` resolves to `undefined`
rather than erroring. Every shipped template uses `currentSegment` for exactly
that reason, which is what made it read as ceremony.

Both halves are now in the field's help text:

> *"Names the variable each iteration puts one item into, so steps inside the
> loop can read it. Any name works. Pick `currentSegment` to also use the
> `segment.field` shorthand in conditions — that shorthand always reads
> `currentSegment`, so under another name you write the full variable out."*

**And your underlying point was taken.** A freshly-dropped **Run for each item**
started with the key empty, which is a guaranteed validation error on every new
loop. Alex approved the change: the field is now pre-filled with
`currentSegment` at creation time — creation only, so no saved workflow is
rewritten and the seeded one using `currentDoc` is untouched. The new loop also
declares `currentSegment` as a workflow variable in the same change, so a step
wired inside the loop can read it straight away, and one Undo removes both. The
risk a default
introduces is two loops silently sharing one item variable, so that now raises a
**warning, not an error** — it tells you and lets you save:

> *Map node "Run for each item" reuses the item variable "currentSegment", which
> another loop on this canvas already writes. Steps that read "currentSegment"
> can bind to the wrong loop, and if one of these loops runs inside the other the
> inner item replaces the outer one. Give this loop its own item variable unless
> both loops really mean the same item.*

**See it yourself.** Open any workflow with a **Run for each item** step and read
the **Item ctx key** field's help text in the right-hand panel.

### D34 · The "(Part N)" in demo names doesn't match the walkthrough — **Answered; nothing renamed**

> *"What do the parts reference on the demo workflow names? They don't correspond
> with the parts of the walkthrough seemingly."*

**Correct — they are Parts of
[`MANUAL_TEST_PLAN.md`](../../docs-md/workflows/MANUAL_TEST_PLAN.md), not stops
of the gallery.** The demos were built for the test plan and the walkthrough
borrows them, so the numbers deliberately do not line up: the Typed I/O demo is
"(Part 7)" but is used at gallery stop **4**; Node settings is "(Part 3)" but is
stop **2**.

**Nothing was renamed, and that was a decision rather than laziness.** The title
feeds the stable slug the guide links to, and the run seeder finds workflows
**by name** — renaming would break both. Documented instead, in a new *Reading
the demo names* subsection, which also covers a second confusion you did not name
but would have hit: the walkthrough abbreviates the names, so where it says
*🎯 Demo — Typed I/O*, the workflow list shows
*🎯 Demo — Typed I/O — coloured handles & type pills (Part 7)*.

---

## Things that were hard to read

### D22 · The Ref picker doesn't read as "previous nodes and their outputs" — **Fixed** (stop 6)

> *"I think this has to be clearer. It wasn't immediately apparent that the Ref
> options were previous nodes and their outputs."*

**It is exactly that, and it always was.** The picker walks the upstream nodes,
keeps the ones that produce output, and emits one row per output port, sorted
nearest-first. What made it unreadable was not the rows — which already carried
node, port, kind and distance — but that nothing above them said what the list
*was*, and the mode switch offering it was labelled **"Ref"**: a name for the
mechanism, not for the choice.

So: `Ref` / `Literal` became **From a step** / **Typed value**, and a heading
went above the rows — *"Outputs of earlier steps · Each row is one output of a
step that runs before this one — step name, then the output it produces."* **The
rows themselves are untouched**, because you asked for it to be clearer, not for
the upstream-distance detail to be hidden.

**On the panel you photographed, the value being checked was not in the list at
all.** A poll step's stop condition is checked after every attempt, against
what that attempt returned, so it reads the poll step's own output — here Poll
status — and the list held only earlier steps. A poll step's condition now
lists the step's own outputs first, under **This step's result**, and the row
the condition reads is marked.

| Before | After |
|---|---|
| ![The Ref side of the condition: a "Ref" mode control, then four upstream-output rows](screenshots/before/D22-ref-picker.png) | ![The same panel with a "From a step / Typed value" control, then "This step's result" with Poll status marked, then the heading "Outputs of earlier steps" and its explanatory line above the earlier steps' rows](screenshots/after/D22-ref-picker.png) |

The after frame ends at the bottom of the window; the earlier steps' rows
continue below it.

**See it yourself.** `http://localhost:3000/workflows/by-slug/standard-ocr/edit`
→ click **Poll OCR Results** → scroll the right-hand panel to **Termination
condition**. That is the exact panel you photographed.

### D23 · `gte` and friends in the operator dropdown — **Fixed** (stop 6)

> *"The dropdown of operators currently contains things like gte, which I imagine
> would be confusing if users weren't familiar with that shorthand. Maybe use the
> symbols instead?"*

**You are right, and the app had already been disagreeing with itself about it.**
The canvas edge chips have drawn **≥** since the edge-label work; the dropdown
you pick from said `gte`. Same operator, two vocabularies, one screen apart.
Worth recording: the node catalog **already specified** plain English labels.
The catalog is the spec; the dropdown never implemented it.

Every operator now has a human label with the symbol after it — `is greater than
or equal to (≥)` — in the dropdown, and the canvas chips and a condition group's
summary take their words from the same labels: the symbol for a comparison
(`≥`), and the words otherwise (`is empty`). **The stored value is unchanged**
(`gte` is still `gte` in the config); the tests deliberately pin the stored
value while reading the label off the same map the UI uses.

| Before | After |
|---|---|
| ![The Operator select open: equals, not-equals, gt, gte, lt, lte, contains](screenshots/before/D23-operator-dropdown.png) | ![The same select open: is equal to (=), is not equal to (≠), is greater than (>), is greater than or equal to (≥), is less than (<), is less than or equal to (≤), contains](screenshots/after/D23-operator-dropdown.png) |

**See it yourself.** Same route as D22, then open the **Operator** select.

### D29 · Legend category names aren't intuitive — **Fixed**

> *"Some of the categories in this legend could be more intuitive. Like, what's a
> 'Judgement about a document'?"*

Two labels did not say what they are, and both are rewritten:

| Before | After |
|---|---|
| Judgements about a document | **Labels and check results** |
| Pointers — IDs and lookups | **IDs that point at something stored elsewhere** |

The first family holds classifications and validation results — a label the app
applied and a check it ran — and "labels and check results" is the vocabulary the
rest of the UI already uses for both. The second was not wrong, only compressed:
everything in it names something held elsewhere. The other three rows —
*Documents & files*, *Content taken out of a document*, *Untyped — takes
anything* — already say what they are and were left alone.

Two card-border role names were rewritten in the same pass, for the same reason:
*"Does work"* → **"Performs an action"** (the old one was true of all five roles,
so it separated nothing) and *"Fans out or back in"* → **"Repeats over a list, or
gathers results"** (fan-out/fan-in is the same class of jargon as `gte`).
**Colours are untouched** — the colour-distance measurement behind the
five-accent palette stands.

| Before | After |
|---|---|
| ![The legend popover: WIRES, PORT DOTS, RINGS, CARD BORDERS](screenshots/before/D29-card-borders-legend.png) | ![The same popover with the two rewritten port-dot rows](screenshots/after/D29-card-borders-legend.png) |

**Note on which row you meant:** the row you quoted is under **PORT DOTS**, not
CARD BORDERS. Both frames are the whole popover so the wording can be judged in
the company it is grouped with.

**See it yourself.** Open any workflow in the editor and click **Legend** at the
bottom of the canvas.

---

## The three suggestions — all built

### D31 · Compare to Head should show a real diff — **Built** (stop 11)

> *"The Compare to Head feature could be clearer if it showed an actual diff, not
> just both versions in full."*

Built, with **no new dependency added** — and that was a decision, not a
constraint. The frontend's tree has no diff library, and a *text* diff would be
the wrong tool anyway: config objects have no meaningful key order, so a line
diff reports a move as a change. A new structural config-diff walks both versions
to their leaves and compares leaf by leaf. List items are matched by identity —
a wire by its `id`, a step's input or output by its `port` — so deleting a step
reports that step and its own wires, not every wire listed after them, and a
path names the item it is about (`edges[id=a-b].source`). A list whose items
carry no identity is compared by position. A subtree present on only one side
expands into its own leaves, so "this node only exists in head" lists the fields
it adds.

`metadata.configHash` is **excluded as derived** — it changes on every save and
turned "1 changed field" into "2, one of them a 64-character hash" — and the
modal states the exclusion rather than hiding it.

The modal opens on a new **Changes** tab: a summary line, one row per difference
with both values labelled, unchanged fields collapsed. **The old side-by-side
JSON is kept** as *Both versions in full*, because "show me everything" is a real
need.

| Before | After |
|---|---|
| ![The comparison modal: two full JSON dumps side by side, nothing marking what differs](screenshots/before/D31-compare-to-head.png) | ![The modal on its Changes tab: "1 changed field of 77", the configHash exclusion footnote, one row showing v1 against head (v2), and "Show 76 unchanged fields" collapsed](screenshots/after/D31-compare-to-head.png) |

**The crop deliberately changed.** The before frame is 877px tall because it had
to hold two JSON dumps; the after is 285px because the diff is one row. Same
element, same zero padding — the modal is simply that much shorter now. Framing
the old side-by-side would have hidden the entire fix.

**See it yourself.**
`http://localhost:3000/workflows/by-slug/demo-versioning-history-revert-part-12/edit`
→ **More → Version history** → **Compare to head** on the *older* row. The head
row's own button stays disabled, correctly — comparing head to head has nothing
to show.

### D33 · The workflow list needs a search bar — **Built**

> *"We might need a search bar for the workflow list. Even with this number of
> workflows, it can be hard to find the one you want."*

Built, **client-side, and here is why**: the list endpoint has no page or limit
parameter, so the whole list is already in memory (35 workflows on this stack). A
request per keystroke would add latency and a loading flicker to a list that is
fully loaded. If it ever grows past a few hundred, the honest fix is server-side
paging for the whole page, not search alone — and a test asserts **no additional
fetch happens while filtering**, which is that claim made executable.

It uses the existing house search component (the same one the tables and groups
lists use), matches name, slug and description, and the table caption reads
`1 of 35 workflows match "versioning"`. The empty result names the term, points
at the Workflows/Libraries/All filter as the usual reason a workflow is missing,
and offers **Clear search** — with the box staying mounted so the term can be
edited rather than retyped.

| Before | After |
|---|---|
| ![The workflows page: 35 rows, kind filter, benchmark switch, and no search field anywhere](screenshots/before/D33-workflow-list-no-search.png) | ![The same page with a search field above the table](screenshots/after/D33-workflow-list-no-search.png) |

| The field in use *(no before counterpart — the control did not exist)* |
|---|
| ![`ocr` typed into the search field; the table caption reads "10 of 35 workflows match "ocr""](screenshots/after/D33-search-in-use.png) |

**The after file keeps the before file's name** (`…-no-search.png`) so the pair
matches by name; it is the same window *with* the field.

**See it yourself.** `http://localhost:3000/workflows` → type into the search
field above the table. Clearing it returns the caption to "35 workflows".

### D32 · Reuse the legend colours in the sidebar node list — **Built**

> *"Could we use these colours in the sidebar list of nodes?"*

The palette already had the idea — a 3px left border against the canvas's 6px —
and already used the activity accent for activity and source rows. **Two row
types were off-vocabulary, both with hardcoded hexes that exist in no registry:**
control-flow rows painted every one of six types the same violet while the canvas
paints those same nodes across four different accents, and the custom-node row
had a purple of its own while the canvas paints a custom node with the ordinary
activity accent. So "Branch by condition" and "Run for each item" looked
identical in the list and different on the canvas.

Both now read from the same module the canvas card borders read, and so does the
canvas's other list of steps, the "pick a step" list that opens from a card's
dot. **No hex was copied**, and the tests assert against the registry rather
than against colour values.

| Palette row | Before | After | Canvas accent |
|---|---|---|---|
| Branch by condition | `#8b5cf6` | `rgb(217,119,6)` | routing ✓ |
| Run for each item | `#8b5cf6` | `rgb(107,33,168)` | fan ✓ |
| Sub-workflow | `#8b5cf6` | `rgb(6,95,70)` | childWorkflow ✓ |
| Wait for approval | `#8b5cf6` | `rgb(185,28,28)` | person ✓ |
| demo-uppercase (DYN) | `#9333ea` | `rgb(100,116,139)` | activity ✓ |

| Before | After |
|---|---|
| ![The palette rail full height, every row the same neutral colour](screenshots/before/D32-sidebar-node-list.png) | ![The same rail, every row carrying its family's card-border colour on its left edge](screenshots/after/D32-sidebar-node-list.png) |

Identical crop (280×968), so the two lay side by side.

**See it yourself.** Open any workflow in the editor; the palette is the left
rail.

---

## The walkthrough text you were reading

Seven items, all in
[`docs-md/workflows/GALLERY.md`](../../docs-md/workflows/GALLERY.md), all done.
These are the ones that made a working app look broken, so they were cheap and
worth a lot. None has a screenshot — the change is text.

**D14 · *"There is no Try button, only Run."*** Half right, and the half matters.
The top bar carried **Try** and **Run this workflow** until 2026-08-08, when they
were merged into one button labelled **`Run…`** (with an ellipsis, not a bare
"Run"). "Try" did not disappear — it moved *inside* the drawer, as the **Try on
canvas** tab. The doc also claimed the button "refuses" when clicked; it does
not, because a disabled button fires no click. It is grey before you touch it and
the reason is in a hover tooltip, which the doc now quotes verbatim. The same
correction was swept into stop 15, and the stop 8 and stop 15 pictures are
re-shot.

**D15 · *"The first actual instruction here is just Do this."*** Not a
truncation: that line has read the same since the file was created. The real
defect is that the stop is titled *"Try it, and watch"* and its only instruction
was to *replay an old run* — and on a clean checkout the Standard OCR Workflow
has no runs to replay. It is now two instructions, one per half of the title, on
the Try-in-place demo, whose steps touch no Azure and need no credential: start
a run by giving the **Run…** drawer a PDF, then open **Run history** and replay
a run with a green dot. `npm run seed:demo-runs` adds three finished runs to
look at: one green, one from cache, one genuinely failed.

**D16 · *"Is it meant to be stop, not step?"*** **Deliberately not renamed.**
"Stop" is the page's own word for a section of the tour — its opening line is *"a
guided tour in 16 stops"*, and it is used that way 14 times. But the same page
also defines **step** to mean a box inside a workflow and never says the two are
different, so reading "skip to stop 11" as a typo was reasonable. Renaming would
have made it worse: the page has sections literally titled *"Drop a step on the
canvas"*. The word is now defined where the vocabulary paragraph first uses it,
and a sweep confirmed no "stop N" in the file ever meant a workflow node.

**D17 · *"There aren't any instructions on what it wants from a user in the Run
sidebar… when it's just an unpopulated `{}`."*** The box is headed **Initial
ctx** — the bag of starting values a run begins with — and it is **prefilled**
from the inputs the workflow *declares*, not blank by design. `{}` means *this
workflow declares no inputs*. Standard OCR Workflow declares one, `modelId` (the
model its OCR steps use), with a default, so its box opens as
`{"modelId": "sdpr_synth_test"}`. Documented, along with what the first step
actually needs (`documentId` and `blobKey`, both naming a document already in
the database and blob storage) — and why nobody types this workflow's input in
practice, which is exactly what you did: you start it by uploading a file, and
follow it on the **Documents** page, since the editor's Run history lists only
runs started from the editor. The doc now gives a contrasting example from the
Workflow-as-API demo,
whose box arrives already written as `{"documentUrl": "", "priority": 0}` — that
is not illustrative, it is what the prefill produces for that workflow, key for
key.

**D18 · *"Instructions outdated. It is the Run button, followed by the Call from
outside tab."*** Confirmed, with the one refinement that the button reads
`Run…`. **A second stale claim in the same stop** was found while verifying: the
panel it sends you to was renamed from "Test run" to **Start a run**, because a
run started there is stamped as an API call server-side and nothing later cancels
it — which "test" read backwards.

**D19 · *"Run this workflow doesn't exist. It's just Run."*** Same correction.
**Two behaviours were added that the text had missed**, both visible in the
stop's own screenshot: this workflow shows no tabs at all (a file is its only way
in, so the drawer opens straight on **Upload a file**), and it is
select-then-**Run**, not drop-to-run — dropping only selects the file.

**D20 · *"Names its kind of what? Should this be names its type?"*** **The app
says "kind"**, as a literal field label in three editors, and "Type" is
separately taken in the product (the Run drawer's input-schema table has a
**Type** column of JSON-schema primitives). So swapping to "type" would have
collided with it. The word stays and the doc now defines it in the sentence that
first uses it. **A real error surfaced alongside the wording**: the doc claimed
segments are green. There is no green family — see D25 — and the bullet now lists
the five real ones.

---

## Residuals worth knowing about

Not open questions — things that are true and worth knowing.

- **The deployed assistant is wired**: the four `AZURE_OPENAI_*` variables
  reach backend-services in compose, the kustomize base, the instance overlay,
  the deploy workflow and the rotation script. All four env refs are
  `optional: true`, so a missing key disables the assistant rather than putting
  pods into `CreateContainerConfigError`. Existing instances need only a
  redeploy — nothing breaks if one is left alone. (I1 / D4.)
- **The caret jump is closed** — both causes, each with a passing browser
  test. The second fix changes how the editor holds its text
  (`defaultValue`, not `value`), so if anything about typing in a custom step
  feels different, that is where to look first. (D8.)
- **The request logger recorded 500s as 201**, which is why the stale-Prisma
  failures went unnoticed for a morning. Filed as its own defect, not fixed here.
  (I1.)
