import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../types/workflow";
import { computeNodeStatus } from "./auto-wire-status";

function makeConfig(
  nodes: Record<string, GraphWorkflowConfig["nodes"][string]>,
  edges: { source: string; target: string }[] = [],
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

describe("computeNodeStatus", () => {
  it("returns 'ok' when every typed input is auto-bound or locked", () => {
    const cfg = makeConfig(
      {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "A",
          outputs: [{ port: "preparedData", ctxKey: "__auto.A.preparedData" }],
        },
        B: {
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "B",
          inputs: [{ port: "fileData", ctxKey: "__auto.A.preparedData" }],
        },
      },
      [{ source: "A", target: "B" }],
    );
    expect(computeNodeStatus(cfg, "B")).toBe("ok");
  });

  it("returns 'ambiguous' when any port is ambiguous", () => {
    const cfg = makeConfig(
      {
        X: {
          id: "X",
          type: "activity",
          activityType: "file.prepare",
          label: "X",
        },
        Y: {
          id: "Y",
          type: "activity",
          activityType: "file.prepare",
          label: "Y",
        },
        Z: {
          id: "Z",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "Z",
        },
      },
      [
        { source: "X", target: "Z" },
        { source: "Y", target: "Z" },
      ],
    );
    expect(computeNodeStatus(cfg, "Z")).toBe("ambiguous");
  });

  it("returns 'unsatisfied' when any port is unsatisfied (and none ambiguous)", () => {
    const cfg = makeConfig({
      Z: {
        id: "Z",
        type: "activity",
        activityType: "azureOcr.submit",
        label: "Z",
      },
    });
    expect(computeNodeStatus(cfg, "Z")).toBe("unsatisfied");
  });

  it("returns 'ok' when every input port has kind 'Artifact' (identifier-style — invisible to status)", () => {
    // file.prepare has multiple Artifact-kinded identifier inputs (documentId,
    // fileName, fileType, contentType) plus one Document-kinded input (blobKey).
    // This test exercises a node where we supply `blobKey` as locked so the
    // only remaining ports for status computation are the Artifact-kinded ones,
    // which should be completely invisible — status must be "ok".
    const cfg = makeConfig({
      A: {
        id: "A",
        type: "activity",
        activityType: "file.prepare",
        label: "A",
        inputs: [{ port: "blobKey", ctxKey: "myBlobKey" }],
        metadata: { lockedInputPorts: ["blobKey"] },
      },
    });
    // With blobKey locked and all remaining inputs being Artifact-kinded,
    // computeNodeStatus should return "ok" (not "unsatisfied").
    expect(computeNodeStatus(cfg, "A")).toBe("ok");
  });
});
