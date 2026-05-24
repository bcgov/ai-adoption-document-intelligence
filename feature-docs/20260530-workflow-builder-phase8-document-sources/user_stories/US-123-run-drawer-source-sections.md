# US-123: `RunWorkflowDrawer` — up-to-two source sections

**As a** workflow author testing a workflow that has source nodes,
**I want** the Run drawer to render an API section, an Upload section, both, or neither depending on the workflow's source configuration,
**So that** I can exercise either trigger from the same drawer and the existing isInput-only behaviour stays unchanged for legacy workflows.

## Acceptance Criteria

- [ ] **Scenario 1**: Workflow with `source.api` only → API section rendered
    - **Given** `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx`
    - **When** the drawer opens for a workflow whose `/run-spec` response has `inputSchema` (derived from source.api via US-111) and NO `uploadSpec`
    - **Then** the drawer renders the existing Phase 2 Track 2 API surface: trigger URL with copy, schema field table (using the source.api `fields[]`-derived schema), sample curl with copy, auth notes, JsonInput (prefilled from the schema's defaults), Run button — same as Phase 2 Track 2 verbatim

- [ ] **Scenario 2**: Workflow with `source.upload` only → Upload section rendered
    - **Given** the same component
    - **When** the drawer opens for a workflow whose `/run-spec` response has `uploadSpec` but NO `inputSchema` (or an empty `inputSchema`)
    - **Then** the drawer renders an Upload section: a Mantine `<Dropzone>` configured with `accept={uploadSpec.allowedMimeTypes}` + `maxSize={uploadSpec.maxFileSizeMB * 1024 * 1024}`, a `<Text>` surfacing the constraints inline ("Accepts PDF, max 25MB"), and a Run button
    - **And** the Run button is disabled until a file is selected
    - **And** clicking Run calls `useSourceUpload` (US-122), waits for the upload to resolve, then POSTs the returned ctxKey-keyed object as `initialCtx` to `/runs`
    - **And** success shows the returned Temporal workflowId in the same Alert style the Phase 2 Track 2 API path uses

- [ ] **Scenario 3**: Workflow with BOTH → both sections render
    - **Given** the same component
    - **When** the drawer opens for a workflow with both a source.api and a source.upload
    - **Then** the drawer renders BOTH sections (API on top, Upload below — or whichever order the design specs)
    - **And** the user can exercise either; each Run button triggers an independent run

- [ ] **Scenario 4**: Workflow with NEITHER source node → legacy isInput-derived behaviour unchanged
    - **Given** the same component
    - **When** the drawer opens for a legacy workflow (no source nodes, just `isInput`-flagged ctx)
    - **Then** the drawer renders EXACTLY as Phase 2 Track 2 left it — the `isInput`-flagged ctx drives `inputSchema`, JsonInput renders, Run goes through `/runs` directly
    - **And** the existing Phase 2 Track 2 Playwright walkthrough (`/tmp/wb-phase2-track2-verify/`) would still pass without changes

- [ ] **Scenario 5**: Frontend vitest coverage for each state
    - **Given** new tests in `RunWorkflowDrawer.test.tsx`
    - **When** the suite runs with fixtures for each of the four states (api-only, upload-only, both, neither)
    - **Then** each fixture renders the expected sections and only the expected sections
    - **And** mocking `useStartWorkflowRun` + `useSourceUpload` lets the test simulate Run + Upload completions and assert the success Alert + Temporal workflowId display
    - **And** existing RunWorkflowDrawer tests stay green

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx` — extend rendering to handle the four states; introduce small `<ApiSourceSection>` + `<UploadSourceSection>` sub-components if the rendering gets dense
- `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.test.tsx` — extend with the 4 state-based tests
- Possibly new files for the sub-components if they're extracted

## Technical notes

- Section rendering is driven by the new fields on the `/run-spec` response:
  - `inputSchema` present + non-empty → render API section
  - `uploadSpec` present → render Upload section
  - both absent / empty → render legacy fallback (which IS the API section against an isInput-derived schema; the source-of-derivation difference is invisible at this layer thanks to US-111's precedence helper)
- Don't try to determine "is this a source.api workflow vs an isInput workflow" in the drawer. The drawer reads `/run-spec`'s response shape only. The derivation precedence is the backend's job.
- The upload-then-/runs chain uses `useStartWorkflowRun` (existing Phase 2 Track 2 hook) for the `/runs` POST, passing the ctxKey-keyed upload response as `initialCtx`. Workflows can have BOTH source.api AND source.upload — the upload chain populates ONLY the source.upload's ctxKey; the API path populates source.api's fields. They are independent code paths.
- For Scenario 3, the visual layout is "API section above Upload section, separated by a `<Divider />`". Match whatever the design brief implies; if unclear, ship the simplest stack.
