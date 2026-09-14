// packages/graph-workflow/src/auto-wire/prune-edge-references.test.ts
import type { GraphEdge, GraphNode, GraphWorkflowConfig } from "../types";
import {
  findDanglingEdgeReferences,
  pruneEdgeReferences,
} from "./prune-edge-references";

function edge(id: string, source: string, target: string): GraphEdge {
  return { id, source, target, type: "normal" };
}

function makeConfig(
  nodes: Record<string, GraphNode>,
  edges: GraphEdge[],
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes,
    edges,
    entryNodeId: Object.keys(nodes)[0] ?? "",
    ctx: {},
  };
}

function switchNode(
  id: string,
  caseEdgeIds: string[],
  defaultEdge?: string,
): GraphNode {
  return {
    id,
    type: "switch",
    label: id,
    defaultEdge,
    cases: caseEdgeIds.map((edgeId) => ({
      edgeId,
      condition: {
        operator: "equals",
        left: { ref: "doc.type" },
        right: { literal: edgeId },
      },
    })),
  } as GraphNode;
}

function gate(
  id: string,
  onTimeout: "fail" | "continue" | "fallback",
  fallbackEdgeId?: string,
): GraphNode {
  return {
    id,
    type: "humanGate",
    label: id,
    signal: { name: `${id}-signal` },
    timeout: "PT1H",
    onTimeout,
    fallbackEdgeId,
  } as GraphNode;
}

function activity(id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: "activity",
    activityType: "file.prepare",
    label: id,
    ...extra,
  } as GraphNode;
}

describe("findDanglingEdgeReferences", () => {
  it("reports nothing when every reference resolves", () => {
    const cfg = makeConfig(
      { sw: switchNode("sw", ["e1"], "e2"), a: activity("a") },
      [edge("e1", "sw", "a"), edge("e2", "sw", "a")],
    );
    expect(findDanglingEdgeReferences(cfg)).toEqual([]);
  });

  it("reports a switch case whose edge is gone", () => {
    const cfg = makeConfig({ sw: switchNode("sw", ["e1", "gone"], "e1") }, [
      edge("e1", "sw", "a"),
    ]);
    expect(findDanglingEdgeReferences(cfg)).toEqual([
      { nodeId: "sw", edgeId: "gone", kind: "switch-case" },
    ]);
  });

  it("reports a switch default whose edge is gone", () => {
    const cfg = makeConfig({ sw: switchNode("sw", ["e1"], "gone") }, [
      edge("e1", "sw", "a"),
    ]);
    expect(findDanglingEdgeReferences(cfg)).toEqual([
      { nodeId: "sw", edgeId: "gone", kind: "switch-default" },
    ]);
  });

  it("reports a human gate's missing fallback edge", () => {
    const cfg = makeConfig({ g: gate("g", "fallback", "gone") }, []);
    expect(findDanglingEdgeReferences(cfg)).toEqual([
      { nodeId: "g", edgeId: "gone", kind: "human-gate-fallback" },
    ]);
  });

  it("reports an errorPolicy fallback edge on any node type", () => {
    const cfg = makeConfig(
      {
        a: activity("a", {
          errorPolicy: { retryable: false, onError: "fallback", fallbackEdgeId: "gone" },
        }),
      },
      [],
    );
    expect(findDanglingEdgeReferences(cfg)).toEqual([
      { nodeId: "a", edgeId: "gone", kind: "error-policy-fallback" },
    ]);
  });
});

