# BEFORE frames — workflow-designer review fixes, 2026-08-14

Every image here is a screenshot of the running dev stack (frontend :3000,
backend :3002, temporal worker) taken by
[`../../capture-screenshots.mjs`](../../capture-screenshots.mjs) with
`--phase before`. Nothing is a mock-up and nothing is composited. Re-run the
same script with `--phase after` once the fixes land and the frames will match
one-for-one, because both phases open the same routes and drive the same UI
states.

```
node feature-docs/20260814-workflow-designer-fixes/capture-screenshots.mjs --phase before
node feature-docs/20260814-workflow-designer-fixes/capture-screenshots.mjs --phase after
node feature-docs/20260814-workflow-designer-fixes/capture-screenshots.mjs --phase after I3 D13   # a subset
```

Viewport is 1920×1080 on every frame — the same as the 2026-08-06 batch and the
walkthrough, so a frame from either batch can be laid beside one from this one.
Auth is the mock-user route interception from `.claude/skills/app-browser-auth`;
without it every route redirects to the IDIR login screen.

Item ids are `CHECKLIST.md`'s. `I…` are inderdeepsinghgill's, `D…` are dbarkowsky's.

---

## inderdeepsinghgill

### I2 — send versus stop while a reply is in flight

| | |
|---|---|
| **`I2-composer-idle.png`** | The whole agent-chat drawer column with nothing sent. Primary action is a send arrow; the drawer header carries history, new-conversation and close. |
| **`I2-composer-in-flight.png`** | The same column with a turn in flight. The send arrow **has** become a filled stop square in the composer, and the header is unchanged. |

- **Route:** `http://localhost:3000/workflows`, then the speech-bubble icon in
  the header (`agent-chat-icon`) opens the drawer.
- **By hand:** open any page, click the chat bubble at top right, type
  anything, press send, and watch the bottom-right button.
- **What the pair already shows:** the composer's primary action *does*
  transform into a stop control today (`SendOrStopButton` in
  `AgentChatDrawer.tsx`). inderdeepsinghgill's "the stop icon is still at the top" does
  not reproduce on this build — worth confirming which build his snapshots came
  from before writing code for I2.
- **Caveat you must know to read the second frame:** the agent errors here in
  about a tenth of a second (the same failure as I1 — see the I3 row), so the
  in-flight state is real but too brief to photograph. The script therefore
  **delays the outgoing POST** to `/api/agent/chat` by nine seconds. Nothing
  about the response is faked: the same request reaches the same backend and
  fails the same way a moment later. Both phases do this identically.

### I3 — the composer footer strip

| | |
|---|---|
| **`I3-chat-composer-footer.png`** | The composer cropped to itself: paperclip at the left, the textarea, the send arrow at the right, and "Azure OpenAI — gpt-5.4" as a dimmed caption *below* the row. |

- **Route:** `http://localhost:3000/workflows` → chat bubble in the header.
- **By hand:** open the drawer and look at the bottom strip.
- Compare against [`../../source/inderdeep-mockup-composer.png`](../../source/inderdeep-mockup-composer.png),
  which puts the model name inline as a dropdown trigger next to an attach `+`.
- **Also visible:** the model caption reads "Azure OpenAI — gpt-5.4" once
  models load, and "Server default model" before that.

### I4 — the node error chip

| | |
|---|---|
| **`I4-node-error-chip.png`** | The red `× ERROR` chip on a failed node's title row, canvas zoomed to 2.0× so the icon-versus-text baseline is legible. |

- **Route:** `http://localhost:3000/workflows/by-slug/probe-clean-failure/edit`
- **By hand:** open the `🧪 Probe — clean failure` workflow, click **Run…**,
  then **Try** on the "Try on canvas" tab with the ctx left as `{}`. The
  `file.prepare` step is pointed at a blob that does not exist, so it fails
  within seconds. Zoom in on the failed card's title row.
- **Why it must be a live run:** `NodeFailureChip` renders nothing without an
  `activeRunId` — a design-time canvas deliberately shows no statuses — so
  there is no way to reach this except by really running something.

### I5 — the failed-step notice and its red CTA

| | |
|---|---|
| **`I5-no-output-error-card.png`** | The red inline alert — "This step failed — no output was produced to preview", the engine's reason, and a **filled red "Re-run workflow"** button. |

