# US-075: End-to-end Playwright walkthrough — Run panel for regular + library, paste-and-run, list filter

**As a** session-handoff reader,
**I want** a documented end-to-end verification that the Track 2
features work against the live dev server,
**So that** I can trust the implementation without re-running every
verification step myself.

## Acceptance Criteria

- [x] **Scenario 1**: Backend run-spec for a regular workflow
    - **Given** a saved regular workflow with at least one ctx entry flagged `isInput: true`
    - **When** `GET /api/workflows/:id/run-spec` is called with the seed-default `x-api-key`
    - **Then** the response is 200
    - **And** `inputSchema.properties` contains exactly the flagged ctx entries
    - **And** `triggerUrl` ends with `/api/workflows/:id/runs`
    - **And** `sampleCurl` is a valid curl command (visually inspected)

- [x] **Scenario 2**: Backend run-spec for a library workflow
    - **Given** the library workflow created during Track 1 verification (or a new one)
    - **When** `GET /api/workflows/:id/run-spec` is called
    - **Then** `inputSchema.properties` matches the library's `metadata.inputs[]` entries (by `path`)
    - **And** `required` lists all input paths (libraries have no defaults)

- [x] **Scenario 3**: Backend POST /runs happy path
    - **Given** a workflow with a `customerId: string` input
    - **When** `POST /api/workflows/:id/runs` is called with body `{ initialCtx: { customerId: "test-customer-001" } }` and the API key
    - **Then** the response is 201 with `{ workflowId: "...", workflowVersionId: "...", status: "started" }`
    - **And** `workflowId` is a non-empty Temporal workflow id

- [x] **Scenario 4**: Backend POST /runs rejects bad input
    - **Given** a workflow with required `customerId`
    - **When** `POST /api/workflows/:id/runs` is called with body `{}` (missing required field)
    - **Then** the response is 400 with a `message` referencing `customerId`

- [x] **Scenario 5**: Frontend Run drawer opens for a regular workflow
    - **Given** a saved regular workflow loaded in `/workflows/:id/edit-v2`
    - **When** the user clicks "Run this workflow"
    - **Then** the Run drawer opens
    - **And** the trigger URL, input schema rows, sample curl, and auth notes are visible
    - **And** zero console errors are logged

- [x] **Scenario 6**: Frontend paste-and-run produces a workflowId
    - **Given** the Run drawer is open on a regular workflow with a `customerId` input
    - **When** the user types `{ "customerId": "test" }` in the JsonInput and clicks Run
    - **Then** a success notification appears
    - **And** the returned `workflowId` is shown in the drawer with a copy button

- [x] **Scenario 7**: Frontend Run drawer for a library workflow
    - **Given** a library workflow loaded in `/workflows/:id/edit-v2`
    - **When** the user opens the Run drawer
    - **Then** the input schema rows reflect the library's `metadata.inputs[]` (not its ctx)

- [x] **Scenario 8**: Workflow list filter
    - **Given** the `/workflows` page
    - **When** the user toggles the SegmentedControl through "Workflows" / "Libraries" / "All"
    - **Then** the list updates appropriately each time
    - **And** the Libraries tab shows the test library workflow
    - **And** the Workflows tab does not show it
    - **And** the All tab shows both

- [x] **Scenario 9**: Screenshots
    - **Given** all Playwright steps above
    - **When** the walkthrough completes
    - **Then** screenshots from each major step are saved under `/tmp/wb-phase2-track2-verify/` with descriptive names

## Priority
- [ ] High (Must Have)

## Notes

- Use the `app-browser-auth` skill to bypass IDIR auth and mock auth context.
- The seed-default API key from CLAUDE.md works after `npm run db:seed`.
- Screenshots + summary go into the SESSION_HANDOFF.md docs commit after this story is done.
