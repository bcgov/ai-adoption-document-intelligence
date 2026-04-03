# Agentic SDLC — Workflow Replacement and Feedback Loop (Feature 008A)

This feature implements **conditional workflow replacement**, the **full AI feedback loop** as a Temporal workflow, and **AI-generated correction nodes exploration**. It is intended to be implemented **after** [Feature 008 (OCR Correction Tools and Benchmark Comparison)](../008-ocr-correction-agentic-sdlc/), which delivers correction tools, AI HITL processing, workflow modification utility, and benchmark integration so you can run the baseline, make corrections, and have AI review the results. Feature 008A adds automatic replacement and end-to-end orchestration.

## Implementation order

| Step | Document | Summary |
|------|----------|---------|
| 1 | [step-01-conditional-workflow-replacement.md](./step-01-conditional-workflow-replacement.md) | Workflow versioning and replacement when no degradation |
| 2 | [step-02-feedback-loop.md](./step-02-feedback-loop.md) | Temporal workflow orchestrating the full loop |
| 3 | [step-03-ai-generated-nodes-exploration.md](./step-03-ai-generated-nodes-exploration.md) | Exploration doc for AI-generated correction nodes; optional implementation |

## Dependencies

- **Feature 008** must be complete (Steps 1–4): confusion matrices, correction tools, AI recommendation pipeline, workflow modification utility, benchmark run with workflow override, comparison result.
- **Step 1** (replacement) depends on Feature 008 Step 4 (baseline comparison result).
- **Step 2** (feedback loop) depends on 008A Step 1 and Feature 008 Steps 3–4.
- **Step 3** (AI-generated nodes exploration) is independent and can be done in parallel or after Step 2.

## Related docs

| Topic | Location |
|-------|----------|
| Feature 008A requirements | [REQUIREMENTS.md](./REQUIREMENTS.md) |
| Feature 008 (prerequisite) | [../008-ocr-correction-agentic-sdlc/](../008-ocr-correction-agentic-sdlc/) |
| Main OCR/Agentic requirements (Sections 7–9) | [docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) |
| Benchmarking | [docs/benchmarking/BENCHMARKING_GUIDE.md](../../docs/benchmarking/BENCHMARKING_GUIDE.md) |
