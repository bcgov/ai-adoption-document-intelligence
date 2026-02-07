/**
 * Temporal Client for OCR Workflow
 * Provides functions to trigger workflow executions
 */

import { Connection, Client } from '@temporalio/client';
import { ocrWorkflow } from './workflow';
import type { OCRWorkflowInput, OCRResult } from './types';

// Load environment variables
require('dotenv').config();

const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
const taskQueue = process.env.TEMPORAL_TASK_QUEUE || 'ocr-processing';

/**
 * Create a Temporal client connection
 */
async function createClient(): Promise<Client> {
  const connection = await Connection.connect({
    address,
    // TLS configuration can be added here if needed
  });

  return new Client({
    connection,
    namespace,
  });
}

/**
 * Start an OCR workflow execution
 * @param input Workflow input with file data
 * @returns Workflow execution handle
 */
export async function startOCRWorkflow(input: OCRWorkflowInput) {
  const client = await createClient();

  console.log(`[Client] Starting OCR workflow for file: ${input.fileName || 'document'}`);

  const handle = await client.workflow.start(ocrWorkflow, {
    args: [input],
    taskQueue,
    workflowId: `ocr-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    workflowExecutionTimeout: '30 minutes',
  });

  console.log(`[Client] Workflow started with ID: ${handle.workflowId}`);
  return handle;
}

/**
 * Start an OCR workflow and wait for result
 * @param input Workflow input with file data
 * @returns OCR result
 */
export async function executeOCRWorkflow(input: OCRWorkflowInput): Promise<OCRResult> {
  const handle = await startOCRWorkflow(input);

  console.log(`[Client] Waiting for workflow to complete: ${handle.workflowId}`);
  const result = await handle.result();

  console.log(`[Client] Workflow completed: ${handle.workflowId}`);
  return result;
}

/**
 * Get workflow result by workflow ID
 * @param workflowId Workflow execution ID
 * @returns OCR result
 */
export async function getWorkflowResult(workflowId: string): Promise<OCRResult> {
  const client = await createClient();
  const handle = client.workflow.getHandle(workflowId);

  console.log(`[Client] Getting result for workflow: ${workflowId}`);
  const result = await handle.result();

  return result;
}

/**
 * Example usage function
 */
export async function example() {
  // Example: Start workflow with file data
  const result = await executeOCRWorkflow({
    documentId: 'example-document-id',
    blobKey: 'documents/example-document-id/original.pdf',
    fileName: 'example.pdf',
    fileType: 'pdf',
    contentType: 'application/pdf',
  });

  console.log('OCR Result:', {
    success: result.success,
    status: result.status,
    fileName: result.fileName,
    extractedTextLength: result.extractedText.length,
    pages: result.pages.length,
    tables: result.tables.length,
  });
}

// If run directly, show example
if (require.main === module) {
  console.log('[Client] Example usage:');
  console.log('  import { executeOCRWorkflow } from "./client";');
  console.log('  const result = await executeOCRWorkflow({ ... });');
}

