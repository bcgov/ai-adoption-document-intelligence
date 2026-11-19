# US-085: `RunWorkflowDrawer` "Version" Select wires per-version run-spec refetch + sends `workflowVersionId` in body

**As a** workflow author who wants to test-run an older version,
**I want** to choose the version from the Run drawer and have the
input schema + prefilled JSON + run-on-Run all target that version,
**So that** I can validate behaviour across versions without bouncing
between curl + the Temporal Web UI.

## Acceptance Criteria

- [x] **Scenario 1**: Version `<Select>` appears above the JsonInput
    - **Given** the Run drawer is open for a workflow with multiple versions
    - **When** the drawer renders
    - **Then** a Mantine `<Select label="Version">` is shown above the "Test run" JsonInput
    - **And** the options are one per row from `useWorkflowVersions(lineageId)`, labelled `v{n}` (or `v{n} — head` for the head row)
    - **And** the default selected value is the head version's id

- [x] **Scenario 2**: Changing the version refetches the spec
    - **Given** the user picks a non-head version from the Select
    - **When** the change handler fires
    - **Then** `useWorkflowRunSpec(lineageId, { workflowVersionId: <chosenId> })` refetches (the hook adds the new query param to the URL)
    - **And** the schema table updates with the chosen version's `inputSchema`
    - **And** the prefilled JsonInput body resets to the new schema's `buildStubInput` output
    - **And** the sample curl is regenerated for the new schema

- [x] **Scenario 3**: Run button sends the selected version in the body
    - **Given** a non-head version is selected
    - **When** the user clicks Run
    - **Then** `useStartWorkflowRun().mutateAsync` is called with `{ initialCtx, workflowVersionId: <chosenId> }`
    - **And** the response handling (workflowId display, copy, success notification) works identically to Track 2

- [x] **Scenario 4**: When head is selected, body omits `workflowVersionId`
    - **Given** the head version is selected
    - **When** the user clicks Run
    - **Then** the body sent to `/api/workflows/:id/runs` is `{ initialCtx }` only — no `workflowVersionId` field — so the backend defaults to head (matches Track 2 default)

- [x] **Scenario 5**: Vitest coverage
    - **Given** the wired-up Select + hooks
    - **When** `npm test` runs
    - **Then** tests cover: Select default = head, change → spec refetch with the right query param, Run body includes `workflowVersionId` for non-head, Run body omits it for head

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx` — add the Version `<Select>`, track selected version in component state, derive the right spec + body
- `apps/frontend/src/data/hooks/useWorkflows.ts` — extend `useWorkflowRunSpec(lineageId, { workflowVersionId? }?)` to take an optional `workflowVersionId` and add it to the query string + queryKey
- `apps/frontend/src/features/workflow-builder/run/__tests__/RunWorkflowDrawer.test.tsx` — scenarios 1–4

## Notes

- The Select option labelling ("v3 — head") only marks the head with the badge text once at fetch time; if head moves while the drawer is open (e.g. user revert-then-runs), the drawer will show stale "head" until reopened. Acceptable for Track 3.
- Avoid prematurely-triggered refetches on every keystroke in the JsonInput by isolating the Select state from the JsonInput state.
