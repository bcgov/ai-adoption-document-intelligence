# Agentic SDLC — Workflow Replacement and Feedback Loop (Feature 005)

This feature implements **conditional workflow replacement**, the **full AI feedback loop** as a Temporal workflow, and **AI-generated correction nodes exploration**. It is intended to be implemented **after** [Feature 004 (OCR Correction Tools and Benchmark Comparison)](../004-ocr-correction-agentic-sdlc/), which delivers correction tools, AI HITL processing, workflow modification utility, and benchmark integration so you can run the baseline, make corrections, and have AI review the results. Feature 005 adds automatic replacement and end-to-end orchestration.

## Implementation order

| Step | Document | Summary |
|------|----------|---------|
| 1 | [step-01-conditional-workflow-replacement.md](./step-01-conditional-workflow-replacement.md) | Workflow versioning and replacement when no degradation |
| 2 | [step-02-feedback-loop.md](./step-02-feedback-loop.md) | Temporal workflow orchestrating the full loop |
| 3 | [step-03-ai-generated-nodes-exploration.md](./step-03-ai-generated-nodes-exploration.md) | Exploration doc for AI-generated correction nodes; optional implementation |

## Dependencies

- **Feature 004** must be complete (Steps 1–4): confusion matrices, correction tools, AI recommendation pipeline, workflow modification utility, benchmark run with workflow override, comparison result.
- **Step 1** (replacement) depends on Feature 004 Step 4 (baseline comparison result).
- **Step 2** (feedback loop) depends on 005 Step 1 and Feature 004 Steps 3–4.
- **Step 3** (AI-generated nodes exploration) is independent and can be done in parallel or after Step 2.

## Related docs

| Topic | Location |
|-------|----------|
| Feature 005 requirements | [REQUIREMENTS.md](./REQUIREMENTS.md) |
| Feature 004 (prerequisite) | [../004-ocr-correction-agentic-sdlc/](../004-ocr-correction-agentic-sdlc/) |
| Main OCR/Agentic requirements (Sections 7–9) | [docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) |
| Benchmarking | [docs/benchmarking/BENCHMARKING_GUIDE.md](../../docs/benchmarking/BENCHMARKING_GUIDE.md) |
