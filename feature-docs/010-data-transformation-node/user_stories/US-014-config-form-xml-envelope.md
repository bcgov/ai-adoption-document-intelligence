# US-014: Node Configuration Form — XML Envelope Editor

**As an** admin,
**I want to** configure an optional XML envelope template in the transform node configuration form when XML output is selected,
**So that** I can wrap the rendered XML payload in a caller-defined envelope structure (e.g., SOAP wrapper).

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: XML envelope editor is only visible when output format is XML
    - **Given** the admin is configuring a transform node
    - **When** the selected `outputFormat` is NOT `"xml"`
    - **Then** the XML envelope editor section is hidden; when `outputFormat` IS `"xml"`, the section is visible

- [ ] **Scenario 2**: Admin can type or paste an envelope template
    - **Given** the XML envelope editor is visible
    - **When** the admin types or pastes an XML envelope template into the text area
    - **Then** the value is saved to the node's `xmlEnvelope` field and persists when the panel is reopened

- [ ] **Scenario 3**: Admin can upload an XML file to populate the envelope template
    - **Given** the admin clicks "Upload envelope" and selects a `.xml` file
    - **When** the file is loaded
    - **Then** the envelope text area is populated with the file's content and `xmlEnvelope` is updated accordingly

- [ ] **Scenario 4**: Admin can export/download the current envelope as an .xml file
    - **Given** the admin has a non-empty `xmlEnvelope` in the text area
    - **When** they click "Download envelope"
    - **Then** the browser downloads a file named `envelope.xml` containing the current text area content

## Priority
- [x] Medium (Should Have)

## Technical Notes / Assumptions
- The XML envelope editor is part of the `TransformNodeForm` component (from US-013), conditionally rendered when `outputFormat === "xml"`.
- Use a Mantine `Textarea` labelled "XML Envelope (optional)" with a description explaining the `{{payload}}` placeholder.
- File upload and download follow the same pattern as the mapping editor (US-013).
- Clearing the text area (empty string) should set `xmlEnvelope` to `undefined` on the node config.
- This story depends on US-013 (the form component scaffold).
