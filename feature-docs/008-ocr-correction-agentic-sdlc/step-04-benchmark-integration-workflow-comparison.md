# Step 4: Integrate with benchmarking system (workflow comparison)

**Parent:** [OCR Correction and Agentic SDLC Requirements](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) — Section 6  
**Implementation order:** 4  
**Depends on:** Existing benchmarking system (feature 003). No new benchmark implementation required.

---

## Goal

Use the existing benchmarking system to run the candidate workflow (e.g. current workflow + AI-suggested correction nodes) on the same benchmark dataset as the "current" workflow and obtain a pass/fail (degradation yes/no) result from the baseline comparison.

## Concepts (existing system)

- **Current workflow** is represented by a **baseline run** in the benchmarking system (a promoted run for a benchmark definition that uses the current workflow and a fixed benchmark dataset).
- **Workflow versioning:** The "current" workflow is a designated workflow (by id or by name + active version). A **candidate** is produced by applying the Step 3 recommendation and is persisted as a **new version** (e.g. new `Workflow` record). Benchmark runs SHALL use the **same** definition for both baseline and candidate: the run-start path (API or Temporal) accepts an optional **workflow override** (workflow id) so the run executes with the candidate config while still belonging to the same definition; baseline comparison then compares runs within the same definition.
- **Candidate workflow** is produced by the **workflow modification utility** (see below) from the current graph config and the Step 3 AI recommendation. The utility outputs (and optionally persists) a new graph config with the suggested nodes inserted and edges/ports wired.
- **Workflow modification utility:** A component that takes (current graph config, AI recommendation) and returns a new graph config. **Challenges:** the graph is a DAG; inserting a node requires choosing an edge to split, removing it, adding the new node, and wiring two new edges with correct port bindings; `ctx` may need updates. The utility SHALL be implemented with documented constraints (e.g. supported insertion points or recommendation shapes); no placeholders. Scope may be limited in the first iteration (e.g. a defined set of insertion points).
  - **Chained inserts (same segment):** When multiple tools are inserted between the same logical pair of nodes (e.g. several nodes between `extractResults` and `checkConfidence`), the direct edge from the first “after” node to the “before” node may no longer exist after the first insertion. The implementation **splits the last remaining normal edge on a path** to the target `beforeNodeId` so additional nodes can be appended in order. See `applyRecommendations` in `apps/temporal/src/workflow-modification/workflow-modification.util.ts` (and backend mirror).
  - **Automated insertion:** The improvement pipeline splits the **first normal edge after `azureOcr.extract`** and chains **`ocr.characterConfusion` → `ocr.normalizeFields` → `ocr.spellcheck`** there (exact upstream/downstream node ids depend on the template). **`ocr.enrich`** is **not** inserted or configured by this step; if the base workflow already contains **`ocr.enrich`**, optional **`llmPromptAppend`** on that node steers the enrichment LLM when enabled (see Step 2 and [docs-md/OCR_IMPROVEMENT_PIPELINE.md](../../docs-md/OCR_IMPROVEMENT_PIPELINE.md)).
- The candidate is run on the **same** benchmark definition using the workflow override. Runs execute asynchronously on the `benchmark-processing` queue.
- **Comparison** is provided by the existing system: each new run is compared to the baseline run using configurable thresholds (absolute or relative per metric); result is pass/fail and regression severity. **No degradation** = baseline comparison reports pass for all configured metrics.

## Requirements

- OCR workflow comparison SHALL use the **existing benchmarking APIs and data model** (benchmark project, definition, dataset version, split, baseline run, thresholds).
- A **job or automation** SHALL start a benchmark run for the candidate workflow (same or new definition as appropriate) and wait for completion.
- The **pass/fail (degradation yes/no)** result SHALL be taken from the existing **baseline comparison result** for that run; criteria are the thresholds configured when the baseline was promoted.

## Implementation tasks

- Define (or reuse) a **benchmark project** and **definition** for the OCR workflow: dataset/split, workflow, evaluator. Add support for **workflow override** when starting a run (so the candidate workflow config can be used while keeping the same definitionId for baseline comparison).
- Implement the **workflow modification utility** that applies the AI recommendation to a graph config and returns (and optionally persists) a new workflow version.
- **Establish a baseline run** for the current workflow (promote a run with thresholds).
- Add **automation or Temporal activities** to: (1) produce candidate config via the workflow modification utility, (2) start a run for the candidate (same definition, workflow override), (3) wait for run completion, (4) read the baseline comparison result for that run.
- If existing evaluators do not emit OCR correction–relevant metrics, **add or register a new evaluator** per the mechanism in the main requirements (Section 10).

## Acceptance criteria

- [ ] OCR workflow comparison is implemented using existing benchmarking APIs (projects, definitions, runs, baseline promotion, regression thresholds).
- [ ] **Workflow override** is supported when starting a run (same definition, optional workflow id override) so baseline comparison applies to the candidate run.
- [ ] The **workflow modification utility** is implemented and documented (constraints, supported insertion points or recommendation shape).
- [ ] Automation or activities start a benchmark run for the candidate workflow (via override) and obtain the baseline comparison result (pass/fail) for that run.

## References

- [docs/benchmarking/BENCHMARKING_GUIDE.md](../../docs/benchmarking/BENCHMARKING_GUIDE.md) — Workflow, Establish a Baseline, Regression Reports
- [feature-docs/003-benchmarking-system/REQUIREMENTS.md](../003-benchmarking-system/REQUIREMENTS.md)
- [docs-md/OCR_IMPROVEMENT_PIPELINE.md](../../docs-md/OCR_IMPROVEMENT_PIPELINE.md) — end-to-end improvement pipeline, API, comparing candidate vs baseline
- User stories: US-034 (baseline management), US-035 (scheduled runs), US-037 (regression reports)
- [docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) Section 10 — Creating new evaluators (interface, registry, module registration)
