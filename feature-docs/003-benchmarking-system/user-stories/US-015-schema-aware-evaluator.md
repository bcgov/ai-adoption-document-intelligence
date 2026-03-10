# US-015: Schema-Aware Evaluator

**As a** user,
**I want to** evaluate workflow outputs against structured ground truth using field-level comparison,
**So that** I can measure extraction accuracy with precision, recall, and F1 metrics per field.

## Acceptance Criteria
- [ ] **Scenario 1**: Compare flat JSON key-value outputs
    - **Given** a workflow output JSON file and a ground truth JSON file with flat key-value pairs
    - **When** the schema-aware evaluator runs
    - **Then** each field in the ground truth is compared against the corresponding field in the prediction, producing per-field match results

- [ ] **Scenario 2**: Compute per-field precision, recall, and F1
    - **Given** a set of predictions and ground truth fields
    - **When** the evaluation completes for a sample
    - **Then** the metrics include per-field `precision`, `recall`, and `F1` scores, plus overall (macro-averaged) precision, recall, and F1

- [ ] **Scenario 3**: Exact match comparison
    - **Given** evaluator config specifies `matchingRule: "exact"` for a field
    - **When** the field values are compared
    - **Then** the field is marked as a match only if the prediction value exactly equals the ground truth value (case-sensitive string comparison)

- [ ] **Scenario 4**: Fuzzy match comparison
    - **Given** evaluator config specifies `matchingRule: "fuzzy"` with a similarity threshold
    - **When** the field values are compared
    - **Then** the field is marked as a match if the Levenshtein similarity between prediction and ground truth exceeds the configured threshold

- [ ] **Scenario 5**: Numeric tolerance comparison
    - **Given** evaluator config specifies `matchingRule: "numeric"` with an absolute or relative tolerance
    - **When** numeric field values are compared
    - **Then** the field is marked as a match if the numeric difference is within the configured tolerance, and metrics include absolute and relative error

- [ ] **Scenario 6**: Date format normalization
    - **Given** evaluator config specifies `matchingRule: "date"` with accepted date formats
    - **When** date field values are compared
    - **Then** both values are normalized to a canonical date format before comparison

- [ ] **Scenario 7**: Boolean/checkbox accuracy
    - **Given** ground truth contains boolean checkbox fields
    - **When** boolean field values are compared
    - **Then** checkbox accuracy is computed as the fraction of correctly predicted boolean fields

- [ ] **Scenario 8**: Missing fields in prediction are counted
    - **Given** the ground truth has fields that are absent from the prediction
    - **When** the evaluation completes
    - **Then** missing fields reduce recall and are listed in the diagnostics

- [ ] **Scenario 9**: Extra fields in prediction are counted
    - **Given** the prediction has fields that are absent from the ground truth
    - **When** the evaluation completes
    - **Then** extra fields reduce precision and are listed in the diagnostics

- [ ] **Scenario 10**: Pass/fail determination
    - **Given** evaluator config includes threshold values for pass/fail
    - **When** the evaluation completes
    - **Then** `EvaluationResult.pass` is `true` if overall F1 meets the configured threshold, `false` otherwise

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/evaluators/schema-aware-evaluator.ts`
- Implements the `BenchmarkEvaluator` interface from `apps/temporal/src/benchmark-types.ts`
- Evaluator type string: `"schema-aware"`
- Phase 1 focuses on flat JSON key-value comparison (matching the example ground truth format in Section 3.5)
- Table-level comparison (row matching, cell accuracy) is deferred to future phases
- Matching rules are configurable per-field via `evaluatorConfig`
- See Requirements Section 5.2 (Schema-Aware Evaluators)
- Tests: `apps/temporal/src/evaluators/schema-aware-evaluator.test.ts`
