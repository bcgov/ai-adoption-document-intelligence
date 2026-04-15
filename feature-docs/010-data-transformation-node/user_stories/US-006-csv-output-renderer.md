# US-006: Implement CSV Output Renderer

**As a** developer building the transformation engine,
**I want to** serialize a resolved field mapping to a valid CSV string when `outputFormat` is `"csv"`,
**So that** downstream nodes receive a well-formed CSV payload.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: Top-level mapping keys become CSV column headers
    - **Given** a resolved mapping `{ "FirstName": "Alice", "CaseID": "123" }` and `outputFormat` is `"csv"`
    - **When** the CSV renderer runs
    - **Then** the first row of the output is `FirstName,CaseID` (or equivalent header row)

- [ ] **Scenario 2**: Resolved values form the data row
    - **Given** the same resolved mapping
    - **When** the CSV renderer runs
    - **Then** the second row of the output is `Alice,123` matching the column order

- [ ] **Scenario 3**: Values containing commas or quotes are properly escaped
    - **Given** a resolved mapping where a value contains a comma (e.g., `"Name": "Smith, Alice"`) or a double-quote
    - **When** the CSV renderer runs
    - **Then** the value is quoted and/or escaped according to RFC 4180 CSV rules

- [ ] **Scenario 4**: Output is parseable by a standard CSV parser
    - **Given** any valid resolved mapping
    - **When** the CSV renderer produces output
    - **Then** the output string can be parsed without error by a standard CSV parser

- [ ] **Scenario 5**: Rendering failure throws structured error
    - **Given** the resolved mapping cannot be serialized to CSV (e.g., a value is a complex nested object not reduced by iteration)
    - **When** the CSV renderer runs
    - **Then** it throws a structured error with diagnostic detail sufficient to diagnose the failure

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- For a single-row (non-iterated) mapping, the CSV output is always two rows: headers + one data row.
- Iteration blocks (US-008) add additional data rows for array inputs.
- Use the `csv` umbrella package (`csv-stringify/sync`) for serialization — the same umbrella already provides `csv-parse/sync` for input parsing, so no additional dependency is needed.
- Nested objects in mapping values that are not arrays should be serialized as JSON strings within the CSV cell, or throw an error — the implementer should choose and document.
- Unit tests should cover flat, comma-containing, quoted, and error cases.