describe("pruneEdgeReferences", () => {
  it("returns the same reference when nothing dangles", () => {
    const cfg = makeConfig({ sw: switchNode("sw", ["e1"], "e1") }, [
      edge("e1", "sw", "a"),
    ]);
    expect(pruneEdgeReferences(cfg)).toBe(cfg);
  });

  it("drops only the switch cases whose edge is gone", () => {
    const cfg = makeConfig({ sw: switchNode("sw", ["e1", "gone", "e2"]) }, [
      edge("e1", "sw", "a"),
      edge("e2", "sw", "b"),
    ]);
    const next = pruneEdgeReferences(cfg);
    const sw = next.nodes.sw as Extract<GraphNode, { type: "switch" }>;
    expect(sw.cases.map((c) => c.edgeId)).toEqual(["e1", "e2"]);
  });

  it("clears a dangling switch default without inventing a replacement", () => {
    const cfg = makeConfig({ sw: switchNode("sw", ["e1"], "gone") }, [
      edge("e1", "sw", "a"),
    ]);
    const sw = pruneEdgeReferences(cfg).nodes.sw as Extract<
      GraphNode,
      { type: "switch" }
    >;
    expect(sw.defaultEdge).toBeUndefined();
    expect(sw.cases).toHaveLength(1);
  });

  it("downgrades a human gate to onTimeout 'fail' when its fallback edge is gone", () => {
    const cfg = makeConfig({ g: gate("g", "fallback", "gone") }, []);
    const g = pruneEdgeReferences(cfg).nodes.g as Extract<
      GraphNode,
      { type: "humanGate" }
    >;
    expect(g.fallbackEdgeId).toBeUndefined();
    expect(g.onTimeout).toBe("fail");
  });

  it("leaves a gate's onTimeout alone when it was not 'fallback'", () => {
    const cfg = makeConfig({ g: gate("g", "continue", "gone") }, []);
    const g = pruneEdgeReferences(cfg).nodes.g as Extract<
      GraphNode,
      { type: "humanGate" }
    >;
    expect(g.fallbackEdgeId).toBeUndefined();
    expect(g.onTimeout).toBe("continue");
  });

  it("downgrades errorPolicy.onError to 'fail' when its fallback edge is gone", () => {
    const cfg = makeConfig(
      {
        a: activity("a", {
          errorPolicy: {
            retryable: true,
            maxRetries: 2,
            onError: "fallback",
            fallbackEdgeId: "gone",
          },
        }),
      },
      [],
    );
    const a = pruneEdgeReferences(cfg).nodes.a;
    expect(a.errorPolicy).toEqual({
      retryable: true,
      maxRetries: 2,
      onError: "fail",
    });
  });

  it("leaves errorPolicy.onError alone when it was 'skip'", () => {
    const cfg = makeConfig(
      {
        a: activity("a", {
          errorPolicy: { retryable: false, onError: "skip", fallbackEdgeId: "gone" },
        }),
      },
      [],
    );
    expect(pruneEdgeReferences(cfg).nodes.a.errorPolicy).toEqual({
      retryable: false,
      onError: "skip",
    });
  });

  it("does not mutate the input config", () => {
    const cfg = makeConfig({ sw: switchNode("sw", ["gone"], "gone") }, []);
    pruneEdgeReferences(cfg);
    const sw = cfg.nodes.sw as Extract<GraphNode, { type: "switch" }>;
    expect(sw.cases.map((c) => c.edgeId)).toEqual(["gone"]);
    expect(sw.defaultEdge).toBe("gone");
  });

  it("sweeps several nodes in one pass", () => {
    const cfg = makeConfig(
      {
        sw: switchNode("sw", ["gone-a"], "gone-b"),
        g: gate("g", "fallback", "gone-c"),
        a: activity("a", {
          errorPolicy: { retryable: false, onError: "fallback", fallbackEdgeId: "gone-d" },
        }),
      },
      [],
    );
    expect(findDanglingEdgeReferences(cfg)).toHaveLength(4);
    const next = pruneEdgeReferences(cfg);
    const sw = next.nodes.sw as Extract<GraphNode, { type: "switch" }>;
    const g = next.nodes.g as Extract<GraphNode, { type: "humanGate" }>;
    expect(sw.cases).toHaveLength(0);
    expect(sw.defaultEdge).toBeUndefined();
    expect(g.onTimeout).toBe("fail");
    expect(next.nodes.a.errorPolicy?.onError).toBe("fail");
  });
});
