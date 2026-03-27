# US-014: Add or register OCR correction evaluator (if needed)

**As a** benchmark consumer,
**I want to** use an evaluator that emits metrics suitable for OCR correction quality (e.g. character-level or field-level accuracy) when existing evaluators do not,
**So that** baseline comparison and regression detection are meaningful for correction workflows.

## Acceptance Criteria
- [ ] **Scenario 1**: Evaluate need
    - **Given** existing evaluators (schema-aware, black-box, field-accuracy)
    - **When** OCR correction workflows are benchmarked
    - **Then** if existing evaluators already emit suitable metrics, no new evaluator is required; otherwise a new evaluator type is implemented and registered

- [ ] **Scenario 2**: New evaluator implements interface
    - **Given** a new evaluator is needed
    - **When** it is implemented
    - **Then** it implements BenchmarkEvaluator (type, evaluate(input): Promise<EvaluationResult>), is registered in the benchmark module (e.g. onModuleInit), and the definition’s evaluatorType can reference it

- [ ] **Scenario 3**: Documented
    - **Given** the evaluator type and its evaluatorConfig
    - **When** a user creates or updates a benchmark definition
    - **Then** the evaluator type and config schema are documented in `/docs`

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Step 4; requirements Section 6 and Section 10. Reference: apps/backend-services/src/benchmark/evaluator.interface.ts, evaluator-registry.service.ts, benchmark.module.ts.
