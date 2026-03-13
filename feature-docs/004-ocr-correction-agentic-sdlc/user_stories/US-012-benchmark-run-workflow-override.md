# US-012: Benchmark run start with optional workflow override

**As a** pipeline or automation,
**I want to** start a benchmark run for a given definition with an optional workflow override (workflow id) so the run uses that workflow’s config while still belonging to the same definition,
**So that** baseline comparison applies (same definitionId, baseline run vs candidate run) without creating a new definition.

## Acceptance Criteria
- [ ] **Scenario 1**: Optional override accepted
    - **Given** a benchmark definition id and an optional workflow override id
    - **When** a run is started (via API or Temporal workflow input)
    - **Then** if override is provided, the run executes using that workflow’s config; if not, the run uses the definition’s default workflow as today

- [ ] **Scenario 2**: Same definitionId
    - **Given** a run started with a workflow override
    - **When** the run is stored and later compared to baseline
    - **Then** the run has the same definitionId as the definition; baseline comparison finds the baseline run for that definition and compares metrics

- [ ] **Scenario 3**: Resolved config passed to benchmark workflow
    - **Given** the override workflow id (or definition default)
    - **When** the benchmark run workflow is started
    - **Then** the resolved workflow config (and its hash) is passed into the benchmark workflow input so execution uses the correct graph

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Step 4; requirements Section 6 (workflow versioning). Current code: benchmark-run.service and benchmark-temporal.service pass definition.workflowId and workflowConfigHash; they do not pass full workflowConfig. Implementation may need to load workflow config by id (or override id) and pass it into the Temporal workflow args.
