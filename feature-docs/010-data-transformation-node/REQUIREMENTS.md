# Feature: Data Transformation Node

## Overview

Add a general-purpose **Data Transformation** workflow node to the graph-based workflow engine. The node accepts a user-defined field-mapping configuration and renders it into a target format (JSON, XML, or CSV) by substituting values from upstream node outputs. Its design is format-agnostic and not tied to any specific integration (e.g., ICM/MySS).

The primary driver for this feature is enabling conversion of OCR-extracted JSON output into structured XML payloads required by downstream SOAP-based integrations, but the node must remain generic enough to serve any transformation workload.

---

## Goals

- Provide a reusable workflow node that transforms data from one format to another.
- Allow admins to define field mappings without writing code.
- Surface field-resolution warnings without blocking workflow execution.
- Fail loudly on malformed output to prevent silent data corruption.

## Out of Scope

- Array/list iteration within templates (looping constructs such as `{{#each}}`).
- Output schema validation (e.g., XSD, JSON Schema).
- SOAP envelope/wrapper generation (handled by a separate downstream node).
- File/blob input from previous steps (noted as a future enhancement).
- Auto-discovery UI for upstream node fields (manual path entry only).

---

## User Roles

| Role  | Description |
|-------|-------------|
| Admin | Configures the workflow graph including this node. Assumed to have low technical literacy; UI must be approachable. |

---

## Functional Requirements

### FR-1: Node Registration

- The Data Transformation node must be registered as a standard, selectable node type in the workflow builder UI alongside all other node types.
- It must appear in whichever palette or node-picker the system uses.

### FR-2: Output Format Selection

- The node must support exactly three output formats:
  - `JSON`
  - `XML`
  - `CSV`
- The admin selects the desired output format at configuration time via a dropdown or equivalent UI control.
- The selection is stored as part of the node's configuration and does not change at runtime.

### FR-3: Field Mapping Configuration

- The node's transformation is driven by a **field mapping document** — a JSON object where each key is an output field identifier and each value is either:
  - A literal string value, or
  - A binding expression (see FR-4) that resolves to a value from upstream node output.
- Example mapping structure:
  ```json
  {
    "TransactionName": "EA SD81 Submission to ICM",
    "FirstName": "{{extractionNode.KeyPlayerFirstName}}",
    "CaseID": "{{extractionNode.payload.ICMCaseID}}"
  }
  ```
- The mapping document is editable directly in the node UI via a **plain-text JSON editor** (text area with JSON syntax).
- The admin can also **upload a `.json` file** to replace the current mapping. After upload, the file's content is displayed in the text editor for review and further edits.
- The current mapping is always visible in the text editor when the node is opened.

### FR-4: Binding Syntax

- Bindings use double-curly-brace syntax: `{{nodeName.field.path}}`.
- Paths are period-separated and support arbitrary nesting depth (e.g., `{{nodeName.payload.header.userId}}`).
- `nodeName` uniquely identifies a prior node in the workflow. The identifier must correspond to the Temporal activity/node identifier used in the workflow engine.
- Bindings can reference the immediate predecessor node or any earlier node in the graph.
- Binding resolution is performed at workflow execution time, not at configuration time.

### FR-5: Template Rendering

- At execution time, the node receives its mapping configuration and the outputs of upstream nodes.
- The node resolves all binding expressions in the mapping values.
- It then renders the resolved mapping into the selected output format:
  - **XML**: Each top-level key becomes a child element under a single root element (root element name TBD by implementer or configurable). Nested mappings produce nested elements.
  - **JSON**: The resolved mapping is serialized as a JSON object.
  - **CSV**: Top-level keys become column headers; resolved values form a single data row.
- The output is a **plain text string** in the target format, passed as the node's output to the next node in the workflow.

### FR-6: Missing Field Handling

- If a binding expression cannot be resolved (the referenced field does not exist in the upstream node's output), the node must:
  1. **Skip** that field — it is omitted from the rendered output.
  2. **Record a warning** in the workflow execution log identifying the unresolved binding path.
  3. **Set a warning badge** on the node in the workflow UI indicating that one or more fields were skipped during the last execution.
- Missing fields must **not** stop or fail the workflow execution.

### FR-7: Malformed Output Handling

- If the rendering process produces output that is structurally invalid for the chosen format (e.g., invalid XML, malformed JSON), the node must:
  1. **Throw an error** and halt the workflow at that node.
  2. **Record the error** in the workflow execution log with sufficient detail to diagnose the problem.
- "Malformed" means the output cannot be parsed by a standard parser for that format.

### FR-8: Node UI — Summary View

- When a configured node is viewed in the workflow builder (not in edit mode), it must display:
  - The selected output format.
  - A read-only preview of the current mapping (or a truncated summary if the mapping is large).
  - A warning badge if the last execution produced any skipped-field warnings.

---

## Non-Functional Requirements

### NFR-1: Format Agnosticism
The node implementation must not contain logic specific to any integration target (e.g., no ICM-specific field names, no SOAP-specific wrappers). All integration-specific concerns live in the mapping configuration provided by the admin.

### NFR-2: Approachability
The JSON mapping editor must be clearly labelled and include inline guidance (placeholder text or tooltip) explaining the `{{nodeName.field}}` binding syntax, so an admin with low technical literacy can understand how to construct a mapping.

### NFR-3: Config Persistence
The mapping document and selected format are persisted as part of the workflow definition and survive workflow saves, reloads, and version history (consistent with how other node configurations are stored).

---

## Example Use Case (Reference Only)

> An OCR extraction node outputs a JSON object containing fields such as `KeyPlayerFirstName`, `ICMCaseID`, and `SubmitDate`. A downstream ICM integration requires an XML payload. The admin creates a Data Transformation node, selects **XML** as the output format, and provides a mapping file that binds each required XML element to the corresponding OCR output field using `{{ocrNode.fieldName}}` syntax. The rendered XML string is then passed to a subsequent SOAP submission node.

The sample XML structure from the ICM integration (`EA SD81 Submission to ICM Sample_Request.xml`) serves as a reference for the payload shape but is not hardcoded into the node implementation.

---

## Open Questions / Future Considerations

- **Root element name for XML output**: Should the root element name be a fixed convention, configurable per node, or derived from the mapping? (Deferred to implementation.)
- **Array/list support**: The ICM sample contains `<ListOfDtormInstance>` with repeating child elements. Loop/iteration support in bindings is explicitly out of scope for this ticket but should be tracked as a follow-on feature.
- **File/blob inputs**: Future enhancement to allow a prior node's file output (e.g., a PDF or image blob) to be referenced in a mapping.
- **Template file formats**: Currently JSON mapping only. Future consideration: support YAML mapping format.
