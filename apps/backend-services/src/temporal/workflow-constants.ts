/**
 * Workflow step constants
 * These should match the WorkflowStepId type in the temporal package
 */

export const VALID_WORKFLOW_STEP_IDS = [
  "updateStatus",
  "prepareFileData",
  "submitToAzureOCR",
  "updateApimRequestId",
  "waitBeforePoll",
  "pollOCRResults",
  "extractOCRResults",
  "postOcrCleanup",
  "checkOcrConfidence",
  "humanReview",
  "storeResults",
] as const;

export type WorkflowStepId = (typeof VALID_WORKFLOW_STEP_IDS)[number];