- **Route:** `http://localhost:3000/workflows/by-slug/demo-typed-i-o-coloured-handles-type-pills-part-7/edit`
- **By hand:** open `🎯 Demo — Typed I/O — coloured handles & type pills (Part 7)`,
  **Run… → Try** with ctx `{}`, wait for **Prepare** to go red, then **click
  that card's result strip** (the one-line band that read "Not run yet"). The
  notice is in the strip's expanded detail, not on the card face.
- **Why this workflow and not `probe-clean-failure`:** `NoOutputNotice` is a
  *preview* surface, so it only renders for a step that declares an output.
  The probe workflow's nodes declare none, so its failed step draws "this step
  doesn't produce a previewable output" instead of the error card. Part 7's
  `prep` declares `preparedData` and fails identically on an empty ctx.
- **Component:** `apps/frontend/src/features/workflow-builder/preview/NoOutputNotice.tsx`
  (the button is at line 163).

---

## dbarkowsky

### D13 — the Simplified-view toggle

| | |
|---|---|
| **`D13-simplified-off.png`** | The graph pane at fit-view with Simplified **off**: five cards inside two group containers. |
| **`D13-simplified-on.png`** | The identical pane, identical crop, immediately after switching Simplified **on**: two tiny group chips stranded at the old zoom, most of the pane empty. |

- **Route:** `http://localhost:3000/workflows/by-slug/demo-grouping-simplified-view-node-swap-part-6/edit`
- **By hand:** open `🎯 Demo — Grouping, simplified view & node swap (Part 6)`,
  click **Fit view** (the ⛶ button in the top bar), then flick the
  **Simplified** switch beside it.
- **The crop is deliberately the same for both** and is deliberately *not*
  tightened around the graph: the defect is that the view does not refit, so a
  frame cropped to the chips would hide the thing being reported.

### D22 / D23 — the condition editor

| | |
|---|---|
| **`D22-ref-picker.png`** | The Ref side of the condition: "Expression type: Comparison", "Operator: not-equals", then **Left** with four upstream-output rows ("Submit to Azure OCR → Request ID · `apimRequestId` · RequestId · 2 steps upstream", …) and an "Enter a variable manually" link. |
| **`D23-operator-dropdown.png`** | The Operator select with its dropdown open: `equals`, `not-equals`, `gt`, `gte`, `lt`, `lte`, `contains`… |

- **Route:** `http://localhost:3000/workflows/by-slug/standard-ocr/edit`, then
  click the **Poll OCR Results** node.
- **By hand:** open `Standard OCR Workflow`, click **Poll OCR Results**, and
  scroll the right-hand settings panel to **Termination condition**.
- This is the exact panel dbarkowsky photographed in
  [`../../source/dylan-ref-picker-operators.png`](../../source/dylan-ref-picker-operators.png) —
  same node, same section, same framing.

### D26 — where the validation tick sits

| | |
|---|---|
| **`D26-validation-tick-position.png`** | The custom-step code editor with the green ✓ strip — "Signature OK: my-custom-node — document: Document → result: Artifact" — running the full width **underneath** the editor, not beside it. |

- **Route:** `http://localhost:3000/dynamic-nodes/new`
- **By hand:** left nav → **Dynamic nodes** → **New dynamic node**. The starter
  file validates clean, so the tick is green on arrival.
- **Why `/new` and not an existing node:** `GET /api/dynamic-nodes` is 500ing
  in this environment (see the unreachable list below), so the list page cannot
  offer a row to open. GALLERY step 14 — the step dbarkowsky was on — starts on the
  blank editor anyway.

### D28 — run-order connectors

| | |
|---|---|
| **`D28-run-order-connectors.png`** | Poll OCR Results and Extract OCR Results whole, side by side at 1.1× — the black run-order dots at visibly different heights and different sizes, the green data ports beside them. |

- **Route:** `http://localhost:3000/workflows/by-slug/standard-ocr/edit`
- **By hand:** open `Standard OCR Workflow` and pan to the Poll → Extract pair.
- Matches dbarkowsky's framing in
  [`../../source/dylan-poll-ocr-connectors.png`](../../source/dylan-poll-ocr-connectors.png).

