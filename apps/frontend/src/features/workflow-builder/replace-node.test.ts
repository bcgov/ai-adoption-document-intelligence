import { describe, expect, it } from "vitest";
import type { GraphNode, GraphWorkflowConfig } from "../../types/workflow";
import { replaceNode } from "./replace-node";

function config(nodes: GraphWorkflowConfig["nodes"]): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: Object.keys(nodes)[0] ?? "",
    ctx: {},
    nodes,
    edges: [],
  };
}

const activity = (id: string, label: string): GraphNode => ({
  id,
  type: "activity",
  label,
  activityType: "test.noop",
});

describe("replaceNode (§6.3)", () => {
  it("replaces the node by id and returns a new config (no mutation)", () => {
    const before = config({ a: activity("a", "A"), b: activity("b", "B") });
    const next = replaceNode(before, "b", activity("b", "B renamed"));

    expect(next).not.toBe(before);
    expect(next.nodes).not.toBe(before.nodes);
    expect(next.nodes.b.label).toBe("B renamed");
    // Siblings + top-level fields are preserved.
    expect(next.nodes.a).toBe(before.nodes.a);
    expect(next.entryNodeId).toBe(before.entryNodeId);
    // Original is untouched.
    expect(before.nodes.b.label).toBe("B");
  });

  it("inserts a node when the id is new", () => {
    const before = config({ a: activity("a", "A") });
    const next = replaceNode(before, "c", activity("c", "C"));
    expect(Object.keys(next.nodes).sort()).toEqual(["a", "c"]);
  });
});
