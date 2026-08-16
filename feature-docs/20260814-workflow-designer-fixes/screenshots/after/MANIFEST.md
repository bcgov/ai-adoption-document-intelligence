# AFTER frames — workflow-designer review fixes, 2026-08-15

Every image here is a screenshot of the running dev stack (frontend :3000,
backend :3002, temporal worker) taken by
[`../../capture-screenshots.mjs`](../../capture-screenshots.mjs) with
`--phase after`, after the fix batch landed (`tsc` clean, 2381 frontend tests
passing). Nothing is a mock-up and nothing is composited.

```
node feature-docs/20260814-workflow-designer-fixes/capture-screenshots.mjs --phase after
node feature-docs/20260814-workflow-designer-fixes/capture-screenshots.mjs --phase after I3 D13   # a subset
```

Same viewport as the before pass — **1920×1080** on every frame — and the same
routes, the same crops and the same canvas zooms, so a before frame and its
after frame differ by the fix and not by the framing. Auth is the mock-user
route interception from `.claude/skills/app-browser-auth`.

Item ids are `CHECKLIST.md`'s. `I…` are Inderdeep's, `D…` are Dylan's.

**Three frames are not straight photographs of the seeded app, and each says so
where it is described:** `I1` and both `D12` frames need a route intercepted to
reach a state this environment cannot otherwise be in, and the `D12` *before*
frame is additionally a **reconstruction** of the pre-fix label. `D11` builds
and then deletes a scratch workflow of its own rather than writing to a seeded
one. Nothing else here is anything but the app.

---

## Inderdeep

### I1 — "the assistant isn't configured on this server"

| | |
|---|---|
| **`I1-assistant-unconfigured.png`** | The whole drawer column with the new fourth state: a grey notice titled *"The assistant isn't configured on this server"*, the sentence *"No model provider has credentials here, so the assistant can't answer and sending is disabled"*, the variable names to set (`AZURE_OPENAI_API_KEY` **and** `AZURE_OPENAI_ENDPOINT`, **or** `OPENAI_API_KEY`), a pointer to `docs-md/workflows/AGENT_SETUP.md`, a footer reading **"No model configured"** and a greyed send button. |

- **Route:** `http://localhost:3000/workflows` → the speech-bubble icon in the
  header opens the drawer.
- **By hand:** point a backend at no provider at all (unset the Azure and
  OpenAI variables) and restart it, then open the drawer.
- **⚠ INTERCEPTED, and this is why.** The state is real code on a real page,
  but it is only reachable on a backend with *no* model provider credentials —
  and this dev stack has Azure OpenAI configured, so `GET /api/agent/models`
  correctly answers with a model and the drawer is correctly `ready`. The
  script therefore fulfils that one route with the body an unconfigured
  backend really sends: an empty `items` list plus the `missingConfig` table
  **naming** the environment variables. Names only — the backend never puts a
  value in that response and neither does the interception. Everything else on
  the page is live.
- **No before frame exists.** Before the fix an empty list was collapsed into
  the label "Server default model" with a live composer, and that build is not
  in the tree to photograph.

### I2 — send versus stop while a reply is in flight

**No after frames, deliberately. The before pair is the current behaviour.**

I2 is closed as *already correct on this branch* — the composer's send arrow is
the only stop affordance and the swap shipped 2026-08-08 in `5903a414`; no code
changed for it in this batch. Re-shooting would produce two files identical to
[`../before/I2-composer-idle.png`](../before/I2-composer-idle.png) and
[`../before/I2-composer-in-flight.png`](../before/I2-composer-in-flight.png)
and imply a change that was never made. Read the before pair as the after pair.

### I3 — the composer footer strip

| | |
|---|---|
| **`I3-chat-composer-footer.png`** | The composer rebuilt to Inderdeep's mock-up: the message box on its own line, then one footer strip — attach **`+`** hard left (was a paperclip), **`gpt-5.4` `Balanced`** as the model menu trigger beside it, send hard right. |

- **Route / by hand:** unchanged from the before frame — `/workflows`, chat
  bubble, look at the bottom strip.
- **Pairs with:** [`../before/I3-chat-composer-footer.png`](../before/I3-chat-composer-footer.png)
  (paperclip left, model name as a dimmed caption *below* the row).
