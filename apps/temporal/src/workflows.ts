/**
 * Barrel file for the OCR worker's workflow bundle.
 *
 * The primary OCR worker needs `graphWorkflow` (the generic DAG runner)
 * and `cacheGcWorkflow` (the Phase 4 / US-134 periodic activity-output
 * cache GC sweep). Temporal's `workflowsPath` accepts a single module,
 * so this file re-exports both together.
 *
 * Mirrors the same pattern as `benchmark-workflows.ts` for the benchmark
 * worker bundle.
 */

export type { CacheGcWorkflowInput } from "./cache-gc-workflow";
export { cacheGcWorkflow } from "./cache-gc-workflow";
export { graphWorkflow } from "./graph-workflow";
