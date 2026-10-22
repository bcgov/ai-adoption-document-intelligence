/**
 * Unit tests for `pruneNodeFromGroups` / `pruneNodesFromGroups` (Item 28).
 *
 * Deleting a grouped node must strip it from `nodeGroups[*].nodeIds`,
 * drop a group that becomes empty, and prune orphaned `exposedParams`
 * — otherwise the save-time validator reports "references non-existent
 * node".
 */

import { describe, expect, it } from "vitest";

import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  pruneNodeFromGroups,
  pruneNodesFromGroups,
} from "./prune-node-from-groups";

function baseConfig(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0.0",
    entryNodeId: "a",
    nodes: {
      a: { id: "a", type: "activity", label: "A", activityType: "noop" },
      b: { id: "b", type: "activity", label: "B", activityType: "noop" },
      c: { id: "c", type: "activity", label: "C", activityType: "noop" },
    },
    edges: [],
  } as unknown as GraphWorkflowConfig;
}

describe("pruneNodeFromGroups", () => {
  it("removes the deleted id from a group's nodeIds", () => {
    const config: GraphWorkflowConfig = {
      ...baseConfig(),
      nodeGroups: {
        g1: { label: "G1", nodeIds: ["a", "b", "c"] },
      },
    };

    const next = pruneNodeFromGroups(config, "b");

    expect(next.nodeGroups?.g1.nodeIds).toEqual(["a", "c"]);
  });

  it("drops a group that becomes empty after the deletion", () => {
    const config: GraphWorkflowConfig = {
      ...baseConfig(),
      nodeGroups: {
        g1: { label: "G1", nodeIds: ["a", "b"] },
        g2: { label: "G2", nodeIds: ["c"] },
      },
    };

    const next = pruneNodesFromGroups(config, ["c"]);

    expect(next.nodeGroups).toHaveProperty("g1");
    expect(next.nodeGroups).not.toHaveProperty("g2");
  });

  it("prunes exposedParams referencing the deleted node", () => {
    const config: GraphWorkflowConfig = {
      ...baseConfig(),
      nodeGroups: {
        g1: {
          label: "G1",
          nodeIds: ["a", "b"],
          exposedParams: [
            { label: "P-a", nodeId: "a", path: "parameters.x", type: "string" },
            { label: "P-b", nodeId: "b", path: "parameters.y", type: "string" },
            { label: "P-none", path: "parameters.z", type: "string" },
          ],
        },
      },
    };

    const next = pruneNodeFromGroups(config, "b");

    expect(next.nodeGroups?.g1.nodeIds).toEqual(["a"]);
    expect(next.nodeGroups?.g1.exposedParams).toEqual([
      { label: "P-a", nodeId: "a", path: "parameters.x", type: "string" },
      { label: "P-none", path: "parameters.z", type: "string" },
    ]);
  });

  it("returns the same config reference when nothing changes", () => {
    const config: GraphWorkflowConfig = {
      ...baseConfig(),
      nodeGroups: {
        g1: { label: "G1", nodeIds: ["a", "b"] },
      },
    };

    // "c" isn't a member of any group.
    expect(pruneNodeFromGroups(config, "c")).toBe(config);
  });

  it("returns the same config reference when there are no groups", () => {
    const config = baseConfig();
    expect(pruneNodeFromGroups(config, "a")).toBe(config);
  });

  it("prunes the same node across multiple groups", () => {
    const config: GraphWorkflowConfig = {
      ...baseConfig(),
      nodeGroups: {
        g1: { label: "G1", nodeIds: ["a", "b"] },
        g2: { label: "G2", nodeIds: ["b", "c"] },
      },
    };

    const next = pruneNodeFromGroups(config, "b");

    expect(next.nodeGroups?.g1.nodeIds).toEqual(["a"]);
    expect(next.nodeGroups?.g2.nodeIds).toEqual(["c"]);
  });

  it("does not mutate the input config", () => {
    const config: GraphWorkflowConfig = {
      ...baseConfig(),
      nodeGroups: {
        g1: { label: "G1", nodeIds: ["a", "b"] },
      },
    };

    pruneNodeFromGroups(config, "b");

    expect(config.nodeGroups?.g1.nodeIds).toEqual(["a", "b"]);
  });
});