- Frame is 18px taller than the before frame because the strip itself is: the
  crop is the same element with the same padding.

### I4 — the node error chip

| | |
|---|---|
| **`I4-node-error-chip.png`** | The red `× ERROR` chip on the failed node's title row, canvas at **2.00×** — the same zoom the before frame was shot at — with the glyph now on the label's optical centre. |

- **Route:** `http://localhost:3000/workflows/by-slug/probe-clean-failure/edit`
- **By hand:** open `🧪 Probe — clean failure`, **Run…** → **Try** with the ctx
  left as `{}`; `file.prepare` points at a blob that does not exist, so it
  fails within seconds. Zoom in on the failed card's title row.
- Still a live run, for the same reason as before: `NodeFailureChip` renders
  nothing without an `activeRunId`.
- The difference is sub-pixel by design (a derived
  `(ascent − descent − capHeight)/2` nudge). At this zoom it is visible; it is
  not a frame that will read on a phone.

### I5 — the failed-step notice and its CTA

| | |
|---|---|
| **`I5-no-output-error-card.png`** | The same notice restyled to the BC DS inline-alert pattern: 1px danger border, the **alert-circle** icon in place of the warning triangle, a new dimmed scope line — *"Runs the whole workflow again from the start, with the same input."* — and **Re-run workflow** as an **outlined** button instead of filled red. |

- **Route:** `http://localhost:3000/workflows/by-slug/demo-typed-i-o-coloured-handles-type-pills-part-7/edit`
- **By hand:** open Part 7, **Run… → Try** with ctx `{}`, wait for **Prepare**
  to go red, then click that card's result strip. The notice is in the strip's
  expanded detail, not on the card face.
- **Pairs with:** [`../before/I5-no-output-error-card.png`](../before/I5-no-output-error-card.png).
  39px taller, which is the scope line that was added.

---

## Dylan

### D11 — the restore toast

| | |
|---|---|
| **`D11-restore-toast.png`** | The green notification restore now raises: **"Restored v1 as v3"**, and under it *"The editor is on v3, a new version holding v1's steps. v1 is still in the history."* |

- **Route:** any workflow editor → **More → Version history → Revert to this
  version** on a non-head row.
- **By hand:** open `🎯 Demo — Versioning — history & revert (Part 12)`,
  **More → Version history**, **Revert to this version** on the older row,
  confirm. The toast is top-right.
- **⚠ Shot against a scratch lineage, not the seeded demo, and here is the
  whole of what that means.** Restoring *writes*: it appends the old config as
  a new version and moves the head. Doing that to the Part 12 demo would leave
  it sitting on a v3 nobody seeded. So the script creates its own lineage from
  a copy of the `probe-clean-failure` config, saves an edited second version to
  reach v2, restores v1 through the real UI, and **deletes the lineage in a
  `finally`**. Verified after the run: the workflows list is back to its 35
  seeded rows and no scratch row survives. The version numbers in the toast are
  the backend's own answer to a real `revert-head` call.
- **No before frame.** The before pass did not shoot D11, and the pre-fix toast
  (which named only the version reverted *to*) is not in the tree.

### D12 — the dynamic-nodes empty-state button

| | |
|---|---|
| **`../before/D12-empty-state-cta.png`** | The button reading **`+ + Create your first`** — an `IconPlus` left section and a literal `+` at the head of the label. |
| **`D12-empty-state-cta.png`** | The same card, same crop: **`+ Create your first custom node`** — one plus, and the phrase names its object. |

- **Route:** `http://localhost:3000/dynamic-nodes`
- **By hand:** left nav → **Dynamic nodes**, on a group that owns no custom
  node.
- **⚠ Both frames are INTERCEPTED into the empty state.** The empty state
  renders only when the calling group owns no custom node, and this database's
  single group owns `demo-uppercase`, which the Part 14 demo depends on
  (`usedInWorkflowCount: 1`). Deleting it to take a screenshot is not on, and
  there is no second group to switch to. So `GET /api/dynamic-nodes` is
  fulfilled with `{"items": []}` — the exact body the endpoint returns for a
  group with none — and the page renders its own empty state from it. The
  interception lives in the browser context and dies with it; no row is read or
  written.
