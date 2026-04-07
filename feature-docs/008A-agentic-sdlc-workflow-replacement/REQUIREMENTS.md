# Agentic SDLC — Workflow Replacement and Feedback Loop (Feature 008A)

**Context:** This feature implements **conditional workflow replacement**, the **full AI feedback loop** as a Temporal workflow, and **AI-generated correction nodes exploration**. It builds on [Feature 008 (OCR Correction Tools and Benchmark Comparison)](../008-ocr-correction-agentic-sdlc/), which delivers: correction tools, confusion matrices, AI HITL processing and tool recommendation, workflow modification utility, and benchmark integration (run baseline and candidate with workflow override, read comparison). Feature 008 enables running the baseline, making corrections, and having AI review the results; design decisions can be made from there. Feature 008A adds automatic replacement and orchestration.

**Prerequisites:** Feature 008 must be implemented first (Steps 1–4: confusion matrices, correction tools, AI recommendation pipeline, workflow modification utility, benchmark run with workflow override, comparison result).

**Related docs:** [docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) (Sections 7–9), [docs/benchmarking/BENCHMARKING_GUIDE.md](../../docs/benchmarking/BENCHMARKING_GUIDE.md), [feature-docs/008-ocr-correction-agentic-sdlc/](../008-ocr-correction-agentic-sdlc/).

---

## 1. Conditional workflow replacement (no degradation)

**Requirement:** When the benchmarking system's baseline comparison for a candidate run reports **no degradation**, set the candidate workflow as the new current production workflow using workflow versioning.

**Details:**

- **Trigger:** After a candidate workflow is tested (Feature 008 Step 4) and the baseline comparison for that run reports no degradation (pass for all thresholds).
- **Workflow versioning:** The system SHALL maintain a notion of "current" production workflow (e.g. designated workflow id, or default workflow id used at upload). Replacement SHALL set the candidate as the new current version (update active workflow pointer). Replacement SHALL NOT overwrite the previous workflow record in place.
- **Safety:** Replacement SHALL occur only when the baseline comparison has explicitly reported no degradation.

**Acceptance:**

- Defined process or automation: (1) read baseline comparison for the candidate run, (2) if no degradation, set candidate as new current version and persist.
- No replacement when degradation is detected or when comparison has not been run.

---

## 2. AI feedback loop with benchmarking

**Requirement:** Wire the full loop as a **Temporal workflow**: HITL → AI recommendation → workflow modification → start benchmark run (with workflow override) → baseline comparison → if no degradation, replace workflow.

**Details:**

- Loop implemented as a Temporal workflow (or schedule + workflow). Activities: fetch HITL data, AI recommendation, workflow modification and persist version, start benchmark run with override, wait for completion, read comparison, conditional replacement.
- Trigger (on-demand, schedule, or event) SHALL be documented.
- Benchmark metrics and comparison provided by existing system; loop consumes them via benchmarking APIs.

**Acceptance:**

- Loop is a Temporal workflow with activities for all steps; end-to-end flow documented; trigger documented.

---

## 3. AI-generated custom correction nodes (exploration)

**Requirement:** Explore and document approaches for AI-generated custom correction nodes; optionally implement one approach with validation.

**Details:**

- Document at least two approaches (e.g. AI-generated rule config vs AI-generated code), risks, and validation strategy.
- Any generated node SHALL be validated before use; validation requirements documented.
- Exploration only unless one approach is implemented (then include validation and documentation).

**Acceptance:**

- Short design/exploration document in `/docs`. If one approach is implemented: validation and documentation.

---

## 4. Implementation order

1. **Conditional replacement:** Active workflow pointer (008A Step 1a), replacement automation (008A Step 1b).
2. **Feedback loop:** Temporal workflow for the loop (008A Step 2), trigger documentation.
3. **AI-generated nodes:** Exploration doc (008A Step 3); optional implementation.

---

## 5. Step documents

| Step | Document | Summary |
|------|----------|---------|
| 1 | step-01-conditional-workflow-replacement.md | Workflow versioning and replacement when no degradation |
| 2 | step-02-feedback-loop.md | Temporal workflow orchestrating the full loop |
| 3 | step-03-ai-generated-nodes-exploration.md | Exploration doc; optional implementation |

See [README.md](./README.md) in this folder for links and dependencies.
