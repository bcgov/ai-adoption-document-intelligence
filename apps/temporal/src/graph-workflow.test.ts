/**
 * Graph Workflow Integration Tests
 *
 * Tests for the generic DAG workflow execution engine.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type {
  GraphWorkflowInput,
  GraphWorkflowConfig,
  GraphWorkflowResult,
} from './graph-workflow-types';
import { graphWorkflow, GRAPH_WORKFLOW_TYPE } from './graph-workflow';

const TASK_QUEUE = 'graph-workflow-test';

/**
 * Test helper: Create mock activity implementations
 */
const mockActivities = {
  'document.updateStatus': async (_params: {
    documentId: string;
    status: string;
  }) => {
    return { success: true };
  },

  'file.prepare': async (params: {
    blobKey: string;
    fileName?: string;
  }) => {
    return { preparedData: { blobKey: params.blobKey } };
  },

  'azureOcr.submit': async (_params: { fileData: unknown }) => {
    return { apimRequestId: 'test-request-123' };
  },
};

/**
 * Test helper: Create a minimal graph config
 */
function makeMinimalGraph(): GraphWorkflowConfig {
  return {
    schemaVersion: '1.0',
    metadata: {
      name: 'Test Graph',
      description: 'Minimal test graph',
      version: '1.0.0',
    },
    nodes: {
      a: {
        id: 'a',
        type: 'activity',
        label: 'Node A',
        activityType: 'document.updateStatus',
        inputs: [{ port: 'documentId', ctxKey: 'documentId' }],
        parameters: { status: 'test' },
      },
    },
    edges: [],
    entryNodeId: 'a',
    ctx: {
      documentId: { type: 'string', defaultValue: 'doc-123' },
    },
  };
}

/**
 * Test helper: Create a linear 3-node graph (A -> B -> C)
 */
function makeLinearGraph(): GraphWorkflowConfig {
  return {
    schemaVersion: '1.0',
    metadata: {
      name: 'Linear Test Graph',
      description: '3-node linear graph',
      version: '1.0.0',
    },
    nodes: {
      a: {
        id: 'a',
        type: 'activity',
        label: 'Node A',
        activityType: 'document.updateStatus',
        inputs: [{ port: 'documentId', ctxKey: 'documentId' }],
        parameters: { status: 'started' },
      },
      b: {
        id: 'b',
        type: 'activity',
        label: 'Node B',
        activityType: 'file.prepare',
        inputs: [{ port: 'blobKey', ctxKey: 'blobKey' }],
        outputs: [{ port: 'preparedData', ctxKey: 'preparedData' }],
      },
      c: {
        id: 'c',
        type: 'activity',
        label: 'Node C',
        activityType: 'azureOcr.submit',
        inputs: [{ port: 'fileData', ctxKey: 'preparedData' }],
        outputs: [{ port: 'apimRequestId', ctxKey: 'apimRequestId' }],
      },
    },
    edges: [
      { id: 'e1', source: 'a', target: 'b', type: 'normal' },
      { id: 'e2', source: 'b', target: 'c', type: 'normal' },
    ],
    entryNodeId: 'a',
    ctx: {
      documentId: { type: 'string', defaultValue: 'doc-123' },
      blobKey: { type: 'string', defaultValue: 'blobs/test.pdf' },
      preparedData: { type: 'object' },
      apimRequestId: { type: 'string' },
    },
  };
}

/**
 * Test helper: Create a graph input
 */
function makeMockInput(
  graph: GraphWorkflowConfig,
  initialCtx: Record<string, unknown> = {},
): GraphWorkflowInput {
  return {
    graph,
    initialCtx,
    configHash: 'test-hash',
    runnerVersion: '1.0',
  };
}

/**
 * Test helper: Run a workflow with the test environment
 */
async function runWorkflow(
  testEnv: TestWorkflowEnvironment,
  input: GraphWorkflowInput,
  workflowId: string,
): Promise<GraphWorkflowResult> {
  const workflowsPath = require.resolve('./graph-workflow');

  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: 'default',
    taskQueue: TASK_QUEUE,
    workflowsPath,
    activities: mockActivities,
  });

  return worker.runUntil(
    testEnv.client.workflow.execute(graphWorkflow, {
      workflowId,
      taskQueue: TASK_QUEUE,
      args: [input],
    }),
  );
}

