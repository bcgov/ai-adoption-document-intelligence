#!/usr/bin/env ts-node
/**
 * Integration Test: Graph Workflow Execution
 *
 * Tests the complete workflow execution with real backend services, Temporal, and database.
 * This test will run until it encounters the current error to help debug the issue.
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Connection, Client, WorkflowExecutionStatusName } from '@temporalio/client';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// --- Configuration ---
const CONFIG = {
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:3002',
  TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
  TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE || 'default',
  TEST_API_KEY: process.env.TEST_API_KEY || '',
  TEST_TIMEOUT: parseInt(process.env.TEST_TIMEOUT || '300000', 10), // 5 minutes
  POLL_INTERVAL: 2000, // 2 seconds
};

// --- Types ---
interface GraphWorkflowConfig {
  schemaVersion: string;
  metadata: {
    name?: string;
    description?: string;
    tags?: string[];
  };
  entryNodeId: string;
  ctx: Record<string, unknown>;
  nodes: Record<string, unknown>;
  edges: Array<unknown>;
}

interface WorkflowInfo {
  id: string;
  name: string;
  description: string | null;
  config: GraphWorkflowConfig;
}

interface UploadResponse {
  id: string;
  title: string;
  status: string;
  file_path: string;
}

interface WorkflowStatus {
  status: WorkflowExecutionStatusName;
  result?: unknown;
}

interface WorkflowProgress {
  currentStep: string;
  status: string;
  apimRequestId?: string;
  retryCount?: number;
  maxRetries?: number;
  error?: string;
}

// --- Test State ---
let testDocumentId: string | null = null;
let testWorkflowConfigId: string | null = null;
let workflowExecutionId: string | null = null;
let api: AxiosInstance;
let temporalClient: Client | null = null;
let temporalConnection: Connection | null = null;

// --- Utilities ---
function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info'): void {
  const timestamp = new Date().toISOString();
  const symbols = { info: 'ℹ', success: '✓', error: '✗', warn: '⚠' };
  const colors = {
    info: '\x1b[36m',    // cyan
    success: '\x1b[32m', // green
    error: '\x1b[31m',   // red
    warn: '\x1b[33m',    // yellow
  };
  const reset = '\x1b[0m';
  console.log(`${colors[type]}${symbols[type]}${reset} [${timestamp}] ${message}`);
}

function section(title: string): void {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80) + '\n');
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Pre-flight Checks ---
async function checkTemporalServer(): Promise<boolean> {
  try {
    log('Checking Temporal Server connectivity...');
    const conn = await Connection.connect({ address: CONFIG.TEMPORAL_ADDRESS });
    const client = new Client({ connection: conn, namespace: CONFIG.TEMPORAL_NAMESPACE });

    // Try to list workflows to verify connection
    const workflows = client.workflow.list();
    let count = 0;
    for await (const _workflow of workflows) {
      count++;
      if (count >= 1) break;
    }

    await conn.close();
    log(`Temporal Server connected at ${CONFIG.TEMPORAL_ADDRESS}`, 'success');
    return true;
  } catch (error) {
    log(`Failed to connect to Temporal: ${error.message}`, 'error');
    return false;
  }
}

async function checkBackendAPI(): Promise<boolean> {
  try {
    log('Checking Backend API health...');
    // Try /api/models endpoint - even 401 means the server is running
    const response = await axios.get(`${CONFIG.BACKEND_URL}/api/models`, {
      timeout: 5000,
      validateStatus: (status) => status < 500 // Accept any status < 500 (including 401)
    });

    if (response.status === 200 || response.status === 401) {
      log(`Backend API healthy at ${CONFIG.BACKEND_URL}`, 'success');
      return true;
    }
    log(`Backend API returned unexpected status: ${response.status}`, 'warn');
    return false;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      log(`Backend API not reachable at ${CONFIG.BACKEND_URL}`, 'error');
    } else {
      log(`Backend API check failed: ${error.message}`, 'error');
    }
    return false;
  }
}

async function runPreflightChecks(): Promise<boolean> {
  section('Pre-flight Checks');

  const temporalOk = await checkTemporalServer();
  const backendOk = await checkBackendAPI();

  const allOk = temporalOk && backendOk;

  if (allOk) {
    log('All pre-flight checks passed', 'success');
  } else {
    log('Some pre-flight checks failed', 'error');
  }

  return allOk;
}

// --- Test Data Preparation ---
async function loadWorkflowConfig(): Promise<GraphWorkflowConfig> {
  log('Loading workflow configuration from template...');
  const templatePath = path.join(__dirname, '../../../docs/templates/standard-ocr-workflow.json');

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Workflow template not found at ${templatePath}`);
  }

  const configData = fs.readFileSync(templatePath, 'utf-8');
  const config = JSON.parse(configData) as GraphWorkflowConfig;

  log(`Loaded workflow config: ${config.metadata.name || 'Unnamed'}`, 'success');
  return config;
}

async function loadTestFile(): Promise<string> {
  log('Loading test document...');
  const testFilePath = path.join(__dirname, 'test-document.jpg');

  if (!fs.existsSync(testFilePath)) {
    throw new Error(`Test file not found at ${testFilePath}`);
  }

  const fileBuffer = fs.readFileSync(testFilePath);
  const base64 = fileBuffer.toString('base64');

  log(`Test file loaded: ${(fileBuffer.length / 1024).toFixed(2)} KB`, 'success');
  return base64;
}

async function createWorkflowConfig(config: GraphWorkflowConfig): Promise<string> {
  log('Creating workflow configuration in database...');

  try {
    const response = await api.post('/api/workflows', {
      name: config.metadata.name || 'Integration Test Workflow',
      description: config.metadata.description || 'Workflow for integration testing',
      config: config,
    });

    const workflowInfo = response.data.workflow as WorkflowInfo;
    log(`Workflow config created with ID: ${workflowInfo.id}`, 'success');
    return workflowInfo.id;
  } catch (error) {
    log(`Failed to create workflow config: ${error.message}`, 'error');
    if (error.response) {
      log(`Response: ${JSON.stringify(error.response.data)}`, 'error');
    }
    throw error;
  }
}

async function uploadDocument(fileBase64: string, workflowConfigId: string): Promise<UploadResponse> {
  log('Uploading test document...');

  try {
    const response = await api.post('/api/upload', {
      title: 'Integration Test Document',
      file: fileBase64,
      file_type: 'image',
      original_filename: 'test-document.jpg',
      model_id: 'prebuilt-layout',
      workflow_config_id: workflowConfigId,
      metadata: {
        test: true,
        testRun: new Date().toISOString(),
      },
    });

    // The upload response has structure: { success: boolean, document: {...} }
    const uploadData = response.data.document;
    log(`Document uploaded with ID: ${uploadData.id}`, 'success');
    log(`Document status: ${uploadData.status}`, 'info');
    return {
      id: uploadData.id,
      title: uploadData.title,
      status: uploadData.status,
      file_path: uploadData.file_path || '',
    };
  } catch (error: any) {
    log(`Failed to upload document: ${error.message}`, 'error');
    if (error.response) {
      log(`Response: ${JSON.stringify(error.response.data)}`, 'error');
    }
    throw error;
  }
}

async function setupTestData(): Promise<void> {
  section('Test Setup');

  const workflowConfig = await loadWorkflowConfig();
  const fileBase64 = await loadTestFile();

  testWorkflowConfigId = await createWorkflowConfig(workflowConfig);
  const uploadResponse = await uploadDocument(fileBase64, testWorkflowConfigId);
  testDocumentId = uploadResponse.id;

  // The workflow execution ID follows the pattern: graph-{documentId}
  workflowExecutionId = `graph-${testDocumentId}`;

  log(`Workflow execution ID: ${workflowExecutionId}`, 'info');
}

// --- Workflow Monitoring ---
async function initTemporalClient(): Promise<void> {
  log('Initializing Temporal client for monitoring...');
  temporalConnection = await Connection.connect({ address: CONFIG.TEMPORAL_ADDRESS });
  temporalClient = new Client({
    connection: temporalConnection,
    namespace: CONFIG.TEMPORAL_NAMESPACE,
  });
  log('Temporal client initialized', 'success');
}

async function getWorkflowStatus(): Promise<WorkflowStatus> {
  if (!temporalClient || !workflowExecutionId) {
    throw new Error('Temporal client or workflow ID not initialized');
  }

  const handle = temporalClient.workflow.getHandle(workflowExecutionId);
  const description = await handle.describe();

  return {
    status: description.status.name,
    result: description.status.name === 'COMPLETED' ? await handle.result() : undefined,
  };
}

async function queryWorkflowProgress(): Promise<WorkflowProgress | null> {
  if (!temporalClient || !workflowExecutionId) {
    throw new Error('Temporal client or workflow ID not initialized');
  }

  try {
    const handle = temporalClient.workflow.getHandle(workflowExecutionId);
    const status = await handle.query<WorkflowProgress>('getStatus');
    return status;
  } catch (error) {
    // Query might not be available yet or workflow might not support it
    return null;
  }
}

async function displayDetailedErrorInfo(): Promise<void> {
  if (!temporalClient || !workflowExecutionId) {
    return;
  }

  try {
    log('\n📋 Detailed Error Information:', 'warn');

    const handle = temporalClient.workflow.getHandle(workflowExecutionId);

    // Get workflow description which includes failure info
    const description = await handle.describe();

    // Check if there's a failure
    if (description.status.name === 'FAILED') {
      // Try to get the workflow result which contains the error
      try {
        await handle.result();
      } catch (workflowError: any) {
        if (workflowError.cause) {
          log(`\n❌ Workflow Error:`, 'error');
          log(`   Type: ${workflowError.cause.name || 'Error'}`, 'error');
          log(`   Message: ${workflowError.cause.message}`, 'error');

          // Extract activity information if available
          if (workflowError.cause.activityType) {
            log(`   Activity Type: ${workflowError.cause.activityType}`, 'error');
          }
          if (workflowError.cause.activityId) {
            log(`   Activity ID: ${workflowError.cause.activityId}`, 'error');
          }
          if (workflowError.cause.attempt !== undefined) {
            log(`   Attempt: ${workflowError.cause.attempt}`, 'error');
          }

          if (workflowError.cause.stack) {
            log(`\n   Stack Trace:`, 'error');
            const stackLines = workflowError.cause.stack.split('\n').slice(0, 10);
            stackLines.forEach((line: string) => {
              log(`   ${line}`, 'error');
            });
          }

          // If there's a nested cause (activity failure)
          if (workflowError.cause.cause) {
            log(`\n❌ Activity Error (Root Cause):`, 'error');
            log(`   Type: ${workflowError.cause.cause.name || 'Error'}`, 'error');
            log(`   Message: ${workflowError.cause.cause.message}`, 'error');

            if (workflowError.cause.cause.stack) {
              log(`\n   Stack Trace:`, 'error');
              const activityStackLines = workflowError.cause.cause.stack.split('\n').slice(0, 15);
              activityStackLines.forEach((line: string) => {
                log(`   ${line}`, 'error');
              });
            }
          }
        } else {
          log(`Error: ${workflowError.message}`, 'error');
        }
      }
    }

    log('', 'info');
  } catch (error: any) {
    log(`Could not fetch detailed error info: ${error.message}`, 'warn');
  }
}

async function monitorWorkflow(): Promise<void> {
  section('Workflow Execution');

  await initTemporalClient();

  log(`Monitoring workflow: ${workflowExecutionId}`);
  log('Waiting for workflow to start...');

  // Wait a bit for workflow to start
  await sleep(2000);

  const startTime = Date.now();
  let lastStep = '';
  let lastStatus = '';

  while (true) {
    const elapsed = Date.now() - startTime;

    if (elapsed > CONFIG.TEST_TIMEOUT) {
      log(`Workflow timeout after ${(elapsed / 1000).toFixed(1)}s`, 'error');
      break;
    }

    try {
      const status = await getWorkflowStatus();
      const progress = await queryWorkflowProgress();

      // Log progress if step changed
      if (progress && (progress.currentStep !== lastStep || progress.status !== lastStatus)) {
        const stepInfo = progress.currentStep || 'unknown';
        const statusInfo = progress.status || 'unknown';

        if (lastStep && lastStep !== progress.currentStep) {
          log(`  ✓ Step completed: ${lastStep}`, 'success');
        }

        if (statusInfo === 'running') {
          log(`  ⏳ Step: ${stepInfo} (${statusInfo})`, 'info');
        } else if (statusInfo === 'awaiting_review') {
          log(`  🤖 Step: ${stepInfo} (awaiting human review)`, 'warn');
        } else {
          log(`  → Step: ${stepInfo} (${statusInfo})`, 'info');
        }

        if (progress.error) {
          log(`  Error: ${progress.error}`, 'error');
        }

        lastStep = progress.currentStep;
        lastStatus = progress.status;
      }

      // Check workflow execution status
      if (status.status === 'COMPLETED') {
        log(`Workflow completed successfully in ${(elapsed / 1000).toFixed(1)}s`, 'success');
        log(`Result: ${JSON.stringify(status.result, null, 2)}`, 'info');
        break;
      } else if (status.status === 'FAILED') {
        log(`Workflow failed after ${(elapsed / 1000).toFixed(1)}s`, 'error');

        if (progress && progress.error) {
          log(`Last error: ${progress.error}`, 'error');
        }

        // Fetch detailed error information from workflow history
        await displayDetailedErrorInfo();
        break;
      } else if (status.status === 'RUNNING') {
        // Continue monitoring
      } else {
        log(`Workflow status: ${status.status}`, 'warn');
        break;
      }

    } catch (error) {
      log(`Error monitoring workflow: ${error.message}`, 'error');
      break;
    }

    await sleep(CONFIG.POLL_INTERVAL);
  }
}

// --- Cleanup ---
async function cleanup(): Promise<void> {
  section('Cleanup');

  try {
    if (temporalConnection) {
      await temporalConnection.close();
      log('Temporal connection closed', 'success');
    }

    if (testDocumentId) {
      try {
        await api.delete(`/api/documents/${testDocumentId}`);
        log(`Test document deleted: ${testDocumentId}`, 'success');
      } catch (error) {
        log(`Could not delete test document: ${error.message}`, 'warn');
      }
    }

    if (testWorkflowConfigId) {
      try {
        await api.delete(`/api/workflows/${testWorkflowConfigId}`);
        log(`Test workflow config deleted: ${testWorkflowConfigId}`, 'success');
      } catch (error) {
        log(`Could not delete workflow config: ${error.message}`, 'warn');
      }
    }
  } catch (error) {
    log(`Cleanup error: ${error.message}`, 'warn');
  }
}

// --- Main Test Flow ---
async function runIntegrationTest(): Promise<void> {
  console.log('\n');
  section('🔍 Integration Test: Graph Workflow Execution');

  try {
    // Initialize API client with API key authentication
    if (!CONFIG.TEST_API_KEY) {
      log('TEST_API_KEY environment variable not set', 'error');
      log('Please set TEST_API_KEY in your .env file', 'error');
      process.exit(1);
    }

    api = axios.create({
      baseURL: CONFIG.BACKEND_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.TEST_API_KEY,
      },
    });

    // Run pre-flight checks
    const checksOk = await runPreflightChecks();
    if (!checksOk) {
      log('Pre-flight checks failed. Please ensure all services are running.', 'error');
      log('  - Temporal Server: cd apps/temporal && docker-compose up -d', 'info');
      log('  - Temporal Worker: cd apps/temporal && npm run dev', 'info');
      log('  - Backend Database: cd apps/backend-services && docker-compose up -d', 'info');
      log('  - Backend Services: cd apps/backend-services && npm run start:dev', 'info');
      process.exit(1);
    }

    // Setup test data
    await setupTestData();

    // Monitor workflow execution
    await monitorWorkflow();

    // Cleanup
    await cleanup();

    section('✅ Integration Test Completed');

  } catch (error) {
    log(`Test failed with error: ${error.message}`, 'error');
    if (error.stack) {
      console.error(error.stack);
    }

    // Attempt cleanup even on failure
    try {
      await cleanup();
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  runIntegrationTest().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { runIntegrationTest };
