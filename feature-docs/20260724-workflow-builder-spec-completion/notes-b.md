# Pass B — Editor-Environment Obligations: narrative

Scope: `docs-md/workflow-builder/MANUAL_TEST_PLAN.md` Parts 3–9 surfaces, audited against the
12-item duty roster in `BRIEF-B.md`. Discovery only — no source file was modified.
27 findings in `findings-b.json` (3 blocker, 12 major, 12 minor; 2 of the minors are
deliberate `non-goal` records).

---

## 1. Roster verdict table

| # | Roster item | Verdict | Findings |
|---|---|---|---|
| 1 | CRUD on every artifact | **partial** | B-009, B-010, B-012, B-013, B-014, B-027 |
| 2 | Undo / redo | **absent** | B-001 |
| 3 | Duplicate node or selection | **absent** | B-003 |
| 4 | Copy / paste incl. cross-workflow | **absent** | B-004 |
| 5 | Multi-select operations | **partial** | B-007 (move), B-008 (align) |
| 6 | Find & navigate | **absent** | B-005, B-006 |
| 7 | Refactor | **partial** | B-011 (rename sweep), B-015 (extract/inline) |
| 8 | Inspect & debug | **partial** | B-016, B-017, B-018, B-025, B-026 |
| 9 | Error recovery | **partial** | B-002, B-019, B-020, B-027 |
| 10 | Diff & compare | **partial** | B-023 |
| 11 | Concurrent editing | **absent** (detection) / **non-goal** (live collab) | B-021, B-022 |
| 12 | Keyboard access | **absent** for authoring | B-024 |

Per-item detail on what *is* present, so "partial" is falsifiable:

1. **CRUD.** Present and complete for: workflow lineage (create/read/update in `page-shell`,
   delete in `WorkflowListPage.tsx:284` with a confirm modal), nodes, edges (create/delete),
   ctx declarations (add/rename/update/delete), node groups, exposed params, switch cases
   (add/remove/edit), and every rich-widget list. Holes: `errorPolicy` has **no writer at all**
   in the frontend (B-009 — the only true blocker in this group); ctx-key delete does no
   reference sweep (B-010); switch cases cannot be reordered though order is semantic (B-012);
   edge type is immutable after creation (B-013); the inline child graph is a full
   `GraphWorkflowConfig` with no graph editor (B-014). Also confirmed absent, matching
   INVENTORY §5.11 and not re-filed as separate findings: `RetryPolicy`, `TimeoutPolicy`,
   `EphemeralConfig`, `CtxDeclaration.defaultValue`, `ExposedParam.default` — B-009 covers the
   one that has a live downstream consequence.
2. **Undo/redo.** Absent, absolutely. See §2 below on the probe correction.
3. **Duplicate.** Absent at every granularity — node, selection, and workflow.
4. **Copy/paste.** Absent, and there is no substitute: no export, no import, no
   duplicate-workflow. "Save as library" is whole-config-only.
5. **Multi-select.** Selection works via xyflow defaults (`selectionKeyCode = 'Shift'`,
   `multiSelectionKeyCode = Meta/Control` — neither is overridden at
   `WorkflowEditorCanvas.tsx:3050`–`:3079`). Multi-**delete** works (`handleDelete`, `:2371`).
   Multi-**group** works ("Group selected", `WorkflowEditorV2Page.tsx:1138`). Multi-**move**
   is silently lossy (B-007). Align/distribute absent (B-008).
6. **Find & navigate.** MiniMap + Controls only. No node search, no outline. Compounded by
   the validation drawer's select-node being both non-sticky and non-panning (B-006).
7. **Refactor.** Node **label** rename works (settings panel). Node **id** is immutable and
   never user-visible as editable — correct, given `__auto.<nodeId>.<port>` ctx keys depend on
   it. Ctx-key rename has a real sweep (`rename-ctx-key.ts`), missing only library port paths
   (B-011). Extract-to-sub-workflow and inline-a-sub-workflow both absent (B-015).
8. **Inspect & debug.** Genuinely good coverage: per-node preview panes, kind-aware widget
   dispatch, wire peek, failure reason on the status badge tooltip
   (`NodeStatusBadge.tsx:118`), cache-evicted recovery, replay. Gaps are all in completeness,
   not existence: first-output-only previews (B-016), silence during live Try (B-017),
   unrendered cache-hit metadata (B-018), no blackboard view (B-026).
