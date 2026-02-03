/**
 * Workflow configuration types
 * These should match the types in the backend-services package
 */

// Step configuration
export interface StepConfig {
  enabled?: boolean; // Defaults to true if not specified
  parameters?: Record<string, unknown>;
}

// Workflow steps configuration (partial - only specify steps you want to customize)
export interface WorkflowStepsConfig {
  [key: string]: StepConfig | undefined;
}
