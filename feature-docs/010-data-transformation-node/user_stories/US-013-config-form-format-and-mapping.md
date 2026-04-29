# US-013: Node Configuration Form — Format Selectors and Mapping Editor

**As an** admin,
**I want to** configure the Data Transformation node through a dedicated form panel with input/output format dropdowns and a field mapping editor,
**So that** I can define transformation rules without writing code.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [x] **Scenario 1**: Input and output format dropdowns persist selections
    - **Given** the admin opens the transform node configuration panel
    - **When** they select an input format (JSON, XML, or CSV) and an output format from the dropdowns
    - **Then** the selections are saved to the node's `inputFormat` and `outputFormat` fields and are reflected when the panel is reopened

- [x] **Scenario 2**: Mapping text area displays and updates the current fieldMapping
    - **Given** the transform node has an existing `fieldMapping` value
    - **When** the admin opens the configuration panel
    - **Then** the text area displays the current mapping; edits to the text area update `fieldMapping` in the node config

- [x] **Scenario 3**: Admin can upload a .json file to replace the mapping
    - **Given** the admin clicks "Upload mapping" and selects a valid `.json` file
    - **When** the file is loaded
    - **Then** the text area is populated with the file's content and `fieldMapping` is updated accordingly

- [x] **Scenario 4**: Admin can export/download the current mapping as a .json file
    - **Given** the admin has a non-empty `fieldMapping` in the text area
    - **When** they click "Download mapping"
    - **Then** the browser downloads a file named `mapping.json` containing the current text area content

- [x] **Scenario 5**: Mapping text area includes inline guidance about binding syntax
    - **Given** the text area is empty (new node with default mapping)
    - **When** the admin views the text area
    - **Then** placeholder text or a visible tooltip explains the `{{nodeName.fieldName}}` binding syntax

## Priority
- [x] Medium (Should Have)

## Technical Notes / Assumptions
- The configuration panel is a new React component (e.g., `TransformNodeForm`) rendered inside `GraphConfigFormEditor` when `node.type === "transform"`, analogous to `ActivityNodeForm`.
- Use Mantine `Textarea` for the mapping editor, `Select` for the format dropdowns, and file input for upload.
- File upload uses the browser `FileReader` API to read content as text.
- File download uses a temporary `<a>` element with a `Blob` URL.
- The text area does not validate JSON in real-time; invalid JSON is saved as-is and caught at execution time. A note to this effect may be shown.
- This story depends on US-012 (node type registration in the form editor).
