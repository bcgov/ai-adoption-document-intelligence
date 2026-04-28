# US-010: Malformed Output Error Handling

**As a** workflow admin,
**I want to** have the transformation node halt the workflow and log a diagnostic error when the rendered output is structurally invalid for the chosen format,
**So that** malformed data is never silently passed to downstream nodes.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [x] **Scenario 1**: Invalid XML output halts the workflow
    - **Given** the transform node renders an XML output string that fails XML parsing
    - **When** the output validation step runs
    - **Then** a non-retryable `ApplicationFailure` is thrown, halting the workflow, with the output format (`xml`) and parser error detail in the message

- [x] **Scenario 2**: Malformed JSON output halts the workflow
    - **Given** the transform node renders a JSON output string that fails `JSON.parse()`
    - **When** the output validation step runs
    - **Then** a non-retryable `ApplicationFailure` is thrown, halting the workflow, with the output format (`json`) and parser error detail in the message

- [x] **Scenario 3**: Malformed CSV output halts the workflow
    - **Given** the transform node renders a CSV output string that fails standard CSV parsing
    - **When** the output validation step runs
    - **Then** a non-retryable `ApplicationFailure` is thrown, halting the workflow, with the output format (`csv`) and parser error detail in the message

- [x] **Scenario 4**: Error is recorded with diagnostic detail in the execution log
    - **Given** any of the above malformed output scenarios
    - **When** the workflow halts
    - **Then** the Temporal workflow execution history contains a failure event with the format type and sufficient detail to identify the malformed section

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- Output validation runs after rendering is complete (post-render validation), by attempting to re-parse the rendered string with a standard parser for that format.
- The error should use `ApplicationFailure.create({ type: "TRANSFORM_OUTPUT_ERROR", nonRetryable: true, message: ... })`.
- This validation step acts as a safety net even when the individual renderers (US-004, US-005, US-006) catch their own errors, because the envelope injection (US-007) or iteration resolution (US-008) could introduce structural issues not caught during rendering.
- Unit tests should cover each format's malformed output scenario.
