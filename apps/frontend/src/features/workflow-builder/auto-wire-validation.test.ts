import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../types/workflow";
import { autoWireIssuesToValidationErrors } from "./auto-wire-validation";

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

describe("autoWireIssuesToValidationErrors", () => {
  it("returns no entries when every input resolves", () => {
    // A produces a Document into B's fileData (auto-bound); A's own typed
    // blobKey input is locked so the root doesn't itself report unsatisfied.
    const cfg = makeConfig(
      {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "A",
          inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
          outputs: [{ port: "preparedData", ctxKey: "__auto.A.preparedData" }],
          metadata: { lockedInputPorts: ["blobKey"] },
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
    expect(autoWireIssuesToValidationErrors(cfg)).toEqual([]);
  });

  it("emits a warning anchored at the input port for an unsatisfied input", () => {
    const cfg = makeConfig({
      Z: {
        id: "Z",
        type: "activity",
        activityType: "azureOcr.submit",
        label: "Z",
      },
    });
    const errors = autoWireIssuesToValidationErrors(cfg);
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("warning");
    expect(errors[0].path).toBe("nodes.Z.inputs.fileData");
    expect(errors[0].message).toBe(
      'Input "Prepared file data" needs a source — choose where it comes from',
    );
  });

  it("emits a warning for an ambiguous input", () => {
    const cfg = makeConfig(
      {
        X: {
          id: "X",
          type: "activity",
          activityType: "file.prepare",
          label: "X",
          inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
          metadata: { lockedInputPorts: ["blobKey"] },
        },
        Y: {
          id: "Y",
          type: "activity",
          activityType: "file.prepare",
          label: "Y",
          inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
          metadata: { lockedInputPorts: ["blobKey"] },
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
    const errors = autoWireIssuesToValidationErrors(cfg);
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("warning");
    expect(errors[0].path).toBe("nodes.Z.inputs.fileData");
    expect(errors[0].message).toBe(
      'Input "Prepared file data" has multiple possible sources — pick one',
    );
  });

  it("does not flag a port explicitly bound to a ctx variable, even when unlocked and producer-less", () => {
    // A non-entry root reading a workflow ctx-input: no upstream producer, but
    // the author bound it to a declared ctx key — that IS its source.
    const cfg = makeConfig({
      N: {
        id: "N",
        type: "activity",
        activityType: "document.normalizeOrientation",
        label: "N",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
      },
    });
    expect(autoWireIssuesToValidationErrors(cfg)).toEqual([]);
  });

  it("covers every node in the graph", () => {
    const cfg = makeConfig({
      Z1: {
        id: "Z1",
        type: "activity",
        activityType: "azureOcr.submit",
        label: "Z1",
      },
      Z2: {
        id: "Z2",
        type: "activity",
        activityType: "azureOcr.submit",
        label: "Z2",
      },
    });
    const paths = autoWireIssuesToValidationErrors(cfg)
      .map((e) => e.path)
      .sort();
    expect(paths).toEqual([
      "nodes.Z1.inputs.fileData",
      "nodes.Z2.inputs.fileData",
    ]);
  });
});
