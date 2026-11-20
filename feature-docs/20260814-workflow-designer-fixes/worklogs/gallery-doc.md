# Worklog — GALLERY.md doc fixes (D14–D20, D34, doc side of D3/D5)

File changed: `docs-md/workflows/GALLERY.md` (only file touched).
Branch: `feature/visual-workflow-builder`. Date: 2026-08-14.

Every quoted "after" text is the exact text now in the file. Every "evidence"
line is a real path and line number on this branch at the time of the edit.

---

## D14 — Step 8 says "Try"; the real button is "Run"

**Reviewer:** *"There is no Try button, only Run."*

**What the code actually says.** The reviewer is half right. The top bar used to
carry two buttons, **Try** and **Run this workflow**, which opened the same
drawer on different tabs; on 2026-08-08 they were merged into one. The surviving
button's label is **`Run…`** — with an ellipsis, not a bare "Run". "Try" did not
disappear: it moved *inside* the drawer, as the tab **Try on canvas** and the
blue **Try** button on that tab.

Evidence:

- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1848` —
  the button's literal label, `Run…`, inside
  `data-testid="run-this-workflow-button"`.
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1824-1830` —
  the comment recording the merge: *"Batch-four item 8 (2026-08-08): one button,
  not two. \"Try\" and \"Run this workflow\" opened the SAME drawer on different
  tabs…"*
- `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx:172` —
  the drawer's own title is still `Run this workflow`; that is a drawer heading,
  not a button.
- `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx:801` —
  the `Try` button, on the Try tab.

**Before** (step 8 blockquote):

```
> **This stop needs the engine running.** If **Try** is greyed out, hover it — it
> will say why. If nothing happens at all, the engine isn't up: skip to stop 11.
```

**After:**

```
> **This stop needs the Temporal worker running**, and a run to look at — that's
> `npm run seed:demo-runs` from [Before you start](#2--seed-the-demo-workflows).
> If **Run…** is greyed out, hover it: the tooltip *is* the reason, and it's one
> of *"Save the workflow first"*, *"Fix N validation errors first — this graph
> cannot run as it stands"*, or *"Save your changes first — a run always executes
> the saved graph, not the canvas"*. If nothing ever moves off *"Not run yet"*,
> the worker isn't up: skip to stop 11 and come back later.
```

The three tooltip strings are quoted verbatim from
`WorkflowEditorV2Page.tsx:1002-1009` (`runBlockedReason`). `"Not run yet"` is
from `apps/frontend/src/features/workflow-builder/preview/no-output-state.ts:135`.

**Before** (step 8 "Try this"):

```
**Try this.** Click **Try** on a workflow you've edited but not saved. It refuses,
and says why: *"Save your changes first — a run always executes the saved graph,
not the canvas."* That's deliberate — a run should never execute a diagram you
aren't looking at.
```

**After:**

```
**Try this.** Edit a workflow and don't save it, then look at **Run…** — it goes
grey, and hovering it says why: *"Save your changes first — a run always executes
the saved graph, not the canvas"*. That's deliberate — a run should never execute
a diagram you aren't looking at.
```

Two corrections in that one paragraph: the button name, and the *mechanism*. The
old text said the button "refuses" when clicked. It does not — a disabled button
fires no click; the message arrives as a tooltip on hover, and the button is
already grey before you touch it (`WorkflowEditorV2Page.tsx:1834-1847`, the
`<Tooltip>` wrapping an `inline-flex` span precisely so a disabled button still
has a hover target — see the comment at :1811-1818).

**Also fixed, same root cause, outside the numbered item.** Stop 15 still
described two buttons:

Before: `- **Try** and **Run** are both disabled, and say why.`

After:

```
- **Run…** in the top bar is disabled, and hovering it says why: *"Fix 1
  validation error first — this graph cannot run as it stands"*.
```

The singular/plural wording of that message is generated at
`WorkflowEditorV2Page.tsx:1006`; a deleted `dyn.*` lineage produces exactly one
error (the D-11 note at :991-995).

**Screenshot note added**, because `gallery-images/08-run-and-watch.png` shows
the pre-merge top bar with both **Try** and **Run this workflow** visible:

```
> *That screenshot predates 2026-08-08, when the top bar's two buttons —
> **Try** and **Run this workflow** — were merged into the single **Run…**
> button described below. The canvas itself is unchanged.*
```

This follows the pattern already used at stop 9 for its own dated screenshot.

---

## D15 — Step 8's first instruction is "Do this." with no action

**Reviewer:** *"The first actual instruction here is just Do this. What is it
asking someone to do?"*

**Diagnosis.** The line was not truncated — `git show
c6dfe62c:docs-md/workflows/GALLERY.md` has the same text since the file was
created. The defect is that the stop is titled **"Try it, and watch"** and its
only instruction was *replay an old run*. There was no instruction for the thing
the title promises, so a reader looking for "how do I try it" found nothing, and
the words "Do this." were the last thing they read before the gap.

Compounding it: on a clean checkout **Standard OCR Workflow has no runs at all**,
so "Replay on the most recent row" has no row. There is no run model in the
database — `GET /:id/runs` is Temporal's visibility API
(`scripts/seed-demo-runs.mjs:19-25`), and the only seeded runs are created by
`npm run seed:demo-runs` against the **demo** workflows, not Standard OCR.

