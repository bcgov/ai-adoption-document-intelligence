# OCR Correction Tools and Benchmark Comparison (Feature 004)

This feature covers **confusion matrices**, **OCR correction tools** (spellcheck, character-confusion, and one other), **AI processing of HITL feedback** (tool recommendations), **workflow modification utility**, and **benchmark integration** (run baseline and candidate with workflow override, read comparison). The goal is to run the baseline, make corrections, run the candidate workflow, and **have AI review the results** so you can make design decisions. It does **not** include automatic workflow replacement or the full feedback loop—those are in [Feature 005 (Agentic SDLC Workflow Replacement and Feedback Loop)](../005-agentic-sdlc-workflow-replacement/).

Requirements: [docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) (Sections 1–6 and Section 10; Sections 7–9 are implemented in Feature 005).

## Implementation order

| Step | Document | Summary |
|------|----------|---------|
| 1 | [step-01-confusion-matrices.md](./step-01-confusion-matrices.md) | Document and implement confusion-matrix–style data for analysis and tuning |
| 2 | [step-02-ocr-correction-tools-and-nodes.md](./step-02-ocr-correction-tools-and-nodes.md) | Implement three correction tools and simple correction nodes (spellcheck, character-confusion, one other) |
| 3 | [step-03-ai-hitl-processing-tool-selection.md](./step-03-ai-hitl-processing-tool-selection.md) | AI pipeline to process HITL feedback and output tool/placement recommendations |
| 4 | [step-04-benchmark-integration-workflow-comparison.md](./step-04-benchmark-integration-workflow-comparison.md) | Integrate with benchmarking system: workflow override, workflow modification utility, run candidate, read baseline comparison |

## Dependencies

- **Steps 1–3** can be implemented in order with no dependency on Step 4.
- **Step 4** depends on the existing benchmarking system (feature 003); no new benchmark implementation.

## Follow-on feature

**[Feature 005 — Agentic SDLC Workflow Replacement and Feedback Loop](../005-agentic-sdlc-workflow-replacement/)** implements conditional workflow replacement, the full Temporal feedback loop, and AI-generated nodes exploration. It is intended to be implemented after Feature 004, once baseline runs, corrections, and AI review of results are in place and design decisions have been made.

## Related docs

| Topic | Location |
|-------|----------|
| Full requirements (004 scope: Sections 1–6, 10) | [docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) |
| Feature 005 (replacement, loop, exploration) | [feature-docs/005-agentic-sdlc-workflow-replacement/](../005-agentic-sdlc-workflow-replacement/) |
| Enrichment, HITL, graph workflows | [docs/ENRICHMENT.md](../../docs/ENRICHMENT.md), [docs/HITL_ARCHITECTURE.md](../../docs/HITL_ARCHITECTURE.md), [docs/graph-workflows/](../../docs/graph-workflows/) |
| Benchmarking system | [docs/benchmarking/BENCHMARKING_GUIDE.md](../../docs/benchmarking/BENCHMARKING_GUIDE.md), [feature-docs/003-benchmarking-system/REQUIREMENTS.md](../003-benchmarking-system/REQUIREMENTS.md) |
