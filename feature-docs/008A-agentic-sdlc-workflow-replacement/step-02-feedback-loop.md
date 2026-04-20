# Step 2: AI feedback loop with benchmarking

**Parent:** [Feature 008A REQUIREMENTS](./REQUIREMENTS.md) — Section 2  
**Implementation order:** 2  
**Depends on:** Feature 008 Steps 3–4 (AI HITL processing, benchmark integration), 008A Step 1 (conditional replacement).

---

## Goal

Wire the full loop as a **Temporal workflow**: HITL corrections → AI recommendation → workflow modification → start benchmark run (same definition, workflow override) → baseline comparison → if no degradation, replace workflow. Optionally collect new HITL data and repeat.

## Orchestration

- The end-to-end loop SHALL be implemented as a **Temporal workflow** (or a Temporal schedule that starts such a workflow).
- The loop workflow MAY use activities that: (1) fetch aggregated HITL data, (2) call the AI recommendation pipeline, (3) run the workflow modification utility to produce the candidate config and persist a new workflow version, (4) start the benchmark run (with workflow override), (5) wait for run completion, (6) read the baseline comparison from the run record, (7) if no degradation, perform replacement (update active workflow pointer).

**Trigger:** The loop may be triggered **on demand**, **on a schedule** (Temporal schedule), or by an **event**. The chosen trigger(s) SHALL be documented.

## Loop steps

1. **HITL corrections** — Input: aggregated FieldCorrection / review session data (via aggregation from Feature 008).
2. **AI analysis** (Feature 008 Step 3) — Output: recommended tools and placement/parameters.
3. **Workflow modification** — Apply recommendation via the workflow modification utility; produce and persist candidate workflow (new version).
4. **Start benchmark run** (Feature 008 Step 4) — Same definition, workflow override to candidate workflow id; wait for completion.
5. **Baseline comparison** — Run completes; comparison is stored on the run.
6. **If no degradation** — **Replace workflow** (008A Step 1): set candidate as new current version.
7. **(Optional)** Collect new HITL data and repeat.

## Acceptance criteria

- [ ] The loop is implemented as a **Temporal workflow** (or schedule + workflow) with activities for HITL fetch, AI recommendation, workflow modification, run start (with workflow override), wait for completion, read comparison, and conditional replacement.
- [ ] End-to-end flow is **documented** and implementable.
- [ ] **Trigger** (on-demand, schedule, or event) is documented.
- [ ] Benchmark metrics and comparison are provided by the existing system; the loop consumes them via the benchmarking APIs.

## References

- Feature 008: [../008-ocr-correction-agentic-sdlc/](../008-ocr-correction-agentic-sdlc/)
- [docs/benchmarking/BENCHMARKING_GUIDE.md](../../docs/benchmarking/BENCHMARKING_GUIDE.md)
