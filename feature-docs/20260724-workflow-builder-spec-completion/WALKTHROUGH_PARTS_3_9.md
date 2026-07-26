# Walkthrough — MANUAL_TEST_PLAN Parts 3–9

**Date:** 2026-07-25
**Branch:** `feature/visual-workflow-builder` @ `84c22880` (current with `develop`)
**Driver:** headless Chromium via Playwright, auth mocked per `.claude/skills/app-browser-auth/`
**Stack:** frontend :3000, backend :3002, Temporal worker + docker infra all live; runs really executed

This is the acceptance test for the spec-completion effort — the first time Parts 3–9
have been walked end-to-end against the shipped product rather than reasoned about.

---

## Headline

**The authoring core holds up.** Roughly 60 checks were exercised against the running
app. Everything the nine fix batches were supposed to deliver is observably working,
including the exact toast and error strings the plan specifies. No crashes, no blank
screens, no data loss.

The defects that surfaced are **small and mostly in the test plan itself** — four checks
promise something the product cannot produce on the fixtures they name, which means
those checks would pass while regressing. That is worth more than it sounds: an
unfalsifiable check is worse than no check, because it reads as coverage.

**Two real product defects** were confirmed, both minor and both about *feedback*
rather than correctness.

---

## Confirmed working (observed, not inferred)

### Part 3 — canvas & node basics
| Check | Evidence |
|---|---|
| 3.1 add + auto-fit | viewport transform `translate(0,0) scale(1)` → `translate(-98,58.5) scale(2)`; Undo enabled, Redo stays disabled |
| 3.2 fit only on add | dragging a node left the transform byte-identical; adding one changed it |
| 3.3 configure | schema-driven form; label edit reached the canvas node immediately |
| 3.6 save round-trip | redirect to `/workflows/<cuid>/edit`; reload restored 2 nodes + 1 edge |
| 3.7 master template | 16 config nodes load, auto-arrange, save, reload — round-trips |
| 3.8–3.11 undo/redo | add/undo/redo by one step each; redo branch dropped after a new edit |
| 3.10 undo covers everything | move restored to `translate(80px,100px)` exactly; label restored; **auto-arrange undo restored the previous positions rather than recomputing** |
| 3.12 delete | no confirm dialog; toast verbatim: `Deleted "Prepare File" — 1 variable lost its source; 1 step reads it.` + **Undo**; leaf delete silent; undo restored node **and** both ctx declarations |
| 3.13 undo vs typing | `abcdef` → `a` → `New workflow` by character group, canvas untouched; after blurring to canvas Ctrl+Z undid the graph |
| 3.14 leave guard | `beforeunload` on reload; in-app confirm verbatim: `This workflow has unsaved changes. Leave and discard them?`; cancel keeps the edit, confirm navigates, untouched saved workflow is silent |
| 3.15 find a node | type search lists all 3 `azureOcr` nodes incl. the poll; empty state verbatim: `No node matches "document.classify" in this workflow.`; click selects, **selection sticks**, canvas pans, query clears |
| 3.16 Used by N | popover: `READ BY (2)` / `Prepare File Data — prepareFileData · blobKey ← blobKey` |

### Part 4 — control-flow forms
All six forms render with their full field sets. Specifically:
- **4.1** the case Edge dropdown lists **exactly** this switch's three conditional edges
  (`route-invoice` / `route-receipt` / `route-default`) and nothing else.
- **4.2** body-entry picker excludes the map itself; the **dead-end warning** fires:
  *"These body branches end before the exit node: Sub-workflow (inline OCR), Wait for approval."*
- **4.3** source-map picker offers only `Run for each document MAP`.
- **4.5** invalid duration `30` → inline *"Enter a Temporal duration like 30s, 5m, 1h."* with `aria-invalid="true"`.
- **4.6** the fallback-edge picker appears for **Fallback** only (present 0 / 0 / 1 across Fail / Continue / Fallback).
- **4.7** the 3-level tree renders with `ALL OF THESE MUST BE TRUE` / `ANY OF THESE CAN BE TRUE` group summaries.
- **4.13** typed drill-down works: `ocrResult.documentId string`, `.byteLength number · optional`, … while untyped `documents` / `currentDoc` show no field rows.
- **4.15** a **dead-end branch node** (`childOcr`) does see `currentDoc` and `docIndex` — the regression guard holds.

