# US-002: Implement Input Format Parsers

**As a** developer building the transformation engine,
**I want to** parse an upstream node's string output into an intermediate JSON representation based on the configured input format,
**So that** binding expressions can be resolved against a uniform in-memory structure regardless of the input format.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [x] **Scenario 1**: JSON input parsed to intermediate object
    - **Given** an input string that is valid JSON and `inputFormat` is `"json"`
    - **When** the input parser runs
    - **Then** the result is a JavaScript object equivalent to `JSON.parse(inputString)`

- [x] **Scenario 2**: XML input parsed to intermediate object
    - **Given** an input string that is valid XML and `inputFormat` is `"xml"`
    - **When** the input parser runs
    - **Then** the result is a JavaScript object where element names map to keys and element text content maps to values, preserving nesting

- [x] **Scenario 3**: CSV input parsed to intermediate object
    - **Given** an input string that is valid CSV (first row is headers) and `inputFormat` is `"csv"`
    - **When** the input parser runs
    - **Then** the result is an array of JavaScript objects where each object's keys are the header columns and values are the row values

- [x] **Scenario 4**: Malformed input string throws structured error
    - **Given** an input string that does not conform to the specified `inputFormat` (e.g., invalid JSON, malformed XML)
    - **When** the input parser runs
    - **Then** it throws a structured error that identifies the input format and includes the parser error detail

- [x] **Scenario 5**: Empty input string throws structured error
    - **Given** an empty string as the input
    - **When** the input parser runs
    - **Then** it throws a structured error indicating the input was empty or unparseable

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The parser logic lives in the temporal worker app (e.g., `apps/temporal/src/activities/data-transform/`).
- XML parsing should produce a plain JavaScript object compatible with the binding resolver (US-003). A library such as `fast-xml-parser` is recommended.
- CSV parsing should treat the first row as headers. A library such as `csv-parse` (sync mode) is suitable.
- The intermediate representation is an in-memory JavaScript value; it is never persisted.
- Unit tests should cover all three format paths plus the error paths.
