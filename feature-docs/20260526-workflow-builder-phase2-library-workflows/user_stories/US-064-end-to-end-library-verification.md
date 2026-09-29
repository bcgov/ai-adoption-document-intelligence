# US-064: End-to-end Playwright verification — save library → add childWorkflow → pick library → round-trip

**As a** Phase 2 Track 1 reviewer,
**I want** end-to-end browser verification that the full flow works
against the running dev server,
**So that** I can sign off that the library workflow concept actually
works clickably, not just in unit tests.

## Acceptance Criteria

- [ ] **Scenario 1**: Save a template as a library
    - **Given** the V2 editor at `/workflows/create-v2` after loading a template (e.g., `multi-page-report-workflow.json`)
    - **When** the user clicks "Save as library", declares at least 1 input + 1 output, sets Name + Description, and clicks Save
    - **Then** the request POSTs successfully with `workflowKind: "library"` + the declared metadata
    - **And** the success toast appears with a "View library" link

- [ ] **Scenario 2**: Library appears in the picker
    - **Given** a freshly created library workflow
    - **When** the user navigates to a new `/workflows/create-v2`, adds a `childWorkflow` node, and opens its picker
    - **Then** the just-saved library appears in the modal with its declared signature

- [ ] **Scenario 3**: Picking writes the workflowRef
    - **Given** the picker is open with the library visible
    - **When** the user selects it
    - **Then** the node's `workflowRef.workflowId` equals the library's id
    - **And** the read-only signature summary renders below the picker button

- [ ] **Scenario 4**: Saved workflow round-trips
    - **Given** the new workflow with a populated childWorkflow node
    - **When** the user saves the workflow and reloads the page
    - **Then** the childWorkflow node still references the same library id
    - **And** the signature summary renders correctly on reload (fetched against the backend)

- [ ] **Scenario 5**: Backend list confirms the library kind
    - **Given** the dev backend
    - **When** `curl -H "x-api-key: <key>" "http://localhost:3002/api/workflows?kind=library"` is run
    - **Then** the response contains the new library workflow
    - **And** `curl -H "x-api-key: <key>" "http://localhost:3002/api/workflows"` (no `kind` param) does NOT contain it

- [ ] **Scenario 6**: Screenshots captured for the handoff
    - **Given** the verification run
    - **When** key moments are reached
    - **Then** screenshots are saved to `/tmp/wb-phase2-track1-verify/` (modal open, library list in picker, summary on saved childWorkflow, round-tripped state after reload)

## Notes

- Use the `app-browser-auth` skill for browser inspection. The
  `x-api-key` env var must be provided by the user at session start
  (per `project_workflow_builder_handoff`).
- Vite must be restarted after any `packages/graph-workflow` change
  (US-055 lands new exports). Ask the user to restart it before
  attempting this Playwright run.

## Priority
- [ ] High (Must Have)

## Files modified

- None — this is a verification story only. Findings inform commit
  messages + the final SESSION_HANDOFF refresh.
