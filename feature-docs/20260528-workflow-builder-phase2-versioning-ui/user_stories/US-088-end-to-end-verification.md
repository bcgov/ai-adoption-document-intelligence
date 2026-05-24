# US-088: End-to-end Playwright walkthrough — versioning UI

**As the** engineer closing Track 3,
**I want** a single Playwright walkthrough that exercises every
versioning surface end-to-end against the running dev server,
**So that** we don't ship Track 3 on green unit tests alone — the
real backend + Vite + dev DB combination must demonstrably work.

## Acceptance Criteria

- [ ] **Scenario 1**: History drawer + head badge
    - **Given** a workflow with 2+ versions and the dev server running
    - **When** the test opens the V2 editor for that workflow and clicks "History" in the top bar
    - **Then** the `VersionHistoryDrawer` renders with rows newest-first
    - **And** the "head" badge appears on the correct row
    - **And** screenshot `01-history-drawer.png` is saved to `/tmp/wb-phase2-track3-verify/`

- [ ] **Scenario 2**: Compare-to-head modal
    - **Given** the drawer is open
    - **When** the test clicks "Compare to head" on a non-head row
    - **Then** a modal opens with two side-by-side `JsonInput` blocks
    - **And** both columns contain valid JSON renderings of their respective configs
    - **And** screenshot `02-compare-modal.png` is saved

- [ ] **Scenario 3**: Revert flow + canvas reload
    - **Given** the drawer is open
    - **When** the test clicks "Revert to this version" on a non-head row and confirms the modal
    - **Then** the drawer closes
    - **And** the editor's canvas reloads with the reverted config (verified by querying for a node id present only in the older version's config)
    - **And** re-opening the History drawer shows the head badge on the previously selected row
    - **And** screenshots `03-revert-confirm.png` + `04-after-revert.png` are saved

- [ ] **Scenario 4**: Run drawer per-version
    - **Given** the Run drawer is open
    - **When** the test picks a non-head version from the Version Select
    - **Then** the schema table updates and the prefilled JSON changes (verified by an assertion against the rendered text)
    - **And** clicking Run returns a `workflowId` in the success notification
    - **And** screenshot `05-run-drawer-versioned.png` is saved

- [ ] **Scenario 5**: Library pin persistence
    - **Given** a workflow with a `childWorkflow` node and a library workflow with 2+ versions
    - **When** the test opens `LibraryPickerModal`, selects the library + a non-head version, confirms, saves the parent workflow, and reloads the page
    - **Then** the `ChildWorkflowNodeSettings` signature summary shows the `v{n}` badge after reload
    - **And** screenshot `06-library-pinned.png` is saved

- [ ] **Scenario 6**: Zero `pageerror` events through the entire walkthrough
    - **Given** a page-level error listener attached at test start
    - **When** the walkthrough completes
    - **Then** the recorded `pageerror` count is 0 (console-level 401s from background polling are tolerated as in Track 2's verification — they predate Track 3)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `/tmp/wb-phase2-track3-verify/` — screenshot output dir
- Inline Playwright script via `node --input-type=module -e "..."` per the `app-browser-auth` skill (no permanent test file; verification is one-shot per the Track 2 + Track 1 pattern)
- After verification: refresh `docs-md/workflow-builder/SESSION_HANDOFF.md` with Track 3 closeout notes mirroring the Track 2 closeout convention

## Notes

- Use the seed-default API key from CLAUDE.md (`69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY`); if 401s, ask Alex to re-seed via `npm run db:seed` in `apps/backend-services`.
- The library-pin scenario likely needs creating a second version of the library workflow first (re-save → backend creates a new version). Bake that step into the script.
- chrome-devtools MCP is preferred per Alex's note; fall back to Playwright per the `app-browser-auth` skill if unavailable.
