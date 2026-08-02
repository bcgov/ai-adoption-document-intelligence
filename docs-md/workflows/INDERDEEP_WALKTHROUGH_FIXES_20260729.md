# Workflow Builder: Inderdeep's 2026-07-29 Walkthrough Findings — Fix Batch 1

Tracks the fixes for the issues Inderdeep Singh found manually walking Part 2/3
of `docs-md/workflows/MANUAL_TEST_PLAN.md`, reviewed with Alex on 2026-07-29
(transcript + summary in the notes corpus, `!Justin/SDPR workshop/`). Goal:
all items done before the next batch-review meeting.

---

## Workflows List & Navigation

### 1. [x] Make workflow names clickable links that open the workflow
**Area:** Frontend — WorkflowListPage
**Problem:** Rows highlight blue on hover (`highlightOnHover`) but clicking a row does nothing; elsewhere in the app (e.g. other list screens) clicking a row opens the record, so behaviour is inconsistent within the application. The only affordance is the Edit icon button, but Inderdeep wanted to *open/view*, not edit — he tried right-click, double-click, and clicking the name (which isn't a link). Agreed fix: make the name a real link (hand cursor, link styling) that opens the workflow; keep row-level actions (copy slug, Edit, Delete) as they are and do NOT make the whole row clickable, so accidental clicks near row actions don't navigate.
**Expected:** Workflow name renders as a clickable link with pointer cursor navigating to the editor for that workflow; hover affordance matches what actually happens on click.
**Key file:** `apps/frontend/src/pages/WorkflowListPage.tsx:264-324` — name cell at :266-268 is a plain `<Text fw={500}>`; Edit navigation lives in the `IconActionButton` at :299-307.

### 2. [x] Add an in-editor workflow switcher
**Area:** Frontend — WorkflowEditorV2Page top bar
**Problem:** From inside the editor there is no way to move to another workflow — no in-app back button, no switcher. With ~25 seeded workflows Inderdeep had to bounce list↔editor constantly while executing test cases. Discussed: title-as-dropdown (Alex) vs a searchable list (Inderdeep — dropdown doesn't scale past ~50). Both agree a searchable switcher beats back-and-forth; name editing must remain possible (could become a separate function if the title becomes the switcher trigger).
**Expected:** A searchable workflow switcher in the editor top bar (centre zone next to Name/Description is the natural home) that lists existing workflows, filters as you type, and navigates on select — without breaking the ability to rename the current workflow. An explicit "back to workflows" affordance also satisfies the navigation half.
**Key file:** `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1355-1420` — top bar zones; `NodeSearchBox.tsx` is prior art for a search box (searches nodes, not workflows). Routes in `apps/frontend/src/App.tsx:66-90`.

---

## Saving

### 3. [x] Allow saving an invalid workflow (draft semantics)
**Area:** Frontend — save flow + Backend — workflow.service validation gate
**Problem:** Save fails with "Save failed: invalid workflow configuration" until the graph validates. Alex hit this live and called it out himself: "you should probably be able to save regardless of the state"; Inderdeep: "it should be up to the user." Filed in the work store as an open question with both leaning allow — confirm final call with Alex before building, then: saving persists whatever the user has, validation results surface as warnings, and only *activation/run* stays gated on validity.
**Expected:** Save succeeds for structurally-storable but semantically-invalid graphs; validation issues shown non-blockingly (notification + ValidationDrawer); running/activating an invalid workflow remains blocked.
**Key file:** `apps/backend-services/src/workflow/workflow.service.ts:702,840` — "Invalid workflow configuration" gate; `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1095-1189` — `handleSave` failure branch; `apps/frontend/src/data/hooks/useWorkflows.ts:199-290` — `WorkflowSaveError`.

---

## Grouping UX

### 4. [x] Grouping switches to the simplified view and shows a persistent visual indication
**Area:** Frontend — workflow-builder grouping / canvas
**Problem:** "Group selected" only fires a toast; once it fades there is no visual clue on the canvas that a group exists ("I don't remember, are they grouped or not?"). The whole point of grouping is simplification, yet the canvas keeps showing the ungrouped nodes; the simplified view exists but is a separate manual toggle. Agreed in the meeting: grouping should just show the simplified (collapsed) view.
**Expected:** Creating a group flips the canvas to the simplified view (or at minimum collapses that group), and grouped membership has a persistent visual indication when expanded (outline/tint/badge), so a user returning later can tell what is grouped without digging into settings.
**Key file:** `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:676-710` — `handleGroupSelected`; simplified-view toggle at :271 and :1560-1567; `canvas/group-projection.ts` + `canvas/GroupChipNode.tsx` — collapsed rendering; `group/create-group.ts` — group creation; `nodeGroups` type in `packages/graph-workflow/src/types.ts:22`.

### 5. [x] Ungroup affordance + feedback on ungroup/undo
**Area:** Frontend — workflow-builder grouping
**Problem:** There is no visible way to ungroup other than undo, and undoing/ungrouping produces no toast or visual feedback at all — grouping shows a toast, its inverse shows nothing ("if I'm ungrouping, I should probably see the opposite of it").
**Expected:** A discoverable Ungroup action (context menu / More menu / group chip), and symmetric feedback: ungroup (including via undo) confirms itself with a toast or equivalent visual response.
**Key file:** `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:676-710,1556` — group action + menu; `group/prune-node-from-groups.ts`; `settings/group/GroupNodeSettings.tsx`.

### 6. [x] Decide group interaction semantics: move-together and delete-the-group
**Area:** Design decision — grouping
**Problem:** Coming from Figma, Inderdeep expects grouped nodes to move together and deleting a group member (or the group) to delete the whole group; today members move independently and deleting one node leaves the rest. Alex: canvas semantics may legitimately differ from Figma — "something to brainstorm."
**Action:** Decision item, not a build item. Resolve with Alex (and ideally Inderdeep) whether groups move/delete as a unit, then implement the outcome. Filed as an open question in the work store. If item 4 collapses groups to a single chip, moving/deleting the chip as a unit may resolve this naturally.
**Key file:** `apps/frontend/src/features/workflow-builder/canvas/GroupChipNode.tsx` — collapsed chip already behaves unit-wise; expanded-mode behaviour is the open half.
**Resolved 2026-08-02** (Alex: *"Figma style suggestions also look good"*) — Figma is right about *moving*, wrong about *deleting*, and full unit semantics belong on the collapsed chip:
- **Move-together:** dragging any member carries the rest of its group, live and in one undo step (`canvas/group-drag-cohesion.ts` + the drag handlers in `WorkflowEditorCanvas.tsx`). Selection stays per-node so the settings panel still edits one step at a time. Synthetic map-body groups are excluded.
- **Delete stays per-node when expanded** — unchanged.
- **Unit-delete lives on the chip:** deleting a collapsed chip removes the group *and* its steps behind a confirm naming the step count. Implemented in `onBeforeDelete` (not `onDelete`) because xyflow empties its store before `onDelete` fires, so a confirm there would show the chip already gone. This supersedes G-091's refusal.
- The two-sentence rule for Inderdeep: *"grouped things move together; deleting the group is only offered on the chip, and deleting a node inside an expanded group only removes that node."*

---

## Wiring & Discoverability

### 7. [x] Clarify the "Needs a source" / "Pick a source" empty state
**Area:** Frontend — InputsSection / ProducerPicker
**Problem:** Every node Inderdeep clicked showed "Pick a source" that opened a modal with nothing actionable — just "Nothing upstream produces a {kind} yet…" ("why is this even clickable if it's just information?"). The mechanic itself is fine (connect the edge first → the producer appears in the picker), and Alex admitted he was confused too until he asked AI to explain. Also confusing: a potential producer that exists on the canvas but is *unconnected* is invisible to the picker.
**Expected:** The empty state explains the model in plain words (connect this node downstream of a producer first, then pick it here) and, where a compatible-but-unconnected producer exists on the canvas, says so and offers it (e.g. "Prepare File on this canvas produces this — connect it"). The control's affordance should match its state: if there is truly nothing to do, it shouldn't look like a button that does something.
**Key file:** `apps/frontend/src/features/workflow-builder/graph-widgets/ProducerPicker.tsx:34-67` — candidate list + empty state at :62-67; `settings/InputsSection.tsx:305-332` — the chips; `settings/input-row-resolution.ts` — status derivation.

### 8. [x] Input-side hover suggestions (build right-to-left)
**Area:** Frontend — canvas hover-extend
**Problem:** Hovering an output dot pops a filtered list of compatible next nodes (Flow Control first, then activities) — but hovering an input dot does nothing, so you cannot build right-to-left: place "submit to Mistral", then discover what produces the `PreparedFileData` it needs ("damn, how do I figure that out?"). Alex: "there's already logic to do it one way, so we can just do it the other way as well."
**Expected:** Hovering an input handle shows the same popover filtered to compatible *producer* activity types, and selecting one inserts it upstream wired into that input.
**Key file:** `apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx:203-222` — hover handlers attached only on the non-input branch; `canvas/HoverExtendPopover.tsx` — the popup; `canvas/extend-filter.ts` — `entryAcceptsKind`/`rankActivityTypesForKind` to mirror for producers; `canvas/use-hover-extend.ts` — debounce hook.

### 9. [x] Verify/fix the 3.4 green "Auto" badge on connect
**Area:** Frontend — auto-wiring / InputsSection
**Problem:** Test case 3.4 promises: connect Prepare File → Submit OCR and "the consumer's input row flips to Prepare File with a green Auto badge." Live, the coloured edge appeared but neither Alex nor Inderdeep ever saw the green badge (the input row already read Prepare File; no green dot/badge appeared). Either the feature regressed for this path, the port-drag path pins instead of auto-binding (pinned ≠ Auto), or the test plan describes the wrong expectation. Alex took it to review.
**Expected:** Reproduce 3.4 exactly as written; make the observed behaviour and the test plan agree — either the Auto badge shows when an auto-binding results from a connect, or 3.4 is rewritten to describe the real (pinned vs auto) semantics.
**Key file:** `apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx:284-299` — Auto badge render; `canvas/WorkflowEditorCanvas.tsx:2944-3060` — `handleConnect` (port-drag → `pinPortBinding` = "Pinned", node-level connect → `resolveBindings` = auto); `docs-md/workflows/MANUAL_TEST_PLAN.md:228` — the 3.4 text.

---

## Visual Language

### 10. [x] Define and simplify the port/edge colour scheme
**Area:** Frontend — canvas visual language
**Problem:** Dots and edges come in blue/grey/purple/orange/green with no legend; meaning is unclear even to Alex beyond "colours map to specific artifact types" (blue ≈ file data, grey = untyped). Inderdeep: "I'm sure there must be some meaning there… but then what's the difference?" Alex: colours are fine but they must be well-defined, not a per-type sprawl.
**Expected:** A deliberate, documented colour scheme (few colours, stable semantics — e.g. control-flow vs data vs error vs untyped) applied consistently to handles and edges, plus an in-canvas legend or hover explanation so users can learn it in place.
**Key file:** `apps/frontend/src/features/workflow-builder/canvas/artifact-kind-colour.ts:37-41` — kind→colour; `canvas/handle-style.ts:66-135` — handle styling; `canvas/WorkflowEdge.tsx:118-235` — edge strokes; registry colours in `packages/graph-workflow` (`getArtifactKindMeta`); `control-flow-visual-hints.ts:104-110`.

### 11. [x] Review typed vs untyped ports
**Area:** Frontend/packages — graph-workflow type system
**Problem:** Many inputs/outputs are untyped strings behind the scenes (e.g. "request ID" is just a string — "anything can be a string"), which undermines both the colour semantics (grey dots) and type-based suggestions/auto-wiring. Alex flagged it as "something to look at."
**Action:** Investigation item — inventory which catalog ports are effectively untyped, decide which deserve real artifact kinds, and tighten them. Feeds items 8 and 10. No agreed end-state yet; produce a short findings note before changing catalogs.
**Key file:** `packages/graph-workflow` — artifact kind registry and activity catalog port declarations; `canvas/extend-filter.ts` — where untyped ports fall out of suggestion ranking.

---

## Test Plan

### 12. [x] Fix "build a small graph" wording in the manual test plan
**Area:** Docs — MANUAL_TEST_PLAN.md
**Problem:** 3.6 says "build a small graph, then save — reload reuses canvas matches the saved config"; Inderdeep couldn't tell what a "graph" was ("it's mentioned workflows. I'm like, no, it's a graph. I don't know what it is") and Alex agreed the wording is deceptive — it means "go to the create screen, build a workflow, save".
**Expected:** The test plan (and any other user-facing doc walked by non-developers) says "workflow" not "graph", and 3.6 spells out the navigation ("create a new workflow, add a couple of nodes, save…"). Sweep the plan for other internal jargon while in there.
**Key file:** `docs-md/workflows/MANUAL_TEST_PLAN.md:233` — 3.6; grep the file for "graph" generally.

---

## Key Files Reference

| Area | Files |
|------|-------|
| Workflows list | `apps/frontend/src/pages/WorkflowListPage.tsx`, `apps/frontend/src/components/workflow/SlugChip.tsx` |
| Editor page / top bar / routing | `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx`, `apps/frontend/src/App.tsx` |
| Save + validation | `apps/backend-services/src/workflow/workflow.service.ts`, `apps/frontend/src/data/hooks/useWorkflows.ts`, `features/workflow-builder/validation/useGraphValidation.ts`, `validation/ValidationDrawer.tsx` |
| Grouping | `features/workflow-builder/group/create-group.ts`, `group/prune-node-from-groups.ts`, `canvas/group-projection.ts`, `canvas/GroupChipNode.tsx`, `settings/group/GroupNodeSettings.tsx` |
| Input rows / producer picking | `features/workflow-builder/settings/InputsSection.tsx`, `settings/input-row-resolution.ts`, `graph-widgets/ProducerPicker.tsx` |
| Hover-extend suggestions | `canvas/HoverExtendPopover.tsx`, `canvas/extend-filter.ts`, `canvas/use-hover-extend.ts`, `canvas/PortRows.tsx` |
| Auto-wiring | `canvas/WorkflowEditorCanvas.tsx`, `canvas/wire-mutations.ts`, `canvas/derive-wires.ts`, `settings/ctx-kind-consumers.ts` |
| Colours | `canvas/artifact-kind-colour.ts`, `canvas/handle-style.ts`, `canvas/WorkflowEdge.tsx`, `control-flow-visual-hints.ts`, `packages/graph-workflow` artifact registry |
| Test plan | `docs-md/workflows/MANUAL_TEST_PLAN.md` |
