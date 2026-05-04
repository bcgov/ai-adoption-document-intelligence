# US-05: Create AzureClassifySubmitForm Frontend Component

**As a** Workflow Designer,
**I want to** configure an Azure classifier page extraction node in the workflow builder using a dedicated form,
**So that** I can select a trained classifier and wire up the source document without editing raw JSON.

## Acceptance Criteria
- [x] **Scenario 1**: Classifier dropdown shows only READY classifiers for the current group
    - **Given** the form is rendered for an `azureClassify.submit` node
    - **When** the classifier dropdown is displayed
    - **Then** it lists only classifiers with `status === "READY"` scoped to the current group, fetched via `GET /api/azure/classifier?group_id={groupId}`

- [x] **Scenario 2**: Loading state
    - **Given** the classifier list is being fetched
    - **When** the dropdown is rendered
    - **Then** it is disabled and shows a loading indicator

- [x] **Scenario 3**: Error state
    - **Given** the classifier fetch fails
    - **When** the dropdown is rendered
    - **Then** an error message is shown and the dropdown is disabled

- [x] **Scenario 4**: Classifier selection updates node parameters
    - **Given** the user selects a classifier from the dropdown
    - **When** the selection changes
    - **Then** `node.parameters.classifierName` is updated to the selected classifier's `name`

- [x] **Scenario 5**: Component is standalone and receives node/onChange props
    - **Given** the component definition
    - **When** it is inspected
    - **Then** it accepts `(node: ActivityNode, onChange: (node: ActivityNode) => void)` as props and does not inline-mutate anything in `GraphConfigFormEditor.tsx`

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- File: `apps/frontend/src/components/workflow/AzureClassifySubmitForm.tsx`
- Use Tanstack React Query `useQuery` keyed on `["classifiers", groupId]` to fetch from `GET /api/azure/classifier?group_id={groupId}`.
- Current group ID comes from the existing group context in the frontend.
- Use Mantine `Select` component for the classifier dropdown.
- Filter returned classifiers to `status === "READY"` client-side after fetch (the API already supports server-side filtering by `group_id`).
- Component must have a Vitest / React Testing Library unit test covering: loading state, error state, successful render with options, and selection updating parameters.
