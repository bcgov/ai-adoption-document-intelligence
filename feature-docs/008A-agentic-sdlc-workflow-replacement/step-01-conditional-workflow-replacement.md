# Step 1: Conditional workflow replacement (no degradation)

**Parent:** [Feature 008A REQUIREMENTS](./REQUIREMENTS.md) — Section 1  
**Implementation order:** 1  
**Depends on:** Feature 008 Step 4 (baseline comparison result must be available to consume).

---

## Goal

When the benchmarking system's baseline comparison for the candidate run reports **no degradation**, set the candidate workflow as the new **current** production workflow using **workflow versioning**. The benchmarking system does not store "production workflow"; this step implements the automation that performs the update.

## Trigger

- After a candidate workflow is tested (Feature 008 Step 4) and the **baseline comparison for that run reports no degradation** (pass for all thresholds).

## Requirements

- **Workflow versioning:** The system SHALL maintain a notion of "current" production workflow (e.g. a designated workflow id, or a pointer such as default workflow id used at upload when `workflow_config_id` is not provided). Replacement SHALL set the **candidate as the new current version** (e.g. update the active workflow pointer to the new workflow id). Replacement SHALL **not** overwrite the previous workflow record in place; it SHALL create or designate a new version so history and rollback remain possible.
- **Replacement:** When the comparison reports no degradation, the automation SHALL update whatever store or config holds the active workflow. In this codebase, workflow config is stored in the **`Workflow` model** (Prisma); documents use **workflow_config_id** at upload. The active workflow SHALL resolve via that id. See [DAG_WORKFLOW_ENGINE.md](../../docs/graph-workflows/DAG_WORKFLOW_ENGINE.md) and `WorkflowService.getWorkflowById` / `TemporalClientService.startGraphWorkflow(workflowConfigId)`.
- **Safety:** Replacement SHALL occur **only** when the baseline comparison has explicitly reported no degradation.

## Acceptance criteria

- [ ] There is a **defined process or automation** that: (1) reads the baseline comparison result for the candidate run from the benchmarking system, (2) if no degradation, sets the candidate workflow as the new current version (updates active workflow pointer; does not overwrite previous workflow in place), (3) persists the update.
- [ ] No replacement occurs when degradation is detected or when the comparison has not been run.

## References

- Feature 008 Step 4: [step-04-benchmark-integration-workflow-comparison.md](../008-ocr-correction-agentic-sdlc/step-04-benchmark-integration-workflow-comparison.md) — how comparison result is obtained
- [docs/benchmarking/BENCHMARKING_GUIDE.md](../../docs/benchmarking/BENCHMARKING_GUIDE.md) — baseline comparison API/data
- [docs/graph-workflows/DAG_WORKFLOW_ENGINE.md](../../docs/graph-workflows/DAG_WORKFLOW_ENGINE.md) — workflow config storage
