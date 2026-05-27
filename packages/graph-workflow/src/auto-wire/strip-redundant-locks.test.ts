// packages/graph-workflow/src/auto-wire/strip-redundant-locks.test.ts
import type { GraphWorkflowConfig } from "../types";
import { stripRedundantLocks } from "./strip-redundant-locks";

function configWithNode(node: GraphWorkflowConfig["nodes"][string]): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes: { [node.id]: node },
    edges: [],
    entryNodeId: node.id,
    ctx: {},
  };
}

describe("stripRedundantLocks", () => {
  it("drops a locked port whose ctxKey is non-__auto. (implicit via prefix)", () => {
    const cfg = configWithNode({
      id: "X",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "X",
      inputs: [{ port: "fileData", ctxKey: "preparedData" }],
      metadata: { lockedInputPorts: ["fileData"] },
    });
    const out = stripRedundantLocks(cfg);
    expect(
      (out.nodes.X.metadata as { lockedInputPorts?: unknown })
        ?.lockedInputPorts,
    ).toBeUndefined();
  });

  it("keeps an explicit lock pointing at an __auto. ctxKey", () => {
    const cfg = configWithNode({
      id: "X",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "X",
      inputs: [{ port: "fileData", ctxKey: "__auto.OTHER.preparedData" }],
      metadata: { lockedInputPorts: ["fileData"] },
    });
    const out = stripRedundantLocks(cfg);
    expect(
      (out.nodes.X.metadata as { lockedInputPorts: string[] })
        .lockedInputPorts,
    ).toEqual(["fileData"]);
  });

  it("drops the metadata field entirely when the array empties out", () => {
    const cfg = configWithNode({
      id: "X",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "X",
      inputs: [{ port: "fileData", ctxKey: "preparedData" }],
      metadata: { lockedInputPorts: ["fileData"] },
    });
    const out = stripRedundantLocks(cfg);
    expect(out.nodes.X.metadata).toBeUndefined();
  });

  it("preserves unrelated metadata", () => {
    const cfg = configWithNode({
      id: "X",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "X",
      inputs: [{ port: "fileData", ctxKey: "preparedData" }],
      metadata: {
        lockedInputPorts: ["fileData"],
        position: { x: 10, y: 20 },
      },
    });
    const out = stripRedundantLocks(cfg);
    expect(out.nodes.X.metadata).toEqual({ position: { x: 10, y: 20 } });
  });
});