**Before:**

```
**Do this.** Click **More ▸ Run history**, then **Replay** on the most recent row.
```

**After** — two instructions, one per half of the stop's title. The full "start a
run" half is quoted under D17 below; the "watch" half:

```
**Do this — watch one.** Open **🎯 Demo — Try-in-place — run a workflow & see
previews (Part 9)**, click **More ▸ Run history**, then **Replay** on the most
recent row. That demo's steps run against local Postgres and local blob storage
only — no Azure, no credentials — and `npm run seed:demo-runs` has already put
three real runs behind it: one green, one that came back from cache, and one that
genuinely failed.
```

Evidence for every claim in that paragraph:

- Demo name — `scripts/demo-run-targets.mjs:17` (`NAME_PREFIX = "🎯 Demo — "`)
  and `:28` (`title: "Try-in-place — run a workflow & see previews (Part 9)"`).
  The seeded name is `NAME_PREFIX + title`, per the comment at :20-24.
- The three run states — `scripts/seed-demo-runs.mjs:29-32`: succeeded run,
  cache hit (`skipped` + `cacheHit`), failed run, all on the try-in-place demo.
- No cloud dependency — `scripts/seed-demo-runs.mjs:40-42`: *"Nothing here
  touches Azure, an LLM or any credential: every activity in those graphs
  (`file.prepare`, `document.updateStatus`) runs against local Postgres and local
  blob storage."*
- Run history lives under **More** — `WorkflowEditorV2Page.tsx:1877-1888`
  (`Menu.Item` `data-testid="topbar-menu-run-history"`, label `Run history`).

Consequential one-line edit at stop 9, whose subtitle assumed a single workflow:

Before: `**⏱ 4 min** · Same workflow, still in replay`
After: `**⏱ 4 min** · Whichever workflow you replayed at stop 8, still in replay`

---

## D16 — "skip to stop 11" — stop or step?

**Reviewer:** *"Is it meant to be stop, not step?"*

**Finding: not a typo, and I did not change it to "step".** The page's own
opening line is *"A guided tour of the workflow builder, in **16 stops**"*
(GALLERY.md:3), and "stop" is used that way twelve times across the file. The
real defect is that the same page also defines **step** to mean a box inside a
workflow ("Each box in it is a *step*"), and never says the two words are
different things — so a developer reading "skip to stop 11" reasonably reads it
as a typo for "step 11".

Changing "stop" → "step" would have made it worse, not better: the page has
sections literally titled *"Drop a step on the canvas"*, *"Write your own step"*
and *"When a step goes missing"*, so "step 11" would then be genuinely ambiguous.
The fix is to define the word at first use, per the doc's own vocabulary
paragraph.

**Before:**

```
**A word on the words.** A *workflow* is a diagram of work to be done. Each box in
it is a *step*. Steps are joined by *wires*. Running a workflow once is a *run*.
That's the whole vocabulary.
```

**After:**

```
**A word on the words.** A *workflow* is a diagram of work to be done. Each box in
it is a *step*. Steps are joined by *wires*. Running a workflow once is a *run*.
That's the whole vocabulary — with one caution, because two of those words look
alike. The numbered sections of *this page* are **stops** on a tour. A **step** is
always a box inside a workflow. So "skip to stop 11" means a section of this
document, never a node on the canvas.
```

**Sweep result.** `grep -n "stop [0-9]\|stops [0-9]\|Stops " docs-md/workflows/GALLERY.md`
returns 14 hits after the edit. Every one refers to a numbered section of the
tour; there is no place in the file where "stop N" was used to mean a workflow
node. Nothing else needed changing.

---

## D17 — Step 8 gives no guidance for the Run sidebar

**Reviewer:** *"There aren't any instructions on what it wants from a user in
the Run sidebar. Not sure what to do with this text field when it's just an
unpopulated `{}`."*

**What the field is, from the code.**

- The box is a Mantine `JsonInput` under the section heading **Initial ctx**
  (`RunWorkflowDrawer.tsx:769` and `:781-790`), aria-labelled *"Initial ctx JSON
  for the in-canvas Try"*. Its value is POSTed as `initialCtx`
  (`RunWorkflowDrawer.tsx:733-741`).
- It is **prefilled**, not blank by design: `buildStubInput(runSpec.inputSchema)`
  writes one key per declared input, using the declared `default` where there is
  one and a type-appropriate empty value otherwise —
  `apps/frontend/src/features/workflow-builder/run/build-stub-input.ts:12-39`.
- So `{}` means *this workflow declares no inputs*. The schema comes from
  `deriveInputSchema` in
  `apps/backend-services/src/workflow/derive-input-schema.ts:64-78`: a
  `source.api` node wins, then a library workflow's `metadata.inputs`, then ctx
  entries flagged `isInput: true`, then an empty object.
- **Standard OCR Workflow hits the fourth branch.** Its config has no `source.*`
  node and not one `isInput` flag —
  `docs-md/workflows/templates/standard-ocr-workflow.json`, `ctx` block. Hence
  the literal `{}` the reviewer was staring at.
- What the run then needs anyway: the entry node is `prepareFileData`
  (`activityType: "file.prepare"`), whose catalog entry marks `documentId` and
  `blobKey` **required** and `fileName` / `fileType` / `contentType` optional —
  `packages/graph-workflow/src/catalog/activities/file-prepare.ts:53-90`.