### D29 — the legend

| | |
|---|---|
| **`D29-card-borders-legend.png`** | The whole legend popover: WIRES, PORT DOTS, RINGS, **CARD BORDERS**. |

- **Route:** `http://localhost:3000/workflows/by-slug/standard-ocr/edit`, then
  the **Legend** button at the bottom of the canvas.
- **By hand:** open any workflow in the editor and click **Legend**.
- **Note on which row he meant:** dbarkowsky quoted *"what's a 'Judgement about a
  document'?"*, and that row is under **PORT DOTS**, not CARD BORDERS. The
  frame is the whole popover so both groups are in shot and the wording can be
  judged in context.

### D30 — Poll OCR Results versus Extract OCR Results

| | |
|---|---|
| **`D30-poll-ocr-fields.png`** | Poll OCR Results' settings panel, top to bottom: Node label, Activity, Termination condition (expression type, operator, Left, Right), Schedule. |
| **`D30-extract-ocr-fields.png`** | Extract OCR Results' settings panel at the same width: Node label, Parameters ("No additional fields"), Error handling, five pinned Inputs. |

- **Route:** `http://localhost:3000/workflows/by-slug/standard-ocr/edit`, then
  click each node in turn.
- **By hand:** open `Standard OCR Workflow`, click **Poll OCR Results**, read
  the right panel, then click **Extract OCR Results** and read it again.
- Two frames rather than one because the item is a comparison; one panel on its
  own answers nothing.

### D31 — Compare to Head

| | |
|---|---|
| **`D31-compare-to-head.png`** | The comparison modal: two full JSON dumps side by side, nothing marking what differs. |

- **Route:** `http://localhost:3000/workflows/by-slug/demo-versioning-history-revert-part-12/edit`
  → top bar **More** → **Version history** → **Compare to Head** on a row.
- **By hand:** open `🎯 Demo — Versioning — history & revert (Part 12)`, open
  **More → Version history**, and press **Compare to Head** on the *older* row.
  The head row's own button is disabled, correctly — comparing head to head has
  nothing to show.

### D32 — the sidebar node list

| | |
|---|---|
| **`D32-sidebar-node-list.png`** | The palette rail full height: SOURCES, FLOW CONTROL, CUSTOM (`demo-uppercase` with its DYN pill), FILE HANDLING, OCR (AZURE) — every row the same neutral colour, with none of the legend's family colours. |

- **Route:** `http://localhost:3000/workflows/by-slug/standard-ocr/edit`
- **By hand:** open any workflow in the editor; the palette is the left rail.
- Re-shot after the Prisma client was regenerated. The earlier take of this
  frame read "No custom nodes yet" under CUSTOM, which was the
  `/api/dynamic-nodes` 500 rather than an empty seed; this one shows the real
  section.

### D33 — the workflows list

| | |
|---|---|
| **`D33-workflow-list-no-search.png`** | The full window at `/workflows`: 35 rows, a kind filter (Workflows / Libraries / All), a benchmark-candidates switch, New-from-template and Create-workflow — and no search field anywhere. |

- **Route:** `http://localhost:3000/workflows`
- **By hand:** left nav → **Workflows**.
- Full window rather than the table alone: the absence of a control is a claim
  about the whole page.

---

## D12 — the `+ + Create your first` button

**Captured 2026-08-15, with the after pass — as `D12-empty-state-cta.png`, and
it is INTERCEPTED and RECONSTRUCTED. Read the two caveats before the frame.**

| | |
|---|---|
| **`D12-empty-state-cta.png`** | The dynamic-nodes empty-state card: "No custom nodes yet", and the button reading **`+ + Create your first`** — an `IconPlus` left section and a literal `+` at the head of the label. |

1. **The empty state is intercepted into existence.** `GET /api/dynamic-nodes`
   is fulfilled in the browser with `{"items": []}` — the body the endpoint
   really returns for a group that owns none — because this database's single
   group owns `demo-uppercase` and the Part 14 demo depends on it (the whole of
   the reasoning below still stands). No row is read or written; the
   interception dies with the browser context.
