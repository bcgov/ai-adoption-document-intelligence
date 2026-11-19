import type { GraphValidationError, GraphWorkflowConfig } from "../types";
import { validateGraphConfig } from "./validator";

/**
 * G-070 — a human gate inside a map body cannot work and failed silently.
 *
 * `executeHumanGateNode` calls `setHandler(defineSignal(node.signal.name))`
 * every time it runs, and a map body runs once per item; the backend then
 * resumes by signalling the workflow id with the fixed name "humanApproval".
 * So N iterations register N handlers under one name, the last wins, and one
 * approval has no way to say which item it is for.
 *
 * The rule refuses the shape rather than inventing per-iteration signal
 * routing, which would be a new feature rather than a fix.
 */
function gate(id: string, label = id) {
  return {
    id,
    type: "humanGate",
    label,
    signal: { name: "approve" },
    timeout: "PT1H",
    onTimeout: "fail",
  };
}

function activity(id: string) {
  return {
    id,
    type: "activity",
    label: id,
    activityType: "azureOcr.submit",
  };
}

function configWith(
  nodes: Record<string, unknown>,
  edges: Array<{ id: string; source: string; target: string }>,
  entryNodeId: string,
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    entryNodeId,
    nodes,
    edges: edges.map((e) => ({ ...e, type: "normal" })),
    ctx: { segments: { type: "array" }, currentSegment: { type: "object" } },
    metadata: {},
  } as unknown as GraphWorkflowConfig;
}

function mapNode(bodyEntryNodeId: string, bodyExitNodeId: string) {
  return {
    id: "m",
    type: "map",
    label: "Per segment",
    collectionCtxKey: "segments",
    itemCtxKey: "currentSegment",
    maxConcurrency: 5,
    bodyEntryNodeId,
    bodyExitNodeId,
  };
}

const gateErrors = (cfg: GraphWorkflowConfig) =>
  (validateGraphConfig(cfg).errors ?? []).filter((e: GraphValidationError) =>
    e.message.includes("inside a loop body"),
  );

describe("G-070 — a human gate inside a loop body is refused", () => {
  it("rejects a gate that IS the body entry", () => {
    const cfg = configWith(
      { m: mapNode("g", "g"), g: gate("g", "Approve segment") },
      [],
      "m",
    );
    const issues = gateErrors(cfg);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].path).toBe("nodes.g");
    expect(issues[0].message).toContain("Approve segment");
    expect(issues[0].message).toContain("move the gate outside the loop");
  });

  it("rejects a gate reached partway through the body", () => {
    const cfg = configWith(
      { m: mapNode("a", "b"), a: activity("a"), g: gate("g"), b: activity("b") },
      [
        { id: "e1", source: "a", target: "g" },
        { id: "e2", source: "g", target: "b" },
      ],
      "m",
    );
    expect(gateErrors(cfg)).toHaveLength(1);
  });

  it("blocks Save", () => {
    const cfg = configWith(
      { m: mapNode("g", "g"), g: gate("g") },
      [],
      "m",
    );
    expect(validateGraphConfig(cfg).valid).toBe(false);
  });

  it("allows a gate OUTSIDE the loop", () => {
    const cfg = configWith(
      {
        m: mapNode("a", "a"),
        a: activity("a"),
        g: gate("g"),
      },
      [{ id: "e1", source: "m", target: "g" }],
      "m",
    );
    expect(gateErrors(cfg)).toHaveLength(0);
  });

  it("does not treat a node DOWNSTREAM of the body exit as inside the body", () => {
    // `b` is the exit; `g` sits after it, so it runs once, not once per item.
    const cfg = configWith(
      {
        m: mapNode("a", "b"),
        a: activity("a"),
        b: activity("b"),
        g: gate("g"),
      },
      [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "g" },
      ],
      "m",
    );
    expect(gateErrors(cfg)).toHaveLength(0);
  });

  it("says nothing about a graph with no map at all", () => {
    const cfg = configWith(
      { g: gate("g"), a: activity("a") },
      [{ id: "e1", source: "g", target: "a" }],
      "g",
    );
    expect(gateErrors(cfg)).toHaveLength(0);
  });
});
