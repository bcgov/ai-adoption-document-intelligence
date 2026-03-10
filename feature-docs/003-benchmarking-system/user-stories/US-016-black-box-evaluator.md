# US-016: Black-Box Evaluator

**As a** user,
**I want to** evaluate workflow outputs using opaque comparison (JSON deep-equal with diff),
**So that** I can benchmark workflows where ground truth schema is not formalized or when comparing arbitrary output formats.

## Acceptance Criteria
- [ ] **Scenario 1**: JSON deep-equal comparison
    - **Given** a workflow output JSON file and a ground truth JSON file
    - **When** the black-box evaluator runs
    - **Then** the files are compared using deep equality, and the result indicates whether they match exactly

- [ ] **Scenario 2**: Diff output for mismatches
    - **Given** the prediction and ground truth JSON files differ
    - **When** the evaluation completes
    - **Then** a structured diff is generated showing the specific fields/values that differ, and this diff is included in `EvaluationResult.diagnostics`

- [ ] **Scenario 3**: Diff artifact is generated
    - **Given** the prediction and ground truth differ
    - **When** the evaluation completes
    - **Then** an `EvaluationArtifact` is generated containing the full diff report for storage

- [ ] **Scenario 4**: Emit match metric
    - **Given** a comparison is performed
    - **When** the evaluation completes
    - **Then** `EvaluationResult.metrics` includes an `exact_match` metric (1.0 for match, 0.0 for mismatch)

- [ ] **Scenario 5**: Emit similarity metric
    - **Given** the prediction and ground truth are JSON objects
    - **When** the evaluation completes
    - **Then** `EvaluationResult.metrics` includes a `field_overlap` metric representing the fraction of matching fields/values

- [ ] **Scenario 6**: Pass/fail based on exact match
    - **Given** the black-box evaluator runs
    - **When** the evaluation completes
    - **Then** `EvaluationResult.pass` is `true` if the outputs match exactly, `false` otherwise

- [ ] **Scenario 7**: Handle non-JSON output formats gracefully
    - **Given** output files are not valid JSON
    - **When** the black-box evaluator runs
    - **Then** a byte-level comparison is performed, and the result indicates match/mismatch without crashing

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/evaluators/black-box-evaluator.ts`
- Implements the `BenchmarkEvaluator` interface from `apps/temporal/src/benchmark-types.ts`
- Evaluator type string: `"black-box"`
- Treats outputs as opaque -- no schema knowledge required
- JSON diff can use a library like `deep-diff` or `json-diff`
- See Requirements Section 5.3 (Black-Box Evaluators)
- Tests: `apps/temporal/src/evaluators/black-box-evaluator.test.ts`
