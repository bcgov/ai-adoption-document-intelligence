import { computeTopologicalOrder, computeReadySet, computeReadySetForSubgraph } from './graph-algorithms';
import type { GraphWorkflowConfig } from '../graph-workflow-types';
import type { ExecutionState } from './execution-state';

describe('computeTopologicalOrder', () => {
  it('should compute topological order for linear graph', () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: '1.0',
      metadata: {},
      entryNodeId: 'A',
      nodes: {
        A: { id: 'A', type: 'activity', activityType: 'test', label: 'A' },
        B: { id: 'B', type: 'activity', activityType: 'test', label: 'B' },
        C: { id: 'C', type: 'activity', activityType: 'test', label: 'C' },
      },
      edges: [
        { id: 'e1', source: 'A', target: 'B', type: 'normal' },
        { id: 'e2', source: 'B', target: 'C', type: 'normal' },
      ],
      ctx: {},
    };

    const result = computeTopologicalOrder(config);
    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('should compute topological order for branching graph', () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: '1.0',
      metadata: {},
      entryNodeId: 'A',
      nodes: {
        A: { id: 'A', type: 'activity', activityType: 'test', label: 'A' },
        B: { id: 'B', type: 'activity', activityType: 'test', label: 'B' },
        C: { id: 'C', type: 'activity', activityType: 'test', label: 'C' },
        D: { id: 'D', type: 'activity', activityType: 'test', label: 'D' },
      },
      edges: [
        { id: 'e1', source: 'A', target: 'B', type: 'normal' },
        { id: 'e2', source: 'A', target: 'C', type: 'normal' },
        { id: 'e3', source: 'B', target: 'D', type: 'normal' },
        { id: 'e4', source: 'C', target: 'D', type: 'normal' },
      ],
      ctx: {},
    };

    const result = computeTopologicalOrder(config);
    expect(result).toEqual(['A', 'B', 'C', 'D']);
  });

  it('should throw error on cycle detection', () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: '1.0',
      metadata: {},
      entryNodeId: 'A',
      nodes: {
        A: { id: 'A', type: 'activity', activityType: 'test', label: 'A' },
        B: { id: 'B', type: 'activity', activityType: 'test', label: 'B' },
      },
      edges: [
        { id: 'e1', source: 'A', target: 'B', type: 'normal' },
        { id: 'e2', source: 'B', target: 'A', type: 'normal' },
      ],
      ctx: {},
    };

    expect(() => computeTopologicalOrder(config)).toThrow('Cycle detected in graph');
  });

  it('should ignore conditional edges for topological sort', () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: '1.0',
      metadata: {},
      entryNodeId: 'A',
      nodes: {
        A: { id: 'A', type: 'switch', cases: [], defaultEdge: 'e1', label: 'A' },
        B: { id: 'B', type: 'activity', activityType: 'test', label: 'B' },
        C: { id: 'C', type: 'activity', activityType: 'test', label: 'C' },
      },
      edges: [
        { id: 'e1', source: 'A', target: 'B', type: 'conditional' },
        { id: 'e2', source: 'A', target: 'C', type: 'conditional' },
      ],
      ctx: {},
    };

    // Both B and C have zero in-degree when conditional edges are ignored
    const result = computeTopologicalOrder(config);
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
  });
});

