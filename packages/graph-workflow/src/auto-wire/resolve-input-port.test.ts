// packages/graph-workflow/src/auto-wire/resolve-input-port.test.ts
import type { GraphWorkflowConfig } from "../types";
import { resolveInputPort } from "./resolve-input-port";

function activity(id: string, activityType: string): GraphWorkflowConfig["nodes"][string] {
  return {
    id,
    type: "activity",
    activityType,
    label: id,
  };
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

describe("resolveInputPort", () => {
  it("returns 'unsatisfied' when no upstream producer matches the kind", () => {
    // file.prepare emits `preparedData` (kind `Document`); we ask for
    // a `Segment` input on the only node downstream → no candidate.
    const cfg = makeConfig(
      { A: activity("A", "file.prepare"), B: activity("B", "ocr.cleanup") },
      [{ source: "A", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "segments", kind: "Segment[]" }),
    ).toEqual({ status: "unsatisfied" });
  });

  it("returns 'auto-bound' when exactly one upstream producer matches", () => {
    // file.prepare → azureOcr.submit. submit declares an input `fileData`
    // (Document), prepare declares an output `preparedData` (Document).
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare"),
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "A", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "A",
      producerPort: "preparedData",
    });
  });

  it("returns 'auto-bound' to nearest producer when multiple match", () => {
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare"),
        B: activity("B", "file.prepare"),
        C: activity("C", "azureOcr.submit"),
      },
      [
        { source: "A", target: "B" },
        { source: "B", target: "C" },
      ],
    );
    // B is closer to C than A (distance 1 vs 2), so it wins.
    expect(
      resolveInputPort(cfg, "C", { name: "fileData", kind: "Document" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "B",
      producerPort: "preparedData",
    });
  });

  it("returns 'ambiguous' when two producers tie at minimum distance", () => {
    // X → Z and Y → Z; both X and Y produce `Document` at distance 1.
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
    const result = resolveInputPort(cfg, "Z", {
      name: "fileData",
      kind: "Document",
    });
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") throw new Error("type narrow");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.producerNodeId).sort()).toEqual(["X", "Y"]);
  });

  it("returns 'locked' when the port is in node.metadata.lockedInputPorts", () => {
    const node = {
      ...activity("B", "azureOcr.submit"),
      inputs: [{ port: "fileData", ctxKey: "myDoc" }],
      metadata: { lockedInputPorts: ["fileData"] },
    };
    const cfg = makeConfig(
      { A: activity("A", "file.prepare"), B: node },
      [{ source: "A", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({ status: "locked", ctxKey: "myDoc" });
  });

  it("skips ports with no declared kind (wildcard)", () => {
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare"),
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "A", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "freeform" }),
    ).toEqual({ status: "unsatisfied" });
  });
});
