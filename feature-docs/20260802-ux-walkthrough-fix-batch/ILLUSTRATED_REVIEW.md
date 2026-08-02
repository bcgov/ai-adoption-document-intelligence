# UX walkthrough fix batch — illustrated review

**2026-08-02 · branch `feature/visual-workflow-builder`**

Same ground as [REVIEW.md](REVIEW.md), but every fix is shown rather than
described. Each screenshot below was captured from the app running locally on
2026-08-02 against the seeded database — nothing here is a mock-up or a
promise.

Read it in order and it doubles as the demo script for the next UX review
session: each numbered section is one thing to show, in walkthrough order, with
the exact clicks to reproduce it on your own machine.

---

## Status

All twelve items from the 2026-07-29 walkthrough are done, including the two
that were waiting on your decision.

| Commit | What |
|---|---|
| `b6b86d40` | Identifier retag (Option A) — 27 files |
| `637c024b` | Walkthrough fix batch 1 — items 1–2, 4–5, 7–10, 12 — 30 files |
| `b76d651c` | Draft save — item 3 — 11 files |
| `363b917c` | Grouping semantics — item 6 — 9 files |
| *uncommitted* | Disabled-button tooltip fix + this document (see [What the screenshots caught](#what-the-screenshots-caught)) |

Tests: frontend **2321** across 200 files, backend **2824** across 151 suites,
`tsc --noEmit` clean on both sides.

---

## Before you click anything

```bash
npm run dev          # frontend :3000, backend :3002, temporal workers
```

Then open **<http://localhost:3000/workflows>**. Every *Try it* box below links
to a real local page.

The links use the **by-slug** form — `/workflows/by-slug/standard-ocr/edit` —
which is derived from the workflow name and therefore survives a reseed. An
id-based link does not: reseeding mints new ids and the link 404s.

Two things worth knowing before you start:

- **The seeded database is the demo set.** 11 workflows, each with 5 groups.
  **Standard OCR Workflow** is the one behind every canvas screenshot here.
- **Nothing below needs saving.** Only §10 (draft save) writes anything, and it
  writes a throwaway workflow you can delete from the list afterwards. Where a
  step does change a workflow, the box says so and tells you how to undo it.

---

## 1. Workflow names are real links

The UX reviewer tried right-click, double-click and clicking the name; rows
highlighted on hover but nothing opened. The name is now an actual `<a href>`,
so it has a hand cursor, underlines on hover, and "Open in new tab" works.

![Workflow list with names as links](screenshots/01-workflow-names-are-links.png)

Row bodies still don't navigate — copy-slug, Edit and Delete stay safe to
click by accident.

> **Try it** → [the workflow list](http://localhost:3000/workflows)
> Hover any name in the **Name** column: pointer turns to a hand and the name
> underlines. Click it to open the editor; middle-click or right-click ▸ *Open
> in new tab* also works, because it is a real link now. Then click the empty
> part of a row — nothing happens, by design.

---

## 2. An in-editor workflow switcher

There was no way out of the editor except the browser back button. The top bar
now carries **Switch**: type to filter by name or slug, pick one, and that
editor opens. The current workflow is marked and disabled; **← All workflows**
goes back to the list.

![Workflow switcher popover open](screenshots/02-workflow-switcher.png)

This is the searchable form the reviewer argued for rather than the dropdown —
it still reads well at 25+ workflows.

> **Try it** → [Standard OCR Workflow](http://localhost:3000/workflows/by-slug/standard-ocr/edit)
> Click **Switch** in the top bar, left of the Name field. Type `exp` to filter
> to the seven experiment workflows, or `mistral` to match on slug. Pick one and
> that editor opens. Re-open **Switch** and note the current workflow is listed
> but disabled, with **← All workflows** at the top to get back to the list.

---

## 3. Grouped steps look grouped

*"I don't remember, are they grouped or not?"* — the toast faded and the canvas
looked identical. Every member of a group now wears a dashed violet ring, and
hovering one names the group.

![Grouped nodes with dashed ring and hover label](screenshots/03-grouped-cue-and-label.png)

> **Try it** → [Standard OCR Workflow](http://localhost:3000/workflows/by-slug/standard-ocr/edit)
> Every node on this canvas belongs to one of its five groups, so they all wear
> the dashed violet ring. Hover **Extract OCR Results** and the violet
> *OCR Extraction* chip appears above the card.

Creating a group also flips the canvas straight to Simplified view, so
grouping visibly does something the moment you do it.

![Simplified view showing group chips](screenshots/07-simplified-view-chips.png)

> **Try it** → same workflow, **More ▸ Simplified view**
> That is a *switch inside the menu row* — click the toggle itself, not the row.
> The ten nodes collapse to five chips. Toggle it back off to expand again.
> To watch grouping do this on its own: marquee-select two nodes with
> shift-drag (or Ctrl-click each), then **More ▸ Group selected**.

---

## 4. Ungroup is discoverable, and says so

Ungrouping was reachable only through undo, and produced no feedback at all.
Right-click any grouped node:

![Context menu with Ungroup entry](screenshots/05-ungroup-context-menu.png)

The entry names the group and promises what it will do — *"(steps stay)"* —
because the whole risk here is someone expecting it to delete the steps. It
fires a green **Ungrouped** toast naming how many steps were released. The
right rail's old "Delete group" button now reads **Ungroup (steps stay)** too.

> **Try it** → [Standard OCR Workflow](http://localhost:3000/workflows/by-slug/standard-ocr/edit)
> Right-click **Extract OCR Results**. The middle entry reads
> *Ungroup "OCR Extraction" (steps stay)*. Click it and a green **Ungrouped**
> toast names the five steps released — every node is still on the canvas, only
> the dashed rings are gone. <kbd>Ctrl</kbd>+<kbd>Z</kbd> puts the group back.
> **Don't save** afterwards unless you mean to keep it ungrouped.

---

## 5. "Needs a source" explains itself

Every node the reviewer clicked offered a red **Needs a source** button:

![Inputs row with the Needs a source button](screenshots/09-inputs-needs-a-source.png)

…which opened a modal with nothing in it — *"why is this even clickable if
it's just information?"*. The empty state now explains the model in plain
words instead of stating a fact about the graph:

![Producer picker empty state](screenshots/10-producer-picker-offers-unconnected.png)

> Sources come from connected steps: add a step whose output is a `DocumentId`
> and connect it so it runs before this one — it will wire up automatically, or
> appear here to pick.

Where a compatible producer already sits unconnected on the canvas, it is now
offered under a dashed border, and picking it draws the edge *and* pins the
binding in one click.

> **Try it** → [a new workflow](http://localhost:3000/workflows/create)
> Click **Submit OCR** in the left palette (under *OCR (Azure)*), then click the
> node it drops on the canvas. The right rail's **Inputs** section shows the red
> **Needs a source** button — click it to read the new empty state. Now add
> **Prepare File** from the palette *without connecting it*, re-open the picker
> on the `Prepared file data` input, and it is offered under a dashed border:
> picking it draws the edge and pins the binding in one go.

---

## 6. Building right-to-left

Hovering an **output** dot suggested next steps; hovering an **input** dot did
nothing, so you couldn't place "Submit OCR" and then ask what produces the
`PreparedFile` it needs. Now you can — hovering the input dot lists only
activities that *produce* that kind:

![Input-dot hover suggesting producers](screenshots/15-input-hover-suggests-producers.png)

Flow Control is absent on purpose: it produces nothing, so it can never answer
"what makes one of these?". Picking an entry drops it to the left, already
wired into that input.

> **Try it** → [a new workflow](http://localhost:3000/workflows/create)
> Add **Submit OCR** from the palette. On the node card, hover the small dot on
> the **left** of the `Prepared file data` row — the input dot, not the node's
> big left handle. After ~1s the popover lists **Prepare File** and nothing
> else, because it is the only activity that produces a `PreparedFile`. Click it
> and it lands to the left, already wired in. For contrast, hover an **output**
> dot on the right: that list is the downstream one, and it includes Flow
> Control.

---

## 7. The green Auto badge (test case 3.4)

Neither of you could find this during the walkthrough, and it turned out the
feature was fine — the test plan just never said the settings panel had to be
open. Connect **Prepare File → Submit OCR** using the node-level handles, then
click the consumer:

![Inputs panel showing the green AUTO badge](screenshots/14-auto-badge-inputs-panel.png)

The badge lives in the right rail only; nothing turns green on the canvas card
itself. 3.4 now spells that out, and also distinguishes **Auto** (node-level
drag, the resolver binds for you) from **Pinned** (you dropped onto a specific
port dot). Both are correct — they're different gestures.

> **Try it** → [a new workflow](http://localhost:3000/workflows/create)
> Add **Prepare File**, then **Submit OCR**. Drag from Prepare File's
> **right-edge node handle** (the round handle on the card's border, not a port
> dot) to Submit OCR's **left-edge node handle**. Now click **Submit OCR** so
> the right rail opens: `Prepared file data` reads `← Prepare File` with the
> green **AUTO** badge. Repeat the drag onto the *port dot* instead and the same
> row reads grey **PINNED** — that difference is what nobody could see before.
>
> Seeded workflows all read **PINNED**, because they ship explicit bindings —
> so the Auto badge only shows on a connection you make yourself.

---

## 8. A colour scheme you can look up

Colours were meaningful but undocumented. Bottom-centre of the canvas there is
now a **Legend**:

![Canvas legend popover](screenshots/04-canvas-legend-open.png)

Wires split four ways (order-only, data, error, branch) and port dots by
family — including the new cyan **Identifiers** row.

> **Try it** → [Standard OCR Workflow](http://localhost:3000/workflows/by-slug/standard-ocr/edit)
> Click **Legend** at the bottom-centre of the canvas, then read the graph
> behind it against the rows. The two edges into **Store Results** are a good
> pair to compare: one leaves the **Branch by condition** node on its default
> case, the other comes from **Human Review** carrying no data — so they render
> differently, and the legend is where you find out why.

---

## 9. Identifiers are a real type now

This is the retag you approved as Option A. Request IDs, document IDs, model
IDs and group IDs used to be untyped strings, which meant grey dots, no
suggestions and no protection. They are now a proper cyan family:

![Cyan identifier port dots on a node](screenshots/06-identifier-ports-cyan.png)

`APIM request ID` and `OCR model ID` are cyan where they used to be grey —
while `File name`, `File type` and `OCR response` stay grey, because those
genuinely are untyped.

> **Try it** → [Standard OCR Workflow](http://localhost:3000/workflows/by-slug/standard-ocr/edit)
> Look at **Extract OCR Results**: `APIM request ID` and `OCR model ID` have
> cyan dots, while `File name`, `File type` and `OCR response` stay grey. Then
> hover the `APIM request ID` **input** dot — the popover can now answer "what
> produces a Request ID?", which was impossible while it was an untyped string,
> because every kind-driven feature skips wildcards.

**What to tell the UX designer:** the greys now mean something. A grey dot used to
mean two different things — "this is genuinely untyped" and "nobody got round
to typing it" — and you couldn't tell which. Now grey means only the first.
Identifier ports join type-driven suggestions in both directions, wrong wires
between sibling ID kinds are refused, and the legend has a row that explains
the colour. 30 ports across 17 activities were retagged; no benchmark
activities were touched.

---

## 10. Draft save — saving and running are different things

Your rule: *"saving and running are different things. I should be able to save
whenever."* The validator didn't disappear; it **moved** to run start.

Add a **Branch by condition** node and leave it unwired — a switch with no
default edge is a genuine error — then hit Save:

![Amber saved-with-issues toast](screenshots/11-draft-save-amber-toast.png)

The save **succeeds**. The toast is amber, names the count, and quotes the
finding. Reload and the half-built workflow is exactly as you drew it:

![Invalid workflow reloaded intact](screenshots/13-invalid-workflow-persisted.png)

Meanwhile **Save stays blue and live while Try and Run are greyed**, with the
reason on hover and an error chip beside them:

![Save enabled, Try and Run disabled with the reason](screenshots/12-run-blocked-reason.png)

The API enforces the same rule, so this isn't only a UI courtesy — `POST
/:id/runs`, `/:id/tries` and the upload-and-Try path all answer 400 with the
findings. Upload-and-Try refuses *before* the file is streamed to blob storage
and a Document row is created.

> **Try it** → [a new workflow](http://localhost:3000/workflows/create)
> Add **Prepare File**, then **Branch by condition** from *Flow Control*, and
> leave the branch unwired. Hit **Save**. It saves — amber toast,
> *"Created — 1 issue remains"*, quoting the defaultEdge finding. Reload the
> page: your half-built workflow is exactly as you left it. Note **Save** is
> still blue while **Try** and **Run** are greyed; hover either for the reason.
> To see the API half, copy the workflow id out of the URL and run:
>
> ```bash
> curl -s -X POST -H "x-api-key: $TEST_API_KEY" -H 'content-type: application/json' \
>   -d '{}' http://localhost:3002/api/workflows/<id>/runs | jq
> ```
>
> → `400`, with the same finding. Then wire the switch's default edge, save
> again, and the toast turns green as Run lights up.

> **One correction to the test plan.** A required input with no source — a lone
> Submit OCR, say — is a **warning**, not an error: `ctx` can legitimately
> supply it at run time. That workflow saves green and stays runnable. Only
> severity-`error` findings turn the toast amber and gate Run. My first draft
> of test case 3.6a used that graph as the example and was wrong; it now uses
> the unwired switch, which is a real error.

---

## 11. Groups move as one

The UX reviewer's Figma expectation: *"when I move one, the other one also moves."*
Your ruling was that Figma is right about **moving**, wrong about **deleting**.

Before — the five members of "OCR Extraction" sit level with the two
downstream steps:

![Before the drag](screenshots/16-move-together-before.png)

After dragging **one** member upward — the whole group came with it, keeping
its shape, while the two nodes outside the group held position:

![After the drag](screenshots/17-move-together-after.png)

Measured during capture: dragging `extractResults` moved exactly the five
members of its group — `prepareFileData`, `submitOcr`, `pollOcrResults`,
`updateApimRequestId`, `extractResults` — each by an identical delta of
`(0, −122)`. The other five nodes on the canvas did not move at all.

Two deliberate limits:

- **Selection is not cohesive.** Clicking a member still selects and edits only
  that member, so per-step configuration is untouched. Only the *drag* carries
  the others.
- **Map bodies are excluded.** The box the canvas draws around a Map node's
  body is derived, not authored, so its members keep their own layout rules.

> **Try it** → [Standard OCR Workflow](http://localhost:3000/workflows/by-slug/standard-ocr/edit)
> Drag **Extract OCR Results** upward. *Prepare File Data*, *Submit OCR*,
> *Poll OCR Results* and *Update APIM Request ID* come with it — all five keep
> their spacing — while *Post-OCR Cleanup* and *Check OCR Confidence* stay put.
> One <kbd>Ctrl</kbd>+<kbd>Z</kbd> reverses the whole move, not one node at a
> time. Then click a single member: only that node is selected and the right
> rail shows *that* node's settings. For the excluded case, open
> [Multi-Page Report](http://localhost:3000/workflows/by-slug/multi-page-report/edit)
> and drag a node inside the Map body box — only that node moves.

### Mechanism note

The approved sketch was *"clicking the ring selects all members, and xyflow's
multi-drag moves them for free."* Two things made that unbuildable as written:
the ring is a CSS `outline`, which cannot receive clicks, and xyflow captures
its drag set **before** `onNodeDragStart` fires, so selecting at drag time is
already too late. Making the drag itself cohesive delivers the same rule
without hijacking selection — which is the half of your ruling that protected
per-node work.

---

## 12. Deleting a group as a unit

Full Figma semantics live on the collapsed chip, where the chip *is* the object
and there is nothing else the gesture could mean. Select a chip in Simplified
view and press Delete:

![Delete group confirm naming the step count](screenshots/08-chip-unit-delete-confirm.png)

The confirm names the step count, because that is the difference between this
and every other delete on the canvas. Cancel leaves everything in place;
confirm removes the group and its steps with an Undo toast. Expanded, deleting
a member still removes only that member.

> **Try it** → [Standard OCR Workflow](http://localhost:3000/workflows/by-slug/standard-ocr/edit)
> **More ▸ Simplified view**, then click the **Post-Processing** chip and press
> <kbd>Delete</kbd>. The confirm names the real step count. Hit **Cancel** — the
> chip is still there, which is the point: it must not vanish while the question
> is open. Confirm instead and the group and its steps go, with an Undo toast;
> <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings them back. Compare with expanded view,
> where deleting a member removes only that member.

This replaces the old behaviour, where deleting a chip did nothing at all, and
then later refused with a message pointing at a button that has since been
renamed.

---

## What the screenshots caught

Two things that a green test suite had not.

**A real bug: the "why can't I run this?" tooltip never appeared.** A disabled
button fires no pointer events, so the Mantine `Tooltip` wrapping the disabled
**Try** button never opened, and Chrome suppresses the native `title` attribute
**Run** was using. The reason was invisible at exactly the moment it mattered
most — draft save had just persisted an unrunnable graph. Both now hover
through an `inline-flex` wrapper, which is what shot 10 above is showing.

The existing test had asserted this behaviour and passed anyway: it fired
`mouseEnter` directly on the disabled button, which jsdom dispatches happily
and no browser ever will. It now hovers the real target, and a matching case
covers the Run button.

**A wrong claim in the test plan** — the 3.6a correction noted above. Both are
the kind of thing only a pass against the running app surfaces, which is the
argument for doing this before the UX reviewer's next session rather than after.

---

## If something doesn't look like the screenshots

- **Stale port colours after a package rebuild** — restart Vite.
  `@ai-di/graph-workflow` is a workspace dependency and Vite caches its
  optimised build, so a retag can be live in the worker and stale in the
  browser.
- **A by-slug link 404s** — the workflow was renamed (the slug is derived from
  the name) or the database was reseeded from different data. Find it on the
  [list page](http://localhost:3000/workflows) instead; the slug is in the
  second column.
- **The list is empty or short** — the seed has not run. `npx prisma db seed`
  from `apps/backend-services` is additive and safe; it brings the set back to
  11 workflows without touching anything you have authored.
- **Screenshots here were captured headless** via Playwright using the IDIR
  auth bypass from `.claude/skills/app-browser-auth`. The capture scripts were
  throwaway and live in the session scratchpad, not the repo — the *Try it*
  boxes are the reproducible version.

---

## Where the detail lives

| Document | What it holds |
|---|---|
| [REVIEW.md](REVIEW.md) | The original review — full file inventory, the UX story, the grouping opinion |
| [UX_WALKTHROUGH_FIXES_20260729.md](../../docs-md/workflows/UX_WALKTHROUGH_FIXES_20260729.md) | The 12-item checklist, all ticked, with the item-6 rationale |
| [MANUAL_TEST_PLAN.md](../../docs-md/workflows/MANUAL_TEST_PLAN.md) | Cases 3.6a, 6.2a and 6.2b are the new ones |
| [WORKFLOW_BUILDER_GUIDE.md](../../docs-md/workflows/WORKFLOW_BUILDER_GUIDE.md) | Colour scheme and the group-gesture table |
| [UNTYPED_PORTS_FINDINGS.md](../../docs-md/workflows/UNTYPED_PORTS_FINDINGS.md) | Why the retag went the way it did |
