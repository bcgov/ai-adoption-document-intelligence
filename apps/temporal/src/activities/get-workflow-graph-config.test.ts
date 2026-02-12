import { getWorkflowGraphConfig } from './get-workflow-graph-config';
import { getPrismaClient } from './database-client';
import type { GraphWorkflowConfig } from '../graph-workflow-types';

jest.mock('./database-client', () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

describe('getWorkflowGraphConfig activity', () => {
  let prismaMock: {
    workflow: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      workflow: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('loads workflow graph config by ID', async () => {
    const mockConfig: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        name: 'Test Workflow',
      },
      nodes: {
        node1: {
          id: 'node1',
          type: 'activity',
          label: 'Start',
          activityType: 'testActivity',
        },
        node2: {
          id: 'node2',
          type: 'activity',
          label: 'End',
          activityType: 'testActivity',
        },
      },
      edges: [
        {
          id: 'edge1',
          source: 'node1',
          target: 'node2',
          type: 'normal' as const,
        },
      ],
      entryNodeId: 'node1',
      ctx: {},
    };

    prismaMock.workflow.findUnique.mockResolvedValue({
      id: 'workflow-1',
      config: mockConfig,
    });

    const result = await getWorkflowGraphConfig({ workflowId: 'workflow-1' });

    expect(result.graph).toEqual(mockConfig);
    expect(prismaMock.workflow.findUnique).toHaveBeenCalledWith({
      where: { id: 'workflow-1' },
      select: { config: true },
    });
  });

  it('loads workflow graph config by name when ID not found', async () => {
    const mockConfig: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        name: 'Standard OCR Workflow',
      },
      nodes: {
        node1: {
          id: 'node1',
          type: 'activity',
          label: 'Start',
          activityType: 'testActivity',
        },
      },
      edges: [],
      entryNodeId: 'node1',
      ctx: {},
    };

    prismaMock.workflow.findUnique.mockResolvedValue(null);
    prismaMock.workflow.findFirst.mockResolvedValue({
      id: 'generated-id',
      config: mockConfig,
    });

    const result = await getWorkflowGraphConfig({ workflowId: 'standard-ocr-workflow' });

    expect(result.graph).toEqual(mockConfig);
    expect(prismaMock.workflow.findUnique).toHaveBeenCalledWith({
      where: { id: 'standard-ocr-workflow' },
      select: { config: true },
    });
    expect(prismaMock.workflow.findFirst).toHaveBeenCalledWith({
      where: { name: 'standard-ocr-workflow' },
      select: { config: true },
    });
  });

  it('throws error when workflow not found by ID or name', async () => {
    prismaMock.workflow.findUnique.mockResolvedValue(null);
    prismaMock.workflow.findFirst.mockResolvedValue(null);

    await expect(
      getWorkflowGraphConfig({ workflowId: 'non-existent' })
    ).rejects.toThrow('Workflow not found by ID or name: non-existent');
  });

  it('throws error when workflow has no config', async () => {
    prismaMock.workflow.findUnique.mockResolvedValue({
      id: 'workflow-2',
      config: null,
    });

    await expect(
      getWorkflowGraphConfig({ workflowId: 'workflow-2' })
    ).rejects.toThrow('Workflow not found by ID or name: workflow-2');
  });

  it('loads complex workflow graph with multiple nodes', async () => {
    const complexConfig: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        name: 'Complex Workflow',
      },
      nodes: {
        start: {
          id: 'start',
          type: 'activity',
          label: 'Start',
          activityType: 'prepareFileData',
        },
        activity1: {
          id: 'activity1',
          type: 'activity',
          label: 'Activity 1',
          activityType: 'prepareFileData',
        },
        condition1: {
          id: 'condition1',
          type: 'switch',
          label: 'Check Result',
          cases: [
            {
              condition: {
                operator: 'equals' as const,
                left: { ref: 'ctx.result' },
                right: { literal: true },
              },
              edgeId: 'to-end',
            },
          ],
        },
        end: {
          id: 'end',
          type: 'activity',
          label: 'End',
          activityType: 'updateDocumentStatus',
        },
      },
      edges: [
        { id: 'edge1', source: 'start', target: 'activity1', type: 'normal' as const },
        { id: 'edge2', source: 'activity1', target: 'condition1', type: 'normal' as const },
        { id: 'to-end', source: 'condition1', target: 'end', type: 'normal' as const },
      ],
      entryNodeId: 'start',
      ctx: {},
    };

    prismaMock.workflow.findUnique.mockResolvedValue({
      id: 'workflow-3',
      config: complexConfig,
    });

    const result = await getWorkflowGraphConfig({ workflowId: 'workflow-3' });

    expect(result.graph).toEqual(complexConfig);
    expect(Object.keys(result.graph.nodes)).toHaveLength(4);
    expect(result.graph.edges).toHaveLength(3);
  });

  it('handles database errors', async () => {
    const dbError = new Error('Database connection failed');
    prismaMock.workflow.findUnique.mockRejectedValue(dbError);

    await expect(
      getWorkflowGraphConfig({ workflowId: 'workflow-4' })
    ).rejects.toThrow('Database connection failed');
  });
});
