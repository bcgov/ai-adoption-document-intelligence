# US-005: Implement XML Output Renderer

**As a** developer building the transformation engine,
**I want to** serialize a resolved field mapping to a valid XML string (without envelope) when `outputFormat` is `"xml"`,
**So that** downstream nodes receive a well-formed XML payload that can be further wrapped or submitted directly.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [x] **Scenario 1**: Top-level mapping keys become child elements of a root element
    - **Given** a resolved mapping `{ "FirstName": "Alice", "CaseID": "123" }` and `outputFormat` is `"xml"`
    - **When** the XML renderer runs without an envelope
    - **Then** the output contains `<FirstName>Alice</FirstName>` and `<CaseID>123</CaseID>` as children of a root element

- [x] **Scenario 2**: Nested mapping objects produce nested XML elements
    - **Given** a resolved mapping with a nested object `{ "Person": { "Name": "Alice" } }`
    - **When** the XML renderer runs
    - **Then** the output contains `<Person><Name>Alice</Name></Person>` preserving the nesting

- [x] **Scenario 3**: Output includes a configurable or default root element
    - **Given** no envelope is configured and the node has no explicit root element name set
    - **When** the XML renderer runs
    - **Then** the output is wrapped in a root element (implementer may choose a default name such as `<Root>`)

- [x] **Scenario 4**: Output is parseable by a standard XML parser
    - **Given** any valid resolved mapping
    - **When** the XML renderer produces output
    - **Then** the output string can be parsed without error by a standard XML parser

- [x] **Scenario 5**: Rendering failure throws structured error
    - **Given** the resolved mapping contains a value that prevents valid XML generation (e.g., a key containing characters illegal in XML element names)
    - **When** the XML renderer runs
    - **Then** it throws a structured error with diagnostic detail sufficient to diagnose the failure

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The XML renderer does not apply an envelope; that is handled separately in US-007.
- A library such as `fast-xml-parser` (builder mode) or `xmlbuilder2` is recommended.
- The default root element name convention is left to the implementer (e.g., `<Root>` or `<Payload>`); it may be made configurable per the open question in the requirements.
- Element name validity (XML naming rules) should be checked; invalid names should result in a structured error.
- Unit tests should cover flat, nested, special-character, and error cases.
