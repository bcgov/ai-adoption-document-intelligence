# US-007: Implement XML Envelope Template Injection

**As a** developer building the transformation engine,
**I want to** inject the rendered XML inner payload into a configurable XML envelope template,
**So that** the transform node can produce a complete SOAP or XML envelope required by downstream integrations.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: Envelope with {{payload}} placeholder receives inner XML
    - **Given** an envelope template containing `{{payload}}` and a rendered inner XML string
    - **When** the envelope injector runs
    - **Then** the output is the envelope template with `{{payload}}` replaced by the inner XML string

- [ ] **Scenario 2**: No envelope configured produces inner XML with root element only
    - **Given** `xmlEnvelope` is `undefined` or empty string on the node config
    - **When** the XML output is produced
    - **Then** the output is the inner XML wrapped only in the default root element (as produced by US-005)

- [ ] **Scenario 3**: Envelope missing {{payload}} placeholder throws structured error
    - **Given** an envelope template that does not contain `{{payload}}`
    - **When** the envelope injector runs
    - **Then** it throws a structured configuration error indicating the missing placeholder

- [ ] **Scenario 4**: Resulting output is valid XML
    - **Given** a valid envelope template with `{{payload}}` and valid inner XML
    - **When** the envelope injector runs
    - **Then** the final output string is parseable by a standard XML parser

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Envelope injection is a simple string substitution of `{{payload}}` with the rendered inner XML.
- This story depends on US-005 (XML output renderer) providing the inner XML string.
- Only the first occurrence of `{{payload}}` need be replaced; having multiple occurrences is treated as a configuration error (Scenario 3 should check for exactly one occurrence, implementer discretion).
- The envelope template is not validated as XML before substitution; the combined output validity is checked as part of US-010 (malformed output handling).
- Unit tests should cover: envelope with placeholder, no envelope, missing placeholder.
