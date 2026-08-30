# US-081: Add "History" top-bar button in `WorkflowEditorV2Page` + `useWorkflowVersion` hook

**As a** workflow author in the V2 editor,
**I want** a discoverable button in the top bar that opens the version
history,
**So that** version management is a peer affordance to Save / Run /
Save-as-library / Settings rather than buried in a sub-menu.

## Acceptance Criteria

- [x] **Scenario 1**: "History" button rendered between "Save" and "Run this workflow"
    - **Given** `WorkflowEditorV2Page` in edit mode (workflow has an `id`)
    - **When** the page renders
    - **Then** a button labelled "History" with `IconHistory` (from `@tabler/icons-react`) appears between "Save" and "Run this workflow" in the top bar
    - **And** clicking it sets the drawer-open state to true

- [x] **Scenario 2**: Button disabled in create mode
    - **Given** `WorkflowEditorV2Page` in create mode (no `workflowId` yet)
    - **When** the page renders
    - **Then** the History button is disabled
    - **And** hover shows a Mantine `Tooltip` with text "Save the workflow first"

- [x] **Scenario 3**: `useWorkflowVersion` hook fetches a single version
    - **Given** `apps/frontend/src/data/hooks/useWorkflows.ts`
    - **When** the hook is read
    - **Then** an exported `useWorkflowVersion(lineageId: string | undefined, versionId: string | undefined)` returns a TanStack `useQuery`
    - **And** the query key is `["workflow-version", lineageId, versionId]`
    - **And** it fetches `GET /workflows/${lineageId}/versions/${versionId}` and returns the `WorkflowInfo`
    - **And** the query is `enabled` only when both ids are defined

- [x] **Scenario 4**: Vitest coverage
    - **Given** existing frontend test patterns for top-bar buttons + hooks
    - **When** `npm test` runs in `apps/frontend/`
    - **Then** a test asserts the History button rendering in both modes (enabled/disabled + tooltip)
    - **And** a test asserts `useWorkflowVersion` calls the correct endpoint and returns the workflow on success

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` — insert History button between Save and Run this workflow; add `historyDrawerOpened` state
- `apps/frontend/src/data/hooks/useWorkflows.ts` — add `useWorkflowVersion`
- `apps/frontend/src/features/workflow-builder/__tests__/WorkflowEditorV2Page.test.tsx` (or equivalent) — scenario 1 + 2
- `apps/frontend/src/data/hooks/__tests__/useWorkflows.test.tsx` (or equivalent) — scenario 3
