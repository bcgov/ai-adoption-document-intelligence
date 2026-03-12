/**
 * Workflow type constants
 * These must match the exported workflow function names in the temporal app
 */

export const WORKFLOW_TYPES = {
  GRAPH_WORKFLOW: "graphWorkflow",
  BENCHMARK_RUN_WORKFLOW: "benchmarkRunWorkflow",
} as const;
