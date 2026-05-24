# US-105: End-to-end Playwright walkthrough — typed I/O artifacts

**As the** engineer closing Phase 3,
**I want** a single Playwright walkthrough that exercises every typed-I/O surface end-to-end against the running dev server,
**So that** we don't ship Phase 3 on green unit tests alone — the real backend + Vite + dev DB combination must demonstrably work.

## Acceptance Criteria

- [ ] **Scenario 1**: Single-typed-output handle colour + hover tooltip
    - **Given** a workflow with a `document.split` node (typed via US-101) and the dev server running with the latest package build
    - **When** the test opens the V2 editor for that workflow
    - **Then** the `document.split` output handle dot renders in the Segment-family colour (green per US-095) with the doubled-outline cardinality marker
    - **And** hovering the output handle shows the tooltip `"Segment[]"`
    - **And** screenshot `01-document-split-typed-handle.png` is saved to `/tmp/wb-phase3-verify/`

- [ ] **Scenario 2**: Type pill on selection (single-port + multi-port)
    - **Given** a `document.split` node and a `document.classify` node both on the canvas
    - **When** the test selects each in turn
    - **Then** `document.split` shows a one-line pill `"SEGMENT[]"` next to its output handle
    - **And** `document.classify` shows a gray handle on both sides + an expanded pill listing all 5 ports (2 inputs, 3 outputs) with their kinds + coloured dots
    - **And** screenshots `02-split-pill.png` + `03-classify-pill.png` are saved

- [ ] **Scenario 3**: Cross-kind wire still draws (no rejection)
    - **Given** a `document.split` (output: Segment[]) and a `tables.lookup` (input: Artifact) on the canvas
    - **When** the test drags a wire from `document.split`'s output to `tables.lookup`'s input
    - **Then** the wire is created successfully (no rejection)
    - **And** the wire's body styling matches the edge type (normal — black/gray per Phase 1B)
    - **And** screenshot `04-cross-kind-wire-drawn.png` is saved

- [ ] **Scenario 4**: Variable picker compatible-first + dim + tooltip
    - **Given** a workflow with two ctx variables (`docA` from a Document producer, `segB` from a Segment producer) and a `document.classify` node whose `segment` input picker is open
    - **When** the picker renders
    - **Then** `segB` appears in the top (compatible) group, `docA` below the `"Incompatible with this port"` divider, dimmed
    - **And** hovering `docA` shows the tooltip `"Document — incompatible with this port (expects Segment)"`
    - **And** screenshot `05-picker-compat-sort.png` is saved

- [ ] **Scenario 5**: Save-time binding-walk error anchors to consumer port
    - **Given** a workflow with a `document.split` producer writing `kind: "Segment[]"` to ctx `pages` and a `document.classify` consumer reading `pages` on its `segment` input (`kind: "Segment"`)
    - **When** the test wires up + saves the workflow with a deliberate cardinality mismatch (binds `pages` to a non-array `Segment` slot — i.e. the consumer expects `Segment`, not `Segment[]`)
    - **Then** the backend returns a 400 with a `GraphValidationError` anchored to the consumer node + port
    - **And** the editor's red node badge + error drawer surface the message: `"Input port \`segment\` (Segment) on node \`<classify-id>\` reads from ctx key \`pages\`, written by node \`<split-id>\` (Segment[]) — Segment[] not assignable to Segment"`
    - **And** screenshot `06-binding-walk-error.png` is saved
    - **And** fixing the binding (rewire to a single-Segment producer or change the consumer kind) → re-save → green

- [ ] **Scenario 6**: Library boundary — typed signature surfaces in childWorkflow
    - **Given** a library workflow saved via `SaveAsLibraryModal` with `inputs: [{ label: "Doc", path: "ctx.docUrl", type: "string", kind: "Document" }]` + `outputs: [{ label: "Class", path: "...", type: "object", kind: "Classification" }]`
    - **When** a parent workflow's `childWorkflow` node picks that library and the test inspects the node settings
    - **Then** the `ChildWorkflowNodeSettings` signature summary shows `Doc (Document)` and `Class (Classification)` rows with their coloured dots
    - **And** the existing `v{N}` / `head` badge from Track 3 still renders alongside
    - **And** screenshot `07-childworkflow-typed-summary.png` is saved

- [ ] **Scenario 7**: Workflow settings drawer "Kind" column round-trips
    - **Given** a workflow with one ctx variable
    - **When** the test opens the settings drawer, sets the variable's Kind to "Document", saves the workflow, navigates away, and reloads
    - **Then** the reloaded drawer shows the Kind column populated with "Document" on that row
    - **And** the persisted JSON (`metadata.ctx.<key>.kind === "Document"`) is verifiable via a `GET /api/workflows/:id` curl assertion in the test
    - **And** screenshot `08-ctx-kind-roundtrip.png` is saved

- [ ] **Scenario 8**: Zero `pageerror` events through the entire walkthrough
    - **Given** a page-level error listener attached at test start
    - **When** the walkthrough completes
    - **Then** the recorded `pageerror` count is 0 (console-level 401s from background polling are tolerated as in Tracks 2 + 3)
    - **And** the test summary lists all screenshots + the recorded console-error count

## Priority
- [x] High (Must Have)

## Files modified / created

- `/tmp/wb-phase3-verify/` — screenshot output dir
- Inline Playwright (or chrome-devtools MCP) script per the `app-browser-auth` skill (no permanent test file; verification is one-shot per the Phase 2 Track 1/2/3 pattern)
- After verification: refresh `docs-md/workflow-builder/SESSION_HANDOFF.md` with Phase 3 closeout notes mirroring the Track 3 closeout convention

## Notes

- Use the seed-default API key from CLAUDE.md (`69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY`); if 401s, ask Alex to re-seed via `npm run db:seed` in `apps/backend-services`.
- chrome-devtools MCP is preferred per Alex's note; fall back to Playwright per the `app-browser-auth` skill if unavailable.
- The library-pin scenario (US-088 Scenario 5 in Track 3) is NOT replayed here — Phase 3's library scenario (Scenario 6 above) verifies the typed-signature surface, not version pinning. Both behaviours coexist in the editor.
- This is the click-and-play milestone for Alex. Final ping for the phase.
