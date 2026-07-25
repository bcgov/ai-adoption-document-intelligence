import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../types/workflow";
import { computeNodeInputIssues, computeNodeStatus } from "./auto-wire-status";

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
 * Declares the hand-authored ctx keys a fixture pins ports to. A pin is only
 * healthy when its key has a real source (G-005), and a workflow variable
 * declared in `config.ctx` is exactly that — so fixtures that mean "this port
 * is bound to a workflow variable" must actually declare it.
 */
function ctxVars(...keys: string[]): GraphWorkflowConfig["ctx"] {
  return Object.fromEntries(
    keys.map((k) => [k, { type: "string" as const, isInput: true }]),
  );
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

  it("returns 'ok' when required ports are resolved and OPTIONAL Artifact ports stay invisible", () => {
    // file.prepare has one REQUIRED Artifact-kinded identifier input
    // (documentId), three OPTIONAL Artifact-kinded identifier inputs
    // (fileName, fileType, contentType), and one required Document-kinded
    // input (blobKey). Optional identifier ports never participate in status
    // computation — but the required documentId port now DOES (ring/badge
    // reconciliation, PORT_WIRING §4.2), so it must be resolved like any
    // other required port for the node to read "ok".
    const cfg = makeConfig(
      {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "A",
          inputs: [
            { port: "documentId", ctxKey: "myDocId" },
            { port: "blobKey", ctxKey: "myBlobKey" },
          ],
          metadata: { lockedInputPorts: ["documentId", "blobKey"] },
        },
      },
      [],
      ctxVars("myDocId", "myBlobKey"),
    );
    expect(computeNodeStatus(cfg, "A")).toBe("ok");
  });
});

describe("computeNodeInputIssues", () => {
  it("returns ok with no problem ports when everything resolves", () => {
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
    expect(computeNodeInputIssues(cfg, "B")).toEqual({
      status: "ok",
      problemPorts: [],
    });
  });

  it("surfaces the unsatisfied port with its kind so the dot can deep-link to it", () => {
    const cfg = makeConfig({
      Z: {
        id: "Z",
        type: "activity",
        activityType: "azureOcr.submit",
        label: "Z",
      },
    });
    const issues = computeNodeInputIssues(cfg, "Z");
    expect(issues.status).toBe("unsatisfied");
    expect(issues.problemPorts).toEqual([
      {
        port: "fileData",
        label: "Prepared file data",
        kind: "PreparedFile",
        status: "unsatisfied",
      },
    ]);
  });

  it("surfaces the ambiguous port", () => {
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
    const issues = computeNodeInputIssues(cfg, "Z");
    expect(issues.status).toBe("ambiguous");
    expect(issues.problemPorts).toEqual([
      {
        port: "fileData",
        label: "Prepared file data",
        kind: "PreparedFile",
        status: "ambiguous",
      },
    ]);
  });

  it("returns ok with no problem ports for a non-activity node", () => {
    const cfg = makeConfig({
      S: {
        id: "S",
        type: "switch",
        label: "S",
        cases: [],
        defaultEdge: "",
      } as unknown as GraphWorkflowConfig["nodes"][string],
    });
    expect(computeNodeInputIssues(cfg, "S")).toEqual({
      status: "ok",
      problemPorts: [],
    });
  });

  it("flags a REQUIRED base-Artifact identifier port with no source", () => {
    // documentId (kind Artifact, required) has no upstream producer and no
    // binding. blobKey is locked/bound so it doesn't also show up as a
    // problem — isolating the identifier-port behaviour under test.
    const cfg = makeConfig(
      {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "A",
          inputs: [{ port: "blobKey", ctxKey: "myBlobKey" }],
          metadata: { lockedInputPorts: ["blobKey"] },
        },
      },
      [],
      ctxVars("myBlobKey"),
    );
    const issues = computeNodeInputIssues(cfg, "A");
    expect(issues.status).toBe("unsatisfied");
    expect(issues.problemPorts).toEqual([
      {
        port: "documentId",
        label: "Document ID",
        kind: "Artifact",
        status: "unsatisfied",
      },
    ]);
  });

  it("does NOT flag an OPTIONAL base-Artifact identifier port", () => {
    // fileName/fileType/contentType are optional Artifact-kinded ports with
    // no source. documentId and blobKey are locked/bound so the node is
    // otherwise clean — the optional identifier ports must stay invisible.
    const cfg = makeConfig(
      {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "A",
          inputs: [
            { port: "documentId", ctxKey: "myDocId" },
            { port: "blobKey", ctxKey: "myBlobKey" },
          ],
          metadata: { lockedInputPorts: ["documentId", "blobKey"] },
        },
      },
      [],
      ctxVars("myDocId", "myBlobKey"),
    );
    expect(computeNodeInputIssues(cfg, "A")).toEqual({
      status: "ok",
      problemPorts: [],
    });
  });

  it("does NOT flag a required identifier port the resolver name-matches", () => {
    // azureOcr.submit outputs a REQUIRED apimRequestId (kind Artifact);
    // azureOcr.poll declares a REQUIRED apimRequestId input with the exact
    // same name — the resolver name-matches it, so it must not be flagged.
    const cfg = makeConfig(
      {
        S: {
          id: "S",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "S",
          outputs: [
            { port: "apimRequestId", ctxKey: "__auto.S.apimRequestId" },
          ],
        },
        P: {
          id: "P",
          type: "activity",
          activityType: "azureOcr.poll",
          label: "P",
        },
      },
      [{ source: "S", target: "P" }],
    );
    expect(computeNodeInputIssues(cfg, "P")).toEqual({
      status: "ok",
      problemPorts: [],
    });
  });

  it("flags a REQUIRED locked-unbound port", () => {
    // fileData (kind PreparedFile, required) is locked with no binding — the
    // user explicitly disconnected it.
    const cfg = makeConfig({
      Z: {
        id: "Z",
        type: "activity",
        activityType: "azureOcr.submit",
        label: "Z",
        metadata: { lockedInputPorts: ["fileData"] },
      },
    });
    const issues = computeNodeInputIssues(cfg, "Z");
    expect(issues.status).toBe("unsatisfied");
    expect(issues.problemPorts).toEqual([
      {
        port: "fileData",
        label: "Prepared file data",
        kind: "PreparedFile",
        status: "locked-unbound",
      },
    ]);
  });

  it("does NOT flag an OPTIONAL locked-unbound port", () => {
    // azureClassify.poll's blobKey (kind Document, required: false) is
    // locked with no binding — a deliberate disconnect of an optional port
    // is not a problem. resultId and modelId (both required) are
    // locked/bound so they don't also surface as problems.
    const cfg = makeConfig(
      {
        A: {
          id: "A",
          type: "activity",
          activityType: "azureClassify.poll",
          label: "A",
          inputs: [
            { port: "resultId", ctxKey: "r1" },
            { port: "modelId", ctxKey: "m1" },
          ],
          metadata: { lockedInputPorts: ["resultId", "modelId", "blobKey"] },
        },
      },
      [],
      ctxVars("r1", "m1"),
    );
    expect(computeNodeInputIssues(cfg, "A")).toEqual({
      status: "ok",
      problemPorts: [],
    });
  });
});