9. **Error recovery.** Recovery exists at **save granularity only** — "Revert to this version"
   (`VersionHistoryDrawer.tsx:206`). Nothing recovers within a session: no undo, no draft, no
   navigation guard (B-019), and a failed save reports a bare string (B-020).
10. **Diff & compare.** Two raw JSON panes vs head, self-described as an interim deliverable.
11. **Concurrent editing.** Deliberately split into a fixable half (B-021, lost-update
    detection) and a recorded non-goal (B-022, live collaboration).
12. **Keyboard access.** Zero `tabIndex` and zero `role="…"` in the entire feature directory.
    The only keyboard-reachable canvas operation is the destructive one.

---

## 2. Correction to the pre-confirmed probe

The brief states the only `undo|redo` matches under `apps/frontend/src/features/workflow-builder/`
are in `ConfusionMapEditor.tsx` and `ChildWorkflowNodeSettings.tsx`. Re-running the probe:

- The `ChildWorkflowNodeSettings.tsx` hits are a **substring false positive** — case-insensitive
  `redo` inside the identifier `decla`**`redO`**`utputs` (`:511`, `:593`, `:594`, `:616`, `:622`).
  There is no undo concept in that file at all.
- The `ConfusionMapEditor.tsx` hit (`:102`) is the word "undo" inside a comment about React
  state re-sync — also not an implementation.

So the accurate statement is stronger than the probe's: the workflow builder contains **no
undo/redo code whatsoever**, not even a localised one. B-001 is written to that standard.

The other two pre-confirmed holes (no duplicate/copy/paste, no find-a-node) were re-verified
independently and hold — see B-003/B-004/B-005 for the fuller evidence, including the
adjacent-affordance arguments (palette *has* search; palette *has* drag-to-create;
neither generalises).

## 3. Assessment requested by the brief: node deletion with no undo behind it

Deletion is well-engineered as a *cascade* and unguarded as a *decision*. `handleDelete`
(`WorkflowEditorCanvas.tsx:2371`) is a deliberate one-pass design — its header comment
explains that splitting node and edge removal into two `onConfigChange` calls caused lost
updates — and `removeNodesFromConfig` (`:1674`) prunes edges, reassigns `entryNodeId`, and
prunes groups + orphaned exposedParams. Three entry points converge on it: the context menu,
the settings-panel trash button (`deleteSelected`, `WorkflowEditorV2Page.tsx:730`), and bare
Delete/Backspace (`deleteKeyCode`, `:3079`).

With no undo behind it, three things follow, and I filed the first two:

- **The blast radius is invisible before the fact and irrecoverable after it** (B-002). No
  confirm on any node-delete path, including multi-node deletes and deleting the entry node
  (which silently repoints `entryNodeId` at an arbitrary surviving key).
- **The guard policy is incoherent** (B-027). Group deletion — much less destructive —
  is the only one that asks, via a `window.confirm` whose comment claims a house pattern that
  does not exist.