- **⚠ The BEFORE frame is additionally a RECONSTRUCTION.** The fix is in the
  working tree, and `git stash` is not available here (the tree is shared with
  other agents), so the old label cannot be checked out. The shipped button is
  photographed with **one string put back** — the string the diff changed:

  ```
  -              + Create your first
  +              Create your first custom node
  ```

  Same `<Button>`, same `leftSection` icon, same theme and metrics; only the
  label text node is rewritten, and the script asserts it is rewriting the
  *fixed* label first, so it can never silently "reconstruct" a build that
  already has the old text. It is a faithful render of the old markup and it is
  **not** a photograph of the old build.

### D13 — the Simplified-view toggle

| | |
|---|---|
| **`D13-simplified-off.png`** | Fit-view, Simplified **off** — five cards inside two group containers. Identical crop to the before frame. |
| **`D13-simplified-on.png`** | Immediately after switching Simplified **on** — two group chips at the same zoom. Identical crop to the before frame. |
| **`D13-simplified-off-again.png`** | *(no before counterpart)* Simplified switched back **off**: the five cards return at their measured positions inside their two group boxes. |
| **`D13-unsaved-rename-survives.png`** | *(no before counterpart)* The top bar after renaming the workflow to "🎯 Demo — renamed but not saved" **without saving** and then toggling Simplified on and off — the edited title is still there. |

- **Route:** `http://localhost:3000/workflows/by-slug/demo-grouping-simplified-view-node-swap-part-6/edit`
- **By hand:** open Part 6, **Fit view** (⛶), flick **Simplified** on, flick it
  off again. For the fourth frame: rename the workflow in the top bar, press
  Enter, do not save, then flick Simplified on and off and read the title.
- **The first pair cannot show this fix, and saying so is the point.** The
  after `on` frame is pixel-identical to the before `on` frame, because what
  the toggle broke was never the simplified projection: flipping the switch
  re-ran the server-hydration effect, which **reverted the workflow to the raw
  server copy** — replacing the measured layout with the loose pre-mount
  fallback and discarding an unsaved rename. Both of those are only observable
  on the way *back*, and the before pass stopped at "on". Rather than crop the
  pair differently and imply the projection changed, the pair is kept as-is and
  two unpaired frames carry the evidence.
- **Read `D13-simplified-off-again.png` honestly:** the five cards come back at
  the positions they had on arrival. The **Finalize** group box is drawn wider
  than on arrival — its right edge runs past the pane — so the round trip is
  not perfectly identity; the cards, the wires and the layout are.

### D22 / D23 — the condition editor

| | |
|---|---|
| **`D22-ref-picker.png`** | The Ref side of the condition, reframed: a **From a step / Typed value** segmented control, then the heading **"Outputs of earlier steps"** and the sentence *"Each row is one output of a step that runs before this one — step name, then the output it produces"*, then the same four rows (`Submit to Azure OCR → Request ID`, …) with their ctx key, kind and upstream distance kept as the dimmed caption. |
| **`D23-operator-dropdown.png`** | The Operator select open, every entry now in words with the symbol after it: `is equal to (=)`, `is not equal to (≠)`, `is greater than (>)`, `is greater than or equal to (≥)`, `is less than (<)`, `is less than or equal to (≤)`, `contains`. The closed trigger reads `is not equal to (≠)` where it read `not-equals`. |

- **Route:** `http://localhost:3000/workflows/by-slug/standard-ocr/edit`, then
  the **Poll OCR Results** node → **Termination condition** in the right panel.
- **By hand:** open `Standard OCR Workflow`, click **Poll OCR Results**, scroll
  the settings panel to **Termination condition**; for D23, open the Operator
  select.
- Same panel, same node, same crops as the before frames. D22's frame is 41px
  taller — the heading and its explanatory line are what was added.
- The stored values are unchanged (`gte` is still `gte` in the config); this is
  a label module, and the tests pin that.

### D26 — where the validation tick sits

| | |
|---|---|
| **`D26-validation-tick-position.png`** | The same green strip in the same place — full width **underneath** the editor — now carrying the sentence *"The signature is the `@workflow-node` comment block — this strip checks that, not the TypeScript below it"* and a **What is checked?** link. |

