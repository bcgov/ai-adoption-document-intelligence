/**
 * Temporal Workflow for Azure OCR Document Processing
 * This workflow orchestrates the OCR process with polling and retry logic
 */

import { sleep, proxyActivities, setHandler, defineQuery, defineSignal } from '@temporalio/workflow';
import type { OCRWorkflowInput, OCRResult, PreparedFileData, SubmissionResult, PollResult, WorkflowStatus, WorkflowProgress, CancelSignal } from './types';
import type * as activities from './activities';

// Define queries
export const getStatus = defineQuery<WorkflowStatus>('getStatus');
export const getProgress = defineQuery<WorkflowProgress>('getProgress');

// Define signals
export const cancelSignal = defineSignal<[CancelSignal]>('cancel');

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

const { upsertOcrResult } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    maximumAttempts: 5,
    initialInterval: '1s',
    backoffCoefficient: 2.0,
    maximumInterval: '30s'
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

  // Workflow state for queries and cancellation
  let currentStep = 'preparing';
  let workflowStatus: 'preparing' | 'submitting' | 'polling' | 'extracting' | 'storing' | 'completed' | 'failed' = 'preparing';
  let apimRequestId: string | undefined = undefined;
  let retryCount = 0;
  const maxRetries = 20;
  let cancelled = false;
  let cancelMode: 'graceful' | 'immediate' = 'graceful' as 'graceful' | 'immediate';
  let workflowError: string | undefined = undefined;

  // Set up query handlers
  setHandler(getStatus, (): WorkflowStatus => {
    return {
      currentStep,
      status: workflowStatus,
      apimRequestId,
      retryCount,
      maxRetries,
      error: workflowError
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

  try {
    // Step 1: Update document status to ongoing_ocr
    currentStep = 'Updating document status';
    workflowStatus = 'preparing';
    await updateDocumentStatus(documentId, 'ongoing_ocr');

    if (cancelled && cancelMode === 'immediate') {
      throw new Error('Workflow cancelled (immediate mode)');
    }

    // Step 2: Prepare file data
    currentStep = 'Preparing file data';
    const fileData: PreparedFileData = await prepareFileData(input);

    if (cancelled && cancelMode === 'immediate') {
      throw new Error('Workflow cancelled (immediate mode)');
    }

    // Step 3: Submit to Azure OCR (returns submission result with request ID)
    currentStep = 'Submitting to Azure OCR';
    workflowStatus = 'submitting';
    const submissionResult: SubmissionResult = await submitToAzureOCR(fileData);
    apimRequestId = submissionResult.apimRequestId;

    if (cancelled && cancelMode === 'immediate') {
      throw new Error('Workflow cancelled (immediate mode)');
    }

    // Step 4: Update document with apim_request_id
    await updateDocumentStatus(documentId, 'ongoing_ocr', submissionResult.apimRequestId);

    // Step 5: Wait 5 seconds before first poll (matching n8n workflow)
    await sleep(5000);

    // Step 6: Poll loop with retry logic
    currentStep = 'Polling OCR results';
    workflowStatus = 'polling';
    retryCount = 0;
    let pollResult: PollResult | null = null;
    let ocrResponse: PollResult['response'] | undefined = undefined;

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

      // Poll OCR results
      pollResult = await pollOCRResults(submissionResult.apimRequestId);

      // If status is not "running", break the loop
      if (pollResult.status !== 'running') {
        ocrResponse = pollResult.response;
        break;
      }

      // Status is "running", increment retry count
      retryCount++;

      // Check if max retries exceeded
      if (retryCount >= maxRetries) {
        workflowStatus = 'failed';
        workflowError = `OCR processing timed out after ${maxRetries} retries. Last status: ${pollResult.status}`;
        await updateDocumentStatus(documentId, 'failed');
        throw new Error(workflowError);
      }

      // Wait 10 seconds before next poll (matching n8n workflow)
      await sleep(10000);
    }

    if (cancelled && cancelMode === 'graceful') {
      workflowStatus = 'failed';
      workflowError = 'Workflow cancelled (graceful mode)';
      await updateDocumentStatus(documentId, 'failed');
      throw new Error(workflowError);
    }

    // Step 7: Extract OCR results
    currentStep = 'Extracting OCR results';
    workflowStatus = 'extracting';
    const result: OCRResult = await extractOCRResults(
      submissionResult.apimRequestId,
      fileData.fileName,
      fileData.fileType,
      ocrResponse
    );

    // Step 8: Store OCR results in database
    currentStep = 'Storing OCR results';
    workflowStatus = 'storing';
    await upsertOcrResult(documentId, result);

    workflowStatus = 'completed';
    currentStep = 'Completed';
    return result;
  } catch (error) {
    workflowStatus = 'failed';
    workflowError = error instanceof Error ? error.message : 'Unknown error';
    currentStep = 'Failed';

    // Update document status to failed on any error
    try {
      await updateDocumentStatus(documentId, 'failed');
    } catch (updateError) {
      // Log but don't throw - we want to propagate the original error
      console.error(`[OCRWorkflow] Failed to update document status to failed: ${updateError}`);
    }
    throw error;
  }
}

