# OCR Correction Tools and Benchmark Comparison (Feature 008)

This feature covers **confusion matrices**, **OCR correction tools** (`ocr.spellcheck`, `ocr.characterConfusion`, `ocr.normalizeFields`; **`ocr.enrich`** remains available in graphs for manual composition but is **not** recommended or inserted by the AI improvement pipeline), **AI processing of HITL feedback** (tool recommendations), **workflow modification utility**, and **benchmark integration** (run baseline and candidate with workflow override, read comparison). The goal is to run the baseline, make corrections, run the candidate workflow, and **have AI review the results** so you can make design decisions. It does **not** include automatic workflow replacement or the full feedback loop—those are in [Feature 008A (Agentic SDLC Workflow Replacement and Feedback Loop)](../008A-agentic-sdlc-workflow-replacement/).

Requirements: [docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) (Sections 1–6 and Section 10; Sections 7–9 are implemented in Feature 008A).

## Implementation order

| Step | Document | Summary |
|------|----------|---------|
| 1 | [step-01-confusion-matrices.md](./step-01-confusion-matrices.md) | Document and implement confusion-matrix–style data for analysis and tuning |
| 2 | [step-02-ocr-correction-tools-and-nodes.md](./step-02-ocr-correction-tools-and-nodes.md) | Implement deterministic correction tools and graph nodes (`ocr.spellcheck`, `ocr.characterConfusion`, `ocr.normalizeFields`) and keep `ocr.enrich` integration explicit |
| 3 | [step-03-ai-hitl-processing-tool-selection.md](./step-03-ai-hitl-processing-tool-selection.md) | AI pipeline to process HITL feedback and output tool/placement recommendations |
| 4 | [step-04-benchmark-integration-workflow-comparison.md](./step-04-benchmark-integration-workflow-comparison.md) | Integrate with benchmarking system: workflow override, workflow modification utility, run candidate, read baseline comparison |

## Dependencies

- **Steps 1–3** can be implemented in order with no dependency on Step 4.
- **Step 4** depends on the existing benchmarking system (feature 003); no new benchmark implementation.

## Follow-on feature

**[Feature 008A — Agentic SDLC Workflow Replacement and Feedback Loop](../008A-agentic-sdlc-workflow-replacement/)** implements conditional workflow replacement, the full Temporal feedback loop, and AI-generated nodes exploration. It is intended to be implemented after Feature 008, once baseline runs, corrections, and AI review of results are in place and design decisions have been made.

## Related docs

| Topic | Location |
|-------|----------|
| Full requirements (008 scope: Sections 1–6, 10) | [docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) |
| **OCR improvement pipeline (API, UI, insertion order, troubleshooting)** | [docs-md/OCR_IMPROVEMENT_PIPELINE.md](../../docs-md/OCR_IMPROVEMENT_PIPELINE.md) |
| Feature 008A (replacement, loop, exploration) | [feature-docs/008A-agentic-sdlc-workflow-replacement/](../008A-agentic-sdlc-workflow-replacement/) |
| Enrichment, HITL, graph workflows | [docs/ENRICHMENT.md](../../docs/ENRICHMENT.md), [docs/HITL_ARCHITECTURE.md](../../docs/HITL_ARCHITECTURE.md), [docs/graph-workflows/](../../docs/graph-workflows/) |
| Benchmarking system | [docs/benchmarking/BENCHMARKING_GUIDE.md](../../docs/benchmarking/BENCHMARKING_GUIDE.md), [feature-docs/003-benchmarking-system/REQUIREMENTS.md](../003-benchmarking-system/REQUIREMENTS.md) |

**Implementation pointers (code):** correction tool manifest (parameter schemas for the three AI-recommendable tools) — `apps/temporal/src/correction-tool-registry.ts` and `apps/backend-services/src/hitl/tool-manifest.service.ts` (kept in sync); **candidate insertion** uses the **first normal edge after `azureOcr.extract`** (`findSlotImmediatelyAfterAzureOcrExtract` / `insertionSlots` in workflow modification), not per-tool manifest slots. Applying AI recommendations — `applyRecommendations` in `apps/temporal/src/workflow-modification/workflow-modification.util.ts` (mirrored under backend `workflow/` for orchestration). For graphs that **already** include **`ocr.enrich`**, optional node parameter **`llmPromptAppend`** appends text to the enrichment LLM user prompt when LLM enrichment is enabled (`apps/temporal/src/activities/enrich-results.ts`, `enrichment-llm.ts`); the AI recommender does not add or configure `ocr.enrich`. Operational behavior and validation tips are documented in `docs-md/OCR_IMPROVEMENT_PIPELINE.md` rather than duplicated here.
