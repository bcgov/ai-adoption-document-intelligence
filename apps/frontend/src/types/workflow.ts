/**
 * Workflow configuration types
 * These should match the types in the backend-services package
 */

export * from "./graph-workflow";

export type WorkflowStepsConfig = Record<
  string,
  { enabled: boolean; parameters?: Record<string, unknown> }
>;
