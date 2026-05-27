import type { GraphWorkflowConfig } from "../types";
import { normaliseLocks } from "./normalise-locks";

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

describe("normaliseLocks", () => {
  it("locks every non-__auto.-prefixed input binding", () => {
    const cfg = configWithNode({
      id: "X",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "X",
      inputs: [{ port: "fileData", ctxKey: "preparedData" }],
    });
    const out = normaliseLocks(cfg);
    expect(out.nodes.X.metadata).toMatchObject({
      lockedInputPorts: ["fileData"],
    });
  });

  it("does NOT lock __auto.-prefixed bindings", () => {
    const cfg = configWithNode({
      id: "X",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "X",
      inputs: [{ port: "fileData", ctxKey: "__auto.A.preparedData" }],
    });
    const out = normaliseLocks(cfg);
    expect(
      (out.nodes.X.metadata as { lockedInputPorts?: string[] } | undefined)
        ?.lockedInputPorts ?? [],
    ).toEqual([]);
  });

  it("does the same for output bindings", () => {
    const cfg = configWithNode({
      id: "X",
      type: "activity",
      activityType: "file.prepare",
      label: "X",
      outputs: [{ port: "preparedData", ctxKey: "myData" }],
    });
    const out = normaliseLocks(cfg);
    expect(out.nodes.X.metadata).toMatchObject({
      lockedOutputPorts: ["preparedData"],
    });
  });

  it("preserves existing locks alongside newly-inferred ones (union, deduped)", () => {
    const cfg = configWithNode({
      id: "X",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "X",
      inputs: [
        { port: "fileData", ctxKey: "preparedData" },
        { port: "locale", ctxKey: "__auto.A.locale" },
      ],
      metadata: { lockedInputPorts: ["locale"] },
    });
    const out = normaliseLocks(cfg);
    const locks =
      (out.nodes.X.metadata as { lockedInputPorts: string[] })
        .lockedInputPorts;
    expect(locks.sort()).toEqual(["fileData", "locale"]);
  });

  it("is idempotent", () => {
    const cfg = configWithNode({
      id: "X",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "X",
      inputs: [{ port: "fileData", ctxKey: "preparedData" }],
    });
    const once = normaliseLocks(cfg);
    const twice = normaliseLocks(once);
    expect(twice).toEqual(once);
  });
});
