/**
 * Temporal Workflow for Azure OCR Document Processing
 * This workflow orchestrates the OCR process with polling and retry logic
 */

import { sleep, proxyActivities, setHandler, defineQuery, defineSignal, condition, ApplicationFailure } from '@temporalio/workflow';
import type { OCRWorkflowInput, OCRResult, PreparedFileData, SubmissionResult, PollResult, WorkflowStatus, WorkflowProgress, CancelSignal, HumanApprovalSignal, WorkflowStepId, PollStepParams, ConfidenceStepParams, HumanReviewParams } from './types';
import type * as activities from './activities';
import { mergeWorkflowConfig } from './workflow-config';
import { validateWorkflowConfig } from './workflow-config-validator';

// Define queries
export const getStatus = defineQuery<WorkflowStatus>('getStatus');
export const getProgress = defineQuery<WorkflowProgress>('getProgress');

// Define signals
export const cancelSignal = defineSignal<[CancelSignal]>('cancel');
export const humanApprovalSignal = defineSignal<[HumanApprovalSignal]>('humanApproval');

// Create activity proxies with different retry configurations
const { prepareFileData } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '10s'
  }
});

const { submitToAzureOCR } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '30s'
  }
});

const { pollOCRResults } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    maximumAttempts: 5,
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '10s'
  }
});

const { extractOCRResults } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '10s'
  }
});

const { updateDocumentStatus } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    maximumAttempts: 5,
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '10s'
  }
});

const { storeDocumentRejection } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    maximumAttempts: 5,
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '10s'
  }
});

const { upsertOcrResult } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    maximumAttempts: 5,
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '30s'
  }
});

const { postOcrCleanup } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '10s'
  }
});

const { checkOcrConfidence } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '10s'
  }
});

/**
 * Workflow type name constant - used by clients to start workflows by string name
 * This ensures consistency between the function name and the string identifier
 */
export const OCR_WORKFLOW_TYPE = 'ocrWorkflow';

/**
 * Main OCR Workflow
 * Processes a document through Azure Document Intelligence OCR
 */