- The contrasting example: the Workflow-as-API demo's `source.api` node declares
  `documentUrl` (required, no default) and `priority` (optional,
  `defaultValue: 0`) — `scripts/seed-feature-demos.mjs:1409-1424`. Run through
  `buildStubInput`, that is exactly `{"documentUrl": "", "priority": 0}`.
- Validation on the box is only "is this a JSON object" —
  `RunWorkflowDrawer.tsx:712-727`.

**Before:** nothing. The Run drawer was never described at stop 8.

**After:**

````
**Do this — start a run.** Click **Run…** in the top bar. A drawer titled
**Run this workflow** opens, with two tabs:

- **Try on canvas** — the run's results land on the diagram in front of you.
- **Call from outside** — the trigger URL, input schema and `curl` another system
  would use. That's stop 12.

Stay on **Try on canvas**. Under **Initial ctx** there's a JSON box, and on
Standard OCR Workflow it opens empty — `{}`. That box is the bag of starting
values the run begins with, and it's prefilled from the inputs the workflow
*declares*: the fields of an **API endpoint** step, or a variable ticked **Input**
in Workflow settings. Standard OCR Workflow declares neither, so there's nothing
to prefill and you're on your own.

Nothing you type is rejected — the box only has to hold a JSON object — but the
first step, **Prepare File Data**, requires `documentId` and `blobKey` and fails
without them. Both have to name a document that already exists in the database
and in blob storage:

```json
{
  "documentId": "<id of a document already in the system>",
  "blobKey": "<that document's stored file key>"
}
```

That's why nobody types this workflow's input in practice: you start it by
uploading a file. For the opposite case, open **🎯 Demo — Workflow-as-API** and
press **Run…** there — that workflow declares two fields, so the box arrives
already written:

```json
{
  "documentUrl": "",
  "priority": 0
}
```
````

The `{"documentUrl": "", "priority": 0}` example is not illustrative — it is
what `buildStubInput` produces for that seeded workflow, key for key.

Which tab opens first is also derived, not fixed: `runDrawerOpenMode`
(`WorkflowEditorV2Page.tsx:1564-1578`) opens on **Try on canvas** unless
`source.upload` is the workflow's only input path. Standard OCR Workflow and the
Workflow-as-API demo both open on **Try on canvas**, which is why the doc now
says "stay on" it rather than "click" it.

---

## D18 — Step 12's instructions are outdated

**Reviewer:** *"Instructions outdated. It is the Run button, followed by the
Call from outside tab."* Confirmed against code, with the one refinement that the
button reads `Run…`.

Evidence: `RunWorkflowDrawer.tsx:212-225` — the two `Tabs.Tab` labels are
literally `Try on canvas` and `Call from outside`. The comment at :203-211
records why they were renamed from "Try"/"Run" on 2026-08-08: *"the tabs used to
read \"Try\" and \"Run\", which names a strength of commitment that does not
exist… The axis that DOES exist is where the answer appears."*

**Before:**

```
**Do this.** Click **Run this workflow**, then the **Run** tab.
```

**After:**

```
**Do this.** Click **Run…** in the top bar, then the **Call from outside** tab.
The drawer opens on **Try on canvas** — that's the tab for running it yourself
(stop 8); **Call from outside** is the one that documents the API.
```

The "opens on Try on canvas" claim is specific to this demo and verified: its
config carries a `source.api` node (`scripts/seed-feature-demos.mjs:1404-1426`),
so `runDrawerOpenMode` returns `"try"` (`WorkflowEditorV2Page.tsx:1564-1578`).

**Second stale claim in the same stop**, found while verifying: the panel it
tells you to look at was renamed too.

Before:

```
- A ready-made **Sample curl**, and a **Test run** box where you can fill the
  fields and fire one off from here.
```

After:

```
- A ready-made **Sample curl**, an **Authentication** note, and a **Start a run**
  box — a version picker, the same JSON body as stop 8, and a **Run** button that
  fires one off from here. A run started on this tab is recorded as an API call,
  so a later try never cancels it; a try started on the other tab can be.
```

