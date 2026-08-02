# Review: Inderdeep walkthrough fix batch — 2026-08-02

## The ask

Three decisions are yours; everything else below is done and needs only your eyes.

| # | Question | Answer needed |
|---|---|---|
| 1 | **Draft-save approach** ([§ Proposal](#proposal-draft-save-item-3)) — remove the save-time validator gate, add it to the two run-start endpoints instead. Approve? | yes / no / change it |
| 2 | **Grouping semantics** ([§ Opinion](#opinion-figma-style-grouping-item-6)) — my recommendation: *select-the-group-moves-together, delete stays per-node, unit-delete only on the collapsed chip*. Agree? | yes / no / discuss with Inderdeep |
| 3 | **Commit & PR** — everything sits uncommitted on `feature/visual-workflow-builder` (50 modified + 6 new files, inventory below). Commit? As one commit or split (fix-batch / retag)? | commit now / after demo pass |

Not yours (my chores, already done): all tests green — `graph-workflow` 1081, frontend 1860, backend workflow module 435, `tsc --noEmit` clean. Two stale local builds fixed en route (`db:generate`, `blob-storage-paths` dist — environment, not code).

## Background

Inderdeep manually walked Part 2/3 of the [manual test plan](../../docs-md/workflows/MANUAL_TEST_PLAN.md) and reviewed findings with you on 2026-07-29 (transcript summarised in the notes corpus; tracked as a subtask of AI-1174). The batch fixes every agreed item from that call, plus the identifier retag you approved on 2026-08-02. Working checklist: [INDERDEEP_WALKTHROUGH_FIXES_20260729.md](../../docs-md/workflows/INDERDEEP_WALKTHROUGH_FIXES_20260729.md).

---

## Demo script

Start the stack (`npm run dev` at repo root — backend :3002, frontend :3000, temporal worker), open **http://localhost:3000/workflows**. Rebuild note: `@ai-di/graph-workflow` was rebuilt — if the canvas shows stale handles, restart Vite (known gotcha, [test plan line 85](../../docs-md/workflows/MANUAL_TEST_PLAN.md)).

Each item = one thing to show Inderdeep, in walkthrough order:

**1. Clickable workflow names** — on `/workflows`, hover a row: the name is now a link (hand cursor, underline on hover). Click it → editor opens. Right-click → "Open in new tab" works (it's a real `<a href>`). Row body still doesn't navigate — copy-slug/Edit/Delete are safe to click.

**2. Workflow switcher** — inside any editor, top bar left of the Name field: **Switch** button. Click → searchable list of all workflows + "← All workflows" at top. Type to filter by name or slug; pick one → that editor opens (current one is marked "(current)" and disabled). With unsaved changes, the leave-guard prompt fires first.

**3. Grouping collapses on group** — select 2+ nodes (marquee), More ▸ Group selected. The canvas now flips straight to simplified view showing the group chip (old behaviour: toast only, nothing visibly changed). Toast copy tells you how to expand again.

**4. Group membership is visible when expanded** — turn simplified view OFF: every member of a group wears a dashed violet ring; hover a member → a chip with the group's name appears above the card.

**5. Ungroup is discoverable + confirmed** — right-click a grouped node → **Ungroup "«name»" (steps stay)**. Also in the right rail: the old "Delete group" button now reads "Ungroup (steps stay)". Both fire a green "Ungrouped" toast naming how many steps were released (before: no feedback path at all).

**6. "Pick a source" is no longer a dead end** — add Submit OCR alone, click its red "Needs a source": the modal now explains the model in plain words. Add an *unconnected* Prepare File elsewhere on the canvas, reopen the picker: Prepare File is offered under a dashed border ("not connected — picking connects it"); pick it → the edge is drawn *and* the binding pinned in one click.

**7. Build right-to-left** — hover the **input** dot on a node (e.g. Submit OCR's `Prepared file data`): a popover opens listing only activities that *produce* that kind (no Flow Control — it produces nothing). Pick one → it lands to the left, already wired into that input. This is the mirror of the output-dot hover that already existed; your line in the meeting — "there's already logic to do it one way" — is literally how it's built ([extend-filter.ts](../../apps/frontend/src/features/workflow-builder/canvas/extend-filter.ts) grew produce-side twins of each accept-side helper).

**8. The 3.4 Auto badge** — connect Prepare File → Submit OCR via the *node-level* right handle, then **click Submit OCR** so the right rail opens: Inputs ▸ `Prepared file data` reads `← Prepare File` with the green **Auto** badge. That panel-must-be-open step is what the test plan never said — [3.4 now spells it out](../../docs-md/workflows/MANUAL_TEST_PLAN.md) and explains Auto (node-level drag) vs Pinned (drag onto a port dot). If the badge still doesn't show *with the panel open*, that's a real bug — flag it.

**9. Colour legend** — bottom-centre of the canvas: **Legend** button. Wires (dashed grey = order only, coloured = data, red = error, violet = switch branch) and dot families, including the new cyan Identifiers row. Same table now in the [builder guide](../../docs-md/workflows/WORKFLOW_BUILDER_GUIDE.md#colour-scheme-wires-and-port-dots).

**10. Identifier retag (the new one)** — add Azure OCR Submit → Azure OCR Poll: `apimRequestId`/`modelId` dots are now **cyan**, not grey, and the pair auto-wires through the typed pass. Hover Poll's `apimRequestId` *input* dot: the popover can now answer "what produces a Request ID?" — impossible before, because wildcards are excluded from every kind-driven feature.

---

## What to tell UX — the retag's usability story

One sentence for Inderdeep: **"the greys now mean something."** Concretely, four things he personally hit on 2026-07-29 get better:

1. **"Which node has the request ID? How do I figure that out?"** — identifier ports were invisible to suggestions (wildcards are deliberately excluded from auto-wire and both hover-extend directions). Typed, they participate: hover an id input → see its producers; hover an id output → see its consumers.
2. **"What do these colours mean?"** — most dots were grey *regardless of meaning*, which is what made the palette look arbitrary. Now grey = genuinely untyped, cyan = an identifier, and the Legend names every family.
3. **Wrong wires got harder** — a `Segment[]` output can no longer be dropped onto a `documentId` port (wildcards accepted anything); a DocumentId can never satisfy a GroupId ([subtype tests](../../packages/graph-workflow/src/types/subtype-check.test.ts)).
4. **Less false red** — optional identifier ports (convention-fed `groupId`/`documentId`) stay out of the problems surface, same as before; only *required* ids with no source nag.

Scope honoured: benchmark activities untouched (internal). Two behaviour guards keep old workflows working: optional ids stay invisible to validation ([auto-wire-status.ts](../../apps/frontend/src/features/workflow-builder/auto-wire-status.ts)), and a typed id port still name-matches onto an *untyped* same-named producer output — e.g. a sub-workflow's output mapping ([resolve-input-port.ts fallback](../../packages/graph-workflow/src/auto-wire/resolve-input-port.ts) + [tests](../../packages/graph-workflow/src/auto-wire/resolve-input-port.test.ts)).

---

## Proposal: draft save (item 3)

Your rule — *"saving and running are different things; I should be able to save whenever"* — plus one fact from the code: **the run-start endpoints do not validate the graph today.** They trust the save-time gate ([workflow.controller.ts:621](../../apps/backend-services/src/workflow/workflow.controller.ts), [:837](../../apps/backend-services/src/workflow/workflow.controller.ts)). So deleting the save gate alone would let invalid graphs *run*. The approach:

1. **Backend — save**: in `createWorkflow` / `updateWorkflow` ([workflow.service.ts:695](../../apps/backend-services/src/workflow/workflow.service.ts), [:833](../../apps/backend-services/src/workflow/workflow.service.ts)), stop throwing on semantic validator errors. Keep the structural floor (config must parse into the schema shape — we never persist junk). Return `validation: { valid, errors }` in the save response so the client knows what it saved.

   ```ts
   // today (create + update, same shape):
   if (!validation.valid) {
     throw new BadRequestException({ message: "Invalid workflow configuration", ... });
   }
   // proposed: persist regardless; return the validation verdict alongside.
   ```

2. **Backend — run**: add the same `validateGraphConfigWithDynamicNodes` check to the two run-start paths (startRun + upload-and-Try) → `400 "Workflow has validation errors — fix before running"` with the error list. The benchmark-candidate creation path ([:1032](../../apps/backend-services/src/workflow/workflow.service.ts)) keeps its gate (machine-generated, nothing draft about it).

3. **Frontend**: Save button is already un-gated client-side; on save-with-errors show an **amber "Saved — N issues remain"** notification linking the ValidationDrawer (instead of today's red "Save failed"). Wire `validation.errorCount` into the existing `runBlockedReason` so Try/Run grey out with the reason.

4. **Deliberately not doing** (deferral, your duplication threshold): no `draft` column, no list-page badge, no versioned validity flag. Validity is recomputed where it matters (run start); nothing stored to rot.

Effort ~half a day incl. backend specs. Say yes and it's in the next batch.

---

## Opinion: Figma-style grouping (item 6)

Short version: **Figma is right about *moving*, wrong about *deleting*, and the collapsed chip is where full Figma semantics belong.**

- In Figma the group *is* the object — members have no meaning outside it. Here a group is an annotation over an executable graph: members carry edges, bindings, run history. Deleting three real pipeline steps because one was selected inside a group is destructive out of proportion to the click. Keep **delete per-node** in expanded view (membership pruning already handles the bookkeeping).
- **Move-together is right though** — Inderdeep's expectation ("when I move one, the other one also moves") matches intent: a group you arranged is a unit of layout. Recommend: clicking the group ring/hover-label **selects all members** (xyflow multi-drag then moves them together for free); plain click on a node body still selects just that node for fine-tuning.
- **Unit semantics live on the chip**: collapsed (simplified view — now the default after grouping, fix #3) the chip already moves as one and can carry unit-delete with a confirm naming the step count ("Delete group and its 4 steps?"). Intent is unambiguous there.

That's ~a day: ring-click→select-members (expanded) + chip unit-delete w/ confirm. If you buy it, I'd bring Inderdeep the two-sentence rule: *"grouped things move together everywhere; deleting the group is only offered on the chip, and deleting a node inside an expanded group only removes that node."*

---

## File inventory (complete)

Every path in the working tree diff. **Nothing is committed yet.**

### New files (6)

| Path | Purpose |
|---|---|
| [WorkflowSwitcher.tsx](../../apps/frontend/src/features/workflow-builder/WorkflowSwitcher.tsx) | In-editor searchable switcher + back-to-list (fix 2) |
| [WorkflowSwitcher.test.tsx](../../apps/frontend/src/features/workflow-builder/WorkflowSwitcher.test.tsx) | 5 tests: navigate, current-marker, filter, empty, back |
| [CanvasLegend.tsx](../../apps/frontend/src/features/workflow-builder/canvas/CanvasLegend.tsx) | Colour legend popover, swatches read from the live registry (fix 9) |
| [CanvasLegend.test.tsx](../../apps/frontend/src/features/workflow-builder/canvas/CanvasLegend.test.tsx) | 2 tests: closed-until-clicked, wires + families content |
| [INDERDEEP_WALKTHROUGH_FIXES_20260729.md](../../docs-md/workflows/INDERDEEP_WALKTHROUGH_FIXES_20260729.md) | The working checklist (10/12 checked; items 3 & 6 await answers above) |
| [UNTYPED_PORTS_FINDINGS.md](../../docs-md/workflows/UNTYPED_PORTS_FINDINGS.md) | Retag findings note (Option A — what you approved) |

*(Also new but not for commit: `apps/frontend/tsconfig*.tsbuildinfo` — build artifacts from running `tsc --noEmit`.)*

### Modified — walkthrough fixes (frontend)

| Path | +/− | What changed |
|---|---|---|
| [WorkflowListPage.tsx](../../apps/frontend/src/pages/WorkflowListPage.tsx) | +11/−2 | Name cell `<Text>` → `<Anchor component={Link}>` (fix 1) |
| [WorkflowListPage.test.tsx](../../apps/frontend/src/pages/WorkflowListPage.test.tsx) | +43/−0 | New describe: name renders as `<a href>` to the editor |
| [WorkflowEditorV2Page.tsx](../../apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx) | +20/−2 | Mounts switcher; body keyed by `workflowId` (clean remount on switch); grouping flips on simplified view + new toast copy |
| [WorkflowEditorV2Page.test.tsx](../../apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.test.tsx) | +3/−0 | Hook mock gains `useWorkflows` (switcher inert in page tests) |
| [WorkflowEditorCanvas.tsx](../../apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx) | +201/−8 | Grouped-node cue stamping; context-menu Ungroup wiring; input-side hover-extend (handler, `extendUpstreamAndPin`, popover direction); Legend panel |
| [WorkflowEditorCanvas.test.tsx](../../apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.test.tsx) | +108/−3 | Grouped-cue describe; §6.2 wildcard test retargeted to `fileName` + new identifier-rejection test; mock gains `Panel` |
| [workflow-editor-canvas.css](../../apps/frontend/src/features/workflow-builder/canvas/workflow-editor-canvas.css) | +29/−0 | `.wb-node-grouped` dashed ring + hover label chip |
| [NodeContextMenu.tsx](../../apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.tsx) | +26/−0 | Optional Ungroup entry (`groupLabel` + `onUngroup` props) |
| [NodeContextMenu.test.tsx](../../apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.test.tsx) | +38/−2 | Ungroup entry tests (shown-with-label / absent-outside-group) |
| [GroupNodeSettings.tsx](../../apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx) | +15/−2 | "Delete group" → "Ungroup (steps stay)"; Ungrouped toast; confirm copy |
| [ProducerPicker.tsx](../../apps/frontend/src/features/workflow-builder/graph-widgets/ProducerPicker.tsx) | +111/−10 | Unconnected-producer offering (`needsEdge`, cycle guard) + rewritten empty state |
| [ProducerPicker.test.tsx](../../apps/frontend/src/features/workflow-builder/graph-widgets/ProducerPicker.test.tsx) | +69/−6 | Tests updated to new contract + needsEdge coverage |
| [InputsSection.tsx](../../apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx) | +13/−6 | Pick with `needsEdge` also draws the edge (`ensureEdgeBetween`) |
| [PortRows.tsx](../../apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx) | +39/−1 | Input-handle hover callbacks (left-centre anchor), mirror of output side |
| [PortRows.test.tsx](../../apps/frontend/src/features/workflow-builder/canvas/PortRows.test.tsx) | +77/−0 | Input-hover describe mirroring the output one |
| [HoverExtendPopover.tsx](../../apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx) | +38/−10 | `direction` prop: upstream = produces-filter, Flow Control hidden |
| [HoverExtendPopover.test.tsx](../../apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.test.tsx) | +35/−0 | Upstream describe (producers shown, Flow Control hidden, regression) |
| [use-hover-extend.ts](../../apps/frontend/src/features/workflow-builder/canvas/use-hover-extend.ts) | +20/−6 | `HoverExtendState.direction` carried through the debounced opener |
| [extend-filter.ts](../../apps/frontend/src/features/workflow-builder/canvas/extend-filter.ts) | +62/−0 | Produce-side twins: `entryProducesKind`, `firstMatchingOutputPort`, `rankActivityTypesProducingKind` |
| [extend-filter.test.ts](../../apps/frontend/src/features/workflow-builder/canvas/extend-filter.test.ts) | +59/−0 | Tests for all three twins |
| [revert-flow.test.tsx](../../apps/frontend/src/features/workflow-builder/versioning/__tests__/revert-flow.test.tsx) | +3/−0 | Hook mock gains `useWorkflows` |
| [WorkflowEditorCanvas.handle-style.test.tsx](../../apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.handle-style.test.tsx) | +1/−0 | Mock gains `Panel` |

### Modified — identifier retag

| Path | +/− | What changed |
|---|---|---|
| [artifacts.ts](../../packages/graph-workflow/src/types/artifacts.ts) | +10/−1 | Union grows `Identifier`, `DocumentId`, `GroupId`, `ModelId`, `RequestId` |
| [artifact-registry.ts](../../packages/graph-workflow/src/types/artifact-registry.ts) | +36/−0 | Identifier family entries, cyan, siblings share only the base |
| [artifact-registry.test.ts](../../packages/graph-workflow/src/types/artifact-registry.test.ts) | +5/−0 | ALL_KINDS grows the 5 new members |
| [subtype-check.test.ts](../../packages/graph-workflow/src/types/subtype-check.test.ts) | +21/−0 | Chain-to-Identifier true; sibling ids false; id-is-not-a-Document |
| [resolve-input-port.ts](../../packages/graph-workflow/src/auto-wire/resolve-input-port.ts) | +27/−0 | Identifier-family name-match fallback when the kind pass finds nothing |
| [resolve-input-port.test.ts](../../packages/graph-workflow/src/auto-wire/resolve-input-port.test.ts) | +56/−0 | Fallback trio (binds untyped same-name; unsatisfied otherwise; scoped to ids) |
| 17 catalog activity files (`azure-*`, `document-*`, `file-prepare`, `mistral-ocr-process`, `ocr-*`, `tables-lookup`) | 30 lines total, 1–5 each | `kind: "Artifact"` → `DocumentId`/`GroupId`/`ModelId`/`RequestId` on the named ports; benchmark files untouched |
| [auto-wire-status.ts](../../apps/frontend/src/features/workflow-builder/auto-wire-status.ts) | +10/−1 | Optional typed-identifier ports stay invisible to the problems surface |
| [auto-wire-status.test.ts](../../apps/frontend/src/features/workflow-builder/auto-wire-status.test.ts) | +6/−5 | Expectations updated to typed kinds |
| [ConnectSummaryPopover.test.tsx](../../apps/frontend/src/features/workflow-builder/canvas/ConnectSummaryPopover.test.tsx) | +6/−5 | apimRequestId now binds via kind pass — no "matched by name" suffix |

### Modified — docs

| Path | +/− | What changed |
|---|---|---|
| [MANUAL_TEST_PLAN.md](../../docs-md/workflows/MANUAL_TEST_PLAN.md) | +9/−8 | 3.4 where-to-look + Auto-vs-Pinned; 3.6 rewrite; "graph"→"workflow" sweep in Parts 3–4 |
| [WORKFLOW_BUILDER_GUIDE.md](../../docs-md/workflows/WORKFLOW_BUILDER_GUIDE.md) | +34/−0 | Colour-scheme section (wires + dot families incl. cyan Identifiers) |

## Verification evidence

- `packages/graph-workflow`: **48 suites, 1081 tests** pass (jest), `tsc` build clean.
- `apps/frontend`: **139 files, 1860 tests** pass (vitest), `tsc --noEmit` **0 errors**.
- `apps/backend-services` workflow module: **19 suites, 435 tests** pass.
- Retag fallout was surfaced *by* the suites and resolved as spec decisions, not test-silencing: 2 behaviour guards added (optional-id invisibility, name-match fallback), 5 tests updated to the stricter typed reality (each annotated with the 2026-08-02 rationale in-file).
- Not yet verified live: items 2–10 in the demo script (stack was down this session). The demo pass **is** the remaining verification.
