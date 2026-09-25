import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../types/workflow";
import { autoWireIssuesToValidationErrors } from "./auto-wire-validation";
import type { DynamicNodeCatalogEntry } from "./canvas/port-rows";

function makeConfig(
  nodes: Record<string, GraphWorkflowConfig["nodes"][string]>,
  edges: { source: string; target: string }[] = [],
  ctx: GraphWorkflowConfig["ctx"] = {},
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
    ctx,
  };
}

/**
 * Declares the hand-authored ctx keys a fixture binds ports to. A binding is
 * only healthy when its key has a real source (G-002), and a workflow variable
 * declared in `config.ctx` is exactly that — so fixtures that mean "this port
 * reads a workflow variable" must actually declare it.
 */
function ctxVars(...keys: string[]): GraphWorkflowConfig["ctx"] {
  return Object.fromEntries(
    keys.map((k) => [k, { type: "string" as const, isInput: true }]),
  );
}

describe("autoWireIssuesToValidationErrors", () => {
  it("returns no entries when every input resolves", () => {
    // A produces a Document into B's fileData (auto-bound); A's own typed
    // blobKey input and required documentId identifier input are locked so
    // the root doesn't itself report unsatisfied.
    const cfg = makeConfig(
      {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "A",
          inputs: [
            { port: "documentId", ctxKey: "docId" },
            { port: "blobKey", ctxKey: "blobKey" },
          ],
          outputs: [{ port: "preparedData", ctxKey: "__auto.A.preparedData" }],
          metadata: { lockedInputPorts: ["documentId", "blobKey"] },
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
      ctxVars("docId", "blobKey"),
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
          inputs: [
            { port: "documentId", ctxKey: "docIdX" },
            { port: "blobKey", ctxKey: "blobKey" },
          ],
          metadata: { lockedInputPorts: ["documentId", "blobKey"] },
        },
        Y: {
          id: "Y",
          type: "activity",
          activityType: "file.prepare",
          label: "Y",
          inputs: [
            { port: "documentId", ctxKey: "docIdY" },
            { port: "blobKey", ctxKey: "blobKey" },
          ],
          metadata: { lockedInputPorts: ["documentId", "blobKey"] },
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
      ctxVars("docIdX", "docIdY", "blobKey"),
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
    const cfg = makeConfig(
      {
        N: {
          id: "N",
          type: "activity",
          activityType: "document.normalizeOrientation",
          label: "N",
          inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        },
      },
      [],
      ctxVars("blobKey"),
    );
    expect(autoWireIssuesToValidationErrors(cfg)).toEqual([]);
  });

  it("emits a 'disconnected' warning for a locked-unbound input", () => {
    const cfg = makeConfig({
      Z: {
        id: "Z",
        type: "activity",
        activityType: "azureOcr.submit",
        label: "Z",
        metadata: { lockedInputPorts: ["fileData"] },
      },
    });
    const errors = autoWireIssuesToValidationErrors(cfg);
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("warning");
    expect(errors[0].path).toBe("nodes.Z.inputs.fileData");
    expect(errors[0].message).toBe(
      'Input "Prepared file data" was disconnected — pick a source or revert to automatic',
    );
  });

  it("emits the needs-a-source warning for a required unbound identifier port", () => {
    const cfg = makeConfig(
      {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "A",
          inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
          metadata: { lockedInputPorts: ["blobKey"] },
        },
      },
      [],
      ctxVars("blobKey"),
    );
    const errors = autoWireIssuesToValidationErrors(cfg);
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("warning");
    expect(errors[0].path).toBe("nodes.A.inputs.documentId");
    expect(errors[0].message).toBe(
      'Input "Document ID" needs a source — choose where it comes from',
    );
  });

  it("surfaces a hand-bound port whose producer was deleted", () => {
    // B's fileData was bound by hand to prep's output; prep is GONE. The key
    // survives the delete and used to read as satisfied on every surface
    // (G-002) — it must now reach the drawer.
    const cfg = makeConfig({
      B: {
        id: "B",
        type: "activity",
        activityType: "azureOcr.submit",
        label: "B",
        inputs: [{ port: "fileData", ctxKey: "__auto.prep.preparedData" }],
        metadata: { lockedInputPorts: ["fileData"] },
      },
    });
    const errors = autoWireIssuesToValidationErrors(cfg);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe("nodes.B.inputs.fileData");
    expect(errors[0].message).toContain("__auto.prep.preparedData");
  });

  it("surfaces an UNLOCKED hand-bound port whose ctx key lost its source", () => {
    // Same shape without the pin: the resolver may still auto-bind elsewhere,
    // so the port never reaches `problemPorts` — the dead binding itself is
    // what must be reported.
    const cfg = makeConfig(
      {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "A",
          inputs: [
            { port: "documentId", ctxKey: "docId" },
            { port: "blobKey", ctxKey: "blobKey" },
          ],
          outputs: [{ port: "preparedData", ctxKey: "__auto.A.preparedData" }],
          metadata: { lockedInputPorts: ["documentId", "blobKey"] },
        },
        B: {
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "B",
          inputs: [{ port: "fileData", ctxKey: "ghostKey" }],
        },
      },
      [{ source: "A", target: "B" }],
      ctxVars("docId", "blobKey"),
    );
    const errors = autoWireIssuesToValidationErrors(cfg);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe("nodes.B.inputs.fileData");
    expect(errors[0].message).toContain("ghostKey");
  });

  it("still suppresses a hand-bound port whose source exists", () => {
    // Regression guard for the false positives the manuallyBoundPorts filter
    // was added for: the key IS declared, so the port has a source.
    const cfg = makeConfig(
      {
        N: {
          id: "N",
          type: "activity",
          activityType: "document.normalizeOrientation",
          label: "N",
          inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        },
      },
      [],
      ctxVars("blobKey"),
    );
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

describe("autoWireIssuesToValidationErrors — dyn.* nodes via the merged catalog", () => {
  const dynEntry: DynamicNodeCatalogEntry = {
    activityType: "dyn.sentiment-scorer",
    inputs: [
      { name: "document", label: "Document", required: true, kind: "Document" },
    ],
    outputs: [{ name: "score", label: "Score", kind: "ValidationResult" }],
  };

  it("surfaces a required unbound dyn input as a warning on the problems surface", () => {
    const cfg = makeConfig({
      D: {
        id: "D",
        type: "activity",
        activityType: "dyn.sentiment-scorer",
        label: "D",
      },
    });
    expect(autoWireIssuesToValidationErrors(cfg, [dynEntry])).toEqual([
      {
        path: "nodes.D.inputs.document",
        message: 'Input "Document" needs a source — choose where it comes from',
        severity: "warning",
      },
    ]);
  });

  it("stays silent for the same node when no merged entries are supplied", () => {
    const cfg = makeConfig({
      D: {
        id: "D",
        type: "activity",
        activityType: "dyn.sentiment-scorer",
        label: "D",
      },
    });
    expect(autoWireIssuesToValidationErrors(cfg)).toEqual([]);
  });
});
