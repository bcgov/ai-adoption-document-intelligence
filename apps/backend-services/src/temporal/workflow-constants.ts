/**
 * Workflow step constants
 * These should match the WorkflowStepId type in the temporal package
 */

export const VALID_WORKFLOW_STEP_IDS = [
  "updateStatus",
  "prepareFileData",
  // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
  "submitToAzureOCR",
  // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
  "updateApimRequestId",
  // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
  "waitBeforePoll",
  "pollOCRResults",
  "extractOCRResults",
  // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
  "postOcrCleanup",
  "enrichResults",
  "checkOcrConfidence",
  "humanReview",
  "storeResults",
] as const;

export type WorkflowStepId = (typeof VALID_WORKFLOW_STEP_IDS)[number];
