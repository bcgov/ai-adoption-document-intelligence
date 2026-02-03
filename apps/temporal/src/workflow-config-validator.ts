/**
 * Workflow configuration validator
 * Validates step configurations before workflow execution
 */

import type { WorkflowStepsConfig, WorkflowStepId, PollStepParams, ConfidenceStepParams, HumanReviewParams } from './types';
import { VALID_WORKFLOW_STEP_IDS } from './types';

export interface ValidationError {
  stepId?: string;
  field?: string;
  message: string;
}

export function validateWorkflowConfig(
  config: WorkflowStepsConfig
): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const validStepIds = VALID_WORKFLOW_STEP_IDS;

  // Validate step IDs
  for (const stepId of Object.keys(config)) {
    if (!validStepIds.includes(stepId as WorkflowStepId)) {
      errors.push({
        stepId,
        message: `Invalid step ID: ${stepId}. Valid steps are: ${validStepIds.join(', ')}`,
      });
    }
  }

  // Validate step-specific parameters
  for (const [stepId, stepConfig] of Object.entries(config)) {
    if (!stepConfig) continue;

    // Validate enabled flag
    if (stepConfig.enabled !== undefined && typeof stepConfig.enabled !== 'boolean') {
      errors.push({
        stepId,
        field: 'enabled',
        message: 'enabled must be a boolean',
      });
    }

    // Validate parameters based on step type
    if (stepConfig.parameters) {
      if (stepId === 'pollOCRResults') {
        const params = stepConfig.parameters as PollStepParams;
        if (params.maxRetries !== undefined && (params.maxRetries < 1 || params.maxRetries > 100)) {
          errors.push({
            stepId,
            field: 'maxRetries',
            message: 'maxRetries must be between 1 and 100',
          });
        }
        if (params.waitBeforeFirstPoll !== undefined && params.waitBeforeFirstPoll < 0) {
          errors.push({
            stepId,
            field: 'waitBeforeFirstPoll',
            message: 'waitBeforeFirstPoll must be >= 0',
          });
        }
        if (params.waitBetweenPolls !== undefined && params.waitBetweenPolls < 0) {
          errors.push({
            stepId,
            field: 'waitBetweenPolls',
            message: 'waitBetweenPolls must be >= 0',
          });
        }
      }

      if (stepId === 'checkOcrConfidence') {
        const params = stepConfig.parameters as ConfidenceStepParams;
        if (params.threshold !== undefined && (params.threshold < 0 || params.threshold > 1)) {
          errors.push({
            stepId,
            field: 'threshold',
            message: 'threshold must be between 0 and 1',
          });
        }
      }

      if (stepId === 'humanReview') {
        const params = stepConfig.parameters as HumanReviewParams;
        if (params.timeout !== undefined && params.timeout < 0) {
          errors.push({
            stepId,
            field: 'timeout',
            message: 'timeout must be >= 0',
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