describe('computeReadySet', () => {
  const createState = (completedNodeIds: string[], selectedEdges: Record<string, string> = {}): ExecutionState => ({
    currentNodes: [],
    completedNodeIds: new Set(completedNodeIds),
    nodeStatuses: new Map(),
    cancelled: () => false,
    cancelMode: () => 'immediate',
    ctx: {},
    selectedEdges: new Map(Object.entries(selectedEdges)),
    mapBranchResults: new Map(),
    configHash: 'test',
    runnerVersion: '1.0.0',
    lastError: {},
  });

  it('should mark entry node as ready', () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: '1.0',
      metadata: {},
      entryNodeId: 'A',
      nodes: {
        A: { id: 'A', type: 'activity', activityType: 'test', label: 'A' },
      },
      edges: [],
      ctx: {},
    };

    const state = createState([]);
    const result = computeReadySet(config, state);
    expect(result).toEqual(['A']);
  });

  it('should not include completed nodes', () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: '1.0',
      metadata: {},
      entryNodeId: 'A',
      nodes: {
        A: { id: 'A', type: 'activity', activityType: 'test', label: 'A' },
      },
      edges: [],
      ctx: {},
    };

    const state = createState(['A']);
    const result = computeReadySet(config, state);
    expect(result).toEqual([]);
  });

  it('should mark nodes ready when normal edge predecessors complete', () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: '1.0',
      metadata: {},
      entryNodeId: 'A',
      nodes: {
        A: { id: 'A', type: 'activity', activityType: 'test', label: 'A' },
        B: { id: 'B', type: 'activity', activityType: 'test', label: 'B' },
      },
      edges: [
        { id: 'e1', source: 'A', target: 'B', type: 'normal' },
      ],
      ctx: {},
    };

    const state = createState(['A']);
    const result = computeReadySet(config, state);
    expect(result).toEqual(['B']);
  });

  it('should wait for all predecessors in join pattern', () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: '1.0',
      metadata: {},
      entryNodeId: 'A',
      nodes: {
        A: { id: 'A', type: 'activity', activityType: 'test', label: 'A' },
        B: { id: 'B', type: 'activity', activityType: 'test', label: 'B' },
        C: { id: 'C', type: 'activity', activityType: 'test', label: 'C' },
      },
      edges: [
        { id: 'e1', source: 'A', target: 'C', type: 'normal' },
        { id: 'e2', source: 'B', target: 'C', type: 'normal' },
      ],
      ctx: {},
    };

    // Only A completed
    let state = createState(['A']);
    let result = computeReadySet(config, state);
    expect(result).not.toContain('C');

    // Both A and B completed
    state = createState(['A', 'B']);
    result = computeReadySet(config, state);
    expect(result).toEqual(['C']);
  });

  it('should respect selected edges for conditional branches', () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: '1.0',
      metadata: {},
      entryNodeId: 'A',
      nodes: {
        A: { id: 'A', type: 'switch', cases: [], defaultEdge: 'e1', label: 'A' },
        B: { id: 'B', type: 'activity', activityType: 'test', label: 'B' },
        C: { id: 'C', type: 'activity', activityType: 'test', label: 'C' },
      },
      edges: [
        { id: 'e1', source: 'A', target: 'B', type: 'conditional' },
        { id: 'e2', source: 'A', target: 'C', type: 'conditional' },
      ],
      ctx: {},
    };

    // A completed and selected edge e1
    const state = createState(['A'], { A: 'e1' });
    const result = computeReadySet(config, state);
    expect(result).toEqual(['B']);
    expect(result).not.toContain('C');
  });

  it('should handle switch-merge pattern where branches converge to single node', () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: '1.0',
      metadata: {},
      entryNodeId: 'switch',
      nodes: {
        switch: { id: 'switch', type: 'switch', cases: [], defaultEdge: 'e1', label: 'Switch' },
        branchA: { id: 'branchA', type: 'activity', activityType: 'test', label: 'Branch A' },
        branchB: { id: 'branchB', type: 'activity', activityType: 'test', label: 'Branch B' },
        merge: { id: 'merge', type: 'activity', activityType: 'test', label: 'Merge' },
      },
      edges: [
        { id: 'e1', source: 'switch', target: 'branchA', type: 'conditional' },
        { id: 'e2', source: 'switch', target: 'branchB', type: 'conditional' },
        { id: 'e3', source: 'branchA', target: 'merge', type: 'normal' },
        { id: 'e4', source: 'branchB', target: 'merge', type: 'normal' },
      ],
      ctx: {},
    };

    // Switch selected branch A (e1)
    const stateAfterSwitch = createState(['switch'], { switch: 'e1' });
    let result = computeReadySet(config, stateAfterSwitch);
    expect(result).toEqual(['branchA']);
    expect(result).not.toContain('branchB');

    // After branchA completes, merge should be ready even though branchB didn't execute
    const stateAfterBranchA = createState(['switch', 'branchA'], { switch: 'e1' });
    result = computeReadySet(config, stateAfterBranchA);
    expect(result).toEqual(['merge']);
  });
});

describe('computeReadySetForSubgraph', () => {
  const createState = (completedNodeIds: string[], selectedEdges: Record<string, string> = {}): ExecutionState => ({
    currentNodes: [],
    completedNodeIds: new Set(completedNodeIds),
    nodeStatuses: new Map(),
    cancelled: () => false,
    cancelMode: () => 'immediate',
    ctx: {},
    selectedEdges: new Map(Object.entries(selectedEdges)),
    mapBranchResults: new Map(),
    configHash: 'test',
    runnerVersion: '1.0.0',
    lastError: {},
  });

  it('should only consider nodes in subgraph', () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: '1.0',
      metadata: {},
      entryNodeId: 'A',
      nodes: {
        A: { id: 'A', type: 'activity', activityType: 'test', label: 'A' },
        B: { id: 'B', type: 'activity', activityType: 'test', label: 'B' },
        C: { id: 'C', type: 'activity', activityType: 'test', label: 'C' },
        D: { id: 'D', type: 'activity', activityType: 'test', label: 'D' },
      },
      edges: [
        { id: 'e1', source: 'A', target: 'B', type: 'normal' },
        { id: 'e2', source: 'B', target: 'C', type: 'normal' },
        { id: 'e3', source: 'C', target: 'D', type: 'normal' },
      ],
      ctx: {},
    };

    const subgraphNodeIds = new Set(['B', 'C']);
    const state = createState([]);
    const result = computeReadySetForSubgraph(config, state, subgraphNodeIds, 'B');

    // Only B should be ready (entry node for subgraph)
    expect(result).toEqual(['B']);
  });

  it('should use subgraph entry node', () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: '1.0',
      metadata: {},
      entryNodeId: 'A',
      nodes: {
        A: { id: 'A', type: 'activity', activityType: 'test', label: 'A' },
        B: { id: 'B', type: 'activity', activityType: 'test', label: 'B' },
        C: { id: 'C', type: 'activity', activityType: 'test', label: 'C' },
      },
      edges: [
        { id: 'e1', source: 'A', target: 'B', type: 'normal' },
        { id: 'e2', source: 'B', target: 'C', type: 'normal' },
      ],
      ctx: {},
    };

    const subgraphNodeIds = new Set(['B', 'C']);
    const state = createState([]);

    // B is the entry node for this subgraph
    const result = computeReadySetForSubgraph(config, state, subgraphNodeIds, 'B');
    expect(result).toEqual(['B']);
  });
});
