// packages/graph-workflow/src/auto-wire/resolver.test.ts
import type { GraphWorkflowConfig } from "../types";
import { resolveBindings } from "./resolver";

function activity(
  id: string,
  activityType: string,
  extra: Partial<GraphWorkflowConfig["nodes"][string]> = {},
): GraphWorkflowConfig["nodes"][string] {
  return { id, type: "activity", activityType, label: id, ...extra } as GraphWorkflowConfig["nodes"][string];
}

function makeConfig(
  nodes: Record<string, GraphWorkflowConfig["nodes"][string]>,
  edges: { source: string; target: string }[],
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes,
    edges: edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      type: "normal" as const,
    })),
    entryNodeId: Object.keys(nodes)[0] ?? "",
    ctx: {},
  };
}

describe("resolveBindings", () => {
  it("auto-binds a linear two-node chain end-to-end", () => {
    // file.prepare (output `preparedData`, kind Document)
    //   → azureOcr.submit (input `fileData`, kind Document)
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare"),
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "A", target: "B" }],
    );

    const out = resolveBindings(cfg);

    expect(out.nodes.A.outputs).toContainEqual({
      port: "preparedData",
      ctxKey: "__auto.A.preparedData",
    });
    expect(out.nodes.B.inputs).toContainEqual({
      port: "fileData",
      ctxKey: "__auto.A.preparedData",
    });
  });

  it("does NOT touch ports listed in metadata.lockedInputPorts", () => {
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare"),
        B: activity("B", "azureOcr.submit", {
          inputs: [{ port: "fileData", ctxKey: "preparedData" }],
          metadata: { lockedInputPorts: ["fileData"] },
        }),
      },
      [{ source: "A", target: "B" }],
    );

    const out = resolveBindings(cfg);

    expect(out.nodes.B.inputs).toEqual([
      { port: "fileData", ctxKey: "preparedData" },
    ]);
    // Producer output binding is NOT stamped — the locked consumer didn't
    // ask for one.
    expect(out.nodes.A.outputs ?? []).toEqual([]);
  });

  it("reuses an existing output binding's ctxKey when auto-binding consumers", () => {
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare", {
          outputs: [{ port: "preparedData", ctxKey: "myDoc" }],
          metadata: { lockedOutputPorts: ["preparedData"] },
        }),
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "A", target: "B" }],
    );

    const out = resolveBindings(cfg);

    expect(out.nodes.B.inputs).toContainEqual({
      port: "fileData",
      ctxKey: "myDoc",
    });
    expect(out.nodes.A.outputs).toEqual([
      { port: "preparedData", ctxKey: "myDoc" },
    ]);
  });

  it("leaves the consumer unbound when ambiguous, no producer output stamped", () => {
    const cfg = makeConfig(
      {
        X: activity("X", "file.prepare"),
        Y: activity("Y", "file.prepare"),
        Z: activity("Z", "azureOcr.submit"),
      },
      [
        { source: "X", target: "Z" },
        { source: "Y", target: "Z" },
      ],
    );

    const out = resolveBindings(cfg);

    expect(
      out.nodes.Z.inputs?.find((b: { port: string }) => b.port === "fileData"),
    ).toBeUndefined();
    expect(out.nodes.X.outputs ?? []).toEqual([]);
    expect(out.nodes.Y.outputs ?? []).toEqual([]);
  });

  it("is idempotent on a stable config", () => {
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare"),
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "A", target: "B" }],
    );
    const once = resolveBindings(cfg);
    const twice = resolveBindings(once);
    expect(twice).toEqual(once);
  });
});