- **The keyboard makes it worse** (folded into B-024's rationale rather than filed separately).
  xyflow's defaults make nodes focusable and Delete/Backspace destructive, while this code adds
  no keyboard path to *create* anything. The single keyboard-accessible authoring operation in
  the editor destroys work.

I did **not** file the dangling-binding consequences of deletion (other nodes' `inputs[]` still
naming `__auto.<deletedId>.<port>`, orphaned `lockedInputPorts`, orphaned `config.ctx` rows).
That is INVENTORY §3.10 / §5.13 and squarely Pass D's axis; duplicating it here would inflate
the merge without adding evidence. B-002 deliberately argues the *reversibility* angle only.

## 4. Judgement calls

- **Two items marked `non-goal`, not silently dropped**, per the brief's standard.
  B-022 (live collaborative editing) and B-025 (breakpoints/stepping). Both are recorded with
  the architectural reason — append-only whole-config versioning, and out-of-process Temporal
  execution respectively — so they stop being rediscovered. In both cases I split off the part
  that *is* a real obligation (B-021 lost-update detection; B-016/B-017/B-018/B-026 post-hoc
  inspection completeness) rather than letting the non-goal absorb it.
- **Align/distribute (B-008) filed as `minor` + `defer`, not dropped.** Auto-arrange plus free
  drag is a defensible minimum at this graph size. The sharper edge — auto-arrange rewriting
  every position irreversibly from one menu click — is a consequence of B-001, so I did not
  double-count it as a severity driver.
- **Blocker reserved for three.** B-001 (no undo), B-009 (errorPolicy unauthorable), B-019
  (no unsaved-changes guard). The test I applied: would a competent author consider the editor
  unsafe or a documented capability unreachable? B-009 is the odd one out in kind — it is not a
  missing convenience but a modelled feature (`error` edges, one of three `GraphEdge.type`
  flavours) with no path to author it and a validation error the UI cannot clear. B-002
  (unguarded delete) is major rather than blocker because fixing B-001 largely dissolves it.
- **`impl-gap` vs `design-gap`.** I used `impl-gap` where the code, a doc comment, or UI copy
  states the intended behaviour and the implementation does not deliver it — B-006 (the page's
  own comment explains why the plain setter is wrong, then passes it), B-007 (xyflow hands over
  the dragged set; the handler drops it), B-009 (`EdgePicker`'s doc comment names
  `errorPolicy.fallbackEdgeId` as a use case it is never wired for), B-010 (the drawer promises
  a sweep for rename and delete has none), B-016/B-018 (doc comments state the intent),
  B-020 (structured errors produced, discarded in transport), B-024 (a11y attributes absent
  outright), B-027 (a comment asserts a pattern that does not exist). `design-gap` where the
  capability was simply never specified.
- **Surfaces** are all §2 short names from the inventory. Where a Parts 3–9 concern reaches a
  §2.8 shared surface I used the shared name and said why in the rationale: `library-port-editor`
  (B-011, ctx rename), `save-as-library` (B-004, B-015), `compare-to-head` / `version-history`
  (B-023, B-021).

## 5. What I could **not** check, and why

1. **Nothing was exercised at runtime.** No app was started and no browser was driven, so every
   finding is static-analysis + type-level reasoning. The two that would most benefit from live
   confirmation:
   - **B-007** — I verified that `OnNodeDrag`'s third argument (the dragged set) exists and is
     dropped, and that `onSelectionDragStop` is unwired. I did **not** observe the snap-back
     empirically. The repro is written out in the rationale; it is cheap to run.
   - **B-009** — I verified statically that no frontend code writes `errorPolicy` and that the
     error handle is gated on it. I did not construct a config with `onError: "fallback"` via
     the API to watch the unclearable validation error appear. The validator branch is
     unambiguous (`validator.ts:336`), but the end-to-end confirmation is missing.
2. **The agent-chat write path was not audited.** `WorkflowEditorV2Page.tsx:503`–`:510` shows
   the agent drawer writes configs behind the editor's back and the editor re-hydrates. Whether
   an agent write can clobber unsaved user edits under a race (rather than the guarded case the
   comment describes) needs a live test I could not run. It is adjacent to B-019/B-021 and may
   be a fourth finding in that family.
3. **Whether xyflow fires `onNodeDragStop` once or per-node** for a multi-node drag. I read the
   public type signature (`(event, node, nodes)`) but not the internal `XYDrag` dispatch. If it
   fired per selected node, B-007's severity would drop — the signature and the ignored third
   argument both argue strongly against that, but I could not close it from source in budget.
4. **Screen-reader behaviour.** B-024 is grounded in the absence of `tabIndex`/`role` and in
   what the interaction handlers require. I did not test with an actual assistive technology,
   so I cannot characterise the experience beyond "the authoring gestures have no keyboard
   path".
5. **Parts 10–16 surfaces** were touched only where a Parts 3–9 concern reaches them
   (per INVENTORY §2.8) and were not audited against the roster in their own right. In
   particular `dynamic-node-editor` (Part 14) has its own CRUD/versioning story that this pass
   did not open.
6. **The backend `errors[]` payload shape on a 400** (B-020) was traced through
   `workflow.service.ts` → NestJS `BadRequestException` → axios → `api.service.ts:166`. I read
   the producing and consuming ends but did not capture an actual failing response body, so the
   exact serialisation of `errors` on the wire is inferred from the throw site, not observed.
