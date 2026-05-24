# US-125: End-to-end Playwright walkthrough — Phase 8 document sources

**As the** engineer closing Phase 8,
**I want** a single Playwright walkthrough that exercises every source-as-node surface end-to-end against the running dev server,
**So that** we don't ship Phase 8 on green unit tests alone — the real backend + Vite + dev DB combination must demonstrably work.

## Acceptance Criteria

- [ ] **Scenario 1**: `source.api` happy path — drop → fields → persist → Run
    - **Given** the dev server running with the latest package build and a fresh V2-editor session
    - **When** the test creates a new workflow, drops a `source.api` node onto the empty canvas (verifying entryNodeId autoset per US-121), adds 3 fields via `FieldListEditor` (`documentUrl: string/Document/required`, `priority: number/—/optional`, `metadata: object/—/optional`), saves, reloads
    - **Then** the saved fields persist with their kinds (verified via a `GET /api/workflows/:id` curl assertion in-test + a UI re-render check)
    - **And** opening the Run drawer shows the API section with the field table (documentUrl REQUIRED + Document kind dot), sample curl reflecting the schema, and a JsonInput
    - **And** pasting a valid body + clicking Run starts a Temporal execution (response includes `workflowId: "graph-adhoc-…"`)
    - **And** screenshots `01-source-api-fields-saved.png` + `02-source-api-run-drawer.png` + `03-source-api-temporal-started.png` are saved to `/tmp/wb-phase8-verify/`

- [ ] **Scenario 2**: `source.upload` happy path — drop → handle blue → Dropzone → upload chain → Temporal
    - **Given** a workflow with a fresh `source.upload` node configured `{ ctxKey: "myFile", allowedMimeTypes: ["application/pdf"], maxFileSizeMB: 25 }`
    - **When** the test inspects the canvas handle, opens the Run drawer, drops a test PDF onto the Dropzone, clicks Run
    - **Then** the canvas handle is blue with hover tooltip "Document"
    - **And** the upload chain runs to completion: `POST /sources/:id/upload` returns `{ myFile: "<blob URL>" }`, then `POST /runs` is called with `initialCtx = { myFile: <url> }`, and a Temporal execution starts
    - **And** screenshots `04-source-upload-handle-blue.png` + `05-source-upload-dropzone.png` + `06-source-upload-chain-success.png` are saved

- [ ] **Scenario 3**: Both `source.api` AND `source.upload` in same workflow → two sections render
    - **Given** a workflow with BOTH source nodes configured
    - **When** the test opens the Run drawer
    - **Then** both an API section and an Upload section render (per US-123)
    - **And** triggering EITHER path independently starts a Temporal execution
    - **And** screenshot `07-dual-source-run-drawer.png` is saved

- [ ] **Scenario 4**: Validator rejects multi-source.api with L17 error
    - **Given** a workflow already containing one `source.api`
    - **When** the test attempts to drop a SECOND source.api and save
    - **Then** the backend returns 400 with `GraphValidationError` matching `"Phase 8.0 supports at most one source of subtype \`source.api\` per workflow — multi-source.source.api is deferred to Phase 8.x"`
    - **And** the editor's error drawer surfaces the message verbatim
    - **And** screenshot `08-multi-source-rejected.png` is saved

- [ ] **Scenario 5**: `source.api` + `isInput` coexistence → L16 warning, source.api wins
    - **Given** a workflow with a `source.api` declaring `fields: [{ name: "alpha", type: "string", required: true }]` AND a `CtxDeclaration` `beta` flagged `isInput: true`
    - **When** the test saves the workflow
    - **Then** the save succeeds (warnings don't block) AND the save response carries one validation warning `"Workflow has a source.api node — isInput flags on ctx declarations are ignored. Remove isInput flags or remove the source.api to clarify intent."`
    - **And** the Run drawer's `inputSchema` shows ONLY `alpha` (from source.api) — `beta` is absent
    - **And** screenshot `09-source-api-wins-warning.png` is saved

- [ ] **Scenario 6**: Legacy isInput-only workflow unchanged + Phase 3 binding-walk on source.api fields
    - **Given** (a) a legacy workflow with no source nodes and a `documentUrl` ctx flagged `isInput: true`, AND (b) a NEW workflow with a `source.api` whose field `pages` declares `kind: "Segment[]"` wired downstream to a `document.classify`'s `segment` input port (`kind: "Segment"`)
    - **When** the test verifies (a) the legacy workflow's Run drawer renders exactly as Phase 2 Track 2, and (b) the new workflow's save returns the binding-walk error
    - **Then** (a) the legacy workflow Run drawer shows the isInput-derived `documentUrl` REQUIRED row — no warning, no source-related UI — Phase 2 Track 2 behaviour is verbatim
    - **And** (b) the save returns the standard Phase 3 binding-walk error `"Input port \`segment\` (Segment) on node \`<classify-id>\` reads from ctx key \`pages\`, written by node \`<source-id>\` (Segment[]) — Segment[] not assignable to Segment"` anchored to the consumer port
    - **And** screenshots `10-legacy-isinput-unchanged.png` + `11-binding-walk-source-api.png` are saved
    - **And** zero `pageerror` events are recorded over the whole walkthrough

## Priority
- [x] High (Must Have)

## Files modified / created

- `/tmp/wb-phase8-verify/` — screenshot output dir (created by the inline test script)
- Inline Playwright (or chrome-devtools MCP) script per the `app-browser-auth` skill; no permanent test file — verification is one-shot per the Phase 2 Track 1/2/3 + Phase 3 pattern
- After verification: refresh `docs-md/workflow-builder/SESSION_HANDOFF.md` with Phase 8 closeout notes mirroring the Phase 3 closeout convention (TL;DR, milestone one-liners, test count deltas, screenshot pointers, fixture IDs left in dev DB)

## Notes

- Use the seed-default API key from CLAUDE.md (`69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY`); if 401s, ask Alex to re-seed via `npm run db:seed` in `apps/backend-services`.
- chrome-devtools MCP is preferred per Alex's note; fall back to Playwright per the `app-browser-auth` skill if unavailable. The auth-bypass cookie/header pattern from prior tracks works the same way here.
- After Milestone C (catalog entries) and any later runtime package change, `packages/graph-workflow` exports new runtime artefacts — the dev Vite pre-bundle may go stale. If the canvas renders source nodes as gray-with-default-handles (missing the catalog kind), restart Vite with a clean `node_modules/.vite/deps/` directory; see the Phase 3.x verification notes in SESSION_HANDOFF for the exact remediation.
- Phase 8 fixture workflows can be left in the dev DB at closeout (Phase 3 left 6; Phase 8 will likely leave 4–5). Document fixture IDs in the SESSION_HANDOFF post-script.
- This is the click-and-play milestone for Alex. Final ping for the phase.