- **Route:** `http://localhost:3000/dynamic-nodes/new`
- **By hand:** left nav → **Dynamic nodes** → **New dynamic node**. The starter
  file validates clean, so the tick is green on arrival; click **What is
  checked?** for the popover listing both sets of checks.
- **The position did not change, and that is the answer, not an omission.** The
  ruling on D26 was that the doc is wrong and the UI is right — the strip's
  error lines jump the caret into the editor above, so adjacency is
  load-bearing. What changed is that the strip now says what it checks.
- 18px taller than the before frame, which is the added line.

### D28 — run-order connectors

| | |
|---|---|
| **`D28-run-order-connectors.png`** | Poll OCR Results and Extract OCR Results side by side at **1.10×** — the same zoom as the before frame — with the run-order dots now at the same height and the same size on both cards, drawn in the dashed wire's own grey. |

- **Route:** `http://localhost:3000/workflows/by-slug/standard-ocr/edit`
- **By hand:** open `Standard OCR Workflow` and pan to the Poll → Extract pair.
- Identical crop and identical zoom to
  [`../before/D28-run-order-connectors.png`](../before/D28-run-order-connectors.png),
  where the pair sat at different heights with different fills.
- The 16px `+` variant (required and unconnected) is unchanged — it is a real
  signal, and what the fix added is a row tooltip that says so. That tooltip is
  not in this frame; it needs a hover, and a hover-held frame would have hidden
  the connectors this pair is about.

### D29 — the legend

| | |
|---|---|
| **`D29-card-borders-legend.png`** | The whole legend popover with the two rewritten rows: **"Labels and check results"** (was *"Judgements about a document"*) and **"IDs that point at something stored elsewhere"** (was *"Pointers — IDs and lookups"*). |

- **Route:** `http://localhost:3000/workflows/by-slug/standard-ocr/edit` → the
  **Legend** button at the bottom of the canvas.
- **By hand:** open any workflow in the editor and click **Legend**.
- Whole popover again, so the rewritten rows are read in the company they are
  grouped with — the same reason the before frame was not cropped to one group.

### D30 — Poll OCR Results versus Extract OCR Results

| | |
|---|---|
| **`D30-poll-ocr-fields.png`** | Poll OCR Results' panel, now led by the answer: *"This is a loop, not a single step. It runs the activity below over and over until the condition is met, so the sections underneath are the loop's own settings — the activity itself has only the fields it would have on its own card."* Then Activity (**Parameters: No additional fields**), Termination condition, and — below the fold of this crop — the three defaulted limits folded behind a toggle. |
| **`D30-extract-ocr-fields.png`** | Extract OCR Results' panel at the same width, unchanged: Node label, Parameters, Error handling, five pinned Inputs. |

- **Route:** `http://localhost:3000/workflows/by-slug/standard-ocr/edit`, then
  each node in turn.
- **By hand:** open `Standard OCR Workflow`, click **Poll OCR Results**, read
  the right panel, then click **Extract OCR Results** and read it again.
- Both frames are the full rail at the same width as the before pair. The rail
  scrolls, so the folded-limits toggle is below the bottom edge in the same way
  the before frame's lower fields were — the crop is the rail, not the scroll
  content.

### D31 — Compare to Head

| | |
|---|---|
| **`D31-compare-to-head.png`** | The modal on its new **Changes** tab: *"1 changed field of 77"*, the footnote that `metadata.configHash` is excluded because it is derived, and one row — `CHANGED nodes.submit.label`, `v1: Submit to Azure OCR` against `head (v2): Submit to Azure OCR (v2 — edited)` — with **Show 76 unchanged fields** collapsed beneath. The **Both versions in full** tab still holds the old side-by-side JSON. |

- **Route:** `http://localhost:3000/workflows/by-slug/demo-versioning-history-revert-part-12/edit`
  → **More → Version history → Compare to head** on the older row.
- **By hand:** open `🎯 Demo — Versioning — history & revert (Part 12)`,
  **More → Version history**, **Compare to head** on the older row. The head
  row's own button stays disabled — comparing head to head has nothing to show.
- **Crop deliberately changed, per the item.** The before frame is 877px tall
  because it had to hold two full JSON dumps; this one is 285px because the
  diff is one row. Framing the old side-by-side would have hidden the entire
  fix. Same element (`.mantine-Modal-content`), same zero padding — the modal
  is simply that much shorter now.

