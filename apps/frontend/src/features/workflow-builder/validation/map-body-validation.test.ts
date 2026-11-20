import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { mapBodyIssuesToValidationErrors } from "./map-body-validation";

/**
 * Map body: entry `sw` (switch) forks to `good` (which reaches the exit) and
 * `dead` (which dead-ends). `dead` never reaches the exit, so it should
 * surface a warning anchored at the map node.
 */
function configWithDeadEndBranch(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    entryNodeId: "m1",
    ctx: {},
    nodes: {
      m1: {
        id: "m1",
        type: "map",
        label: "Each item",
        collectionCtxKey: "items",
        itemCtxKey: "item",
        bodyEntryNodeId: "sw",
        bodyExitNodeId: "exit",
      },
      sw: { id: "sw", type: "switch", label: "Route", cases: [] },
      good: {
        id: "good",
        type: "activity",
        label: "Good",
        activityType: "ocr.cleanup",
      },
      dead: {
        id: "dead",
        type: "activity",
        label: "Dead End",
        activityType: "ocr.cleanup",
      },
      exit: {
        id: "exit",
        type: "activity",
        label: "Exit",
        activityType: "ocr.cleanup",
      },
    },
    edges: [
      { id: "e1", source: "sw", target: "good", type: "conditional" },
      { id: "e2", source: "sw", target: "dead", type: "conditional" },
      { id: "e3", source: "good", target: "exit", type: "normal" },
    ],
  } as unknown as GraphWorkflowConfig;
}

describe("mapBodyIssuesToValidationErrors", () => {
  it("warns (anchored at the map node) when a body branch never reaches the exit", () => {
    const errors = mapBodyIssuesToValidationErrors(configWithDeadEndBranch());
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("warning");
    expect(errors[0].path).toBe("nodes.m1.bodyExitNodeId");
    expect(errors[0].message).toContain("Dead End");
  });

  it("is silent when every branch reaches the exit", () => {
    const config = configWithDeadEndBranch();
    // Wire the dead branch to the exit → no dead ends.
    config.edges.push({
      id: "e4",
      source: "dead",
      target: "exit",
      type: "normal",
    });
    expect(mapBodyIssuesToValidationErrors(config)).toHaveLength(0);
  });

  it("ignores maps missing an entry or exit node id", () => {
    const config = configWithDeadEndBranch();
    (config.nodes.m1 as { bodyExitNodeId?: string }).bodyExitNodeId = "";
    expect(mapBodyIssuesToValidationErrors(config)).toHaveLength(0);
  });
});
