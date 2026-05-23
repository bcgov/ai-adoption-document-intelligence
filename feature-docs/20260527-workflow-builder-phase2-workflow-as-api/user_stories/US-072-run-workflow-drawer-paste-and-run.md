# US-072: Paste-JSON-and-run textarea + Run button POSTs to `/api/workflows/:id/runs`

**As a** workflow author iterating on a workflow,
**I want** to paste a sample JSON input and click Run to trigger an
actual Temporal execution from the editor,
**So that** I can validate my workflow end-to-end without leaving the
browser or wiring up a separate curl invocation.

## Acceptance Criteria

- [ ] **Scenario 1**: "Paste JSON & run" section is present in the drawer
    - **Given** the `RunWorkflowDrawer` from US-071
    - **When** it renders
    - **Then** a section labeled "Test run" (or similar) is present at the bottom of the drawer
    - **And** the section contains a Mantine `<JsonInput>` (or `<Textarea>` with JSON formatting) prefilled with a stub body that matches the input schema
    - **And** a Mantine `<Button>` labeled "Run"

- [ ] **Scenario 2**: Stub body is auto-generated from the schema
    - **Given** an input schema with `{ properties: { customerId: { type: "string" }, count: { type: "number", default: 5 } } }`
    - **When** the section renders
    - **Then** the JsonInput is prefilled with `{ "customerId": "", "count": 5 }` (default if present, type-appropriate stub otherwise: `""` for string, `0` for number, `false` for boolean, `{}` for object, `[]` for array)

- [ ] **Scenario 3**: Run button POSTs and shows the result
    - **Given** a valid JSON body in the JsonInput
    - **When** the user clicks "Run"
    - **Then** the drawer POSTs to `/api/workflows/:workflowId/runs` with body `{ initialCtx: <parsed JSON> }`
    - **And** on 201 response, a success state shows the returned `workflowId` in a `<Code>` block with a copy button
    - **And** a Mantine notification fires ("Workflow run started: <workflowId>")

- [ ] **Scenario 4**: Run button disabled when JSON is invalid
    - **Given** the JsonInput contains unparseable JSON
    - **When** the user looks at the Run button
    - **Then** the Run button is disabled
    - **And** the JsonInput shows an inline parse error (Mantine's default behavior)

- [ ] **Scenario 5**: Backend 400 → inline error
    - **Given** the backend returns `400 { message: "missing required field customerId" }`
    - **When** the user clicks Run
    - **Then** a Mantine `Alert` appears under the Run button with the message
    - **And** no success state is shown

- [ ] **Scenario 6**: Backend 401 / 5xx → fallback error
    - **Given** the backend returns any non-2xx, non-400 status
    - **When** the user clicks Run
    - **Then** a Mantine `Alert` appears with a generic message ("Run failed: <status>") and the response body's `message` if present

- [ ] **Scenario 7**: Run button shows a loading state during the request
    - **Given** the user has clicked Run and the request is in-flight
    - **When** the button is observed
    - **Then** it shows the Mantine `loading` prop active and is disabled

- [ ] **Scenario 8**: Vitest coverage
    - **Given** the component spec
    - **When** `npm test` runs
    - **Then** Scenarios 2, 3, 4, 5 are each covered with mocked fetch responses

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx` — add the "Test run" section
- `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.test.tsx` — add the new test cases
- `apps/frontend/src/api/use-start-workflow-run.ts` — mutation hook around `POST /api/workflows/:id/runs`

## Notes

- The stub-body generator is a small pure function — extract it to `apps/frontend/src/features/workflow-builder/run/build-stub-input.ts` + unit-test it separately.
- Once a successful run completes, do NOT clear the JsonInput — the user may want to tweak and re-run.
