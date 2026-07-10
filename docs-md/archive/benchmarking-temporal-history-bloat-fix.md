# Benchmark history bloat fix (2026-05-04)

## Symptom

Large benchmark runs (~100 documents) failed with one of:

- Temporal server log: `Workflow history size exceeds limit` and the parent
  `benchmarkRunWorkflow` execution closed (terminated by the server) before
  it could write `status="completed"` to the DB. The benchmark run row stayed
  in `running` state indefinitely.
- Per-sample child workflows timed out at the 5-minute
  `workflowExecutionTimeout` even though their activities had completed in a
  few seconds.

## Root cause

Each per-sample child workflow returned its full graph workflow ctx
(predictions and the raw Azure OCR response, ~600 KB per sample) back to the
parent benchmark orchestrator. Both the `ChildWorkflowExecutionCompleted`
event payload and the parent-side `benchmark.persistOcrCache` /
`benchmark.writePrediction` activity arguments stored that ~600 KB inline in
the parent's history. At ~85 samples the parent history exceeded Temporal's
default 50 MB error limit and was server-terminated.

The same bloat also caused worker-thread starvation: each parent activation
required replaying tens of MB on the single workflow thread
(`workflowThreadPoolSize: 1`), preventing any child workflow from being
activated and so children sat idle until they hit their 5-minute execution
timeout.

## Fix

Inserted a thin per-sample wrapper child workflow,
`benchmarkSampleWorkflow`, between the parent benchmark orchestrator and the
existing generic `graphWorkflow`. The wrapper now performs the prediction
write and OCR cache persistence inside its own workflow context, so the
heavy payloads stay in the wrapper's history (small, per-sample) and never
flow to the parent. The wrapper returns only `{ sampleId, success,
predictionPath, confidenceData, outputPaths, error? }`.

After the change, the parent's history at 100 samples is roughly 5 MB
instead of ~50 MB, well below the server limit, and replays fast enough that
children no longer starve.

## Files

- `apps/temporal/src/benchmark-sample-workflow.ts` (new)
- `apps/temporal/src/benchmark-workflows.ts` (registers the new workflow)
- `apps/temporal/src/activities/benchmark-execute.ts` (dispatches the wrapper)
- `apps/temporal/src/benchmark-workflow.ts` (consumes the slim shape)