Evidence: `RunWorkflowDrawer.tsx:366-380` — the sections in order are
`Sample curl`, `Authentication`, `Start a run`; the comment at :374-379 says the
box *"was headed 'Test run', which reads backwards — a run started here is
stamped `\"api\"` server-side, so nothing later cancels it."* The cancel-on-new-try
behaviour is at :681-694 and is surfaced in the UI at :809-812 (*"A try is
disposable — starting another run cancels a try that is still going."*).

---

## D19 — Step 13 says "Run this workflow"; the button is just "Run"

Same correction as D14/D18: the button is **`Run…`**
(`WorkflowEditorV2Page.tsx:1848`).

**Before:**

```
**Do this.** Click **Run this workflow**.

**Look for**

- A drop zone stating what it accepts and the size limit — both come from the
  upload step's settings, so changing them changes this.
- Dropping a file uploads it *and* starts a run in one go.
```

**After:**

```
**Do this.** Click **Run…** in the top bar.

**Look for**

- No tabs. A file is this workflow's only way in, so the drawer skips the
  **Try on canvas** / **Call from outside** pair you saw at stop 12 and opens
  straight on **Upload a file**.
- A drop zone stating what it accepts and the size limit — both come from the
  upload step's settings, so changing them changes this.
- Choosing a file and pressing **Run** uploads it *and* starts a run in one go,
  then closes the drawer so the canvas can show you the run.
```

Two behaviours added because the stop's own screenshot shows them and the text
didn't:

- **No tabs on this workflow.** `showApiSection` is
  `!!runSpec && (!uploadSpec || hasInputSchemaFields)`
  (`RunWorkflowDrawer.tsx:153-161`). The Document-sources demo has a
  `source.upload` node and no `isInput` ctx
  (`scripts/seed-feature-demos.mjs:1452-1487`), so its input schema is empty,
  `showApiSection` is false, and only the `UploadSourceSection` renders
  (`RunWorkflowDrawer.tsx:257-265`).
- **It is a two-gesture flow, not a drop.** `handleDrop` only selects the file
  (`RunWorkflowDrawer.tsx:505-510`); the upload-and-run happens in `handleRun`
  behind the **Run** button (`:512-560`, button at `:606-616`), which then calls
  `runState.setActiveRunId(...)` and `onClose()` so the canvas becomes the result
  surface (`:531-532`, `:556`).

---

## D20 — Step 4's "names its kind"

**Reviewer:** *"Names its kind of what? Should this be names its type?"*

**Finding: the app says "kind", so the doc keeps "kind" — and now defines it in
the sentence that first uses it.** `Kind` is a user-visible field label in three
editors: `sources/FieldListEditor.tsx:424`,
`library/LibraryPortListEditor.tsx:160`, and
`settings/WorkflowSettingsDrawer.tsx:484`. The registry that backs it is
`packages/graph-workflow/src/types/artifact-registry.ts`. "Type" is a different,
also-visible word in the product (the Run drawer's input-schema table has a
**Type** column of JSON-schema primitives — `RunWorkflowDrawer.tsx:907`), so
swapping the doc to "type" would have collided with it.

**Before:**

```
- The colour is the **kind** of thing that travels the wire: segments of a
  document are green, a prepared file is blue, an unspecified value is grey.
- Hover a label: a sentence explains what that input or output is, and names its
  kind.
```

**After:**

```
- Every port carries a **kind** — the builder's word for the sort of thing that
  travels the wire, and the word the app itself uses (the field is labelled
  *Kind* wherever you can set one). `PreparedFile`, `DocumentRef`, `Segment`,
  `OcrResult` are kinds; you don't invent them, the step declares them.
- A dot's **colour and shape are the kind's family**, five in all: documents and
  files are blue circles, content taken out of a document is violet squares,
  judgements about a document are yellow diamonds, IDs and lookups are teal bars,
  and a port that takes anything is a hollow grey circle. The **Legend** button
  at the bottom of the canvas spells all five out.
- Hover a label and the tooltip gives the port's raw name, its kind, and a
  sentence — *"preparedData: PreparedFile — Object describing the validated file,
  ready for OCR submission."*
```

**A factual error fixed alongside the wording.** The old bullet said *"segments
of a document are green"*. There is no green family. `Segment` is **violet** —
`artifact-registry.ts:143-148` (`Segment: { color: "violet" }`), and the whole
Segment + OcrResult group is violet by the block comment at :137-140. The five
families, their labels and their shapes are
`apps/frontend/src/features/workflow-builder/canvas/artifact-kind-colour.ts:108-141`:

| token | label | shape |
|---|---|---|
| blue | Documents & files | circle |
| violet | Content taken out of a document | square |
| yellow | Judgements about a document | diamond |
| teal | Pointers — IDs and lookups | bar |
| gray | Untyped — takes anything | hollow circle |

`PreparedFile` blue (`artifact-registry.ts:122-128`) and `Artifact` grey (:97)
were already right; only the green claim was wrong.

The tooltip format is `rowTooltip` in
`apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx:120-123` —
`` `${row.name}: ${row.kind ?? "Artifact"}` `` plus `" — " + description`. The
worked example uses `file.prepare`'s real output port and its real description
(`packages/graph-workflow/src/catalog/activities/file-prepare.ts:91-100`).

The Legend button's position is `<Panel position="bottom-center">` in
`canvas/WorkflowEditorCanvas.tsx:4575-4577`; the button itself is
`canvas/CanvasLegend.tsx:143-167`.

**Note for the D25 owner (step 7, not changed here):** step 7 still claims *"A
**green wire** now runs from the loop to the third step"*. The same registry
evidence applies — there is no green family, and a loop-item wire carrying a
segment is violet. Left alone because D25 is somebody else's item.

---

## D34 — Demo workflow names reference "parts" that don't match the walkthrough

**Reviewer:** *"What do the parts reference on the demo workflow names? They
don't correspond with the parts of the walkthrough seemingly."*

**Finding: correct — they are Parts of `MANUAL_TEST_PLAN.md`, not stops of the
gallery. No workflow was renamed.**

Evidence:

- The seeded name is `NAME_PREFIX + demo.title`
  (`scripts/seed-feature-demos.mjs:1974`), with
  `NAME_PREFIX = "🎯 Demo — "` (`scripts/demo-run-targets.mjs:17`).
- Titles carry the suffix, e.g. `scripts/seed-feature-demos.mjs:1501`
  (`"Typed I/O — coloured handles & type pills (Part 7)"`), `:1548`
  (`"Node settings panel & canvas basics (Part 3)"`), `:1612`
  (`"Workflow-as-API — trigger URL & schema (Part 11)"`), `:1622`
  (`"Document sources — file upload (Part 13)"`), `:1689`
  (`"Versioning — history & revert (Part 12)"`).
- Those numbers match `docs-md/workflows/MANUAL_TEST_PLAN.md` headings: Part 3 at
  :221 (Canvas & Node Basics), Part 7 at :449 (Typed I/O Artifacts), Part 11 at
  :593 (Workflow-as-API), Part 12 at :613 (Versioning), Part 13 at :633
  (Document Sources), Part 14 at :655 (Dynamic Nodes).
- They do **not** match GALLERY stops: the Typed I/O demo is "(Part 7)" but is
  used at gallery stop **4**; Node settings is "(Part 3)" but is stop **2**.
- Second, related confusion the reviewer did not name but would have hit: GALLERY
  abbreviates the names. It says "🎯 Demo — Typed I/O"; the workflow list shows
  the full seeded title.
- `title` is deliberately frozen — the comment at
  `scripts/seed-feature-demos.mjs:1497-1500` says it feeds the stable slug the
  guide links to. Renaming the demos to match the gallery would break those
  links and `scripts/seed-demo-runs.mjs`, which finds the workflows **by name**
  (`scripts/demo-run-targets.mjs:9-13`). So this is documented, not renamed.

**Before:** nothing. The naming was never explained.

**After** (new subsection in *Before you start*):

```
### 3 · Reading the demo names

Every seeded name ends in something like **(Part 7)** or **(Part 14)**. Those are
Parts of [MANUAL_TEST_PLAN.md](./MANUAL_TEST_PLAN.md), **not** stops of this
tour: the demos were built for the test plan, and this page borrows them, so the
numbers deliberately don't line up. This page also shortens the names — where it
says **🎯 Demo — Typed I/O**, the workflow list shows *🎯 Demo — Typed I/O —
coloured handles & type pills (Part 7)*.
```

---

## D3 / D5 (doc side) — no prerequisites section

**Reviewer, D3:** *"Publish failed — Failed to reach deno-runner /check at
http://localhost:9099"*. **Reviewer, D5:** *"It should be clearer where the Demo
workflows come from and how to load them. I needed to find a separate file about
seeding this separate demo data, then figure out that I had to generate an API
key in the app and update some ENVs."*

**The false claim that caused both.**

Before:

```
You need no setup, no terminal, and no database. If a button doesn't do what this
page says it will, that's a finding — write it down and keep going.
```

After:

```
Somebody has to bring the local stack up and seed it first, though — that's the
**Before you start** section below, about ten minutes of terminal, once. After
that the tour is clicking and reading. If a button doesn't do what this page says
it will, that's a finding — write it down and keep going.
```

The old "Before you start" section was three short paragraphs and mentioned no
command at all:

```
## Before you start

Open the app and sign in. Everything happens under **Workflows** in the left
nav unless a stop says otherwise.

The tour uses the workflows whose names begin **🎯 Demo —**. They are seeded for
exactly this purpose; you can edit them freely, and re-seeding restores them.

☁️ **Four stops need the engine running** — 8, 9, 10 and 14. They're marked with
a ☁️. If the **Try** button does nothing on stop 8, the engine isn't up: skip to
stop 11 and come back later. Everything else works with just the web app.
```

It is now four numbered subsections. Full after-text is in the file at
GALLERY.md:26-101; the verification behind each claim:

**§1 Bring the stack up.**

- Link target: `README.md:241` (`## Quick Start`), which covers Node, the three
  `.env` copies, migrations and `npm run db:seed` (`README.md:243-441`).
- Standard OCR Workflow's provenance: `apps/shared/prisma/seed.ts:683-687` reads
  `docs-md/workflows/templates/standard-ocr-workflow.json` and upserts it as a
  workflow lineage (`seedBenchmarkingData`, :681-745). So it exists after
  `npm run db:seed` and needs no demo seeding — which stops 1 and 8 rely on.
- The three commands are copied from the VS Code tasks that actually run:
  `.vscode/tasks.json:5-16` (`docker compose --profile infra --profile temporal
  up -d`), `:77-95` (`docker compose -f
  deployments/local/docker-compose.deno.yml up -d`). `npm run dev` is
  `package.json:5` — `concurrently` over `dev:backend`, `dev:frontend`,
  `dev:temporal-worker`. **Dev: all** is `.vscode/tasks.json:164-175`, with
  `runOn: folderOpen`.
- "Seven processes": postgres, minio, temporal (the infra profile), deno-runner,
  backend, frontend, Temporal worker.
- The deno-runner error text is quoted from the source that emits it:
  `apps/backend-services/src/dynamic-nodes/deno-runner.client.ts:99` —
  `` `Failed to reach deno-runner /check at ${this.baseUrl}` `` — which is
  character-for-character the reviewer's screenshot.
- Port 9099 and the health URL:
  `deployments/local/docker-compose.deno.yml:5` (`curl
  http://localhost:9099/health`) and `:44` (`"9099:9090"`).
- The claim that the root README never mentions the deno-runner: `grep -n
  "deno" README.md` in the Quick Start range returns nothing; the runner appears
  only in `MANUAL_TEST_PLAN.md:31`.

**§2 Seed the demo workflows.**

- Commands: `package.json:22-23` — `seed:demos` → `node
  scripts/seed-feature-demos.mjs`, `seed:demo-runs` → `node
  scripts/seed-demo-runs.mjs`.
- HTTP-only + needs a seeded DB: `scripts/seed-feature-demos.mjs:8-9` and
  `docs-md/workflows/FEATURE_DEMO_SEEDER.md:19-24` (*"If the DB was reset without
  a seed, every request 401s"*).
- Idempotent, and re-seeding orphans runs:
  `scripts/seed-feature-demos.mjs:12-16`; `FEATURE_DEMO_SEEDER.md:31-38`.
- **The API-key paragraph directly answers D5's "generate an API key in the app
  and update some ENVs" — that step no longer exists.** The seeder loads
  `apps/backend-services/.env` and probes every candidate key until one
  authenticates: `scripts/seed-feature-demos.mjs:44-64` and
  `FEATURE_DEMO_SEEDER.md:47-55`. No key value is ever logged, and none is
  quoted in the doc.
- **The deno-runner-before-seeding warning is the root cause of D6** (stop 15's
  demo missing). Both custom-step demos are published through the runner and are
  best-effort: `scripts/seed-feature-demos.mjs:1806-1809` prints `⚠ dynamic-node
  demo skipped — publish failed (deno-runner down?)`, and `:2016-2019` prints
  `– deleted-dyn skipped (deno-runner unavailable)`. Both quoted strings in the
  doc are shortened to their stable prefix.
- `npm run db:seed` is run from `apps/backend-services`
  (`apps/backend-services/package.json:30`); there is no root-level `db:seed`,
  which is why the doc names the directory.

**§4 What each stop needs.** The table is derived from the demo definitions:

- Stops 8/9/10 need the worker and seeded runs — `scripts/seed-demo-runs.mjs:6-7`
  (*"with the Temporal worker live"*), and the per-demo
  `"⚠️ Requires the Temporal **worker** (the `dev: all` task)"` lines at
  `scripts/seed-feature-demos.mjs:1643`, `:1657`, `:1671`.
- Stops 14/15 need the deno-runner — `scripts/seed-feature-demos.mjs:1753`
  (*"Dynamic-node demo (Part 14) — publish-time needs the deno-runner
  toolchain"*), plus `MANUAL_TEST_PLAN.md:69` (publish-time `deno check`).
- Stop 16 needs agent credentials — deliberately **not** restated here, just
  linked to `MANUAL_TEST_PLAN.md` Part 1.4 (`MANUAL_TEST_PLAN.md:71`), because
  D4 is an open question about which subscription and the answer isn't settled.

Link check: `bash .claude/skills/docs-sync/scripts/check-doc-links.sh` reports 18
dangling links repo-wide, none of them in GALLERY.md.

---

## Not resolved

- **Stale screenshot, stop 8.** `gallery-images/08-run-and-watch.png` shows the
  pre-2026-08-08 top bar (both **Try** and **Run this workflow**). Annotated with
  a dated note rather than re-shot; re-capturing needs a live stack with a
  finished run.
- **D25 overlap left alone.** Step 7's "green wire" is wrong by the same registry
  evidence used for D20, but D25 belongs to another owner, so step 7 is
  untouched.
- **No worked value for Standard OCR Workflow's `documentId` / `blobKey`.** The
  doc gives the required key names and says both must name a document that
  already exists. I could not verify from code that a developer can read a
  `blobKey` out of the UI, so the example uses placeholders and steers the reader
  to the upload path instead of inventing a lookup.
- **Stop 15 carries no ☁️ marker** even though its demo needs the deno-runner at
  seed time. The new prerequisites table says so; the heading glyph was left
  alone because stop 15 is D6's territory.

---

# Follow-ups (second pass, same day)

Three findings routed in by the coordinator from other agents' items. All three
verified against code before writing, as with the first pass. Same file, same
constraint: `docs-md/workflows/GALLERY.md` only.

---

## F1 — Stop 15: the missing custom node is *supposed* to be missing

**Where it came from.** D6 resolved as not-a-defect. The reviewer wrote
*"Appropriate name, because the Demo - Deleted custom node doesn't appear to have
been seeded"* — he checked the **Dynamic nodes** management page, found nothing,
and concluded the seed had failed.

**What the code does.** `demo-deleted-node` is published, referenced, and *then*
soft-deleted, in that order, and the management page is supposed to hide it.

- `scripts/seed-feature-demos.mjs:1868` — `const DELETED_DYN_SLUG =
  "demo-deleted-node"`.
- `scripts/seed-feature-demos.mjs:1860-1867` — the fixture's rationale: *"D2
  (14.8) — a workflow that references a dynamic node whose lineage has been
  SOFT-DELETED, seeded already in that end state… The plan asks the reader to go
  and delete a lineage themselves. That is destructive."*
- `scripts/seed-feature-demos.mjs:2011-2034` — `createDeletedDynDemo()`: `POST
  /api/dynamic-nodes` (publish), then `POST /api/workflows` (the workflow that
  references `dyn.demo-deleted-node`), then `DELETE
  /api/dynamic-nodes/demo-deleted-node`. The comment at :2031-2032 is explicit:
  *"Tombstone the lineage AFTER the workflow references it — that ordering is the
  whole point of the fixture."*
- Exclusion from the list is by design, and stated in the API contract itself:
  `apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.ts:210-216` —
  summary *"List the calling group's **non-deleted** dynamic-node lineages"*,
  response description *"Soft-deleted lineages are excluded."* The query behind
  it is `dynamic-node.repository.ts:304-309`:
  `...(includeDeleted ? {} : { deletedAt: null })`, with `includeDeleted`
  defaulting to `false` (:305).
- The canvas, by contrast, renders it:
  `canvas/WorkflowEditorCanvas.tsx:924` and `:1319` —
  `{isMissingFromCatalog ? "Deleted" : "DYN"}` on a red filled `Badge`. The
  seeded node's label is `"Custom step (lineage deleted)"`
  (`scripts/seed-feature-demos.mjs`, `deletedDynConfig`).

**Before:**

```
Custom steps can be deleted while workflows still refer to them. This is what
that looks like.

**Look for**
```

**After:**

```
Custom steps can be deleted while workflows still refer to them. This is what
that looks like.

**The step is *meant* to be missing, and it is missing in one place only.**
`npm run seed:demos` publishes a custom step called `demo-deleted-node`, builds
this workflow on top of it, and *then* soft-deletes the lineage — that order is
the whole fixture, because a workflow has to reference a step before the step can
become a tombstone. So the two places you might go looking behave differently on
purpose:

- **Dynamic nodes** (left nav) does **not** list it, and that is correct.
  `GET /api/dynamic-nodes` excludes soft-deleted lineages by design. A
  tombstoned step is invisible on the management page — its absence there is the
  feature, not a seeding failure.
- **This workflow's canvas** is where it shows up: present, named, and broken.
  That's the only surface that still knows it existed, and it's what this stop is
  about.

**Look for**
```

**Second insertion, before the closing paragraph.** The stop already quotes the
settings alert *"Restore from the management page to use this node"*
(`settings/dynamic-node/DynamicNodeSettings.tsx:104-110`) — advice that points at
the one page which deliberately doesn't list the thing. That needed explaining,
and the reader needed a real test to tell "working as designed" apart from
"seeding actually failed".

Before: nothing between the **Look for** list and *"This is the shape the whole
product aims for…"*.

After:

```
**Worth knowing.** That alert says *"restore from the management page"*, and the
step isn't on the management page — deliberately, as above. Restoring it means
publishing a step with the **same name** from **Dynamic nodes ▸ New custom
node**: a publish under an existing slug revives the soft-deleted lineage and
continues its version numbering rather than starting a fresh one.

**Something's off if** the canvas has no such step *either*. Then the seeding
really did fail, and the cause is the deno-runner: this step has to be published
before it can be deleted, so a seed run without the runner skips the whole demo
and prints `– deleted-dyn skipped (deno-runner unavailable)`. Start it and
re-seed — see [Before you start](#2--seed-the-demo-workflows).
```

Evidence for the restore mechanic: `dynamic-node.repository.ts:86-99` documents
the three branches of `createWithFirstVersion`, the middle one being *"**A
soft-deleted lineage exists** → restore it: clear `deletedAt`, append the next
version (`maxVersion + 1`, continuing the preserved history…). This is what makes
delete-then-republish under the same name work instead of dead-ending on the slug
tombstone."* Implementation at :121-150. The skip message is
`scripts/seed-feature-demos.mjs:2016-2019`.

---

## F2 — Prerequisites: the generated Prisma client, and running without Azure

**Where it came from.** Two agents lost time to a stale generated Prisma client.
The symptom pair is what makes it worth documenting: the failure is loud but
points somewhere else, and the usual "is my checkout clean?" reflex returns a
false all-clear.

**Verified.**

- The command: `apps/backend-services/package.json:30` — `"db:generate": "node
  ../shared/scripts/generate-prisma.js"`. There is no root-level `db:generate`,
  so the doc names the directory. This also matches the repo's own `CLAUDE.md`
  instruction to use that script rather than a bare `npx prisma generate`.
- Two output directories: `apps/shared/scripts/generate-prisma.js:19-21` —
  `backendServicesPath = apps/backend-services/src/generated` and
  `temporalPath = apps/temporal/src/generated`.
- **Both gitignored**, the load-bearing detail:
  `apps/backend-services/.gitignore:50` (`src/generated`) and
  `apps/temporal/.gitignore:6` (`src/generated/`). A stale client is therefore
  invisible to `git status`.
- The error shape is the standard one for a model missing from a generated
  client — the namespace property is `undefined`, so the first method call on it
  throws. The repo already records an instance of exactly that class of failure:
  `scripts/seed-feature-demos.mjs:445-447` — *"the activity upserts a
  `DocumentRejection` model that was never added to the Prisma schema, so every
  execution dies with 'Cannot read properties of undefined (reading
  'upsert')'."*
- The misleading empty state is real, and shares its wording with the management
  page: `palette/ActivityPalette.tsx:298` and
  `pages/dynamic-nodes/DynamicNodesListPage.tsx:175`, both `"No custom nodes
  yet"`.
- `MOCK_AZURE_OCR` is read by the **worker's** activities, not the backend:
  `apps/temporal/src/activities/submit-to-azure-ocr.ts:56`
  (`const useMock = process.env.MOCK_AZURE_OCR === "true"`) with the mock branch
  at :86-104 returning a synthetic `apimRequestId`, and
  `apps/temporal/src/activities/poll-ocr-results.ts:47` with the canned
  succeeded response at :89-100. Hence the doc says `apps/temporal/.env` and
  "restart the Temporal worker" rather than naming the backend. The key ships in
  `.env.sample:52` as `MOCK_AZURE_OCR=false`.

**Before:** nothing — §1 ended at the deno-runner paragraph.

**After** (appended to *Before you start ▸ 1 · Bring the stack up*):

````
**Regenerate the Prisma client** after you pull, switch branches, or move the
schema:

```bash
cd apps/backend-services && npm run db:generate
```

That script writes the generated client into two places —
`apps/backend-services/src/generated` and `apps/temporal/src/generated` — and
**both are gitignored**, which is what makes a stale one so baffling: `git
status` is clean, the branch is right, and nothing looks wrong. What goes wrong
instead is unrelated-looking. A run dies at its first step with `Cannot read
properties of undefined (reading 'findUnique')` — a model the running code
expects isn't on the generated client, so the property is simply `undefined`.
And the dynamic-nodes endpoint 500s, which the palette renders as a calm
**"No custom nodes yet"** under CUSTOM: identical to what it would say if you
genuinely had none. If either of those greets you, regenerate before debugging
anything else.

**No Azure account?** Put `MOCK_AZURE_OCR=true` in `apps/temporal/.env` and
restart the Temporal worker. `submitToAzureOCR` then returns a mock request id
and `pollOCRResults` a canned succeeded response, so **Standard OCR Workflow**
runs end to end and stops 8–10 work without a credential. (The demo those stops
send you to needs no Azure either way — this is for walking the real OCR chain.)
````

---

## F3 — Stop 7's "green wire"

**Where it came from.** D25's owner confirmed there is no green family — the same
error I corrected at stop 4 in the first pass, still live at stop 7.

**Verified.** `document.split`'s output port is `DocumentSegment[]`
(`packages/graph-workflow/src/catalog/activities/document-split.ts:104`), so one
item off that collection is a `DocumentSegment`, registered `color: "violet"` in
`packages/graph-workflow/src/types/artifact-registry.ts` inside the violet
Segment family whose block comment sits at :137-140. The violet family's legend
label and shape are *"Content taken out of a document"* / square —
`apps/frontend/src/features/workflow-builder/canvas/artifact-kind-colour.ts:114-121`.

**The reviewer's own aside turns out to be the interesting half.** He wrote
*"The wire is not green, it is purple, but so is the Run for Each Item node, so
maybe that's just an expected change."* Two different purples, from two
independent registries:

- the **wire** is `#6741D9`, the violet *data family* of what's travelling it
  (`artifact-kind-colour.ts:117`);
- the **card** is `#6B21A8`, the `fan` *node accent* meaning "Fans out or back
  in" (`apps/frontend/src/features/workflow-builder/node-accents.ts:63`, mapped
  to `map` at `control-flow-visual-hints.ts:63-68`).

The match is coincidence, and a reader is right to wonder — so the doc now says
so instead of leaving it to be re-discovered.

**Before:**

```
- A **green wire** now runs from the loop to the third step: that's the current
  item being handed to the body of the loop. Hover it and it says it was
  connected automatically.
- Give the loop a moment; the wire appears as soon as the item has a name.

**Something's off if** no green wire appears *after* you've named the item —
before you name it, no wire is correct, because there's nothing to hand over yet.
```

**After:**

```
- A **violet wire** now runs from the loop to the third step: that's the current
  item being handed to the body of the loop. Hover it and it says it was
  connected automatically.
- Violet because of what travels it, not because it's a loop. **Split Document**
  emits `DocumentSegment[]`, so one item off that list is a `DocumentSegment` —
  the violet *content taken out of a document* family from stop 4. Wire a loop
  over a different kind and you get that kind's colour.
- The **Run for each item** card is *also* purple, and that is a different purple
  for a different reason: a card's accent says what sort of step it is (this one
  "fans out or back in"), while a wire's colour says what kind of data is on it.
  Two vocabularies, one hue family — worth knowing before you read anything into
  the match.
- Give the loop a moment; the wire appears as soon as the item has a name.

**Something's off if** no wire appears *after* you've named the item — before you
name it, no wire is correct, because there's nothing to hand over yet.
```

**Also fixed: the image alt text**, which carried the same false claim and is
what a screen-reader user gets instead of the picture.

Before: `![A Split Document step wired to a Run for each item step, which is
wired by a green loop wire to a Classify Document step; …](./gallery-images/07-loop.png)`

After: `![A Split Document step wired to a Run for each item step, which is
wired by a violet loop wire to a Classify Document step; …](./gallery-images/07-loop.png)`

**Sweep.** `grep -n "green" docs-md/workflows/GALLERY.md` now returns six hits,
every one of them run-status green — a green node header, green status dots in
run history, a step "gone green", the custom-step editor's green tick. None is a
data-family claim, and no other colour claim in the file contradicts the
registry.
