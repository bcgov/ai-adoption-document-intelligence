# Feature: Data Transformation Node

## Overview

Add a general-purpose **Data Transformation** workflow node to the graph-based workflow engine. The node accepts a user-defined field-mapping configuration and renders it into a target format (JSON, XML, or CSV) by substituting values from upstream node outputs. Its design is format-agnostic and not tied to any specific integration (e.g., ICM/MySS).

The primary driver for this feature is enabling conversion of OCR-extracted JSON output into structured XML payloads required by downstream SOAP-based integrations, but the node must remain generic enough to serve any transformation workload.

---

## Goals

- Provide a reusable workflow node that transforms data from one format to another.
- Allow admins to define field mappings without writing code.
- Fail loudly on unresolved bindings or malformed output to prevent silent data corruption.
- Support repeating/list structures in output via iteration syntax.

## Out of Scope

- Output schema validation (e.g., XSD, JSON Schema).
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

### FR-2: Input and Output Format Selection

- The node must support exactly three formats for both input and output:
  - `JSON`
  - `XML`
  - `CSV`
- The admin selects the **input format** and the **output format** independently at configuration time via dropdowns or equivalent UI controls.
- Both selections are stored as part of the node's configuration and do not change at runtime.
- The input format tells the node how to parse the upstream node's output string. Internally, the node normalises all input formats to an intermediate JSON representation before applying the field mapping. This is an implementation detail transparent to the admin.
- The output format tells the node what format to render the resolved mapping into after the JSON-based mapping is applied.

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
- The admin can **export/download** the current mapping as a `.json` file from the node UI.
- The current mapping is always visible in the text editor when the node is opened.

### FR-4: Binding Syntax

- Bindings use double-curly-brace syntax: `{{nodeName.field.path}}`.
- Paths are period-separated and support arbitrary nesting depth (e.g., `{{nodeName.payload.header.userId}}`).
- `nodeName` uniquely identifies a prior node in the workflow. The identifier must correspond to the Temporal activity/node identifier used in the workflow engine.
- Bindings can reference the immediate predecessor node or any earlier node in the graph.
- Binding resolution is performed at workflow execution time, not at configuration time.

### FR-5: Template Rendering

- At execution time, the node executes a two-step pipeline:
  1. **Parse**: The upstream node's output string is parsed into an intermediate JSON structure according to the configured input format.
  2. **Render**: Binding expressions in the mapping are resolved against the intermediate JSON, and the result is serialised into the configured output format.
- The two-step approach is an internal implementation detail; the admin sees only input format and output format selectors.
- It then renders the resolved mapping into the selected output format:
  - **XML**: Each top-level key becomes a child element. Nested mappings produce nested elements. If an **envelope template** is configured (see FR-5a), the rendered payload is injected into the envelope at the designated insertion point.
  - **JSON**: The resolved mapping is serialized as a JSON object.
  - **CSV**: Top-level keys become column headers; resolved values form a single data row.
- The output is a **plain text string** in the target format, passed as the node's output to the next node in the workflow.

### FR-5a: XML Envelope (Optional)

- When the output format is **XML**, the node may optionally be configured with an **envelope template** — a plain-text XML string that wraps the rendered payload.
- The envelope template may contain a single binding placeholder (e.g., `{{payload}}`) that marks where the rendered inner XML will be inserted.
- The envelope template is provided via the node UI: a separate plain-text editor field labelled clearly as "XML Envelope (optional)".
- The admin can upload an XML file to populate the envelope template, or type/paste it directly.
- The admin can export/download the current envelope template as an XML file.
- If no envelope is provided, the node outputs the inner payload only, with a single root element wrapping it (root element name is configurable or follows a default convention determined by the implementer).
- The envelope is stored as part of the node's configuration alongside the mapping.

### FR-5b: Repeating Elements (Arrays)

- The mapping and binding syntax must support iteration over arrays in the input data.
- An iteration block is defined in the mapping using a `{{#each arrayPath}}` key, where `arrayPath` is a period-separated path to an array value in an upstream node's output. The block's scope is the value of that key — no closing marker is needed.
- Within an iteration block, `{{this.fieldName}}` (or `{{fieldName}}` shorthand) refers to fields on the current array element.
- Example:
  ```json
  {
    "ListOfItems": {
      "{{#each extractionNode.items}}": {
        "Item": {
          "Name": "{{this.name}}",
          "Value": "{{this.value}}"
        }
      }
    }
  }
  ```
- For XML output, each iteration produces a repeated child element.
- For CSV output, each iteration produces an additional data row.
- For JSON output, each iteration adds an entry to an array.
- If the resolved array is empty, the iteration block produces no output (no error).
- **CSV mapping shape constraint**: For CSV output, a mapping must contain either (a) exactly one iteration block and no other top-level keys, or (b) only flat top-level keys. Any other shape is a configuration error that is thrown at render time — it is not silently dropped. Specifically:
  - A mapping with one iteration block **and** additional flat keys will throw an error listing the keys that would have been dropped.
  - A mapping with two or more iteration blocks will throw an error identifying all iteration keys.
  - JSON and XML output have no such restriction because both formats can natively represent mixed, nested, and multi-iteration shapes.

### FR-6: Missing Field Handling

- If a binding expression cannot be resolved (the referenced field does not exist in the upstream node's output), the node must:
  1. **Throw an error** and halt the workflow at that node.
  2. **Record the error** in the workflow execution log identifying the unresolved binding path.
  3. **Set an error badge** on the node in the workflow UI indicating the failure.

### FR-7: Malformed Output Handling

- If the rendering process produces output that is structurally invalid for the chosen format (e.g., invalid XML, malformed JSON), the node must:
  1. **Throw an error** and halt the workflow at that node.
  2. **Record the error** in the workflow execution log with sufficient detail to diagnose the problem.
- "Malformed" means the output cannot be parsed by a standard parser for that format.

### FR-8: Node UI — Summary View

- When a configured node is viewed in the workflow builder (not in edit mode), it must display:
  - The selected input and output formats.
  - A read-only preview of the current mapping (or a truncated summary if the mapping is large).
  - An error badge if the last execution failed due to unresolved bindings or malformed output.

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

- **Root element name for XML output (no envelope)**: Should the default root element name be a fixed convention, configurable per node, or derived from the mapping? (Deferred to implementation.)
- **File/blob inputs**: Future enhancement to allow a prior node's file output (e.g., a PDF or image blob) to be referenced in a mapping.
- **Template file formats**: Currently JSON mapping only. Future consideration: support YAML mapping format.