2. **The label is reconstructed.** The fix had already landed and `git stash`
   is not available here (the tree is shared with other agents), so the shipped
   button is photographed with one string put back — the string the diff
   changed, `"Create your first custom node"` → `"+ Create your first"` — on the
   same `<Button>`, the same icon, the same theme. The script asserts it is
   rewriting the *fixed* label first, so it cannot silently "reconstruct" a
   build that already had the old text. **It is a faithful render of the old
   markup, not a photograph of the old build.**

The after frame is [`../after/D12-empty-state-cta.png`](../after/D12-empty-state-cta.png),
same crop, and only interception (1) applies to it.

The original entry, written when the frame could not be taken at all, follows —
its account of *why* the state is unreachable is still accurate:

**Not reachable without destroying seeded data, so no frame was taken.**

The button renders in exactly one place — the dynamic-nodes **empty state**, at
`apps/frontend/src/pages/dynamic-nodes/DynamicNodesListPage.tsx:171–189`, where
`leftSection={<IconPlus size={16} />}` and a label of `"+ Create your first"`
are drawn together on the same `<Button>`.

Two attempts, and what each ran into:

1. **Before the Prisma client was regenerated**, `GET /api/dynamic-nodes`
   returned 500 (`TypeError: Cannot read properties of undefined (reading
   'findMany')` at `DynamicNodeRepository.listForGroup`), so the page rendered
   its error card rather than either the list or the empty state.
2. **After regeneration** the endpoint works — and the list is **not empty**.
   The Default group owns one live custom node:

   ```
   $ psql -d ai_doc_intelligence -c 'select slug, group_id, deleted_at from dynamic_node'
    demo-uppercase      | seeddefaultgroup |                          ← live
    demo-deleted-node   | seeddefaultgroup | 2026-08-09 23:35:23.967  ← soft-deleted on purpose
    e2e-dyn…  (31 rows) | seeddefaultgroup | (all soft-deleted)
   ```

There is no honest second group to switch to: `select id, name from "group"`
returns exactly one row, `seeddefaultgroup`. And the API key resolves to that
one group — `resolveCallingGroupId`
(`apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.ts:385`)
rejects any `groupId` the caller is not a member of — so no `?groupId=` hint
can reach an empty list either.

Reaching the empty state would therefore mean deleting `demo-uppercase`, which
is seeded demo data that `demo-dynamic-custom-code-node-…-part-14` depends on
(`usedInWorkflowCount: 1`). That was not done.

**To take the frame on a real empty group** — a clean checkout seeded *without*
demo custom nodes — drop the interception from the D12 shot and run
`node …/capture-screenshots.mjs --phase before D12`; it asserts the empty state
either way, so it fails loudly rather than photographing a populated table.
dbarkowsky's own capture is at
[`../../source/dylan-double-plus-button.png`](../../source/dylan-double-plus-button.png).

---

## Incidental finding — D6, the `Demo - Deleted` custom node

dbarkowsky: *"Appropriate name, because the `Demo - Deleted` custom node doesn't
appear to have been seeded."*

**It was seeded.** It is in the database, and it was soft-deleted deliberately
one second after the demo workflows were created:

```
 slug              | group_id         | deleted_at
 demo-deleted-node | seeddefaultgroup | 2026-08-09 23:35:23.967
```

That is the demo working as designed. `demo-deleted-custom-node-deleted-badge-catalog-error-part-14`
contains a node `goneNode` of activity type `dyn.demo-deleted-node`, and the
lineage behind it is deleted so the canvas has a genuinely missing step to
draw. `GET /api/dynamic-nodes` excludes soft-deleted lineages by design, so the
management page correctly does not list it — the list page is not where you go
to see it.

Two things made it look un-seeded to him, and both are worth an answer in the
walkthrough rather than a code change:

- The stale Prisma client (the 500 above) meant the page showed an error, not a
  list, so nothing could be confirmed either way.
- Nothing in GALLERY step 15 says the node is *supposed* to be absent from the
  management list — that absence IS the state the step is demonstrating.

Evidence commands, both read-only:

```
docker exec postgres psql -U postgres -d ai_doc_intelligence \
  -c "select slug, group_id, deleted_at from dynamic_node where slug like 'demo-%';"
curl -H "x-api-key: $API_KEY" http://localhost:3002/api/dynamic-nodes
```
