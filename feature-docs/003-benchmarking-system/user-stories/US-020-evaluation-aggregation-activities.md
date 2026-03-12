# US-020: Evaluation & Aggregation Activities

**As a** developer,
**I want to** have Temporal activities for per-sample evaluation and cross-sample aggregation,
**So that** the benchmark workflow can evaluate predictions against ground truth and compute overall metrics.

## Acceptance Criteria
- [ ] **Scenario 1**: Evaluate a single sample
    - **Given** prediction file paths, ground truth file paths, and evaluator configuration
    - **When** the `benchmark.evaluate` activity is executed
    - **Then** the evaluator registry resolves the configured evaluator by type, the evaluator's `evaluate()` method is called with a properly constructed `EvaluationInput`, and the `EvaluationResult` is returned

- [ ] **Scenario 2**: Evaluator type is resolved from registry
    - **Given** the benchmark definition specifies `evaluatorType: "schema-aware"`
    - **When** the evaluate activity runs
    - **Then** the schema-aware evaluator is retrieved from the evaluator registry and used for evaluation

- [ ] **Scenario 3**: Evaluation handles missing prediction files
    - **Given** the workflow failed to produce output for a sample
    - **When** the evaluate activity runs
    - **Then** the evaluation result indicates failure with appropriate diagnostics (e.g., "no prediction output") and `pass: false`

- [ ] **Scenario 4**: Aggregate metrics across all samples
    - **Given** an array of `EvaluationResult` objects from all evaluated samples
    - **When** the `benchmark.aggregate` activity is executed
    - **Then** the aggregation module (US-017) computes dataset-level metrics (mean, median, std, percentiles), top-N worst samples, per-field breakdown, and error clusters, returning the complete aggregated result

- [ ] **Scenario 5**: Aggregation includes sample metadata for slicing
    - **Given** samples have metadata from the manifest
    - **When** the aggregate activity runs
    - **Then** the aggregation includes per-metadata-dimension breakdowns alongside the overall metrics

- [ ] **Scenario 6**: Evaluation artifacts are collected
    - **Given** the evaluator produces artifacts (diff reports, etc.)
    - **When** the evaluate activity completes
    - **Then** the evaluation artifacts are returned in `EvaluationResult.artifacts` for subsequent storage per the artifact policy

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/activities/benchmark-evaluate.ts`
- Activity types: `benchmark.evaluate` and `benchmark.aggregate`
- `benchmark.evaluate` runs per-sample (called once per document in the fan-out)
- `benchmark.aggregate` runs once after all samples are evaluated
- Evaluator registry on the temporal side mirrors the backend registry pattern
- Uses the aggregation module from US-017
- See Requirements Section 5.1 (Evaluator Interface), Section 11.4 (Temporal Activities)
- Tests: `apps/temporal/src/activities/benchmark-evaluate.test.ts`
