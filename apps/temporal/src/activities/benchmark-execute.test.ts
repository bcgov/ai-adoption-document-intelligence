import type { GraphWorkflowConfig, GraphWorkflowResult } from '../graph-workflow-types';

// Mock @temporalio/workflow before importing the module
const mockExecuteChild = jest.fn();
const mockWorkflowInfo = jest.fn();

jest.mock('@temporalio/workflow', () => ({
  executeChild: mockExecuteChild,
  workflowInfo: mockWorkflowInfo,
}));

import {
  benchmarkExecuteWorkflow,
  BenchmarkExecuteInput,
} from './benchmark-execute';

describe('benchmarkExecuteWorkflow', () => {
  const mockWorkflowConfig: GraphWorkflowConfig = {
    schemaVersion: '1.0',
    metadata: { name: 'test-workflow', version: '1.0' },
    nodes: {
      'node-1': {
        id: 'node-1',
        type: 'activity',
        label: 'Test Node',
        activityType: 'test.activity',
      },
    },
    edges: [],
    entryNodeId: 'node-1',
    ctx: {},
  };

  const baseInput: BenchmarkExecuteInput = {
    sampleId: 'sample-001',
    workflowConfig: mockWorkflowConfig,
    configHash: 'abc123hash',
    inputPaths: ['/data/input/sample-001.pdf'],
    outputBaseDir: '/data/output/run-1/sample-001',
    sampleMetadata: { docType: 'invoice', language: 'en' },
    timeoutMs: 300000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkflowInfo.mockReturnValue({
      workflowId: 'benchmark-run-123',
    });
  });

  describe('Scenario 1: Execute GraphWorkflowConfig as child workflow', () => {
    it('invokes graphWorkflow as a child workflow on benchmark-processing queue', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: { outputPaths: ['/data/output/run-1/sample-001/result.json'] },
        completedNodes: ['node-1'],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      await benchmarkExecuteWorkflow(baseInput);

      expect(mockExecuteChild).toHaveBeenCalledWith('graphWorkflow', {
        args: [
          {
            graph: mockWorkflowConfig,
            initialCtx: {
              docType: 'invoice',
              language: 'en',
              inputPaths: ['/data/input/sample-001.pdf'],
              outputBaseDir: '/data/output/run-1/sample-001',
              sampleId: 'sample-001',
            },
            configHash: 'abc123hash',
            runnerVersion: '1.0.0',
            parentWorkflowId: 'benchmark-run-123',
          },
        ],
        taskQueue: 'benchmark-processing',
        workflowId: 'benchmark-benchmark-run-123-sample-001',
        workflowExecutionTimeout: 300000,
      });
    });

    it('passes sample input files as workflow context', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {},
        completedNodes: ['node-1'],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      await benchmarkExecuteWorkflow(baseInput);

      const callArgs = mockExecuteChild.mock.calls[0][1].args[0];
      expect(callArgs.initialCtx.inputPaths).toEqual(['/data/input/sample-001.pdf']);
      expect(callArgs.initialCtx.sampleId).toBe('sample-001');
    });
  });

  describe('Scenario 2: Collect and return workflow outputs', () => {
    it('captures GraphWorkflowResult including final context and completed nodes', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {
          outputPaths: ['/data/output/result.json'],
          extractedFields: { total: 100 },
        },
        completedNodes: ['node-1'],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.success).toBe(true);
      expect(result.workflowResult).toEqual(childResult);
      expect(result.workflowResult?.completedNodes).toEqual(['node-1']);
      expect(result.workflowResult?.ctx).toEqual(childResult.ctx);
    });

    it('returns output paths from workflow context', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {
          outputPaths: ['/data/output/file1.json', '/data/output/file2.json'],
        },
        completedNodes: ['node-1'],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.outputPaths).toEqual(['/data/output/file1.json', '/data/output/file2.json']);
    });
  });

  describe('Scenario 3: Route to benchmark-processing queue', () => {
    it('executes child workflow on benchmark-processing task queue', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {},
        completedNodes: [],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      await benchmarkExecuteWorkflow(baseInput);

      expect(mockExecuteChild).toHaveBeenCalledWith(
        'graphWorkflow',
        expect.objectContaining({
          taskQueue: 'benchmark-processing',
        })
      );
    });

    it('does not use the production queue', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {},
        completedNodes: [],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      await benchmarkExecuteWorkflow(baseInput);

      const callArgs = mockExecuteChild.mock.calls[0][1];
      expect(callArgs.taskQueue).not.toBe('document-processing');
      expect(callArgs.taskQueue).toBe('benchmark-processing');
    });
  });

  describe('Scenario 4: Handle workflow execution failure', () => {
    it('captures error details when child workflow fails with an exception', async () => {
      mockExecuteChild.mockRejectedValue(
        new Error('Activity node-2 failed: OCR service unavailable')
      );

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Activity node-2 failed: OCR service unavailable');
      expect(result.error?.type).toBe('WORKFLOW_EXECUTION_ERROR');
    });

    it('does not crash the parent benchmark workflow on failure', async () => {
      mockExecuteChild.mockRejectedValue(new Error('Workflow execution failed'));

      // Should resolve (not reject) - failures are returned as result
      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.success).toBe(false);
      expect(result.sampleId).toBe('sample-001');
      expect(result.outputPaths).toEqual([]);
    });

    it('returns failure result when child workflow completes with failed status', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {},
        completedNodes: ['node-1'],
        status: 'failed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.success).toBe(false);
      expect(result.workflowResult).toEqual(childResult);
      expect(result.error?.message).toBe('Workflow completed with status: failed');
    });
  });

  describe('Scenario 5: Handle workflow execution timeout', () => {
    it('sets workflowExecutionTimeout on child workflow', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {},
        completedNodes: [],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const inputWithTimeout = { ...baseInput, timeoutMs: 60000 };
      await benchmarkExecuteWorkflow(inputWithTimeout);

      expect(mockExecuteChild).toHaveBeenCalledWith(
        'graphWorkflow',
        expect.objectContaining({
          workflowExecutionTimeout: 60000,
        })
      );
    });

    it('returns timeout error when child workflow times out', async () => {
      const timeoutError = new Error('Workflow execution timeout exceeded');
      mockExecuteChild.mockRejectedValue(timeoutError);

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Workflow execution timeout exceeded');
      expect(result.error?.type).toBe('TIMEOUT');
    });

    it('uses default timeout when not specified', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {},
        completedNodes: [],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const inputWithoutTimeout = { ...baseInput };
      delete (inputWithoutTimeout as Partial<BenchmarkExecuteInput>).timeoutMs;

      await benchmarkExecuteWorkflow(inputWithoutTimeout);

      expect(mockExecuteChild).toHaveBeenCalledWith(
        'graphWorkflow',
        expect.objectContaining({
          workflowExecutionTimeout: 600000, // 10 minutes default
        })
      );
    });
  });

  describe('Scenario 6: Persist workflow outputs to storage', () => {
    it('returns output file paths from workflow context outputPaths array', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {
          outputPaths: [
            '/data/output/run-1/sample-001/result.json',
            '/data/output/run-1/sample-001/ocr.json',
          ],
        },
        completedNodes: ['node-1'],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.outputPaths).toEqual([
        '/data/output/run-1/sample-001/result.json',
        '/data/output/run-1/sample-001/ocr.json',
      ]);
    });

    it('returns output file path from workflow context outputPath (singular)', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {
          outputPath: '/data/output/run-1/sample-001/result.json',
        },
        completedNodes: ['node-1'],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.outputPaths).toEqual(['/data/output/run-1/sample-001/result.json']);
    });

    it('extracts output paths from results array in context', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {
          results: [
            { outputPath: '/data/output/file1.json' },
            { outputPath: '/data/output/file2.json' },
          ],
        },
        completedNodes: ['node-1'],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.outputPaths).toEqual([
        '/data/output/file1.json',
        '/data/output/file2.json',
      ]);
    });

    it('falls back to outputBaseDir from context when no explicit paths', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {
          outputBaseDir: '/data/output/run-1/sample-001',
          someOtherData: 'value',
        },
        completedNodes: ['node-1'],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.outputPaths).toEqual(['/data/output/run-1/sample-001']);
    });
  });

  describe('duration tracking', () => {
    it('includes duration in milliseconds in the result', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {},
        completedNodes: [],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('includes duration in error results', async () => {
      mockExecuteChild.mockRejectedValue(new Error('Failed'));

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sample metadata propagation', () => {
    it('passes sample metadata into the workflow initial context', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {},
        completedNodes: [],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const inputWithMetadata = {
        ...baseInput,
        sampleMetadata: { docType: 'receipt', vendor: 'acme', pages: 3 },
      };

      await benchmarkExecuteWorkflow(inputWithMetadata);

      const callArgs = mockExecuteChild.mock.calls[0][1].args[0];
      expect(callArgs.initialCtx.docType).toBe('receipt');
      expect(callArgs.initialCtx.vendor).toBe('acme');
      expect(callArgs.initialCtx.pages).toBe(3);
    });
  });

  describe('error type classification', () => {
    it('classifies timeout errors', async () => {
      mockExecuteChild.mockRejectedValue(new Error('Workflow execution timeout'));

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.error?.type).toBe('TIMEOUT');
    });

    it('classifies cancellation errors', async () => {
      mockExecuteChild.mockRejectedValue(new Error('Workflow was cancelled'));

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.error?.type).toBe('CANCELLED');
    });

    it('classifies generic workflow errors', async () => {
      mockExecuteChild.mockRejectedValue(new Error('Some unexpected error'));

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.error?.type).toBe('WORKFLOW_EXECUTION_ERROR');
    });

    it('handles non-Error thrown values', async () => {
      mockExecuteChild.mockRejectedValue('string error');

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Unknown error');
      expect(result.error?.type).toBe('UNKNOWN_ERROR');
    });
  });

  describe('child workflow ID generation', () => {
    it('generates deterministic child workflow ID from parent and sample', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {},
        completedNodes: [],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      await benchmarkExecuteWorkflow(baseInput);

      expect(mockExecuteChild).toHaveBeenCalledWith(
        'graphWorkflow',
        expect.objectContaining({
          workflowId: 'benchmark-benchmark-run-123-sample-001',
        })
      );
    });
  });

  describe('US-023: Task Queue Routing', () => {
    it('defaults to benchmark-processing queue when taskQueue not specified', async () => {
      // US-023 Scenario 7: Default routing uses benchmark queue
      const childResult: GraphWorkflowResult = {
        ctx: {},
        completedNodes: [],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      await benchmarkExecuteWorkflow(baseInput);

      expect(mockExecuteChild).toHaveBeenCalledWith(
        'graphWorkflow',
        expect.objectContaining({
          taskQueue: 'benchmark-processing',
        })
      );
    });

    it('routes to production queue when explicitly configured', async () => {
      // US-023 Scenario 6: Optional routing to production queue
      const childResult: GraphWorkflowResult = {
        ctx: {},
        completedNodes: [],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const inputWithProductionQueue = {
        ...baseInput,
        taskQueue: 'ocr-processing',
      };

      await benchmarkExecuteWorkflow(inputWithProductionQueue);

      expect(mockExecuteChild).toHaveBeenCalledWith(
        'graphWorkflow',
        expect.objectContaining({
          taskQueue: 'ocr-processing',
        })
      );
    });

    it('supports custom task queue names', async () => {
      const childResult: GraphWorkflowResult = {
        ctx: {},
        completedNodes: [],
        status: 'completed',
      };
      mockExecuteChild.mockResolvedValue(childResult);

      const inputWithCustomQueue = {
        ...baseInput,
        taskQueue: 'custom-benchmark-queue',
      };

      await benchmarkExecuteWorkflow(inputWithCustomQueue);

      expect(mockExecuteChild).toHaveBeenCalledWith(
        'graphWorkflow',
        expect.objectContaining({
          taskQueue: 'custom-benchmark-queue',
        })
      );
    });
  });
});