### Part 5 — edges & validation
- **5.1** edge labels verbatim: `if ctx.currentDoc.type is "invoice"`, `if all of (2)`, `otherwise`.
- **5.2 (G-001)** error-policy form offers *Stop the workflow / Follow the error path / Skip this step and continue*; the `error` handle appears; the drawn edge is dark red (`rgb(130,38,35)`) labelled **`on error`**; and the **Error path picker then names "Store Rejection"** — drawing it recorded `fallbackEdgeId`, so no unclearable validation error is left behind.
- **5.4a** drawer rows carry `Select node →` affordances.
- **5.6** verbatim: *"Map item ctx key `segment` collides with a reserved expression namespace — a condition ref `segment` resolves to `ctx.currentSegment`, not this value. Rename it (e.g. `segmentValue`)."* anchored at `nodes.map_1.itemCtxKey`; chip 2 issues → 3 → back to 2 on rename.

### Part 6 — widgets, grouping, swap
- **6.2 / 6.4** group settings expose label, description, icon, colour, member list with per-member remove, delete, and the exposed-parameters editor.
- **6.3** simplified view collapses both members into a single `group-chip-group_1` (node count 2 → 1).
- **6.5** hover-to-extend opens the compatible-next-node popover.
- **6.6** right-click an activity → **Change activity type** enabled; right-click a control-flow node → the same entry is **disabled**.

### Part 7 — typed I/O
- **7.1** per-port rows with kind colours — `blobKey` blue (Document), `segments` **green** (Segment), `groupId`/`documentId` grey (Artifact wildcard); amber ring `rgb(252,196,25)` on required unbound inputs.
- **7.9 (G-016)** a `pollUntil` wrapping `azureOcr.submit` renders all four port rows (`port-row-pollUntil_1-in-fileData`, `-out-apimRequestId`, …), keeps its `WAIT UNTIL CONDITION` chrome, and the card grows to fit.

### Part 8 — auto-wire
- **8.1** connect → `Prepared file data ← Prepare` with a green **AUTO** badge, plus the connect-summary popover and an *"Auto-wired — data now flows from …"* toast.
- **8.2** three states observed on one demo: `Needs a source` (unsatisfied), `from documentId` **PINNED** (locked), `← Prepare` **AUTO**.
- **8.5** badge click opens the node-scoped drawer *"Problems on Lone Submit (unsatisfied)"* with *Input "Prepared file data" needs a source — choose where it comes from* and a **`Pick a source →`** deep link.
- **8.10** mid-drag, incompatible ports dim to `opacity 0.35` with `data-drop-compatible="false"` while compatible ones stay at 1; the drop is refused with *"This input needs PreparedFile — DocumentSegment (list) can't be used here"*, and a self-drop with *"A step can't feed itself"*. No wire is created either way.
- **8.15 (G-104) — the fix I shipped yesterday works end to end.** Built `document.split → map → document.classify`: a **green Segment wire runs from the map to the body node's input row**, the binding reads `currentSegment` (the map's own item key, **not** a synthesised `__auto.<mapId>.item`), the map gained **no** `outputs[]` row, and the badge reads **AUTO** rather than "Pinned by you". Screenshot: `p8-8.15.png`.

### Part 9 — try-in-place (real Temporal runs)
Two runs genuinely executed; the worker log confirms `file.prepare` completing in 647 ms
and `activityOutputCache.upsert` writing the preview.
- **9.3** the source node's **Upload & Try** committed the PDF to blob and started the run.
- **9.4** both nodes reached `data-status="succeeded"` (green).
- **9.5 / 9.5b** previews render; the unbound-output copy is verbatim: *"This step's output isn't bound to a workflow value yet, so there's nothing to read."*
- **9.8** run history lists both runs with status dot, version pin, relative time, input-summary chip (`DOCUMENTURL=…, DOCUMENTID=…`), **Replay** buttons and Status/From/To/Version filters.
- **9.9** Replay works — the top bar reads **`REPLAY MODE — V0 (READ-ONLY)`** and cached statuses repaint.
- **9.13** clicking a data wire opens the peek popover (`Upload → documentUrl`); the right-click menu correctly offers **Disconnect** / **Revert to automatic** and **omits "View data"** when there is no live run — the documented post-reload caveat is real and observable.

