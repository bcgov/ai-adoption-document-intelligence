# Step 6: AI feedback loop with benchmarking

**Parent:** [OCR Correction and Agentic SDLC Requirements](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) — Section 8  
**Implementation order:** 6  
**Depends on:** Steps 3 (AI HITL processing), 4 (benchmark integration), 5 (conditional replacement).

---

## Goal

Wire the full loop as a **Temporal workflow**: HITL corrections → AI recommendation → workflow modification → start benchmark run (same definition, workflow override) → baseline comparison → if no degradation, replace workflow. Optionally collect new HITL data and repeat. The existing benchmarking system provides metrics and comparison; the loop consumes them via the benchmarking APIs.

## Orchestration

- The end-to-end loop SHALL be implemented as a **Temporal workflow** (or a Temporal schedule that starts such a workflow). This provides durability, visibility, and the ability to wait for the benchmark run to complete and then read the comparison result and conditionally replace.
- The loop workflow MAY use activities that: (1) fetch aggregated HITL data, (2) call the AI recommendation pipeline, (3) run the workflow modification utility to produce the candidate config and persist a new workflow version, (4) start the benchmark run (e.g. activity that invokes the start-run path with workflow override, or starts the benchmark run as a child workflow with override), (5) wait for run completion, (6) read the baseline comparison from the run record, (7) if no degradation, perform replacement (update active workflow pointer).

**Trigger:** The loop may be triggered **on demand** (e.g. API or signal), **on a schedule** (Temporal schedule), or by an **event**. Implementation may start with a single trigger; the chosen trigger(s) SHALL be documented.

## Loop steps

1. **HITL corrections** — Input: aggregated FieldCorrection / review session data (via aggregation API/activity).
2. **AI analysis** (Step 3) — Output: recommended tools and placement/parameters.
3. **Workflow modification** — Apply recommendation via the workflow modification utility; produce and persist candidate workflow (new version).
4. **Start benchmark run** (Step 4) — Same definition, **workflow override** to candidate workflow id; wait for completion.
5. **Baseline comparison** — Existing; run completes and comparison is stored on the run.
6. **If no degradation** — **Replace workflow** (Step 5): set candidate as new current version.
7. **(Optional)** Collect new HITL data and repeat.

## Requirements

- **Benchmarking:** Baseline promotion and regression thresholds SHALL be the gate for promoting a new workflow. The same metrics are available for reporting and monitoring via run details, regression reports, and MLflow.
- End-to-end flow SHALL be **documented** and **implementable**.

## Acceptance criteria

- [ ] The loop is implemented as a **Temporal workflow** (or schedule + workflow) with activities for HITL fetch, AI recommendation, workflow modification, run start (with workflow override), wait for completion, read comparison, and conditional replacement.
- [ ] End-to-end flow is **documented** and implementable: HITL data in → AI recommendation → workflow modification → start candidate run (same definition, override) → wait → read comparison → conditional replacement.
- [ ] **Trigger** (on-demand, schedule, or event) is documented.
- [ ] Benchmark metrics and comparison are provided by the existing system; the loop consumes them via the benchmarking APIs.

## References

- Step 3: [step-03-ai-hitl-processing-tool-selection.md](./step-03-ai-hitl-processing-tool-selection.md)
- Step 4: [step-04-benchmark-integration-workflow-comparison.md](./step-04-benchmark-integration-workflow-comparison.md)
- Step 5: [step-05-conditional-workflow-replacement.md](./step-05-conditional-workflow-replacement.md)
- [docs/benchmarking/BENCHMARKING_GUIDE.md](../../docs/benchmarking/BENCHMARKING_GUIDE.md)
