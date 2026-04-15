# US-004: Implement JSON Output Renderer

**As a** developer building the transformation engine,
**I want to** serialize a resolved field mapping to a valid JSON string when `outputFormat` is `"json"`,
**So that** downstream nodes receive a well-formed JSON payload.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [x] **Scenario 1**: Flat resolved mapping serializes to valid JSON object
    - **Given** a resolved mapping `{ "FirstName": "Alice", "CaseID": "123" }` and `outputFormat` is `"json"`
    - **When** the JSON renderer runs
    - **Then** the output is a valid JSON string that `JSON.parse()` can parse back to the same object

- [x] **Scenario 2**: Nested mapping objects serialize to nested JSON
    - **Given** a resolved mapping with nested objects (e.g., `{ "Person": { "Name": "Alice", "Age": 30 } }`)
    - **When** the JSON renderer runs
    - **Then** the output is a valid JSON string preserving the nested structure

- [x] **Scenario 3**: Array values in mapping serialize correctly
    - **Given** a resolved mapping that includes an array value (produced by iteration blocks from US-008)
    - **When** the JSON renderer runs
    - **Then** the output is a valid JSON string with the array correctly serialized

- [x] **Scenario 4**: Rendering failure throws structured error
    - **Given** the resolved mapping contains a value that cannot be JSON-serialized (e.g., circular reference)
    - **When** the JSON renderer runs
    - **Then** it throws a structured error with diagnostic detail sufficient to diagnose the failure

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The JSON renderer is a thin wrapper around `JSON.stringify()` with error catching.
- The output is a plain string, not a Buffer or stream.
- This story depends on US-003 (binding resolver) providing the resolved mapping object as input.
- Unit tests should cover flat, nested, array-valued, and error cases.
