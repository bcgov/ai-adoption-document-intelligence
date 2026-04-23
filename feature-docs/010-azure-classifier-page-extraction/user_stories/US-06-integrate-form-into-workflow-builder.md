# US-06: Integrate AzureClassifySubmitForm into Workflow Builder

**As a** Workflow Designer,
**I want to** see the Azure classifier extraction form automatically when I add an `azureClassify.submit` node to a workflow,
**So that** I do not have to edit raw JSON to configure the classifier name.

## Acceptance Criteria
- [ ] **Scenario 1**: Form renders for azureClassify.submit nodes
    - **Given** a workflow with a node whose `activityType` is `"azureClassify.submit"`
    - **When** the workflow builder displays that node in the form editor
    - **Then** the `AzureClassifySubmitForm` component is rendered for that node

- [ ] **Scenario 2**: Generic activity form still renders for all other activity types
    - **Given** a workflow node with any `activityType` other than `"azureClassify.submit"`
    - **When** the workflow builder displays that node
    - **Then** the standard generic inputs/outputs form is rendered as before (no regression)

- [ ] **Scenario 3**: azureClassify.submit appears in the activity type dropdown/list
    - **Given** the workflow builder's node type options
    - **When** the available activity types are listed
    - **Then** `"azureClassify.submit"` is selectable

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Modify `ActivityNodeForm` in `apps/frontend/src/components/workflow/GraphConfigFormEditor.tsx`.
- Add a conditional: `if (node.activityType === "azureClassify.submit") return <AzureClassifySubmitForm ... />`.
- Do **not** follow the outdated `isOcrEnrich` inline-block pattern — use the standalone component approach.
- The `azureClassify.submit` activity type string must also appear in the list of known type strings used by the workflow builder's type selector (if such a list is maintained in the frontend).
- Regression tests: confirm the existing `ActivityNodeForm` snapshot/behaviour tests still pass.
