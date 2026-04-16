# US-015: Transform Node Summary View

**As an** admin,
**I want to** see a read-only summary of a configured transform node in the workflow builder,
**So that** I can review its settings at a glance without entering edit mode.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [x] **Scenario 1**: Summary displays selected input and output formats
    - **Given** a transform node has `inputFormat: "xml"` and `outputFormat: "json"` configured
    - **When** the admin views the node summary in the workflow builder
    - **Then** the summary panel clearly shows the input format (XML) and output format (JSON)

- [x] **Scenario 2**: Summary displays a read-only preview of the field mapping
    - **Given** a transform node with a non-empty `fieldMapping`
    - **When** the admin views the node summary
    - **Then** the summary panel shows the mapping content in a read-only text display

- [x] **Scenario 3**: Large mappings display a truncated summary
    - **Given** a transform node with a `fieldMapping` exceeding a reasonable display threshold (e.g., more than 300 characters)
    - **When** the admin views the node summary
    - **Then** the mapping preview is truncated with a visual indicator (e.g., "…") rather than showing the full mapping

- [x] **Scenario 4**: Error badge displays when the last execution failed
    - **Given** the workflow execution history shows a failure on the transform node (e.g., unresolved binding or malformed output)
    - **When** the admin views the node in the workflow builder
    - **Then** an error badge is visible on the node indicating the last execution failed

## Priority
- [x] Medium (Should Have)

## Technical Notes / Assumptions
- The summary view is a read-only display rendered when the node is not in edit mode, similar to how other node types surface key metadata.
- The error badge behaviour follows the same pattern used elsewhere in `GraphVisualization.tsx` (the `hasError` flag on node data).
- The "last execution failed" state is derived from workflow execution status data already available in the UI.
- Truncation threshold is at implementer's discretion; 300 characters is a guideline.
- This story depends on US-012 (visualization registration) and US-013 (understanding the config shape).