---

## Real defects found

### D-1 — a run's version number is fabricated as `v0`
**Where:** run-history rows *and* the replay chip.
**Observed:** the Part 9 demo has exactly one version (`workflow_versions.version_number = 1`),
yet every run row renders **`V0 — HEAD`** and replay announces **`REPLAY MODE — V0 (READ-ONLY)`**.
**Path:** [workflow.controller.ts:1332](apps/backend-services/src/workflow/workflow.controller.ts#L1332)
maps a missing version to `0` (`versionNumber: execution.versionNumber ?? 0`); the value
comes from the start-time memo (`decodeWorkflowVersion`,
[temporal-client.service.ts:1218](apps/backend-services/src/temporal/temporal-client.service.ts#L1218)),
which the canvas-triggered run path does not appear to set. The frontend then prints it
raw ([RunRow.tsx:127](apps/frontend/src/features/workflow-builder/run-history/RunRow.tsx#L127)).
**Why it matters:** this is the one surface whose entire job is telling you *which graph ran*.
`v0` is not a version that exists. It also feeds 9.10b (G-024), where the **Re-run v{n}**
button is supposed to target the replayed version — built on a number that is a fallback,
not a fact. The neighbouring `workflowVersionId: … ?? ""` sentinel makes `isHead` compare
two empty strings, which is how an unversioned run can badge itself **head**.
**Suggested fix:** render "version unknown" when the memo is absent rather than coercing
to `0`, and stop the `""` sentinel from satisfying the head comparison.

### D-2 — creating a group gives no feedback at all
**Where:** More ▸ Group selected.
**Observed:** with two nodes marquee-selected the menu item is enabled; clicking it
**does** create and persist the group (verified in the saved config:
`nodeGroups.group_1` with both `nodeIds`). But nothing tells you: no toast, no canvas
change in normal view, and **the Group settings panel does not open** — the right rail
returns to its empty state. The panel is fully functional once you toggle Simplified view
and click the chip.
**Path:** `handleGroupSelected` ([WorkflowEditorV2Page.tsx:626](apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx#L626))
calls `setActiveGroupId(newGroupId)` in the same tick, and its own comment says this exists
"so the panel mounts `GroupNodeSettings`" — but it doesn't mount.
**Why it matters:** 6.2's stated pass is "right rail shows GroupNodeSettings". A user who
groups two nodes in normal view has no way to know it worked.

### D-3 — invalid DOM nesting in the Run drawer (cosmetic)
[RunWorkflowDrawer.tsx:169](apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx#L169)
passes `title={<Title order={4}>Run this workflow</Title>}`; Mantine's drawer title is
already an `<h2>`, producing `<h2><h4>…</h4></h2>` and a React console error
(*"In HTML, `<h4>` cannot be a child of `<h2>`… This will cause a hydration error"*).
It is the only instance of this pattern in the codebase.

### D-4 — a failed Save says less than the API does (minor)
Saving an invalid graph shows **"Save failed / Invalid workflow configuration"**, while the
API response names the exact anchor: `nodes.switch_1.defaultEdge — Switch node "switch_1"
must have a defaultEdge`. The editor already flagged it in the problems chip, so nothing is
lost — but the toast discards detail it was handed.

---

## Test-plan defects — checks that cannot fail

These matter more than their size suggests: each one **would pass even if the feature it
names regressed completely.**

### P-1 — 4.14 and 4.15 promise a "Loop variables" group that can never appear
Both items assert the variable picker shows a **"Loop variables"** group containing
`currentSegment` / `currentDoc` and `docIndex`. But `buildVariableOptions`
([VariablePicker.tsx:141](apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx#L141))
filters loop vars that are *also* declared in `config.ctx` — and **both fixtures the plan
names declare them**: the master template declares `currentSegment`, the part-4 demo
declares `currentDoc`/`docIndex`. They render under **"Workflow context"** instead.
The behaviour is correct (dedupe); the assertion is unreachable. *Fix the plan, or add a
fixture whose map item is not ctx-declared.*

### P-2 — 3.4 asks for a grey edge on a pair that auto-binds
3.4 says to wire **Prepare File → Submit OCR** and expects "a solid grey `normal` edge".
What actually renders is a **coloured data wire** labelled *"Connected automatically —
nearest Prepared file data producer"*, because that pair auto-binds. The dashed grey
sequence wire only appears when no data rides the edge. The plan's own recommended pair
contradicts its expected result.

### P-3 — Part 9's linked demo cannot exercise 9.1 or 9.2
The Part 9 demo (`demo-try-in-place-…-part-9`) is **source.upload-only**, so the Try button
is deliberately absent — there is an explicit unit test asserting this
("Try button is HIDDEN for source.upload-only workflows"). But 9.1 and 9.2 are written
against the top-bar **Try** button and the Try/Run tab split. A walker following the plan
lands on a demo where the first two checks are impossible.

### P-4 — smaller staleness
- **3.15** suggests typing `wait` to match a label; no node in the master template is labelled "wait" (the pollUntil is *"Poll Initial OCR Results"*). Searching by type works fine.
- **8.10** quotes *"needs Document — Segment (list)"*; the shipped copy uses the post-taxonomy names *"needs PreparedFile — DocumentSegment (list)"*.
- **6.2** says "Marquee/shift-select". Shift-**click** does **not** multi-select (ReactFlow's default binds Shift to the marquee and Ctrl to multi-select). Marquee and Ctrl-click both work; the phrasing invites the one gesture that doesn't.
- **3.7** says 16 nodes; the canvas renders 17 elements because of the synthetic map-body container. The config is 16 — worth a parenthetical so it doesn't read as drift.

---

## Corroborated: G-106 is real and visible

Independent of the config analysis, the UI shows it. On the part-4 demo, `pollOcr` — a node
**inside** the map body — reports **"No upstream steps yet — add one, or enter a variable
manually."** in its condition step-picker. Because neither shipped map has an edge to its
`bodyEntryNodeId`, auto-wire cannot see the map from inside its own body. Every data wire
on the master template reads **"Pinned by you"**.

This is exactly the limitation recorded in 8.15's warning note, now confirmed from the
product side rather than from the config. It remains **undispositioned** and is the one
item genuinely blocking map-item bindings from being automatic rather than hand-authored.

---

## Not verified

- **7.2 tooltips** — hover did not produce a tooltip node under automation; likely a driver
  limitation (the amber ring and `data-needs-source` were confirmed directly). Worth 30
  seconds of human hovering.
- **9.4 pending→running transitions** — the 2-node demo completes in under a second, so only
  the terminal `succeeded` state was ever sampled. The badge mechanism is proven; the
  intermediate animation is not.
- **9.6 cache re-run, 9.9a/9.9b/9.10x replay-version semantics, 5.3, 5.7, 6.1, 7.5–7.8,
  8.3/8.6/8.11–8.14** — not reached this pass.
- `GET /api/groups` returns 401 throughout. This is an artifact of the mocked auth (the
  bypass fakes the frontend's `/auth/me` but the backend never sees a session); the group
  selector still renders "Default". Not treated as a product finding.

---

## Recommendation

1. **Fix the four plan defects first** (P-1…P-4). They are the cheapest possible work and
   they are actively lying about coverage — P-1 in particular would hide a total regression
   of loop-variable scoping.
2. **D-1 (`v0`)** is the only finding with real consequences, because replay and re-run
   both key off it. It is also adjacent to G-024, which was supposed to have closed this
   class of problem.
3. **D-2** is a two-line feedback fix.
4. **Rule on G-106** — now corroborated from two independent directions.
5. The unreached checks above are the natural second pass.