export async function ocrWorkflow(input: OCRWorkflowInput): Promise<OCRResult> {
  const { documentId } = input;

  console.log('[OCRWorkflow] ========================================');
  console.log('[OCRWorkflow] Starting OCR Workflow');
  console.log('[OCRWorkflow] ========================================');
  console.log(`[OCRWorkflow] Document ID: ${documentId}`);
  console.log(`[OCRWorkflow] File Name: ${input.fileName}`);
  console.log(`[OCRWorkflow] File Type: ${input.fileType}`);
  console.log(`[OCRWorkflow] Content Type: ${input.contentType}`);
  console.log(`[OCRWorkflow] Model ID: ${input.modelId || 'default'}`);

  // Validate configuration if provided
  if (input.steps) {
    console.log('[OCRWorkflow] Validating workflow configuration...');
    const validation = validateWorkflowConfig(input.steps);
    if (!validation.valid) {
      console.error(`[OCRWorkflow] Validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
      throw new Error(`Invalid workflow configuration: ${validation.errors.map(e => e.message).join('; ')}`);
    }
    console.log('[OCRWorkflow] Workflow configuration validated successfully');
  }

  // Merge user config with defaults
  const config = mergeWorkflowConfig(input.steps);
  console.log('[OCRWorkflow] Workflow configuration merged with defaults');

  // Helper to check if step is enabled
  const isStepEnabled = (stepId: WorkflowStepId): boolean => 
    config[stepId]?.enabled !== false;

  // Helper to get step parameters
  const getStepParams = <T>(stepId: WorkflowStepId): T | undefined =>
    config[stepId]?.parameters as T | undefined;

  // Get configured parameters
  const pollParams = getStepParams<PollStepParams>('pollOCRResults');
  const maxRetries = pollParams?.maxRetries ?? 20;
  const waitBeforeFirstPoll = pollParams?.waitBeforeFirstPoll ?? 5000;
  const waitBetweenPolls = pollParams?.waitBetweenPolls ?? 10000;
  const confidenceParams = getStepParams<ConfidenceStepParams>('checkOcrConfidence');
  const confidenceThreshold = confidenceParams?.threshold ?? 0.95;
  const humanReviewParams = getStepParams<HumanReviewParams>('humanReview');
  const humanReviewTimeout = humanReviewParams?.timeout ?? 86400000; // 24 hours
  const waitBeforePollParams = config.waitBeforePoll?.parameters;
  const waitTime = (waitBeforePollParams?.waitTime as number) ?? 5000;

  console.log('[OCRWorkflow] Workflow Parameters:');
  console.log(`[OCRWorkflow]   - Poll Max Retries: ${maxRetries}`);
  console.log(`[OCRWorkflow]   - Wait Before First Poll: ${waitBeforeFirstPoll}ms`);
  console.log(`[OCRWorkflow]   - Wait Between Polls: ${waitBetweenPolls}ms`);
  console.log(`[OCRWorkflow]   - Confidence Threshold: ${confidenceThreshold}`);
  console.log(`[OCRWorkflow]   - Human Review Timeout: ${humanReviewTimeout}ms (${humanReviewTimeout / 1000 / 60 / 60}h)`);
  console.log(`[OCRWorkflow]   - Wait Before Poll: ${waitTime}ms`);
  console.log('[OCRWorkflow] Step Configuration:');
  Object.keys(config).forEach((stepId) => {
    const stepConfig = config[stepId as WorkflowStepId];
    const enabled = stepConfig?.enabled !== false ? 'ENABLED' : 'DISABLED';
    const params = stepConfig?.parameters ? JSON.stringify(stepConfig.parameters) : 'none';
    console.log(`[OCRWorkflow]   - ${stepId}: ${enabled} (params: ${params})`);
  });

  // Workflow state for queries and cancellation
  let currentStep = 'preparing';
  let workflowStatus: 'preparing' | 'submitting' | 'polling' | 'extracting' | 'awaiting_review' | 'storing' | 'completed' | 'failed' = 'preparing';
  let apimRequestId: string | undefined = undefined;
  let retryCount = 0;
  let cancelled = false;
  let cancelMode: 'graceful' | 'immediate' = 'graceful' as 'graceful' | 'immediate';
  let workflowError: string | undefined = undefined;
  let averageConfidence: number | undefined = undefined;
  let requiresReview: boolean = false;
  let humanApproval: HumanApprovalSignal | null = null;

  // Set up query handlers
  setHandler(getStatus, (): WorkflowStatus => {
    return {
      currentStep,
      status: workflowStatus,
      apimRequestId,
      retryCount,
      maxRetries,
      error: workflowError,
      averageConfidence,
      requiresReview
    };
  });

  setHandler(getProgress, (): WorkflowProgress => {
    const progressPercentage = workflowStatus === 'completed'
      ? 100
      : workflowStatus === 'failed'
        ? 0
        : Math.min(Math.round((retryCount / maxRetries) * 100), 99);

    return {
      retryCount,
      maxRetries,
      currentStep,
      apimRequestId,
      progressPercentage
    };
  });

  // Set up signal handler for cancellation
  setHandler(cancelSignal, (signal: CancelSignal) => {
    cancelled = true;
    cancelMode = signal.mode;
    console.log(`[OCRWorkflow] Cancellation requested with mode: ${cancelMode}`);
  });

  // Set up signal handler for human approval
  setHandler(humanApprovalSignal, (signal: HumanApprovalSignal) => {
    humanApproval = signal;
    console.log(`[OCRWorkflow] Human approval received: ${signal.approved ? 'approved' : 'rejected'}`);
  });

  try {
    // Step 1: Update document status to ongoing_ocr
    if (isStepEnabled('updateStatus')) {
      console.log('[OCRWorkflow] ========================================');
      console.log('[OCRWorkflow] Step 1: Update Document Status');
      console.log('[OCRWorkflow] ========================================');
      console.log(`[OCRWorkflow] Parameters: documentId=${documentId}, status=ongoing_ocr`);
      currentStep = 'Updating document status';
      workflowStatus = 'preparing';
      await updateDocumentStatus(documentId, 'ongoing_ocr');
      console.log('[OCRWorkflow] ✓ Document status updated to ongoing_ocr');

      if (cancelled && cancelMode === 'immediate') {
        throw new Error('Workflow cancelled (immediate mode)');
      }
    } else {
      console.log('[OCRWorkflow] Step 1: Update Document Status - SKIPPED (disabled)');
    }

    // Step 2: Prepare file data
    let fileData: PreparedFileData;
    if (isStepEnabled('prepareFileData')) {
      console.log('[OCRWorkflow] ========================================');
      console.log('[OCRWorkflow] Step 2: Prepare File Data');
      console.log('[OCRWorkflow] ========================================');
      console.log(`[OCRWorkflow] Parameters: fileName=${input.fileName}, fileType=${input.fileType}, contentType=${input.contentType}`);
      console.log(`[OCRWorkflow] Binary data size: ${input.binaryData ? input.binaryData.length : 0} characters`);
      currentStep = 'Preparing file data';
      fileData = await prepareFileData(input);
      console.log(`[OCRWorkflow] ✓ File data prepared: modelId=${fileData.modelId}, fileName=${fileData.fileName}, fileType=${fileData.fileType}`);

      if (cancelled && cancelMode === 'immediate') {
        throw new Error('Workflow cancelled (immediate mode)');
      }
    } else {
      throw new Error('prepareFileData step is required and cannot be disabled');
    }

    // Step 3: Submit to Azure OCR (returns submission result with request ID)
    let submissionResult: SubmissionResult;
    if (isStepEnabled('submitToAzureOCR')) {
      console.log('[OCRWorkflow] ========================================');
      console.log('[OCRWorkflow] Step 3: Submit to Azure OCR');
      console.log('[OCRWorkflow] ========================================');
      console.log(`[OCRWorkflow] Parameters: modelId=${fileData.modelId}, fileName=${fileData.fileName}, fileType=${fileData.fileType}`);
      currentStep = 'Submitting to Azure OCR';
      workflowStatus = 'submitting';
      submissionResult = await submitToAzureOCR(fileData);
      apimRequestId = submissionResult.apimRequestId;
      console.log(`[OCRWorkflow] ✓ Submitted to Azure OCR: apimRequestId=${apimRequestId}`);

      if (cancelled && cancelMode === 'immediate') {
        throw new Error('Workflow cancelled (immediate mode)');
      }
    } else {
      throw new Error('submitToAzureOCR step is required and cannot be disabled');
    }

    // Step 4: Update document with apim_request_id
    if (isStepEnabled('updateApimRequestId')) {
      console.log('[OCRWorkflow] ========================================');
      console.log('[OCRWorkflow] Step 4: Update Document with APIM Request ID');
      console.log('[OCRWorkflow] ========================================');
      console.log(`[OCRWorkflow] Parameters: documentId=${documentId}, apimRequestId=${submissionResult.apimRequestId}`);
      await updateDocumentStatus(documentId, 'ongoing_ocr', submissionResult.apimRequestId);
      console.log(`[OCRWorkflow] ✓ Document updated with apimRequestId=${submissionResult.apimRequestId}`);
    } else {
      console.log('[OCRWorkflow] Step 4: Update Document with APIM Request ID - SKIPPED (disabled)');
    }

    // Step 5: Wait before first poll
    if (isStepEnabled('waitBeforePoll')) {
      console.log('[OCRWorkflow] ========================================');
      console.log('[OCRWorkflow] Step 5: Wait Before Poll');
      console.log('[OCRWorkflow] ========================================');
      console.log(`[OCRWorkflow] Parameters: waitTime=${waitTime}ms`);
      await sleep(waitTime);
      console.log(`[OCRWorkflow] ✓ Waited ${waitTime}ms before polling`);
    } else {
      console.log('[OCRWorkflow] Step 5: Wait Before Poll - SKIPPED (disabled)');
    }

    // Step 6: Poll loop with retry logic
    let pollResult: PollResult | null = null;
    let ocrResponse: PollResult['response'] | undefined = undefined;

    if (isStepEnabled('pollOCRResults')) {
      console.log('[OCRWorkflow] ========================================');
      console.log('[OCRWorkflow] Step 6: Poll OCR Results');
      console.log('[OCRWorkflow] ========================================');
      console.log(`[OCRWorkflow] Parameters: apimRequestId=${submissionResult.apimRequestId}, modelId=${fileData.modelId}`);
      console.log(`[OCRWorkflow] Poll Configuration: maxRetries=${maxRetries}, waitBeforeFirstPoll=${waitBeforeFirstPoll}ms, waitBetweenPolls=${waitBetweenPolls}ms`);
      currentStep = 'Polling OCR results';
      workflowStatus = 'polling';
      retryCount = 0;

      // Wait before first poll if configured
      if (waitBeforeFirstPoll > 0) {
        console.log(`[OCRWorkflow] Waiting ${waitBeforeFirstPoll}ms before first poll...`);
        await sleep(waitBeforeFirstPoll);
      }

      console.log('[OCRWorkflow] Starting polling loop...');
      while (true) {
        // Check for cancellation
        if (cancelled) {
          if (cancelMode === 'immediate') {
            throw new Error('Workflow cancelled (immediate mode)');
          }
          // Graceful cancellation: break after current activity completes
          console.log('[OCRWorkflow] Workflow cancelled (graceful mode), will stop after current poll');
          break;
        }

        // Poll OCR results (pass modelId from fileData)
        console.log(`[OCRWorkflow] Polling attempt ${retryCount + 1}/${maxRetries}...`);
        pollResult = await pollOCRResults(submissionResult.apimRequestId, fileData.modelId);
        console.log(`[OCRWorkflow] Poll result: status=${pollResult.status}`);

        // If status is not "running", break the loop
        if (pollResult.status !== 'running') {
          ocrResponse = pollResult.response;
          console.log(`[OCRWorkflow] ✓ Polling completed: status=${pollResult.status}, total attempts=${retryCount + 1}`);
          break;
        }

        // Status is "running", increment retry count
        retryCount++;
        console.log(`[OCRWorkflow] Status is still "running", retry count: ${retryCount}/${maxRetries}`);

        // Check if max retries exceeded
        if (retryCount >= maxRetries) {
          workflowStatus = 'failed';
          workflowError = `OCR processing timed out after ${maxRetries} retries. Last status: ${pollResult.status}`;
          console.error(`[OCRWorkflow] ✗ Max retries exceeded: ${retryCount}/${maxRetries}`);
          if (isStepEnabled('updateStatus')) {
            await updateDocumentStatus(documentId, 'failed');
          }
          throw new Error(workflowError);
        }

        // Wait before next poll
        console.log(`[OCRWorkflow] Waiting ${waitBetweenPolls}ms before next poll...`);
        await sleep(waitBetweenPolls);
      }
    } else {
      throw new Error('pollOCRResults step is required and cannot be disabled');
    }

    if (cancelled && cancelMode === 'graceful') {
      workflowStatus = 'failed';
      workflowError = 'Workflow cancelled (graceful mode)';
      if (isStepEnabled('updateStatus')) {
        await updateDocumentStatus(documentId, 'failed');
      }
      throw new Error(workflowError);
    }

    // Step 7: Extract OCR results
    let result: OCRResult;
    if (isStepEnabled('extractOCRResults')) {
      console.log('[OCRWorkflow] ========================================');
      console.log('[OCRWorkflow] Step 7: Extract OCR Results');
      console.log('[OCRWorkflow] ========================================');
      console.log(`[OCRWorkflow] Parameters: apimRequestId=${submissionResult.apimRequestId}, fileName=${fileData.fileName}, fileType=${fileData.fileType}, modelId=${fileData.modelId}`);
      currentStep = 'Extracting OCR results';
      workflowStatus = 'extracting';
      result = await extractOCRResults(
        submissionResult.apimRequestId,
        fileData.fileName,
        fileData.fileType,
        fileData.modelId,
        ocrResponse
      );
      console.log(`[OCRWorkflow] ✓ OCR results extracted: pages=${result.pages.length}, tables=${result.tables.length}, paragraphs=${result.paragraphs.length}, keyValuePairs=${result.keyValuePairs.length}`);
      console.log(`[OCRWorkflow] Extracted text length: ${result.extractedText.length} characters`);
    } else {
      throw new Error('extractOCRResults step is required and cannot be disabled');
    }

    // Step 8: Post-OCR cleanup
    let cleanedResult: OCRResult = result;
    if (isStepEnabled('postOcrCleanup')) {
      console.log('[OCRWorkflow] ========================================');
      console.log('[OCRWorkflow] Step 8: Post-OCR Cleanup');
      console.log('[OCRWorkflow] ========================================');
      console.log(`[OCRWorkflow] Parameters: processing OCR result with ${result.pages.length} pages`);
      currentStep = 'Post-OCR cleanup';
      workflowStatus = 'extracting';
      cleanedResult = await postOcrCleanup(result);
      console.log(`[OCRWorkflow] ✓ Post-OCR cleanup completed: pages=${cleanedResult.pages.length}, tables=${cleanedResult.tables.length}`);
    } else {
      console.log('[OCRWorkflow] Step 8: Post-OCR Cleanup - SKIPPED (disabled)');
    }

    // Step 9: Check confidence and trigger human review if needed
    let confidenceResult: { averageConfidence: number; requiresReview: boolean } | undefined = undefined;
    if (isStepEnabled('checkOcrConfidence')) {
      console.log('[OCRWorkflow] ========================================');
      console.log('[OCRWorkflow] Step 9: Check OCR Confidence');
      console.log('[OCRWorkflow] ========================================');
      console.log(`[OCRWorkflow] Parameters: documentId=${documentId}, confidenceThreshold=${confidenceThreshold}`);
      currentStep = 'Checking OCR confidence';
      workflowStatus = 'extracting';
      confidenceResult = await checkOcrConfidence(documentId, cleanedResult, confidenceThreshold);
      averageConfidence = confidenceResult.averageConfidence;
      requiresReview = confidenceResult.requiresReview;
      console.log(`[OCRWorkflow] ✓ Confidence check completed: averageConfidence=${(averageConfidence * 100).toFixed(2)}%, requiresReview=${requiresReview}`);
    } else {
      console.log('[OCRWorkflow] Step 9: Check OCR Confidence - SKIPPED (disabled)');
    }

    // Step 10: Store OCR results in database BEFORE human review
    // This ensures OCR results are available for reviewers to see
    if (isStepEnabled('storeResults')) {
      console.log('[OCRWorkflow] ========================================');
      console.log('[OCRWorkflow] Step 10: Store OCR Results');
      console.log('[OCRWorkflow] ========================================');
      console.log(`[OCRWorkflow] Parameters: documentId=${documentId}`);
      console.log(`[OCRWorkflow] Storing results: pages=${cleanedResult.pages.length}, tables=${cleanedResult.tables.length}, paragraphs=${cleanedResult.paragraphs.length}, keyValuePairs=${cleanedResult.keyValuePairs.length}`);
      currentStep = 'Storing OCR results';
      workflowStatus = 'storing';
      // Store OCR results - status will be set to completed_ocr in database
      // The workflow status "awaiting_review" will be used by frontend to determine if review is needed
      await upsertOcrResult(documentId, cleanedResult);
      console.log(`[OCRWorkflow] ✓ OCR results stored in database for document ${documentId}`);
    } else {
      throw new Error('storeResults step is required and cannot be disabled');
    }

    // Step 11: Human-in-the-loop review if confidence is below threshold
    if (requiresReview && isStepEnabled('humanReview')) {
      console.log('[OCRWorkflow] ========================================');
      console.log('[OCRWorkflow] Step 10: Human Review');
      console.log('[OCRWorkflow] ========================================');
      console.log(`[OCRWorkflow] Parameters: timeout=${humanReviewTimeout}ms (${humanReviewTimeout / 1000 / 60 / 60}h)`);
      console.log(`[OCRWorkflow] Low confidence detected (${(averageConfidence! * 100).toFixed(2)}%), awaiting human review`);
      currentStep = 'Awaiting human review';
      workflowStatus = 'awaiting_review';
      humanApproval = null; // Reset approval state

      // Wait for human approval signal with configured timeout
      console.log(`[OCRWorkflow] Waiting for human approval (timeout: ${humanReviewTimeout / 1000 / 60 / 60}h)...`);
      await condition(() => humanApproval !== null, humanReviewTimeout);

      // Check if approval was received (condition may timeout)
      if (!humanApproval) {
        workflowStatus = 'failed';
        workflowError = `Human review timeout - no approval received within ${humanReviewTimeout / 1000 / 60 / 60} hours`;
        console.log(`[OCRWorkflow] ✗ Human review timeout: ${workflowError}`);
        if (isStepEnabled('updateStatus')) {
          await updateDocumentStatus(documentId, 'failed');
        }
        // Use ApplicationFailure to distinguish business timeout from application errors
        throw ApplicationFailure.create({
          message: workflowError,
          type: 'HUMAN_REVIEW_TIMEOUT',
          nonRetryable: true
        });
      }

      // TypeScript type narrowing - we know humanApproval is not null here
      const approval = humanApproval as HumanApprovalSignal;

      if (!approval.approved) {
        workflowStatus = 'failed';
        workflowError = approval.comments || 'Human reviewer rejected the OCR results';
        console.log(`[OCRWorkflow] ✗ Human review rejected: ${workflowError}`);
        
        // Validate rejection reason is provided
        if (!approval.rejectionReason) {
          console.error(`[OCRWorkflow] Rejection reason is required when rejecting a document`);
          throw new Error('Rejection reason is required when rejecting a document');
        }
        
        // Store rejection data in database
        if (isStepEnabled('updateStatus')) {
          await storeDocumentRejection(
            documentId,
            approval.rejectionReason,
            approval.reviewer,
            approval.annotations
          );
          await updateDocumentStatus(documentId, 'rejected_by_human');
        }
        
        // Use ApplicationFailure to distinguish business rejection from application errors
        // This prevents it from being logged as an application error with stack trace
        throw ApplicationFailure.create({
          message: workflowError,
          type: 'HUMAN_REVIEW_REJECTED',
          nonRetryable: true,
          details: [
            approval.reviewer || 'unknown',
            approval.comments || '',
            approval.rejectionReason || '',
            approval.annotations || ''
          ]
        });
      }

      console.log(`[OCRWorkflow] ✓ Human approval received: ${approval.reviewer || 'unknown reviewer'}`);
      if (approval.comments) {
        console.log(`[OCRWorkflow] Reviewer comments: ${approval.comments}`);
      }
    } else if (requiresReview && !isStepEnabled('humanReview')) {
      // If review is required but human review step is disabled, fail the workflow
      workflowStatus = 'failed';
      workflowError = 'OCR confidence below threshold but human review step is disabled';
      console.error(`[OCRWorkflow] ✗ ${workflowError}`);
      if (isStepEnabled('updateStatus')) {
        await updateDocumentStatus(documentId, 'failed');
      }
      throw new Error(workflowError);
    } else {
      console.log('[OCRWorkflow] Step 11: Human Review - SKIPPED (not required or disabled)');
    }

    workflowStatus = 'completed';
    currentStep = 'Completed';
    console.log('[OCRWorkflow] ========================================');
    console.log('[OCRWorkflow] Workflow Completed Successfully');
    console.log('[OCRWorkflow] ========================================');
    console.log(`[OCRWorkflow] Final Status: ${workflowStatus}`);
    console.log(`[OCRWorkflow] Document ID: ${documentId}`);
    console.log(`[OCRWorkflow] APIM Request ID: ${apimRequestId}`);
    console.log(`[OCRWorkflow] Total Polling Attempts: ${retryCount + 1}`);
    if (averageConfidence !== undefined) {
      console.log(`[OCRWorkflow] Average Confidence: ${(averageConfidence * 100).toFixed(2)}%`);
    }
    return cleanedResult;
  } catch (error) {
    workflowStatus = 'failed';
    workflowError = error instanceof Error ? error.message : 'Unknown error';
    currentStep = 'Failed';

    // Check if this is a business failure (ApplicationFailure) vs application error
    const isBusinessFailure = error instanceof ApplicationFailure;
    const logMethod = isBusinessFailure ? console.log : console.error;
    const logPrefix = isBusinessFailure ? '[OCRWorkflow] Business Failure' : '[OCRWorkflow] Workflow Failed';

    logMethod('[OCRWorkflow] ========================================');
    logMethod(logPrefix);
    logMethod('[OCRWorkflow] ========================================');
    logMethod(`[OCRWorkflow] ${isBusinessFailure ? 'Reason' : 'Error'}: ${workflowError}`);
    logMethod(`[OCRWorkflow] Current Step: ${currentStep}`);
    logMethod(`[OCRWorkflow] Document ID: ${documentId}`);
    logMethod(`[OCRWorkflow] APIM Request ID: ${apimRequestId || 'N/A'}`);
    logMethod(`[OCRWorkflow] Retry Count: ${retryCount}`);
    if (error instanceof ApplicationFailure) {
      logMethod(`[OCRWorkflow] Failure Type: ${error.type || 'UNKNOWN'}`);
    } else if (error instanceof Error && error.stack) {
      // Only log stack trace for application errors, not business failures
      console.error(`[OCRWorkflow] Stack Trace: ${error.stack}`);
    }

    // Update document status to failed on any error (if step is enabled)
    if (isStepEnabled('updateStatus')) {
      try {
        console.log(`[OCRWorkflow] Updating document status to 'failed'...`);
        await updateDocumentStatus(documentId, 'failed');
        console.log(`[OCRWorkflow] ✓ Document status updated to 'failed'`);
      } catch (updateError) {
        // Log but don't throw - we want to propagate the original error
        console.error(`[OCRWorkflow] ✗ Failed to update document status to failed: ${updateError}`);
      }
    }
    throw error;
  }
}

