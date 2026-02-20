# US-014: Evaluator Interface & Registry

**As a** developer,
**I want to** have a pluggable evaluator interface and a registry service for evaluator types,
**So that** evaluators can be registered, discovered, and invoked by type string in a consistent manner.

## Acceptance Criteria
- [ ] **Scenario 1**: BenchmarkEvaluator interface is defined
    - **Given** the evaluator specification in Section 5.1
    - **When** the TypeScript interfaces are created
    - **Then** a `BenchmarkEvaluator` interface exists with `type: string` and `evaluate(input: EvaluationInput): Promise<EvaluationResult>` method

- [ ] **Scenario 2**: EvaluationInput interface is defined
    - **Given** the evaluation input specification in Section 5.1
    - **When** the TypeScript interfaces are created
    - **Then** an `EvaluationInput` interface exists with `sampleId` (string), `inputPaths` (string[]), `predictionPaths` (string[]), `groundTruthPaths` (string[]), `metadata` (Record<string, unknown>), and `evaluatorConfig` (Record<string, unknown>)

- [ ] **Scenario 3**: EvaluationResult interface is defined
    - **Given** the evaluation result specification in Section 5.1
    - **When** the TypeScript interfaces are created
    - **Then** an `EvaluationResult` interface exists with `sampleId` (string), `metrics` (Record<string, number>), `diagnostics` (Record<string, unknown>), `artifacts` (EvaluationArtifact[], optional), and `pass` (boolean)

- [ ] **Scenario 4**: EvaluatorRegistryService registers evaluators by type
    - **Given** evaluator implementations exist
    - **When** `register(evaluator: BenchmarkEvaluator)` is called
    - **Then** the evaluator is stored in the registry keyed by its `type` string

- [ ] **Scenario 5**: EvaluatorRegistryService resolves evaluators by type
    - **Given** evaluators have been registered
    - **When** `getEvaluator(type: string)` is called with a registered type
    - **Then** the corresponding evaluator instance is returned

- [ ] **Scenario 6**: Unknown evaluator type throws error
    - **Given** evaluators have been registered
    - **When** `getEvaluator(type: string)` is called with an unregistered type
    - **Then** an error is thrown indicating the evaluator type is not registered

- [ ] **Scenario 7**: List available evaluator types
    - **Given** evaluators have been registered
    - **When** `getAvailableTypes()` is called
    - **Then** an array of registered evaluator type strings is returned

- [ ] **Scenario 8**: Interfaces are duplicated in Temporal package
    - **Given** the monorepo has no shared import path between backend and temporal
    - **When** the interfaces are created
    - **Then** identical `BenchmarkEvaluator`, `EvaluationInput`, `EvaluationResult`, and `EvaluationArtifact` interfaces exist in both `apps/backend-services/src/benchmark/` and `apps/temporal/src/benchmark-types.ts`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Backend file: `apps/backend-services/src/benchmark/evaluator-registry.service.ts`
- Temporal types file: `apps/temporal/src/benchmark-types.ts`
- Mirrors the existing Activity Registry pattern (`apps/temporal/src/activity-registry.ts`)
- Uses file paths in EvaluationInput (not in-memory objects) to enable future external evaluator support
- Evaluators are registered at startup (module initialization)
- See Requirements Section 5.1 (Pluggable Evaluator Interface), Section 13.2 (Evaluator Registry Pattern)
- Tests: `apps/backend-services/src/benchmark/evaluator-registry.service.spec.ts`
