# US-156: End-to-end Playwright walkthrough — Phase 4 try-in-place

**As the** engineer closing Phase 4,
**I want** a single Playwright walkthrough that exercises every Phase 4 surface end-to-end against the running dev server,
**So that** we don't ship Phase 4 on green unit tests alone — the real backend + Vite + dev DB + Temporal combination must demonstrably work, including cache hits / cancellation / replay / cache-evicted Re-run.

## Acceptance Criteria

- [x] **Scenario 1**: source.upload happy path — Upload & Try → status badges + previews light up
    - **Given** the dev server running with the latest package build + a fresh fixture workflow `WF_PH4_UPLOAD_ID` with `source.upload → file.prepare → azureOcr.submit → azureOcr.poll → azureOcr.extract → ocr.normalizeFields → document.classify`
    - **When** the test opens the editor, opens the `source.upload` node's settings, clicks "Upload & Try", drops a test PDF
    - **Then** the canvas shows status badges progressing in execution order (running → succeeded), active edges animate, and per-node previews render in sequence
    - **And** the `source.upload` node's preview shows the uploaded document via `DocumentPreview`
    - **And** the `azureOcr.extract` node's preview shows the OCR result via `OcrResultPreview` (key-value table)
    - **And** the `document.classify` node's preview shows a label + confidence bar via `ClassificationPreview`
    - **And** screenshots `01-upload-and-try-clicked.png` + `02-canvas-mid-execution.png` + `03-canvas-all-complete.png` saved to `/tmp/wb-phase4-verify/`

- [x] **Scenario 2**: Cache hit on parameter tweak
    - **Given** the workflow has just completed a Try via Scenario 1
    - **When** the test opens `document.classify` settings, changes `confidenceThreshold` from 0.5 → 0.7, clicks Upload & Try with the SAME PDF
    - **Then** within ~2 seconds, upstream nodes (file.prepare, azureOcr.submit, azureOcr.poll, azureOcr.extract, ocr.normalizeFields) flash violet (skipped) — cache hits
    - **And** `document.classify` transitions blue → green (re-executed with new threshold)
    - **And** the classify preview updates to reflect the new threshold's result
    - **And** screenshots `04-cache-hits-on-tweak.png` + `05-classify-re-executed.png` saved

- [x] **Scenario 3**: Cancel-on-new-Try
    - **Given** a Try is currently running (active polling visible)
    - **When** the test clicks "Upload & Try" a second time before the first run completes
    - **Then** the first run's Temporal status transitions to cancelled (verified via `GET /api/workflows/:id/runs` showing the prior run as `cancelled`)
    - **And** the canvas refocuses on the new run's polling loop
    - **And** screenshot `06-cancel-on-new-try.png` saved

- [x] **Scenario 4**: Run history — list + filter + replay
    - **Given** three runs have happened (initial, tweaked, cancelled) on `WF_PH4_UPLOAD_ID`
    - **When** the test opens the "Run history" top-bar button → drawer opens
    - **Then** three rows visible — each with correct status badge (succeeded / succeeded / cancelled), version pin, timestamp, input-ctx summary chip
    - **And** filtering by `status=succeeded` narrows to two rows
    - **And** clicking "Replay" on the FIRST run → drawer closes, canvas enters replay mode (top-bar indicator visible), status badges + previews render the historical state (pre-tweak classification result visible)
    - **And** screenshots `07-run-history-drawer.png` + `08-run-history-filtered.png` + `09-canvas-in-replay-mode.png` saved

- [x] **Scenario 5**: Cache eviction + Re-run
    - **Given** the test is in replay mode for the first run (Scenario 4)
    - **When** the test executes a raw `DELETE FROM activity_output_cache WHERE node_id = '<classify-id>' AND workflow_lineage_id = '<lineage>'` against the dev DB
    - **And** triggers a canvas re-render (e.g., click outside + back on the classify node)
    - **Then** the classify node's preview shows the `CacheEvictedAlert` "Preview unavailable — cache evicted. Re-run to repopulate."
    - **And** clicking Re-run → a fresh Try kicks off with the historical `initialCtx`, replay mode clears, canvas transitions to live mode
    - **And** the new Try completes; classify preview re-populates
    - **And** screenshots `10-cache-evicted-alert.png` + `11-rerun-clicked-live-mode.png` saved

- [x] **Scenario 6**: source.api workflow — in-canvas Try + version-row run-count badge
    - **Given** a fresh fixture workflow `WF_PH4_API_ID` (source.api with 1 field → `data.transform`) AND the workflow has been saved twice (v1 + head v2)
    - **When** the test clicks the new "Try" top-bar button → drawer opens with Try tab pre-selected
    - **And** pastes a valid body, clicks Try
    - **Then** the drawer closes immediately and the canvas comes alive — status badges progress, previews render
    - **And** the user opens "Version history" → the head v2 row shows a `<Badge>1 run</Badge>` (the just-completed run); v1 shows `<Badge>0 runs</Badge>`
    - **And** the Run tab (in the Run drawer) still behaves as Phase 2 Track 2 (paste body, click Run, see inline workflowId — drawer stays open) — verified by switching back to the Run tab and submitting once
    - **And** screenshots `12-source-api-try-drawer.png` + `13-source-api-canvas-mid-run.png` + `14-version-history-with-run-count.png` saved
    - **And** zero `pageerror` events recorded over the whole walkthrough

## Priority
- [ ] High (Must Have)

## Files modified / created

- `/tmp/wb-phase4-verify/` — screenshot output dir (created by the inline test script)
- Inline Playwright (or chrome-devtools MCP) script per the `app-browser-auth` skill; no permanent test file — verification is one-shot per the Phase 2/3/8 pattern
- After verification: refresh `docs-md/workflow-builder/SESSION_HANDOFF.md` with Phase 4 closeout notes mirroring the Phase 8 closeout convention (TL;DR, milestone one-liners, test count deltas, screenshot pointers, fixture IDs left in dev DB)

## Notes

- Use the seed-default API key from CLAUDE.md (`69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY`); if 401s, ask Alex to re-seed via `npm run db:seed` in `apps/backend-services`.
- chrome-devtools MCP is preferred per Alex's note; fall back to Playwright per the `app-browser-auth` skill if unavailable. The auth-bypass cookie/header pattern from prior phases works the same way here.
- After Milestone A landing, `packages/graph-workflow` exports new runtime artefacts (cache helpers). After Milestone B, the catalog has been swept. After both, the Vite pre-bundle MAY go stale — restart with a clean `node_modules/.vite/deps/` directory if the canvas misbehaves.
- Phase 4 fixture workflows can be left in the dev DB at closeout (Phase 8 left 5; Phase 4 will likely leave 2–3 — the upload + the api workflow above). Document fixture IDs in the SESSION_HANDOFF post-script.
- This is the click-and-play milestone for Alex. Final ping for the phase.
