# Session Handoff — Visual Workflow Builder

**Last updated:** 2026-05-24 (**Phase 3 typed I/O artifacts — CLOSED. All 7 milestones (A → G) shipped. US-105 end-to-end walkthrough passed all 8 scenarios with zero `pageerror` events**). Phase 2 closed at 2026-05-23.
**For:** the next Claude Code session picking up this work.
**Purpose:** explain everything that's been decided, what's been built, what's running, what's next.

---

## TL;DR for the next AI — Phase 3 close-out (DONE, 2026-05-24)

**Phase 3 (typed I/O artifacts) is closed.** Seven milestones (A → G) shipped across six implementation commits + one docs-only verification commit (Milestone G). The US-105 end-to-end Playwright walkthrough — the click-and-play milestone — ran cleanly against the live dev server with **zero `pageerror` events**, exercising every typed-I/O surface end-to-end: kind-coloured handles, on-selection type pill (single-port + multi-port), cross-kind wire draws (Model A non-rejection), variable-picker compatible-first sort + dim + tooltip, save-time binding-walk error toast (US-093 surfaced through the editor's save flow), `ChildWorkflowNodeSettings` typed library signature, and Workflow-Settings-Drawer Kind round-trip.

**One-liner per milestone:**

- **Milestone A — `86637d94`** (US-089 → US-092): Typed I/O foundation. Added `ArtifactKind` enum + `artifact-registry` (`isAssignable`/`isKindCompatible`/array+wildcard rules) + `PortDescriptor.kind?` + `CtxDeclaration.kind?` + `LibraryPortDescriptor.kind?` extensions to `@ai-di/graph-workflow`. Package tests 222 → 248.
- **Milestone B — `822421d3`** (US-093 + US-094): Binding-walk validator. New `validateBindings` walker in the shared package anchors errors to consumer port with exact wording `"Input port \`<port>\` (<consumerKind>) on node \`<id>\` reads from ctx key \`<ctx>\`, written by node \`<producer>\` (<producerKind>) — <producerKind> not assignable to <consumerKind>"`. Backend `validateGraphConfig` adopts it; library path depth-check ensures only top-level ctx keys participate.
- **Milestone C — `dce45acd`** (US-095 + US-096): Canvas kind-coloured handles + on-selection type pill. Per-port `data-port-color`/`data-port-array`/`data-port-multi`/`data-port-tooltip` attrs on `port-tooltip-{input,output}-<nodeId>` spans; gray + "Multiple inputs/outputs" for multi-port nodes (Model A strictness). `NodeTypePill` renders single-port (e.g. `SEGMENT[]`) or expanded multi-port (per-port rows with coloured dots) anchored next to the handle when the node is selected.
- **Milestone D — `95de7635`** (US-097): Variable picker compatible-first sort + dim + tooltip. `VariablePicker` Autocomplete now sorts by kind-compatibility: compatible options first, then a divider "Incompatible with this port", then dimmed incompatibles with a `data-incompatible-reason` tooltip `"<Kind> — incompatible with this port (expects <ExpectedKind>)"`.
- **Milestone E — `a5dbc294`** (US-098 + US-099 + US-100): "Kind" Select columns in `WorkflowSettingsDrawer` (per-ctx-row) + `NodeSettings` (per-input-binding-row in port picker) + `SaveAsLibraryModal`'s `LibraryPortListEditor`. Library signature summary in `ChildWorkflowNodeSettings` now surfaces a kind-coloured dot (`[data-kind-dot="<Kind>"]`) per row.
- **Milestone F — `35ca56a3`** (US-101 → US-104): Typed catalog exemplars + bulk invariant + provider-catalog scaffold. Five core catalog entries got typed end-to-end ports (`document.split`, `document.classify`, `mistralOcr.process`, `document.validateFields`, `tables.lookup`); bulk catalog invariant test asserts every catalog entry's port kinds are valid registry kinds; new `provider-catalog` exposes the typed catalog shape for downstream consumers. Package tests 248 → 379.
- **Milestone G — US-105 (docs-only closeout)**: End-to-end Playwright walkthrough verified on 2026-05-24 against six fixture workflows. All 8 scenarios pass; zero `pageerror` events; 29 console-level errors (tolerated — same 401 polling noise as Tracks 2 + 3). Screenshots `01-08-*.png` at `/tmp/wb-phase3-verify/`. Walkthrough script: `/tmp/wb-phase3-verify/walkthrough.mjs`. Two script bugfixes during verification: (1) the `port-tooltip-output-split1` span is `display: inline` so wait for `attached` not `visible`; (2) the `GET /api/workflows/:id` response wraps payload in `{ workflow: {...} }` so read `json.workflow.config.ctx.<key>`. No implementation bugs found.

**Test count deltas (Phase 3):**

| Suite | Phase 2 close | Phase 3 close | Delta |
|-------|---------------|---------------|-------|
| `packages/graph-workflow` | 222 | **379** | +157 |
| `apps/frontend` | 777 | **896** | +119 |
| `apps/backend-services` | 2188 | **2188** | unchanged (Phase 3 wasn't backend-heavy) |

**Open follow-ups (intentionally deferred — NOT in scope for Phase 3):**

- **Phase 3.5 — auto-bind-on-wire-draw.** Today drawing a `document.split` → `document.classify` wire creates the visual edge but does NOT auto-fill the consumer's input-binding ctx key. The user still has to open the consumer settings + pick the producer's output ctx by hand. A future "auto-bind on wire" milestone would pre-fill the consumer's port whose kind best matches the producer's output kind when the wire lands. Locked out of Phase 3 because Phase 3 is strictly typed-I/O annotation surfaces, not wiring semantics.
- **Phase 3.x — full catalog fan-out.** Phase 3 typed only 5 catalog activities. Remaining activities (~15) still have un-typed `PortDescriptor`s (no `kind`) so their handles render gray and their port pills show no per-port kind dot. The bulk invariant in Milestone F asserts kind-validity but doesn't enforce kind-presence. Plan: add kinds incrementally as we touch each activity. No backend break — un-typed kinds fall through to the existing string-typed pathway (Model A).

**Six commits on `feature/visual-workflow-builder` for Phase 3 (most recent first):**

```
35ca56a3 feat(workflow-builder): typed catalog exemplars + bulk invariant + provider-catalog scaffold (Phase 3 — Milestone F — US-101 + US-102 + US-103 + US-104)
a5dbc294 feat(workflow-builder): "Kind" Select columns + library signature summaries surface kind (Phase 3 — Milestone E — US-098 + US-099 + US-100)
95de7635 feat(workflow-builder): variable picker compatible-first sort + dim-with-tooltip for incompatibles (Phase 3 — Milestone D — US-097)
dce45acd feat(workflow-builder): canvas kind-coloured handles + on-selection type pill (Phase 3 — Milestone C — US-095 + US-096)
822421d3 feat(graph-workflow): binding-walk validator + library path depth-check (Phase 3 — Milestone B — US-093 + US-094)
86637d94 feat(graph-workflow): typed I/O foundation — ArtifactKind + registry + isAssignable + schema extensions (Phase 3 — Milestone A — US-089 + US-090 + US-091 + US-092)
```

A seventh, docs-only "Milestone G — US-105 verification closeout" commit will land from the orchestrator after this session (story file checkboxes + this SESSION_HANDOFF refresh).

**US-105 walkthrough — script + fixtures location for posterity:**

- Walkthrough: `/tmp/wb-phase3-verify/walkthrough.mjs`
- Setup: `/tmp/wb-phase3-verify/setup-fixtures.sh`
- Screenshots: `/tmp/wb-phase3-verify/01-document-split-typed-handle.png` → `08-ctx-kind-roundtrip.png`
- Fixture IDs (still present in dev DB at close; safe to leave or clean up via `DELETE /api/workflows/:id`):
  - `WF_A_ID=cmpk21ci4000o5pdu2d2gxelq` (Scenarios 1-3)
  - `WF_B_ID=cmpk21ck0000q5pduj8xyry0e` (Scenario 4)
  - `WF_C_ID=cmpk21clx000s5pdugazoh7ub` (Scenario 5)
  - `WF_D_ID=cmpk21co0000u5pduwy9n9noa` (Scenario 6 — library)
  - `WF_E_ID=cmpk21cqg000w5pduhv3lccsn` (Scenario 6 — parent)
  - `WF_F_ID=cmpk21csb000y5pdu745fvauk` (Scenario 7)

---

## Phase 3 in-flight notes (superseded — kept for historical reference)

**The stale-Vite-cache blocker called out in the prior handoff was resolved before US-105 ran.** Alex restarted Vite with a clean `node_modules/.vite/deps/` directory; the served `@ai-di_graph-workflow.js` bundle now contains `Segment[]` and the full typed catalog. The US-105 walkthrough then completed all 8 scenarios in one run (after 2 unrelated script-side fixes — see Milestone G one-liner above).

---

## TL;DR for the next AI — Phase 3 close-out (in flight — superseded by section above)

**Phase 3 (typed I/O artifacts) Milestones A → F all shipped in earlier sessions.** Five activity catalog entries are now typed end-to-end:

- `document.split` — `MultiPageDocument` + 2 `Artifact` wildcards in → `Segment[]` out (single-typed-output, green handle, doubled-outline cardinality marker)
- `document.classify` — `OcrResult` + `Segment` in → `Classification` + 2 `Artifact` wildcards out (multi-port, gray + expanded type pill listing all 5 ports)
- `mistralOcr.process` — `Document` + 2 `Artifact` wildcards in → `OcrResult` out
- `document.validateFields` — `Segment[]` + `Artifact` in → `ValidationResult` out
- `tables.lookup` — 3 `Artifact` in → `Reference` out

Backend binding-walk validator (Milestone B / US-093) anchors errors to the consumer port with the exact wording `"Input port \`<port>\` (<consumerKind>) on node \`<id>\` reads from ctx key \`<ctx>\`, written by node \`<producer>\` (<producerKind>) — <producerKind> not assignable to <consumerKind>"`. The frontend renders kind-coloured handles (Milestone C / US-095 + US-096), compatible-first variable picker with dim + tooltip on incompatibles (Milestone D / US-097), Kind Select columns in the workflow + node settings drawers + a Kind dot in the library signature summary (Milestone E / US-098 → US-100), and the catalog exemplar bulk-invariant + provider catalog (Milestone F / US-101 → US-104).

**What blocked US-105 (Milestone G — end-to-end Playwright walkthrough), 2026-05-24:**

Vite's optimizeDeps pre-bundle of `@ai-di/graph-workflow` is **stale** — it was generated before the Phase 3 catalog `kind` fields shipped. The served bundle at `http://localhost:3000/node_modules/.vite/deps/@ai-di_graph-workflow.js?v=b7d9e1e2` has port descriptors WITHOUT the `kind` property, so the canvas reads zero typed ports per side and falls back to gray + "Multiple inputs/outputs" tooltip. The local `packages/graph-workflow/dist/catalog/activities/document-split.js` is correct (`kind: "Segment[]"`), and so is the source in `packages/graph-workflow/src/catalog/activities/document-split.ts`. A `npm run build` in `packages/graph-workflow` did not invalidate Vite's deps cache because Vite hashes optimizeDeps by lockfile + config, NOT by dist content. Browser-side hard reload doesn't help — the pinned `?v=b7d9e1e2` query parameter is set inside Vite's own client at startup.

**The fix Alex needs to run (one of, before the next session):**

1. From `apps/frontend/`: `rm -rf node_modules/.vite && npm run dev` (cleanest)
2. OR from `apps/frontend/`: stop Vite, then `npm run dev -- --force`
3. OR add a `--force` flag to the dev script and restart

After that, the US-105 walkthrough script at `/tmp/wb-phase3-verify/walkthrough.mjs` should pick up all 8 scenarios against the SIX fixture workflows created during this session (see "Fixture workflows" below).

**Fixture workflows created during the US-105 attempt (still in dev DB at handoff time):**

| Var       | ID                              | Purpose |
|-----------|---------------------------------|---------|
| `WF_A_ID` | `cmpk21ci4000o5pdu2d2gxelq`     | Scenarios 1, 2, 3 — `document.split` + `document.classify` + `tables.lookup` on the canvas, no wires |
| `WF_B_ID` | `cmpk21ck0000q5pduj8xyry0e`     | Scenario 4 — two ctx vars (Document + Segment producers) feeding `document.classify` |
| `WF_C_ID` | `cmpk21clx000s5pdugazoh7ub`     | Scenario 5 — clean baseline; test rewires `segment` → `pages` (Segment[]) and saves to trigger 400 |
| `WF_D_ID` | `cmpk21co0000u5pduwy9n9noa`     | Scenario 6 — library workflow with typed `inputs[Doc:Document]` + `outputs[Class:Classification]` |
| `WF_E_ID` | `cmpk21cqg000w5pduhv3lccsn`     | Scenario 6 — parent with a `childWorkflow` node referencing `WF_D` |
| `WF_F_ID` | `cmpk21csb000y5pdu745fvauk`     | Scenario 7 — single `myDoc` ctx var; test sets its Kind via the drawer + verifies round-trip |

All fixtures live under `groupId: "seeddefaultgroup"`. The setup script that created them is at `/tmp/wb-phase3-verify/setup-fixtures.sh`; the walkthrough script is at `/tmp/wb-phase3-verify/walkthrough.mjs`. Both are out-of-tree per the Phase 2 Track 2/3 convention.

**What was verified before the Vite blocker surfaced:**

- `curl POST /api/workflows` rejects the deliberately-mismatched Scenario 5 payload (Segment[] producer → Segment consumer slot) at CREATE time with HTTP 400 + `"Input port \`segment\` (Segment) on node \`classifyConsumer\` reads from ctx key \`pages\`, written by node \`splitProducer\` (Segment[]) — Segment[] not assignable to Segment"` — confirms US-093 (binding-walk validator) is wired through the API surface.
- All six fixture workflows were created via `POST /api/workflows` cleanly; the dev DB persists `metadata.ctx.<key>.kind` and `metadata.inputs[]`/`metadata.outputs[]` exactly as POSTed (Scenarios 6 + 7's backend halves).
- The probe Playwright script (`/tmp/wb-phase3-verify/probe.mjs`) confirmed the auth bypass works against `WF_A_ID` and the canvas mounts (`canvas-node-split1` etc.) — the SOLE failure is the stale optimizeDeps making the handles render as gray + multi-port.

**Next session — US-105 re-run checklist:**

1. Verify Vite is serving the fresh bundle: `curl -s "http://localhost:3000/node_modules/.vite/deps/@ai-di_graph-workflow.js?v=..." | grep -c "Segment\[\]"` should be > 0.
2. Run `node /tmp/wb-phase3-verify/walkthrough.mjs` (or recreate it from `feature-docs/20260529-workflow-builder-phase3-typed-io-artifacts/user_stories/US-105-end-to-end-verification.md`).
3. Confirm all 8 screenshots in `/tmp/wb-phase3-verify/` + `pageerrors === 0`.
4. Tick off the 8 scenarios in US-105 and check the README story-row.

---

## TL;DR for the next AI

Alex is building a visual workflow editor on top of Dylan's shared `@ai-di/graph-workflow` package. **Phase 1A is complete (2026-05-23). Phase 1B is complete (2026-05-25). Phase 2 Track 1 is complete (2026-05-26). Phase 2 Track 2 is complete (2026-05-23). Phase 2 Track 3 (versioning UI) is complete (2026-05-23). Phase 2 is closed in full. Phase 3 (typed I/O artifacts) is the next pickup.** Post-1A phases were re-sequenced on 2026-05-23 — see [IMPLEMENTATION_PLAN.md §4 Phase dependencies](IMPLEMENTATION_PLAN.md#4-phase-dependencies) for the DAG.

**What shipped in Phase 2 Track 3 (this session, 2026-05-23):**

- **Shared schema (Milestone A — US-076):** Optional `version?: number` added to the `library` variant of `ChildWorkflowNode.workflowRef` in `packages/graph-workflow/src/types.ts`. Validator unchanged (it doesn't inspect `childWorkflow` nodes). Both `{ type:"library", workflowId }` and the new pinned `{ type:"library", workflowId, version:3 }` shapes validate cleanly. Package tests 220 → 222.
- **Backend per-version surfacing (Milestone B — US-077 → US-080):**
  - `GET /api/workflows/:id/run-spec` accepts optional `?workflowVersionId=`. When set, resolves via `resolveLineageAndVersion` and derives the spec from THAT version's config; omitted = head (regression). 404 on unknown version, 400 on cross-lineage (US-077).
  - `POST /api/workflows/:id/runs` validation already used the resolved version's `wf.config`; added explicit regression tests covering "v2 accepts a body that head would reject" and "v2 still requires its own required fields" (US-078).
  - New `GET /api/workflows/:id/versions/:versionId` returns the full `WorkflowInfo` for a specific version (config + metadata). 404 when version doesn't exist OR doesn't belong to :id (per-URL-space semantics); 403 for non-member. Reuses `WorkflowResponseDto` (US-079).
  - `getWorkflowGraphConfig` Temporal activity extended to `{ workflowId, version? }`. When `version` is set, queries `workflowVersion.findFirst({ lineage_id, version_number })` and throws a clear `"Library lineage <id> has no version <n>"` on miss. `childWorkflow` executor forwards `node.workflowRef.version` to the activity proxy so pinned references actually execute the pinned version at runtime (US-080).
  - Backend 2174 → 2188 tests. Temporal 958 → 963.
- **Frontend version history (Milestone C — US-081 → US-084):**
  - New "History" top-bar button in `WorkflowEditorV2Page` between Save and Run (IconHistory). Disabled in create mode with a Mantine `Tooltip` ("Save the workflow first"). New `useWorkflowVersion(lineageId, versionId)` hook wraps the new endpoint (US-081).
  - New `VersionHistoryDrawer` (right-side Mantine Drawer, position="right") at `apps/frontend/src/features/workflow-builder/versioning/`. Renders rows newest-first: v{n} indigo badge + human-readable createdAt + optional blue "head" badge + "Revert to this version" + "Compare to head" buttons. Buttons disabled-on-head with tooltips "Already the head" / "This is the head — nothing to compare". Loading shows 3 Skeleton rows; empty shows "No versions yet — save the workflow first."; error shows a red Alert (US-082).
  - Revert flow: clicking Revert opens `modals.openConfirmModal` ("Reverting will replace the current head with v{n}, created {ts}. Any unsaved canvas changes will be discarded. Continue?"). On confirm: `useRevertWorkflowHead`, drawer closes, green notification "Reverted to v{n}". The existing `useEffect` syncing `existingWorkflow.config` → canvas state reloads the editor automatically after invalidation. On error: red notification + drawer stays open (US-083).
  - Compare flow: clicking Compare opens a `<Modal size="80%">` with `<SimpleGrid cols={{ base:1, md:2 }}>`. Left = selected version (via `useWorkflowVersion`; Skeleton on load, red Alert on error). Right = already-loaded head (reuses `useWorkflow`; no extra fetch). Both panels render `<JsonInput readOnly autosize maxRows={40}>`. No diff — strictly side-by-side blocks per locked decision D1 (US-084).
- **Frontend Run drawer per-version (Milestone D — US-085):** `RunWorkflowDrawer` grows a `<Select label="Version">` above the Test-run JsonInput. Options derived from `useWorkflowVersions`: `v{n} — head` for head, `v{n}` for others. Default = head. Changing the selection refetches `useWorkflowRunSpec(lineageId, { workflowVersionId })` (hook extended to take the optional second arg); body sent to `POST /runs` includes `workflowVersionId` when non-head, OMITS the field when head selected. Backend US-078 validates against the selected version's schema.
- **Frontend library version-pin (Milestone E — US-086 + US-087):**
  - `LibraryPickerModal` grows an internal `<Select label="Version">` after a library is picked (default `"head"`). Loading: Select disabled + `<Loader size="xs" />`. Confirm returns `{ workflowId, version? }` — the `version` key is OMITTED (not present-with-undefined) when head is selected so existing serialized configs stay shape-equivalent. Explicit Cancel + Confirm footer replaces the previous on-click-row immediate return (US-086).
  - `LibraryPickerModal` also gains `initialWorkflowId` + `initialVersion` props for the "re-open pre-seeded" flow needed by US-087. Pre-seed effects fire once on libraries/versions resolution and don't fight subsequent user picks in the same open session.
  - `ChildWorkflowNodeSettings` library-branch signature summary renders a `<Badge>`: gray "head" when `workflowRef.version` is undefined; blue "v{N}" when pinned. New "Change version" button (`variant="subtle"`) next to the badge re-opens the picker pre-seeded with the current workflowId + version (US-087).
  - Frontend 738 → 777 tests.
- **End-to-end verification (Milestone F — US-088):** Playwright walkthrough against the running dev server with `app-browser-auth` mock auth + the seed-default API key. Confirmed: (1) History drawer renders v2-head + v1 rows newest-first with correct badge; (2) Compare-to-head opens with two side-by-side JsonInputs (v1 on left, head v2 on right) and the `isInput: true` diff on `documentUrl` is plainly visible; (3) Revert from v2→v1 succeeded — head moved on backend, drawer closed, green "Reverted to v1" notification, canvas auto-reloaded with v1's config (restored back to v2 to keep dev DB pristine); (4) Run drawer per-version Select renders `["v2 — head", "v1"]`, picking v1 + clicking Run started Temporal execution `graph-adhoc-11c9f5af-...`; (5) Library pinning end-to-end — opened container's childWorkflow node, clicked Change version, picker pre-seeded with library + Version select offering `["head", "v2", "v1"]`, picked v1, Confirmed, badge changed from "head" → "v1", Save persisted (`workflowRef = { type:"library", version:1, workflowId:<lib> }` on backend), reload showed "v1" badge still rendered (container restored to head). **Zero `pageerror` events.** Screenshots: `/tmp/wb-phase2-track3-verify/01-14-*.png`.

**One bugfix surfaced during verification (and shipped):**

- `RevertHeadDto` (pre-existing from before Track 3) was missing class-validator decorators — only `@ApiProperty` was set. With the global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` in `main.ts`, the pipe rejected every request to `POST /api/workflows/:id/revert-head` with `"property workflowVersionId should not exist"`. Added `@IsString()` + a `workflow-info.dto.spec.ts` regression suite asserting (a) the DTO whitelists `workflowVersionId`, (b) unknown properties are still rejected, (c) missing required field still surfaces. Backend tests 2185 → 2188. The frontend `useRevertWorkflowHead` mutation was correct all along — Track 3 was the first surface to actually wire a UI for it, so this bug had been latent since the endpoint shipped.

**What shipped in Phase 2 Track 2 (prior session, 2026-05-23):**

- **Shared schema (Milestone A — US-065):** Optional `isInput?: boolean` added to `CtxDeclaration` in `packages/graph-workflow/src/types.ts`. Validator unchanged (accepts the new field as declarative metadata). Package tests 219 → 220 passing.
- **Backend run-spec + runs endpoints (Milestone B — US-066 → US-069):** Two new sub-resource endpoints under `/api/workflows/:id/`:
  - `GET /run-spec` returns `{ triggerUrl, inputSchema (JSON Schema 7 subset), authNotes, sampleCurl }`. Library workflows derive `inputSchema` from `metadata.inputs[]`; regular workflows derive it from ctx entries with `isInput: true`. `triggerUrl` is computed server-side from `X-Forwarded-Proto` + `Host`.
  - `POST /runs` accepts `{ initialCtx?, workflowVersionId? }`, validates the body against the derived schema (400 on missing required / type mismatch), and triggers a Temporal execution. Returns `{ workflowId, workflowVersionId, status: "started" }`.
  - `TemporalClientService.startGraphWorkflow()`'s `documentId` is now optional. When omitted, a synthetic `graph-adhoc-<uuid>` workflow id is used and the doc-specific search-attributes / memo keys are skipped. Existing OCR caller is unchanged.
  - New pure helpers: `deriveInputSchema`, `buildRunSpec`, `buildTriggerUrl`, `validateRunInput` — each with its own unit-test file. Full Swagger DTOs (`RunSpecResponseDto`, `StartRunRequestDto`, `StartRunResponseDto`). The `WorkflowModule` ↔ `TemporalModule` cycle was broken via `forwardRef` so the controller can inject the temporal client. Backend tests 2141 → 2174 passing.
- **Frontend Run drawer + isInput checkbox + list filter (Milestones C + D — US-070 → US-074):**
  - `WorkflowSettingsDrawer` ctx-rows grow an "Input" checkbox (tooltip explains the run-spec implication). Toggling writes `ctx[key].isInput: true` (or strips the field when unchecked).
  - New `RunWorkflowDrawer` (`apps/frontend/src/features/workflow-builder/run/`). Right-side Mantine `Drawer` that fetches `GET /run-spec` on open and renders: trigger URL with copy, input-schema field table (Field / Type / Required / Description-default), sample curl with copy, auth notes, and a "Test run" section with a Mantine `<JsonInput>` (prefilled with a stub body from the schema's defaults / type-appropriate stubs) + a Run button that POSTs to `/runs` and shows the returned `workflowId` inline. Backend 4xx surfaces as a red Alert.
  - New "Run this workflow" top-bar button in `WorkflowEditorV2Page` (between Save and Save-as-library). Disabled in create mode with a tooltip; the drawer only mounts in edit mode.
  - `WorkflowListPage` grows a SegmentedControl (Workflows / Libraries / All) above the list. Backend extends `?kind` to accept `all` (returns every kind, still honoring `includeBenchmarkCandidates`). Top bar lifted out so the filter is available even in the empty state; per-tab empty-state copy ("No library workflows yet" for Libraries). New TanStack hooks: `useWorkflowRunSpec`, `useStartWorkflowRun`. Frontend tests 713 → 738 passing.
- **End-to-end verification (Milestone E — US-075):** Playwright walkthrough against the running dev server (with `app-browser-auth` mock auth + seed-default API key). Confirmed: (1) workflow-list filter — Workflows/Libraries/All tabs all switch, requests include `kind=library` / `kind=all` as expected; (2) regular workflow Run drawer — trigger URL, `documentUrl` schema row with REQUIRED badge, sample curl, auth notes, JsonInput prefilled `{"documentUrl":""}`; (3) paste-and-run — real Temporal execution started, returned `graph-adhoc-42733749-6be4-4e22-9dd2-69ab993a0320`; (4) library workflow Run drawer — `ctx.documentUrl` row keyed by `LibraryPortDescriptor.path` with "Document URL" title from `.label`. Screenshots: `/tmp/wb-phase2-track2-verify/01-07-*.png`. Zero page errors.

**What shipped in Phase 2 Track 1 (prior session, 2026-05-26):**

- **Schema + shared types (Milestone A — US-054 → US-056):** `library` added to the `WorkflowKind` Prisma enum (alongside `primary` / `benchmark_candidate`) with a new migration `20260523215517_add_library_workflow_kind`. `GraphMetadata` in `packages/graph-workflow/src/types.ts` extended with optional `kind`, `inputs[]`, `outputs[]` + a new `LibraryPortDescriptor` interface (`{ label, path, type }`, types match CtxDeclaration's set). Two new validator tests confirm acceptance of both flavors; 217 → 219 tests passing.
- **Backend filter (Milestone B — US-057 + US-058):** `GET /api/workflows` accepts `?kind=workflow|library`. Service methods now take a typed `ListWorkflowsOptions` object; new `buildWorkflowKindWhere()` helper centralises the Prisma `workflow_kind` filter. Default unfiltered listing now excludes library workflows (filters `{ not: "library" }` when `includeBenchmarkCandidates=true`). `CreateWorkflowDto.kind?` lets the frontend POST `kind: "library"` to stamp the lineage. Full Swagger `@ApiQuery`/`@ApiBadRequestResponse` decorators. 2123 → 2141 backend tests passing.
- **Save-as-Library affordance (Milestone C — US-059 → US-061):** New `apps/frontend/src/features/workflow-builder/library/SaveAsLibraryModal.tsx` + `LibraryPortListEditor.tsx`. New "Save as library" top-bar button in `WorkflowEditorV2Page` next to Save. Submitting POSTs a new workflow with `kind: "library"` + `metadata.kind = "library"` + the declared `inputs[]` / `outputs[]`. Always creates a new record (D2); the in-flight workflow is not mutated. Success toast + editor stays put.
- **Library picker (Milestone D — US-062 + US-063):** New `LibraryPickerModal.tsx` (counterpart to `TemplatesPickerModal`). Fetches via `useWorkflows({ kind: "library" })`. `ChildWorkflowNodeSettings`'s library branch loses the free-text `workflowId` TextInput and grows a "Pick library workflow" button + read-only signature summary (name + slug + inputs/outputs) fetched via `useWorkflow(workflowId)`. 713 → 723 frontend tests passing.
- **End-to-end verification (Milestone E — US-064):** Playwright walkthrough against the running dev server (with `app-browser-auth` mock auth + seed-default API key after `npm run db:seed`). Confirmed: Save-as-library POSTs the correct DTO (`kind=library`, `metadata.kind=library`, `inputs/outputs` arrays); `?kind=library` returns the new library, default `/workflows` excludes it; childWorkflow picker opens, lists the library, stamps `workflowRef.workflowId` on selection; library summary renders after picking AND after save → reload. Screenshots: `/tmp/wb-phase2-track1-verify/01-09-*.png`. Zero page errors.

**What shipped in Phase 1B (prior session + the 2026-05-23 catalog adoption):**

- **Backend catalog adoption** — `validateGraphConfig` now consumes `createCatalogParameterValidator()` from `@ai-di/graph-workflow`. Both backend + temporal validators inherit. `activity-parameter-schema-registry.ts` deleted in both apps. Catalog drift class closed.
- **Switch case-routed edges** — `WorkflowEdge` xyflow component with per-type stroke + label pill (case[i] / default / on error). `handleConnect` infers conditional/error/normal from source type + handle id. Fallback-policy nodes grow a second source handle. `SwitchNodeSettings` per-case picker filters to conditional edges.
- **All five rich widgets** — `ValidationRuleEditor` (discriminated-union: field-match / arithmetic / array-match), `PageRangeListEditor`, `ConfusionMapEditor` (object↔rows), `KeywordPatternEditor` (regex-validated), `ClassificationRuleEditor` (rules with nested pattern rows). `JsonSchemaForm` routes each `x-widget` hint to its editor. The multi-page-report template loads fully editable end-to-end.
- **Shared duration validation** — `isValidTemporalDuration` lifted into `@ai-di/graph-workflow/validator/duration.ts`; validator surfaces errors on `pollUntil.interval/initialDelay/timeout` and `humanGate.timeout`. Frontend's `duration-validation.ts` re-exports from the package — no duplicated regex.
- **pollUntil parameter validation** — shared validator now runs `validateActivityParameters` on pollUntil nodes (was only checking activity-type registration). Backend + temporal validators inherit.
- **dagre auto-layout** — `canvas/auto-layout.ts` lifts the read-only renderer's dagre call into a shared `layoutGraph(config, opts)` helper. Top-bar "Auto-arrange" button. Templates with no `metadata.position` auto-layout on initial load.
- **Flow Control labels** — palette + canvas-renderer labels renamed for end-users (Switch → "Branch by condition", Map → "Run for each item", etc.). Sign-off confirmed.
- **Canvas context menu + node-type swap** — right-click any node opens a Mantine Menu. "Change activity type" opens a categorised picker; swap preserves overlapping `parameters` keys, drops keys absent from the new schema, defaults required-but-missing keys. Existing edges untouched. Control-flow types can't be swapped (disabled with tooltip).
- **Hover-to-extend chains** — 200ms hover on a source handle pops a categorised palette; clicking adds + connects in one move (edge type inferred). 200ms close grace with hover-bridge into the popover.
- **Group editing in V2** — multi-select → "Group selected" top-bar button → new `nodeGroups[id]`. Right-rail `GroupNodeSettings` with label / description / icon picker / ColorInput / member list / delete. Simplified-view Switch collapses groups to chips via `group-projection.ts` (centroid layout, cross-group edges remapped, intra-group edges hidden). `ExposedParamsEditor` for the group's published parameters with per-row label / nodeId / paramPath / type Select (enum reveals options[]).

**The plan, in full, lives in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).** All architectural decisions, the new phase-dependency DAG, and the full Phase 2 → Phase 7 plan are there. [NOTES.md](NOTES.md) has supporting context plus a vision-thread → phase mapping. [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md) has the concrete artifact taxonomy for Phase 3.

---

## How Alex wants to work

Critical preferences (honour these):

1. **Don't dump intermediate code/text at him.** Only surface clickable milestones. He explicitly said *"How am I supposed to verify what you just did? I'm not reviewing code at this phase, tell me when there's something I can play around with."*
2. **Stop pinging him with mid-work updates.** End-of-turn summary should be terse and only when the milestone is interactive.
3. **Work milestone-by-milestone.** Commit between milestones.
4. **Locked decisions are locked.** Don't re-raise typed I/O, single-in/single-out, shared package vs sibling, or Zod v4 vs Zod 3. All resolved in [IMPLEMENTATION_PLAN.md §3](IMPLEMENTATION_PLAN.md).
5. **Don't ping Dylan about AI-1192.** Just work on top of his branch.
6. **He prefers Chrome DevTools MCP over Playwright** for browser inspection. If chrome-devtools tools are unavailable in your session, Playwright via inline `node --input-type=module -e "..."` is the working fallback — see the [`app-browser-auth`](../../.claude/skills/app-browser-auth/) skill.
7. **Ask for the API key at session start.** The seed default in `CLAUDE.md` does NOT match Alex's dev DB.
8. **After any `packages/graph-workflow` change, build the package and ask Alex to restart Vite.** Vite's pre-bundle of the shared package goes stale otherwise.

---

## Branch + git state

- **Branch:** `feature/visual-workflow-builder`, cut from `origin/AI-1192` (Dylan's shared-package consolidation; **not yet merged to develop**).
- **53 commits ahead of `origin/AI-1192`** at Phase 2 Track 2 close (2026-05-23), including the docs commits.
- **Pre-existing commit `b86741c7`** "deps: pin cross-platform native binaries in root optionalDependencies" — unrelated to the workflow builder; should land as its own PR against develop. Cherry-pick onto a dedicated branch before opening the workflow-builder PR. Don't bundle it.

**Phase 2 Track 2 commits landed in this session (2026-05-23, most recent first):**

- `<latest>` docs(workflow-builder): refresh SESSION_HANDOFF post-Phase-2-Track-2 closeout (this commit)
- `d3916292` feat(workflow-builder): RunWorkflowDrawer + isInput checkbox + kind filter (Milestones C + D — US-070 → US-074)
- `40b5f779` feat(workflow-builder): run-spec + runs backend endpoints (Milestone B — US-066 → US-069)
- `d8d5cae6` feat(graph-workflow): CtxDeclaration.isInput flag (Milestone A — US-065)
- `12a54543` docs(workflow-builder): requirements + user stories for Phase 2 Track 2 (workflow-as-API)

**Phase 2 Track 1 commits landed in the prior session (2026-05-26, most recent first):**

- `b4c7e257` docs(workflow-builder): refresh SESSION_HANDOFF post-Phase-2-Track-1 closeout
- `6641288a` feat(workflow-builder): SaveAsLibraryModal + LibraryPickerModal in V2 editor (Milestones C + D — US-059 → US-063)
- `a7c1ad65` feat(workflow-builder): backend kind=library filter + Save-as-Library kind field (Milestone B — US-057 + US-058)
- `5cfa11c6` feat(graph-workflow): library workflow kind + GraphMetadata fields (Milestone A — US-054 + US-055 + US-056)
- `d18c6931` docs(workflow-builder): requirements + user stories for Phase 2 Track 1 (library workflows)

**Phase 1B commits landed in the prior session (2026-05-25, most recent first):**

- `4259cd2c` group editing in V2 (US-041 + US-042 + US-043 + US-044) — Milestone H
- `797252e9` hover-to-extend chains (US-045) — Milestone I
- `87254a80` canvas context menu + node-type swap (US-046 + US-047) — Milestone J
- `86f06da3` user-friendly Flow Control labels (US-048) — Milestone K
- `94b772df` dagre auto-layout fallback (US-049 + US-050) — Milestone L
- `9adba766` four remaining rich widgets (US-031..US-039) — Milestones C–F
- `6f6d52b2` shared duration validation + pollUntil param validation (US-040 + US-051 + US-052) — Milestones G + M
- `8be0eab6` umbrella feature-doc for rest of Phase 1B (US-031 → US-053)
- `1c64b12b` validateFields.rules rich editor (US-027 → US-030) — Milestone B
- `7fd2f917` switch case-routed edges (US-021 → US-026) — Milestone A
- `624fb47a` backend + temporal validators consume catalog (US-015 → US-020) — Phase 1B item 1

If/when `origin/AI-1192` lands on `develop`, merge develop in to keep current.

---

## Shared package (`packages/graph-workflow`)

Dylan's package now contains, on this branch:

- `src/types.ts` — schema types (Dylan's, extended). Added: optional `nodeId?` on `ExposedParam` (US-044). `GraphWorkflowConfig.metadata` is the natural place to add `kind` / `inputs[]` / `outputs[]` for Phase 2 library workflows (not yet added).
- `src/validator/validator.ts` — graph schema validator. Now consumes catalog adapter; validates pollUntil parameters; validates duration fields.
- `src/validator/duration.ts` + `duration.test.ts` — shared `isValidTemporalDuration` (US-051).
- `src/validator/context-utils.ts` — ctx namespace utils (Dylan's, unchanged).
- `src/catalog/types.ts` — `ActivityCatalogEntry`, `PortDescriptor`, `CatalogCategory`.
- `src/catalog/index.ts` — `ACTIVITY_CATALOG`, `getActivityCatalogEntry()`, `getActivityParametersJsonSchema()`, `listActivityTypes()`, `createCatalogParameterValidator()`. Re-exports `validationRuleSchema`, `ValidationRule`, `documentValidateFieldsParametersSchema`, `classificationRuleSchema`, `classificationPatternSchema`, `CLASSIFICATION_PATTERN_SCOPES`, `CLASSIFICATION_PATTERN_OPERATORS`, `ClassificationPattern`, `ClassificationRule`.
- `src/catalog/create-parameter-validator.ts` — the shared catalog-driven validation adapter.
- `src/catalog/catalog.test.ts` — bulk invariants across all entries.
- **`src/catalog/activities/*.ts` — one file per registered activity type (41 files).**

Each entry: a Zod v4 schema (`from "zod/v4"`) describing static parameters, with UI hints attached via `.meta({ ... })` that ride through `z.toJSONSchema()` as `x-widget`, `x-options`, `x-default`, `x-step`, `x-options-labels` extension fields.

Active `x-widget` hints (all wired to hand-rolled editors as of 2026-05-25):

- `validation-rule-editor` — `document.validateFields.rules` → `ValidationRuleEditor`
- `page-range-list` — `document.split.custom-ranges.customRanges` → `PageRangeListEditor`
- `confusion-map-editor` — `ocr.characterConfusion.customConfusionMap` → `ConfusionMapEditor`
- `keyword-pattern-editor` — `document.splitAndClassify.keywordPatterns` → `KeywordPatternEditor`
- `classification-rule-editor` — `document.classify.rules` → `ClassificationRuleEditor`

`package.json` depends on `zod: "3.25.76"` (the v4-bridge release). Build passes (`npm run build` in the package). Tests pass (`npm test` in the package — 217 tests across 9 suites as of last run).

---

## Frontend additions (post-Phase-1A)

### `apps/frontend/src/features/workflow-builder/`

- **`canvas/`** — interactive editor surface
  - `WorkflowEditorCanvas.tsx` — xyflow canvas (selection / drag / connect / right-click / hover-to-extend / simplified-view / multi-select for grouping)
  - `WorkflowEdge.tsx` + `edge-labels.ts` — custom edge component + ConditionExpression → compact label helper
  - `NodeContextMenu.tsx` — right-click menu (Change activity type / Delete node)
  - `NodeTypeSwapModal.tsx` + `swap-node-type.ts` — activity picker + pure parameter-migration helper
  - `HoverExtendPopover.tsx` + `place-extended-node.ts` — hover-triggered next-node picker
  - `auto-layout.ts` — dagre `layoutGraph(config, opts)` helper (shared with the read-only renderer)
  - `group-projection.ts` — pure helper for the simplified view (chips + cross-group edge remap)
  - `GroupChipNode.tsx` — xyflow custom node for group chips
- **`group/`** — pure helpers + icon registry
  - `create-group.ts` — `createGroupFromSelection(config, ids)` with auto-numbering + single-membership rule
  - `group-icons.ts` — shared `GROUP_ICONS` map (also consumed by the read-only renderer)
- **`palette/`** — left-rail palette
  - `ActivityPalette.tsx` — categorised activity rows + Flow Control section
  - `control-flow-palette-entries.ts` — hard-coded entries with end-user labels (Branch by condition / Run for each item / Collect results / Sub-workflow / Wait until condition / Wait for approval)
  - `control-flow-skeletons.ts` — `buildControlFlowSkeleton(type, id)` for default node shapes
- **`settings/`** — right-rail panels
  - `NodeSettingsPanel.tsx` — dispatch shell; routes to per-type body OR group body OR none
  - `control-flow/*` — per-type settings forms (SwitchNodeSettings, MapNodeSettings, JoinNodeSettings, ChildWorkflowNodeSettings, PollUntilNodeSettings, HumanGateNodeSettings) + `duration-validation.ts` (re-exports from the package)
  - `group/GroupNodeSettings.tsx` + `ExposedParamsEditor.tsx` — group settings body + exposed-params list editor
  - `rich-widgets/` — `ValidationRuleEditor`, `PageRangeListEditor`, `ConfusionMapEditor`, `KeywordPatternEditor`, `ClassificationRuleEditor`
- **`json-schema-form/`** — schema-driven Mantine form renderer
  - `JsonSchemaForm.tsx` — primitives + enums + comboboxes + discriminated unions + arrays + per-x-widget routes
  - `types.ts` — minimal JSON Schema shape; `detectDiscriminatedUnion()`
- **`graph-widgets/`** — reusable picker primitives
  - `NodePicker.tsx`, `EdgePicker.tsx` (with `edgeTypes` filter), `VariablePicker.tsx`, `ConditionExpressionEditor.tsx` (recursive AND/OR/NOT)
- **`templates/`** — static bundle of `docs-md/graph-workflows/templates/*.json`
  - `TemplatesPickerModal.tsx`, `index.ts`
- **`catalog-utils.ts`** — frontend helpers; resolves `iconHint`/`colorHint` strings; groups catalog by category for the palette
- **`control-flow-visual-hints.ts`** — canvas-side display names + colours + icons for control-flow renderers
- **`WorkflowEditorV2Page.tsx`** — the V2 editor page; top bar has Save / Settings / Auto-arrange / Group selected / Simplified view toggle / Templates link

### Routes (in `apps/frontend/src/App.tsx`)

- `/workflows/dev-form-preview` — schema-driven Mantine form renderer tracer
- `/workflows/create-v2` — V2 visual editor, create mode
- `/workflows/:workflowId/edit-v2` — V2 visual editor, edit mode
- old `/workflows/create` and `/workflows/:workflowId/edit` (JSON editor) untouched and coexist

Frontend `package.json` has the `@ai-di/graph-workflow` workspace dep (added by Dylan in `63f23c3a`). Vite pre-bundles the package — see commit `78e2a844`. Type-check passes (`npx tsc --noEmit` in apps/frontend). Biome formatting clean. 713 frontend tests pass.

---

## What was verified this session (2026-05-23, Phase 2 Track 2)

One Playwright walkthrough against the live dev server using the `app-browser-auth` skill (mock auth + the seed-default `x-api-key`). Backend endpoints were also verified directly via `curl` before the browser pass.

**Walkthrough — Track 2 end-to-end (US-075).**

- **`/workflows` SegmentedControl:** The Workflows / Libraries / All tabs all switch the active filter. The Libraries tab triggers a `kind=library` request and shows only the library workflow; the All tab triggers `kind=all` and shows every kind. Per-tab empty-state copy is correct.
- **Regular workflow Run drawer** (`/workflows/cmpixvweq0000k0duaul20yip/edit-v2`, with `ctx.documentUrl` flagged `isInput: true`): drawer opens from the new top-bar button, renders the absolute trigger URL with a copy button, a schema table with `documentUrl` (string, REQUIRED, "Input doc URL"), the sample `curl` with copy, the auth notes paragraph, and a JsonInput prefilled with `{"documentUrl": ""}`.
- **Paste-and-run** (regular workflow): clicked Run, got a `Workflow run started` Mantine notification + a green Alert with the returned Temporal workflowId `graph-adhoc-42733749-6be4-4e22-9dd2-69ab993a0320`, copy-button alongside.
- **Library workflow Run drawer** (`/workflows/cmpixxrm40002k0duvysgrt1r/edit-v2`): schema row renders `ctx.documentUrl` (path-keyed from `LibraryPortDescriptor.path`) + the "Document URL" title from `.label`, REQUIRED badge. Confirms the library-derivation branch of `deriveInputSchema`.
- **Zero `pageerror` events.** (16 console-level 401s captured were background polling for endpoints the mock auth route doesn't cover; they pre-date Track 2 and are unrelated.)

Screenshots: `/tmp/wb-phase2-track2-verify/01-list-default-workflows-tab.png`, `02-list-libraries-tab.png`, `03-list-all-tab.png`, `04-regular-workflow-loaded.png`, `05-regular-run-drawer-open.png`, `06-regular-run-success.png`, `07-library-run-drawer.png`.

---

## How to start the dev server (when needed)

**Don't start the dev server yourself — ask Alex to start / restart it.** Both servers should be running already when you pick up. To probe:

```bash
curl -s -o /dev/null -w "frontend(3000):%{http_code} backend(3002):" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/api
```

If you need to ask for a restart (e.g., after a `packages/graph-workflow` change), say so explicitly and wait. Vite pre-bundles `@ai-di/graph-workflow`, so after package changes the new exports won't surface until Vite is restarted.

Dev server lands on `http://localhost:3000/`.

---

## What to do next

**Phase 1B + Phase 2 (all three tracks) are closed.** The next pickup is **Phase 3 — typed I/O artifacts**. See [IMPLEMENTATION_PLAN.md §5 Phase 3](IMPLEMENTATION_PLAN.md#phase-3--typed-io-artifacts) for the full menu and [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md) for the concrete artifact taxonomy.

### Phase 3 — typed I/O artifacts (next milestone)

Phases 2 + 3 were both prerequisites for Phases 4 (try-in-place), 5 (segmentation), 6 (dynamic nodes), and 7 (AI workflow builder). Phase 2 just closed; Phase 3 is the gate that everything downstream waits on. Summary of what Track 3 (this session) unblocked together with Tracks 1 + 2:

- Phase 3's typed `Document` / `Segment` / etc. artifacts get reified in `packages/graph-workflow/src/types/artifacts.ts` + `artifact-registry.ts` + `subtype-check.ts`.
- `PortDescriptor` gets an optional `kind?: ArtifactKind | T[]` field (backwards compatible — no `kind` = `Artifact`, drawable anywhere).
- Three checkpoints: canvas `onConnect` (UX), settings-panel variable picker (filtered by kind), backend `validateGraphConfig` (save-time error on edge kind mismatch).
- Strict nominal subtyping (`SinglePageDocument` → `Document` slot ✓; reverse ✗; no auto-wrap between `T` and `T[]`).
- Fan out `kind` declarations across the 41 catalog entries — incrementally, one activity at a time, with the bulk catalog test asserting the "every entry that DOES declare `kind` declares it for every port" invariant.
- Provider catalog (`provider-catalog.ts` companion: `{ id, displayName, category, acceptsKind, returns }`) for activities with a generic `provider` parameter that sources dropdowns filtered by upstream `kind`.

Phase 3 also resolves several Phase 2 follow-ups that were filed for it:

- **Library `metadata.inputs[].path` depth-check** in the validator — verify the path references a real ctx key / output binding source. Filed for Phase 3 because typed I/O is the natural home for that verification.
- **Typed `childWorkflow` signatures** — Track 1 closed the schema/types side (`LibraryPortDescriptor` with `{ label, path, type }`). Phase 3 adds the `kind?: ArtifactKind` field so a `childWorkflow` library reference exposes typed handles.

**Phase 2 follow-ups still deferred (not gated on Phase 3):**

- **Run history (`GET /api/workflows/:id/runs` returning past runs)** — Phase 4 (try-in-place). The Run drawer today returns the `workflowId` and stops there; no list of historical runs.
- **Per-version run counts / last-run timestamp** in the History drawer — also Phase 4, requires the run-history endpoint.
- **Per-version annotations / tags / changelog entries** — not in the schema today; future enhancement, not load-bearing for Phase 3.
- **Delete-version / squash-versions actions** — versions stay immutable per the existing backend model. Revert is the closest action available today.

### Phase 2 Track 3 — done. Don't re-implement.

- Shared schema: `ChildWorkflowNode.workflowRef.library.version?: number` (US-076).
- Backend `GET /:id/run-spec?workflowVersionId=` extension (US-077).
- Backend `POST /:id/runs` validates against the selected version's schema (US-078; was already correct, regression coverage added).
- Backend `GET /:id/versions/:versionId` returns full WorkflowInfo (US-079).
- Temporal `childWorkflow` executor honors `workflowRef.library.version` via extended `getWorkflowGraphConfig({ workflowId, version? })` activity (US-080).
- Frontend "History" top-bar button + `useWorkflowVersion` hook (US-081).
- `VersionHistoryDrawer` with rows, head badge, action buttons (US-082).
- Revert flow with `modals.openConfirmModal` + canvas auto-reload + green/red notifications (US-083). NB: `@mantine/modals@8.3.9` was added and `<ModalsProvider>` mounted in `apps/frontend/src/main.tsx` — necessary for `openConfirmModal`.
- `CompareToHeadModal` with two side-by-side read-only `<JsonInput>` blocks (US-084).
- `RunWorkflowDrawer` "Version" Select that refetches the spec + sends `workflowVersionId` in the POST body (omitted for head) (US-085).
- `LibraryPickerModal` "Version" Select returning `{ workflowId, version? }` (US-086).
- `ChildWorkflowNodeSettings` gray "head" / blue "v{N}" badge + "Change version" pre-seeded re-open (US-087).
- End-to-end Playwright walkthrough (US-088).
- Bugfix: `RevertHeadDto` was missing class-validator decorators — added `@IsString()` + a regression suite at `apps/backend-services/src/workflow/dto/workflow-info.dto.spec.ts`.

### Phase 2 Track 2 — done. Don't re-implement.

- Shared schema: `CtxDeclaration.isInput?: boolean` (US-065).
- Backend `TemporalClientService.startGraphWorkflow()` accepts optional `documentId` + skips doc-specific seeding when absent (US-066).
- Backend `GET /api/workflows/:id/run-spec` returning `{ triggerUrl, inputSchema, authNotes, sampleCurl }` (US-067).
- Pure helper `deriveInputSchema(config)`: library `metadata.inputs[]` vs regular ctx `isInput: true` (US-068).
- Backend `POST /api/workflows/:id/runs` with body validation + Temporal trigger (US-069).
- Frontend `WorkflowSettingsDrawer` ctx-row `isInput` checkbox (US-070).
- Frontend `RunWorkflowDrawer` — trigger URL + schema rows + sample curl + auth notes (US-071), paste-JSON-and-run (US-072), top-bar button (US-073).
- Frontend `WorkflowListPage` `SegmentedControl` (Workflows / Libraries / All) + backend `?kind=all` support (US-074).
- End-to-end Playwright walkthrough (US-075).

### Phase 2 Track 1 — done. Don't re-implement.

- Schema discriminator: `WorkflowKind.library` enum + migration (US-054).
- Shared types: `GraphMetadata.kind|inputs|outputs` + `LibraryPortDescriptor` (US-055).
- Validator accepts the new metadata fields (US-056).
- Backend `?kind=library` filter + default exclusion + `kind` field on `CreateWorkflowDto` (US-057 + US-058).
- Frontend "Save as library" top-bar action + `SaveAsLibraryModal` + `LibraryPortListEditor` (US-059 + US-060 + US-061).
- `LibraryPickerModal` + `ChildWorkflowNodeSettings` picker replacement + signature summary (US-062 + US-063).
- End-to-end Playwright walkthrough (US-064).

### Pre-Phase-2 housekeeping (in any order)

- **US-053 — `borderColor` console warning** still open. Blocked on Alex pasting the exact dev-console text. If he hasn't by next session, leave it; if he has, chase it. The audit on 2026-05-23 confirmed our workflow-builder code uses longhand consistently, so the warning is likely Mantine-internal.
- **Pre-existing commit `b86741c7`** still on this branch. Per the original session handoff, cherry-pick to its own branch and open a separate PR against develop before bundling the workflow-builder PR.
- **`activity-parameter-schema-registry.ts`** — was deleted from both apps in Phase 1B item 1. Don't reintroduce; the catalog adapter is the source of truth.

### Already shipped — don't re-implement

- Validation surfacing (US-013), workflow settings drawer, variable picker, control-flow forms, templates picker, save/load round-trip, auto-fit on add (all Phase 1A).
- Backend catalog adoption + shared `createCatalogParameterValidator()` (US-015 → US-020).
- Switch case-routed edge UI + custom `WorkflowEdge` with per-type stroke/label (US-021 → US-026).
- All five `x-widget` rich editors (US-027 → US-039).
- Switch condition-tree recursion (US-040 — already shipped in US-003; audit confirmed).
- pollUntil parameter validation + shared duration regex (US-051 + US-052).
- Dagre auto-layout helper + top-bar button + auto-apply on template-load (US-049 + US-050).
- Flow Control label renames (US-048).
- Canvas context menu + node-type swap modal + intersecting-parameter preservation (US-046 + US-047).
- Hover-to-extend popover with 200ms debounce + hover-bridge (US-045).
- Group editing — selection-to-group + group settings panel + simplified-view toggle + exposed-params editor (US-041 → US-044).

---

## Known limitations / things to circle back on

- **`apps/frontend/src/pages/WorkflowPage.tsx` and `WorkflowEditPage.tsx`** exist alongside `WorkflowEditorPage.tsx`. Three workflow pages is one (or two) too many. Worth auditing before adding more.
- **Decoupled `mantine-form-zod-resolver`** is still imported by `apps/frontend/src/features/tables/components/RowForm.tsx`. New code uses `@mantine/form`'s built-in `schemaResolver` instead.
- **The V2 editor's settings panel** renders parameters via `JsonSchemaForm` but doesn't yet wire `@mantine/form`'s `schemaResolver` for live form-level validation — current validation is the standalone `safeParse` shown as a count under the form.
- **Save backend rejects unknown `x-api-key` in headless test runs.** The real user's IDIR-cookied browser session handles auth normally. Tests bypass via the `app-browser-auth` skill.
- **Setting a non-existent ctx key in a port binding's text input does NOT auto-declare a new ctx entry.** Only the initial node-add auto-declares; subsequent renames are user-driven.
- **Edge fingerprint doesn't capture switch-case mutations.** `edgesFingerprint` keys on `${id}|${source}|${target}|${type}`. Editing a `SwitchNode.cases[i].condition` won't currently trigger a re-projection (chip labels stay stale until something else changes). Acceptable today; lift the fingerprint if a real bug surfaces.
- **Chip dragging is intentionally disabled** in simplified view; chip positions are recomputed every projection from the centroid of members. Could be made draggable + persisted by extending `NodeGroup.metadata.position`. Not filed; surface if Alex hits it.
- **Right-click context menu wasn't confirmed via headless Playwright** in the final verification (the chip click + simplified view + group panel all confirmed). xyflow's `onNodeContextMenu` is finicky in headless mode. jsdom tests pass; manual browser spot-check is the safer route.

---

## Repo layout cheatsheet

```
ai-adoption-document-intelligence/
├── apps/
│   ├── backend-services/          ← NestJS backend (Temporal client)
│   ├── temporal/                  ← Temporal worker + activity implementations
│   └── frontend/                  ← React + Mantine + Vite (the editor lives here)
│       ├── src/components/workflow/
│       │   ├── GraphVisualization.tsx        ← existing read-only renderer; reuses canvas/auto-layout.ts
│       │   ├── GraphConfigFormEditor.tsx     ← old JSON-driven form editor
│       │   └── (other read-only forms)
│       ├── src/features/workflow-builder/    ← all new workflow-builder code
│       │   ├── WorkflowEditorV2Page.tsx
│       │   ├── canvas/
│       │   │   ├── WorkflowEditorCanvas.tsx
│       │   │   ├── WorkflowEdge.tsx + edge-labels.ts
│       │   │   ├── NodeContextMenu.tsx
│       │   │   ├── NodeTypeSwapModal.tsx + swap-node-type.ts
│       │   │   ├── HoverExtendPopover.tsx + place-extended-node.ts
│       │   │   ├── auto-layout.ts
│       │   │   ├── GroupChipNode.tsx
│       │   │   └── group-projection.ts
│       │   ├── group/
│       │   │   ├── create-group.ts
│       │   │   └── group-icons.ts
│       │   ├── library/        ← NEW in Phase 2 Track 1
│       │   │   ├── SaveAsLibraryModal.tsx
│       │   │   ├── LibraryPortListEditor.tsx
│       │   │   └── LibraryPickerModal.tsx
│       │   ├── run/            ← NEW in Phase 2 Track 2
│       │   │   ├── RunWorkflowDrawer.tsx
│       │   │   └── build-stub-input.ts
│       │   ├── palette/
│       │   │   ├── ActivityPalette.tsx
│       │   │   ├── control-flow-palette-entries.ts
│       │   │   └── control-flow-skeletons.ts
│       │   ├── settings/
│       │   │   ├── NodeSettingsPanel.tsx
│       │   │   ├── control-flow/  ← per-type forms + duration-validation
│       │   │   ├── group/         ← GroupNodeSettings + ExposedParamsEditor
│       │   │   └── rich-widgets/  ← Validation/PageRange/Confusion/Keyword/Classification editors
│       │   ├── graph-widgets/     ← NodePicker, EdgePicker, VariablePicker, ConditionExpressionEditor
│       │   ├── json-schema-form/  ← JsonSchemaForm + per-x-widget routes
│       │   ├── templates/         ← TemplatesPickerModal
│       │   ├── catalog-utils.ts
│       │   └── control-flow-visual-hints.ts
│       └── src/pages/
│           ├── WorkflowListPage.tsx
│           ├── WorkflowEditorPage.tsx        ← old JSON editor; coexists
│           ├── WorkflowFormPreviewPage.tsx   ← dev tracer
│           ├── WorkflowEditPage.tsx          ← unknown status, investigate before changing
│           └── WorkflowPage.tsx              ← unknown status, investigate before changing
├── packages/
│   ├── graph-workflow/            ← Dylan's shared package
│   │   └── src/
│   │       ├── types.ts           ← schema types (Dylan's + ExposedParam.nodeId? added)
│   │       ├── validator/         ← validator.ts + duration.ts + context-utils
│   │       └── catalog/           ← 41 activity entries + createCatalogParameterValidator + re-exported widget schemas
│   ├── graph-insertion-slots/
│   ├── blob-storage-paths/
│   ├── logging/
│   └── monitoring/
└── docs-md/
    ├── SHARED_PACKAGES.md
    ├── workflow-builder/
    │   ├── IMPLEMENTATION_PLAN.md ← THE PLAN. READ FIRST.
    │   ├── NOTES.md               ← user-vision walking notes + research
    │   ├── TYPED_IO_DESIGN.md     ← concrete artifact taxonomy for Phase 3
    │   ├── SESSION_HANDOFF.md     ← THIS FILE
    │   ├── WORKFLOW_DESIGN_BRIEF.md
    │   ├── WORKFLOW_NODE_CATALOG.md
    │   └── WORKFLOW_NODE_IO_MODEL_DECISION.md
    └── graph-workflows/
        ├── DAG_WORKFLOW_ENGINE.md
        ├── GRAPH_TYPES.md
        ├── WORKFLOW_BUILDER_GUIDE.md
        └── templates/             ← 8 example workflow JSONs
```

---

## Feature-docs trail

Phase 1B work spread across three feature-doc folders:

- `feature-docs/20260523-workflow-builder-backend-catalog-adoption/` — US-015 → US-020 (Phase 1B item 1)
- `feature-docs/20260524-workflow-builder-switch-edges-and-validation-editor/` — US-021 → US-030 (Milestones A + B)
- `feature-docs/20260525-workflow-builder-phase1b-completion/` — US-031 → US-053 (Milestones C through M); umbrella REQUIREMENTS doc

Phase 2 Track 1 lives at:

- `feature-docs/20260526-workflow-builder-phase2-library-workflows/` — US-054 → US-064 (Milestones A → E). REQUIREMENTS.md documents the five locked decisions D1-D5 (schema discriminator extends `WorkflowKind`; "Save as library" creates a new record; default endpoint excludes library; `LibraryPortDescriptor` shape; declarations live on `GraphMetadata`).

Phase 2 Track 2 lives at:

- `feature-docs/20260527-workflow-builder-phase2-workflow-as-api/` — US-065 → US-075 (Milestones A → E). REQUIREMENTS.md documents the five locked decisions D1-D5 (trigger URL is `POST /api/workflows/:id/runs`; regular workflows derive inputs from `CtxDeclaration.isInput`; library nav is a `SegmentedControl` on `/workflows`; Run panel actually starts Temporal runs; trigger URL is derived server-side from `Host` + `X-Forwarded-Proto`).

Phase 2 Track 3 should start a new feature-doc dir, e.g.:

- `feature-docs/20260528-workflow-builder-phase2-versioning-ui/`

---

## Memory pointers (in `~/.claude/projects/-home-alstruk-GitHub-ai-adoption-document-intelligence/memory/`)

- `project_workflow_builder_handoff.md` — **read this first** — pointers + cadence preferences
- `project_workflow_builder_decisions.md` — locked-in decisions
- `project_shared_graph_workflow_package.md` — Dylan's package status
- `project_workflow_templates.md` — where templates live
- `feedback_dev_servers.md` — never start dev servers yourself
- `feedback_secret_handling.md` — never leak secrets to chat/terminal
- (and unrelated: `project_openshift_deployment.md`, `project_primary_instance.md`, other feedback files)

If a new top-level fact is learned (e.g., AI-1192 finally merged, a major decision flips), add a new memory file and update `MEMORY.md`. Don't put implementation details there — those go in this `SESSION_HANDOFF.md` or `IMPLEMENTATION_PLAN.md`.
