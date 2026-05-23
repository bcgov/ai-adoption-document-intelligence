# US-071: `RunWorkflowDrawer` renders trigger URL, input schema, sample curl, auth notes

**As a** workflow author (or API consumer testing in the editor),
**I want** a right-side drawer that displays everything I need to
trigger this workflow from outside,
**So that** I can copy the trigger URL, see the expected input shape,
and grab a working sample curl in one place.

## Acceptance Criteria

- [ ] **Scenario 1**: Component fetches `run-spec` on open
    - **Given** the `RunWorkflowDrawer` is mounted with a `workflowId` prop and `opened === true`
    - **When** it renders
    - **Then** it fetches `GET /api/workflows/:workflowId/run-spec` (via a TanStack Query hook `useWorkflowRunSpec(workflowId)`)
    - **And** the loading state shows a Mantine `Loader` / skeleton
    - **And** the error state shows a Mantine `Alert` with the error message

- [ ] **Scenario 2**: Trigger URL section
    - **Given** the fetched `run-spec`
    - **When** the drawer renders
    - **Then** there is a clearly-labeled "Trigger URL" section showing the full URL in a `<Code>` block
    - **And** a Mantine `CopyButton` to copy it to the clipboard

- [ ] **Scenario 3**: Input schema section — library workflow
    - **Given** a library workflow whose `inputSchema` has properties `{ foo: { type: "string", title: "Foo" }, bar: { type: "number", title: "Bar" } }` with `required: ["foo", "bar"]`
    - **When** the drawer renders
    - **Then** the "Input" section shows one row per property with the columns: name (`foo`), type (`string`), required (yes/no), description (if any), default (if any)
    - **And** the row order matches the schema's `properties` insertion order

- [ ] **Scenario 4**: Input schema section — regular workflow with no inputs
    - **Given** a workflow whose `inputSchema.properties` is empty
    - **When** the drawer renders
    - **Then** an empty-state message appears: "No inputs declared. Mark ctx entries as 'Input' in Workflow settings to expose them here."

- [ ] **Scenario 5**: Sample curl section
    - **Given** the fetched `sampleCurl`
    - **When** the drawer renders
    - **Then** the "Sample curl" section shows the curl in a `<Code block>` with a copy button
    - **And** the curl text matches the backend's response byte-for-byte (no client-side template munging)

- [ ] **Scenario 6**: Auth notes section
    - **Given** the fetched `authNotes` string
    - **When** the drawer renders
    - **Then** the "Authentication" section displays the text in a plain `Text` block

- [ ] **Scenario 7**: Drawer placement + close
    - **Given** the drawer is opened
    - **When** the user clicks the close icon or the backdrop
    - **Then** the drawer closes via the `onClose` prop
    - **And** the drawer renders on the right side, ~480px wide (or whatever the existing settings drawer uses)

- [ ] **Scenario 8**: Vitest coverage
    - **Given** the component spec
    - **When** `npm test` runs in `apps/frontend`
    - **Then** Scenarios 1 (with mocked fetch) + 2 + 3 + 4 + 5 are each covered

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx`
- `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.test.tsx`
- `apps/frontend/src/api/use-workflow-run-spec.ts` — TanStack Query hook around `GET /api/workflows/:id/run-spec`

## Notes

- US-072 layers the paste-and-run textarea on top of this drawer. Keep the surface tidy so US-072's additions slot in naturally.
- Use existing API client patterns from `apps/frontend/src/api/` (look at `useWorkflows`, `useWorkflow` from Track 1 as the template).
