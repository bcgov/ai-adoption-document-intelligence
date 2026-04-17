# Step 5: UI for OCR improvement (build on existing benchmarking)

**Parent:** [Feature 008 README](./README.md)  
**Implementation order:** 5  
**Depends on:** Step 4 (orchestration, workflow override, run candidate), existing benchmarking frontend (feature 003).

---

## Goal

Provide a UI for the OCR improvement pipeline and candidate runs by extending the existing benchmarking feature. Users can trigger the pipeline, see recommendations, start a candidate run, and use existing run detail and comparison pages for results. No separate app or duplicate run/comparison screens.

## Scope

- **Entry point:** At benchmark project or definition level, an "OCR improvement" (or "Improvement pipeline") section or tab.
- **Trigger pipeline:** Action that runs the full pipeline (aggregate HITL → AI recommendation → create candidate workflow → start benchmark run). Calls a new backend API; response includes candidate workflow ID and benchmark run ID.
- **Show recommendations:** Display AI tool recommendations (tool IDs, placement, rationale) when available (e.g. from pipeline response).
- **Run candidate:** When the user has a candidate (from the pipeline), "Run candidate" starts a benchmark run using the existing start-run API with optional **`candidateWorkflowVersionId`** (config loaded from that workflow version row). Existing run list and run detail pages are used for status and baseline comparison.
- **Comparison:** Use existing run detail and run comparison pages for baseline vs candidate; promote baseline when satisfied.

## Requirements

- The UI SHALL extend the existing benchmarking frontend (`apps/frontend/src/features/benchmarking/`).
- The UI SHALL call a new pipeline run endpoint (e.g. `POST .../benchmark/projects/:projectId/definitions/:definitionId/ocr-improvement/run`) with required context (workflow ID, user ID, optional HITL filters).
- The UI SHALL use the existing start-run API with optional `candidateWorkflowVersionId` when starting a candidate run (no new endpoint for starting runs).
- The UI SHALL reuse existing run list, run detail, run comparison, and promote-baseline flows.

## Implementation tasks

- Add backend endpoint for running the OCR improvement pipeline (see Step 4 orchestration).
- Add an "OCR improvement" section or tab in the benchmarking UI at project or definition level.
- In that section: button/action to "Run improvement pipeline", display of pipeline result (candidate workflow ID, benchmark run ID, recommendations summary), and "Run candidate" that starts a run with override when a candidate is available.
- Extend the existing start-run payload (e.g. in `useRuns` or call site) to support optional `candidateWorkflowVersionId` when running a candidate.

## Acceptance criteria

- [ ] User can trigger the OCR improvement pipeline from the benchmarking UI for a chosen definition (with workflow and project/definition context).
- [ ] Pipeline result shows candidate workflow ID, benchmark run ID, and recommendations summary (applied/rejected counts, tool IDs).
- [ ] User can start a candidate run (workflow override) using the existing start-run flow when a candidate exists; run appears in the same definition’s run list.
- [ ] Existing run detail and comparison pages are used to view baseline vs candidate results; no duplicate comparison UI.

## References

- Step 4: [step-04-benchmark-integration-workflow-comparison.md](./step-04-benchmark-integration-workflow-comparison.md)
- [docs-md/OCR_IMPROVEMENT_PIPELINE.md](../../docs-md/OCR_IMPROVEMENT_PIPELINE.md) — pipeline endpoint, UI behavior, and how candidate runs relate to baseline comparison
- Benchmarking frontend: `apps/frontend/src/features/benchmarking/`
- Start-run API: `POST /api/benchmark/projects/:projectId/definitions/:definitionId/runs` — see `CreateRunDto` and benchmark controller for optional `candidateWorkflowVersionId` when running a candidate workflow
