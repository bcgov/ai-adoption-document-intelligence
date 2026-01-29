/**
 * Default workflow configuration and merge helper
 * Provides default step configurations matching current workflow behavior
 */

import type { WorkflowStepsConfig, WorkflowStepId } from './types';

// Default configuration matching current workflow behavior
export const DEFAULT_WORKFLOW_STEPS: Required<Record<WorkflowStepId, { enabled: boolean; parameters?: Record<string, unknown> }>> = {
  updateStatus: { enabled: true },
  prepareFileData: { enabled: true },
  submitToAzureOCR: { enabled: true },
  updateApimRequestId: { enabled: true },
  waitBeforePoll: { enabled: true, parameters: { waitTime: 5000 } },
  pollOCRResults: { 
    enabled: true, 
    parameters: { maxRetries: 20, waitBeforeFirstPoll: 5000, waitBetweenPolls: 10000 } as unknown as Record<string, unknown>
  },
  extractOCRResults: { enabled: true },
  postOcrCleanup: { enabled: true },
  checkOcrConfidence: { 
    enabled: true, 
    parameters: { threshold: 0.95 } as unknown as Record<string, unknown>
  },
  humanReview: { 
    enabled: true, 
    parameters: { timeout: 86400000 } as unknown as Record<string, unknown> // 24 hours
  },
  storeResults: { enabled: true },
};

/**
 * Merge user-provided step configuration with defaults
 * User config overrides defaults, but only for specified steps
 */
export function mergeWorkflowConfig(
  userConfig?: WorkflowStepsConfig
): Required<Record<WorkflowStepId, { enabled: boolean; parameters?: Record<string, unknown> }>> {
  if (!userConfig) {
    return DEFAULT_WORKFLOW_STEPS;
  }

  const merged = { ...DEFAULT_WORKFLOW_STEPS };

  for (const [stepId, stepConfig] of Object.entries(userConfig)) {
    if (stepConfig && merged[stepId as WorkflowStepId]) {
      merged[stepId as WorkflowStepId] = {
        ...merged[stepId as WorkflowStepId],
        ...stepConfig,
        // Deep merge parameters if both exist
        parameters: {
          ...merged[stepId as WorkflowStepId].parameters,
          ...stepConfig.parameters,
        },
      };
    }
  }

  return merged;
}
