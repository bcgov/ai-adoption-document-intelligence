/**
 * Barrel file for the benchmark worker's workflow bundle.
 *
 * The benchmark worker needs both `benchmarkRunWorkflow` (orchestrator) and
 * `graphWorkflow` (child workflow executed per sample) in its bundle.
 * Temporal's `workflowsPath` accepts a single module, so this file
 * re-exports everything from both workflow modules.
 */
export { benchmarkRunWorkflow } from './benchmark-workflow';
export { graphWorkflow } from './graph-workflow';
