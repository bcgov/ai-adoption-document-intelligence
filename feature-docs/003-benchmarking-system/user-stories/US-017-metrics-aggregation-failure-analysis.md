# US-017: Metrics Aggregation & Failure Analysis

**As a** user,
**I want to** see aggregated dataset-level metrics and failure analysis from per-sample evaluation results,
**So that** I can understand overall benchmark performance and identify the worst-performing samples.

## Acceptance Criteria
- [ ] **Scenario 1**: Compute dataset-level aggregate metrics
    - **Given** per-sample EvaluationResult records for all samples in a benchmark run
    - **When** aggregation is performed
    - **Then** dataset-level metrics are computed including mean, median, standard deviation, and percentiles (p5, p25, p75, p95) for each metric across all samples

- [ ] **Scenario 2**: Top-N worst-performing samples
    - **Given** per-sample evaluation results with metrics
    - **When** failure analysis is performed with a configurable N and metric name
    - **Then** the N samples with the lowest scores on the specified metric are identified and returned with their sample IDs, metrics, and diagnostics

- [ ] **Scenario 3**: Per-field error breakdown
    - **Given** the schema-aware evaluator was used and per-sample diagnostics include per-field results
    - **When** failure analysis is performed
    - **Then** an aggregated per-field error breakdown is produced showing which fields have the highest error rates, lowest F1, or most frequent mismatches

- [ ] **Scenario 4**: Error clustering tags
    - **Given** per-sample evaluation results with diagnostics
    - **When** failure analysis is performed
    - **Then** failures are grouped by error type/pattern (e.g., "missing_field", "type_mismatch", "value_mismatch", "extra_field") and counts are produced for each error cluster

- [ ] **Scenario 5**: Aggregated metrics stored in BenchmarkRun
    - **Given** aggregation has completed
    - **When** the results are persisted
    - **Then** the aggregated metrics object is stored in `BenchmarkRun.metrics` in Postgres

- [ ] **Scenario 6**: Slicing by metadata dimensions
    - **Given** samples have metadata fields (docType, language, pageCount, source)
    - **When** aggregation is performed with slicing enabled
    - **Then** metrics are computed per unique value of each metadata dimension in addition to the overall aggregate

- [ ] **Scenario 7**: Handle empty results gracefully
    - **Given** a benchmark run where all samples failed to produce output
    - **When** aggregation is attempted
    - **Then** the aggregation completes without error, reporting zero-value metrics and listing all samples as failures

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/benchmark-aggregation.ts`
- Used by the `benchmark.aggregate` activity (US-020) during workflow execution
- Aggregation operates on an array of `EvaluationResult` objects
- Standard deviation and percentile computation using simple statistical formulas (no external stats library required)
- See Requirements Section 5.4 (Aggregation) and Section 5.5 (Failure Analysis)
- Tests: `apps/temporal/src/benchmark-aggregation.test.ts`
