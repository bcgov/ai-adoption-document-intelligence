# OCR Correction Tools and Agentic SDLC — Step-by-Step Implementation

This folder breaks down the [OCR Correction and Agentic SDLC requirements](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) into smaller, implementable steps. The main requirements document remains the single source of truth; these step docs extract the relevant requirements and acceptance criteria for each phase.

## Implementation order

| Step | Document | Summary |
|------|----------|---------|
| 1 | [step-01-confusion-matrices.md](./step-01-confusion-matrices.md) | Document and implement confusion-matrix–style data for analysis and tuning |
| 2 | [step-02-ocr-correction-tools-and-nodes.md](./step-02-ocr-correction-tools-and-nodes.md) | Implement at least two correction tools and simple correction nodes (spellcheck + one other) |
| 3 | [step-03-ai-hitl-processing-tool-selection.md](./step-03-ai-hitl-processing-tool-selection.md) | AI pipeline to process HITL feedback and output tool/placement recommendations |
| 4 | [step-04-benchmark-integration-workflow-comparison.md](./step-04-benchmark-integration-workflow-comparison.md) | Integrate with existing benchmarking system for candidate vs baseline workflow comparison |
| 5 | [step-05-conditional-workflow-replacement.md](./step-05-conditional-workflow-replacement.md) | Automation to replace production workflow when baseline comparison reports no degradation |
| 6 | [step-06-feedback-loop.md](./step-06-feedback-loop.md) | Wire HITL → AI → benchmark run → comparison → conditional replacement into one loop |
| 7 | [step-07-ai-generated-nodes-exploration.md](./step-07-ai-generated-nodes-exploration.md) | Exploration doc for AI-generated correction nodes; optional implementation with validation |

## Dependencies

- **Steps 1–3** can be implemented in order with no dependency on 4–6.
- **Step 4** depends on the existing benchmarking system (feature 003); no new benchmark implementation.
- **Step 5** depends on Step 4 (baseline comparison result consumed).
- **Step 6** depends on Steps 3, 4, and 5 (orchestrates the full loop).
- **Step 7** is independent and can be done in parallel or after the loop is in place.

## Related docs

| Topic | Location |
|-------|----------|
| Full requirements | [docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) |
| Enrichment, HITL, graph workflows | [docs/ENRICHMENT.md](../../docs/ENRICHMENT.md), [docs/HITL_ARCHITECTURE.md](../../docs/HITL_ARCHITECTURE.md), [docs/graph-workflows/](../../docs/graph-workflows/) |
| Benchmarking system | [docs/benchmarking/BENCHMARKING_GUIDE.md](../../docs/benchmarking/BENCHMARKING_GUIDE.md), [feature-docs/003-benchmarking-system/REQUIREMENTS.md](../003-benchmarking-system/REQUIREMENTS.md) |