### D32 — the sidebar node list

| | |
|---|---|
| **`D32-sidebar-node-list.png`** | The palette rail full height, every row now carrying the card-border colour of its family on its left edge — flow-control rows in their own colours, file handling and OCR in theirs — instead of one neutral grey for all of them. |

- **Route:** `http://localhost:3000/workflows/by-slug/standard-ocr/edit`
- **By hand:** open any workflow in the editor; the palette is the left rail.
- Identical crop to [`../before/D32-sidebar-node-list.png`](../before/D32-sidebar-node-list.png)
  (280×968), so the two lay side by side.

### D33 — the workflows list

| | |
|---|---|
| **`D33-workflow-list-no-search.png`** | The full window at `/workflows`. **The file name describes the BEFORE state**, and is kept so the pair matches by name: this frame is that same window *with* the search field, above the table and below the kind filter. |
| **`D33-search-in-use.png`** | *(no before counterpart — the control did not exist)* The field in use: `ocr` typed a character at a time, and the table caption reading **"10 of 35 workflows match "ocr""**. |

- **Route:** `http://localhost:3000/workflows`
- **By hand:** left nav → **Workflows**, type into the search field above the
  table. Clearing it returns the caption to "35 workflows".
- Full window in both, for the same reason as the before frame: a claim about a
  control the whole page did or did not have.

---

## What does not pair one-for-one, in one place

| Frame | Why |
|---|---|
| `I2-composer-idle.png`, `I2-composer-in-flight.png` | **After == before, by design.** No code changed for I2; the before pair is the current behaviour and re-shooting it would imply a change. |
| `I1-assistant-unconfigured.png` | New surface. The pre-fix build rendered "Server default model" instead and is not in the tree. |
| `D11-restore-toast.png` | The before pass did not shoot D11. |
| `D12-*` (both phases) | Neither is reachable on a seeded database; both intercepted, and the before frame is a reconstruction. Detail in the D12 row above. |
| `D13-simplified-off-again.png`, `D13-unsaved-rename-survives.png` | The before pass stopped at "on", and what the fix changed is only observable on the way back. |
| `D33-search-in-use.png` | There was no search field to use before. |
| `D31-compare-to-head.png` | Pairs by name, but the crop is 592px shorter: the modal itself is. |
| `D22`, `D26`, `D29`, `I3`, `I5` | Pair by name, crop and route; 18–41px taller each, which is the copy those fixes added. |

---

## D7 — the typing measurement, which has no frame

D7 (typing lag) produces no photograph — a frame of a text field cannot show a
re-render — so it was measured instead, by
[`../../measure-typing.mjs`](../../measure-typing.mjs), against
`multi-page-report` (22 cards on the canvas) with the `processSegments` map
node selected. 30 characters typed with no delay between keys, three rounds,
alternating, medians below. **Dev build** — Vite dev server and a development
React, which is the build Dylan was typing into.

| | **A — Node label**<br>writes the whole config per keystroke<br>*(not part of the D7 change)* | **B — Map item ctx key**<br>local draft, one commit per burst<br>*(the D7 path)* |
|---|---|---|
| React commits for 30 keystrokes | **152** | **68** |
| Wall time for the burst | **6752 ms** (225 ms/char) | **567 ms** (19 ms/char) |
| Long tasks (>50ms) during the burst | **37**, 5286 ms total, longest 447 ms | **1**, 234 ms total |
| …of those, after the last keystroke | 1 (208 ms) | 1 (234 ms) — *the whole of it* |

**What A is, exactly.** Not a recording of the old build: the fix is in the
tree and cannot be stashed. A is the **Node label** field on the same panel of
the same node in the same page load, which was *not* part of the D7 change and
still calls `updateNode` on every keystroke — one whole-config write per
character, the pre-fix path, still live in the shipped build. B additionally
re-expands its option list against the draft on every keystroke, work A does
not do at all, so the comparison is loaded against the fix.

The shape is the point: **B's only long task arrives after the typing stops** —
that is the single debounced commit — while A blocks the main thread 37 times
*during* the burst, which is what "typing is very laggy" is.