describe('Graph Workflow', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  }, 30000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  describe('US-006: Core DAG Execution', () => {
    it('has correct workflow type constant', () => {
      expect(GRAPH_WORKFLOW_TYPE).toBe('graphWorkflow');
    });

    it('initializes context from defaults and initialCtx', async () => {
      const graph = makeMinimalGraph();
      const input = makeMockInput(graph, { documentId: 'override-123' });

      const result = await runWorkflow(
        testEnv,
        input,
        'test-ctx-init',
      );

      expect(result.ctx.documentId).toBe('override-123');
      expect(result.status).toBe('completed');
    });

    it('executes a linear 3-node graph (A -> B -> C)', async () => {
      const graph = makeLinearGraph();
      const input = makeMockInput(graph);

      const result = await runWorkflow(
        testEnv,
        input,
        'test-linear-execution',
      );

      expect(result.status).toBe('completed');
      expect(result.completedNodes).toHaveLength(3);
      expect(result.completedNodes).toContain('a');
      expect(result.completedNodes).toContain('b');
      expect(result.completedNodes).toContain('c');

      // Verify context flows correctly
      expect(result.ctx.preparedData).toBeDefined();
      expect(result.ctx.apimRequestId).toBe('test-request-123');
    });

    it('returns final result with completed status', async () => {
      const graph = makeMinimalGraph();
      const input = makeMockInput(graph);

      const result = await runWorkflow(
        testEnv,
        input,
        'test-final-result',
      );

      expect(result).toMatchObject({
        status: 'completed',
        completedNodes: ['a'],
      });
      expect(result.ctx).toBeDefined();
    });
  });

  describe('US-007: Activity Node Handler', () => {
    it('resolves input port bindings from ctx', async () => {
      const graph = makeMinimalGraph();
      const input = makeMockInput(graph, { documentId: 'test-doc-456' });

      const result = await runWorkflow(
        testEnv,
        input,
        'test-port-bindings',
      );

      expect(result.status).toBe('completed');
      expect(result.ctx.documentId).toBe('test-doc-456');
    });

    it('writes output port bindings to ctx', async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: '1.0',
        metadata: {
          name: 'Output Test',
          description: 'Test output bindings',
          version: '1.0.0',
        },
        nodes: {
          prepare: {
            id: 'prepare',
            type: 'activity',
            label: 'Prepare File',
            activityType: 'file.prepare',
            inputs: [{ port: 'blobKey', ctxKey: 'blobKey' }],
            outputs: [{ port: 'preparedData', ctxKey: 'result' }],
          },
        },
        edges: [],
        entryNodeId: 'prepare',
        ctx: {
          blobKey: { type: 'string', defaultValue: 'blobs/test.pdf' },
          result: { type: 'object' },
        },
      };

      const input = makeMockInput(graph);

      const result = await runWorkflow(
        testEnv,
        input,
        'test-output-bindings',
      );

      expect(result.status).toBe('completed');
      expect(result.ctx.result).toBeDefined();
      expect(result.ctx.result).toHaveProperty('blobKey', 'blobs/test.pdf');
    });

    it('fails with ACTIVITY_NOT_FOUND for unknown activity type', async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: '1.0',
        metadata: {
          name: 'Invalid Activity Test',
          description: 'Test unknown activity',
          version: '1.0.0',
        },
        nodes: {
          invalid: {
            id: 'invalid',
            type: 'activity',
            label: 'Invalid Activity',
            activityType: 'unknown.activity',
          },
        },
        edges: [],
        entryNodeId: 'invalid',
        ctx: {},
      };

      const input = makeMockInput(graph);

      await expect(
        runWorkflow(testEnv, input, 'test-unknown-activity'),
      ).rejects.toThrow();
    });
  });

  describe('US-008: Switch Node Handler', () => {
    it('follows the true case when condition matches', async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: '1.0',
        metadata: {
          name: 'Switch True Test',
          description: 'Test switch routing with true condition',
          version: '1.0.0',
        },
        nodes: {
          start: {
            id: 'start',
            type: 'activity',
            label: 'Start',
            activityType: 'document.updateStatus',
            parameters: { status: 'test' },
          },
          switch: {
            id: 'switch',
            type: 'switch',
            label: 'Check Review',
            cases: [
              {
                condition: {
                  operator: 'equals',
                  left: { ref: 'ctx.requiresReview' },
                  right: { literal: true },
                },
                edgeId: 'edge-switch-to-review',
              },
            ],
            defaultEdge: 'edge-switch-to-skip',
          },
          review: {
            id: 'review',
            type: 'activity',
            label: 'Review Activity',
            activityType: 'document.updateStatus',
            parameters: { status: 'reviewed' },
          },
          skip: {
            id: 'skip',
            type: 'activity',
            label: 'Skip Activity',
            activityType: 'document.updateStatus',
            parameters: { status: 'skipped' },
          },
        },
        edges: [
          { id: 'e1', source: 'start', target: 'switch', type: 'normal' },
          {
            id: 'edge-switch-to-review',
            source: 'switch',
            target: 'review',
            type: 'conditional',
          },
          {
            id: 'edge-switch-to-skip',
            source: 'switch',
            target: 'skip',
            type: 'conditional',
          },
        ],
        entryNodeId: 'start',
        ctx: {
          requiresReview: { type: 'boolean', defaultValue: true },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflow(testEnv, input, 'test-switch-true');

      expect(result.status).toBe('completed');
      expect(result.completedNodes).toContain('review');
      expect(result.completedNodes).not.toContain('skip');
    });

    it('follows the default edge when no case matches', async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: '1.0',
        metadata: {
          name: 'Switch Default Test',
          description: 'Test switch routing with default edge',
          version: '1.0.0',
        },
        nodes: {
          start: {
            id: 'start',
            type: 'activity',
            label: 'Start',
            activityType: 'document.updateStatus',
            parameters: { status: 'test' },
          },
          switch: {
            id: 'switch',
            type: 'switch',
            label: 'Check Review',
            cases: [
              {
                condition: {
                  operator: 'equals',
                  left: { ref: 'ctx.requiresReview' },
                  right: { literal: true },
                },
                edgeId: 'edge-switch-to-review',
              },
            ],
            defaultEdge: 'edge-switch-to-skip',
          },
          review: {
            id: 'review',
            type: 'activity',
            label: 'Review Activity',
            activityType: 'document.updateStatus',
            parameters: { status: 'reviewed' },
          },
          skip: {
            id: 'skip',
            type: 'activity',
            label: 'Skip Activity',
            activityType: 'document.updateStatus',
            parameters: { status: 'skipped' },
          },
        },
        edges: [
          { id: 'e1', source: 'start', target: 'switch', type: 'normal' },
          {
            id: 'edge-switch-to-review',
            source: 'switch',
            target: 'review',
            type: 'conditional',
          },
          {
            id: 'edge-switch-to-skip',
            source: 'switch',
            target: 'skip',
            type: 'conditional',
          },
        ],
        entryNodeId: 'start',
        ctx: {
          requiresReview: { type: 'boolean', defaultValue: false },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflow(testEnv, input, 'test-switch-default');

      expect(result.status).toBe('completed');
      expect(result.completedNodes).toContain('skip');
      expect(result.completedNodes).not.toContain('review');
    });
  });

  describe('US-009: Map/Join Node Handlers', () => {
    it('executes map node over a collection', async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: '1.0',
        metadata: {
          name: 'Map Test',
          description: 'Test map over collection',
          version: '1.0.0',
        },
        nodes: {
          start: {
            id: 'start',
            type: 'activity',
            label: 'Start',
            activityType: 'document.updateStatus',
            parameters: { status: 'started' },
          },
          mapNode: {
            id: 'mapNode',
            type: 'map',
            label: 'Map Over Items',
            collectionCtxKey: 'items',
            itemCtxKey: 'currentItem',
            indexCtxKey: 'currentIndex',
            bodyEntryNodeId: 'processItem',
            bodyExitNodeId: 'processItem',
          },
          processItem: {
            id: 'processItem',
            type: 'activity',
            label: 'Process Item',
            activityType: 'file.prepare',
            inputs: [{ port: 'blobKey', ctxKey: 'currentItem' }],
            outputs: [{ port: 'preparedData', ctxKey: 'itemResult' }],
          },
          joinNode: {
            id: 'joinNode',
            type: 'join',
            label: 'Join Results',
            sourceMapNodeId: 'mapNode',
            strategy: 'all',
            resultsCtxKey: 'allResults',
          },
        },
        edges: [
          { id: 'e1', source: 'start', target: 'mapNode', type: 'normal' },
          { id: 'e2', source: 'mapNode', target: 'joinNode', type: 'normal' },
        ],
        entryNodeId: 'start',
        ctx: {
          items: {
            type: 'array',
            defaultValue: ['item1', 'item2', 'item3'],
          },
          currentItem: { type: 'string' },
          currentIndex: { type: 'number' },
          itemResult: { type: 'object' },
          allResults: { type: 'array' },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflow(testEnv, input, 'test-map-execution');

      expect(result.status).toBe('completed');
      expect(result.completedNodes).toContain('mapNode');
      expect(result.completedNodes).toContain('joinNode');
      expect(result.ctx.allResults).toBeDefined();
      expect(Array.isArray(result.ctx.allResults)).toBe(true);
      expect((result.ctx.allResults as unknown[]).length).toBe(3);
    });

    it('handles empty collection in map node', async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: '1.0',
        metadata: {
          name: 'Empty Map Test',
          description: 'Test map with empty collection',
          version: '1.0.0',
        },
        nodes: {
          mapNode: {
            id: 'mapNode',
            type: 'map',
            label: 'Map Over Items',
            collectionCtxKey: 'items',
            itemCtxKey: 'currentItem',
            bodyEntryNodeId: 'processItem',
            bodyExitNodeId: 'processItem',
          },
          processItem: {
            id: 'processItem',
            type: 'activity',
            label: 'Process Item',
            activityType: 'file.prepare',
            inputs: [{ port: 'blobKey', ctxKey: 'currentItem' }],
          },
          joinNode: {
            id: 'joinNode',
            type: 'join',
            label: 'Join Results',
            sourceMapNodeId: 'mapNode',
            strategy: 'all',
            resultsCtxKey: 'allResults',
          },
        },
        edges: [
          { id: 'e1', source: 'mapNode', target: 'joinNode', type: 'normal' },
        ],
        entryNodeId: 'mapNode',
        ctx: {
          items: { type: 'array', defaultValue: [] },
          currentItem: { type: 'string' },
          allResults: { type: 'array' },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflow(testEnv, input, 'test-map-empty');

      expect(result.status).toBe('completed');
      expect(result.ctx.allResults).toBeDefined();
      expect(Array.isArray(result.ctx.allResults)).toBe(true);
      expect((result.ctx.allResults as unknown[]).length).toBe(0);
    });

    it('map node respects maxConcurrency', async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: '1.0',
        metadata: {
          name: 'Map Concurrency Test',
          description: 'Test map concurrency limiting',
          version: '1.0.0',
        },
        nodes: {
          mapNode: {
            id: 'mapNode',
            type: 'map',
            label: 'Map Over Items',
            collectionCtxKey: 'items',
            itemCtxKey: 'currentItem',
            maxConcurrency: 2,
            bodyEntryNodeId: 'processItem',
            bodyExitNodeId: 'processItem',
          },
          processItem: {
            id: 'processItem',
            type: 'activity',
            label: 'Process Item',
            activityType: 'file.prepare',
            inputs: [{ port: 'blobKey', ctxKey: 'currentItem' }],
          },
          joinNode: {
            id: 'joinNode',
            type: 'join',
            label: 'Join Results',
            sourceMapNodeId: 'mapNode',
            strategy: 'all',
            resultsCtxKey: 'allResults',
          },
        },
        edges: [
          { id: 'e1', source: 'mapNode', target: 'joinNode', type: 'normal' },
        ],
        entryNodeId: 'mapNode',
        ctx: {
          items: {
            type: 'array',
            defaultValue: ['item1', 'item2', 'item3', 'item4', 'item5'],
          },
          currentItem: { type: 'string' },
          allResults: { type: 'array' },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflow(
        testEnv,
        input,
        'test-map-concurrency',
      );

      expect(result.status).toBe('completed');
      expect((result.ctx.allResults as unknown[]).length).toBe(5);
    });
  });
});
