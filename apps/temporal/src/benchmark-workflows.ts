/**
 * Barrel file for the benchmark worker's workflow bundle.
 *
 * The benchmark worker needs `benchmarkRunWorkflow` (orchestrator),
 * `benchmarkSampleWorkflow` (per-sample wrapper that absorbs heavy
 * payloads into its own history), and `graphWorkflow` (the inner
 * workflow that the wrapper invokes). Temporal's `workflowsPath`
 * accepts a single module, so this file re-exports them together.
 */
export { benchmarkSampleWorkflow } from "./benchmark-sample-workflow";
export { benchmarkRunWorkflow } from "./benchmark-workflow";
export { graphWorkflow } from "./graph-workflow";
