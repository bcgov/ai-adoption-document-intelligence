/**
 * G-010 — every validation anchor shape that names a concrete target must
 * resolve to one. The shapes below are the complete enumeration of `path`
 * values emitted by:
 *   - `packages/graph-workflow/src/validator/validator.ts`
 *   - `apps/frontend/src/features/workflow-builder/auto-wire-validation.ts`
 *   - `apps/frontend/src/features/workflow-builder/validation/map-body-validation.ts`
 */

import type { GraphWorkflowConfig } from "@ai-di/graph-workflow";
import { describe, expect, it } from "vitest";
import { type AnchorTarget, resolveAnchorTarget } from "./anchor-target";

const config: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: {
    name: "t",
    kind: "library",
    inputs: [
      { label: "Doc", path: "ctx.documentId", type: "string" },
      { label: "Text", path: "nodes.a.outputs.text", type: "string" },
    ],
    outputs: [{ label: "Out", path: "nodes.b.outputs.result", type: "string" }],
  },
  nodes: {
    a: {
      id: "a",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "A",
    },
    b: {
      id: "b",
      type: "activity",
      activityType: "azureOcr.submit",
      label: "B",
    },
    sw: {
      id: "sw",
      type: "switch",
      label: "SW",
      cases: [],
    } as unknown as GraphWorkflowConfig["nodes"][string],
  },
  edges: [
    { id: "e1", source: "a", target: "b", type: "normal" },
    { id: "e2", source: "b", target: "sw", type: "normal" },
  ],
  entryNodeId: "a",
  ctx: { documentId: { type: "string" } },
  nodeGroups: {
    g1: { label: "Group one", nodeIds: ["a", "b"] },
  },
};

const node = (nodeId: string): AnchorTarget => ({ kind: "node", nodeId });

describe("resolveAnchorTarget — node-anchored shapes", () => {
  it.each<[string, AnchorTarget]>([
    ["nodes.a", node("a")],
    ["nodes.a.label", node("a")],
    ["nodes.a.activityType", node("a")],
    ["nodes.a.sourceType", node("a")],
    ["nodes.a.inputs", node("a")],
    ["nodes.a.inputs[0].ctxKey", node("a")],
    ["nodes.a.outputs[0].ctxKey", node("a")],
    ["nodes.a.outputs.text", node("a")],
    ["nodes.a.parameters", node("a")],
    ["nodes.a.parameters.model.name", node("a")],
    ["nodes.a.errorPolicy.fallbackEdgeId", node("a")],
    ["nodes.sw.defaultEdge", node("sw")],
    ["nodes.sw.cases[0].edgeId", node("sw")],
    ["nodes.sw.cases[0].condition", node("sw")],
    ["nodes.sw.cases[0].condition.operator", node("sw")],
    ["nodes.sw.cases[0].condition.operands[1].operand", node("sw")],
    ["nodes.a.condition", node("a")],
    ["nodes.a.signal.name", node("a")],
    ["nodes.a.bodyEntryNodeId", node("a")],
    ["nodes.a.bodyExitNodeId", node("a")],
    ["nodes.a.sourceMapNodeId", node("a")],
    ["nodes.a.itemCtxKey", node("a")],
    ["nodes.a.indexCtxKey", node("a")],
    ["nodes.a.interval", node("a")],
    ["nodes.a.initialDelay", node("a")],
    ["nodes.a.timeout", node("a")],
  ])("deep-links anchor shape %s", (path, expected) => {
    expect(resolveAnchorTarget(path, config)).toEqual(expected);
  });

  it("deep-links anchor shape nodes.<id>.inputs.<port> to that input's picker", () => {
    expect(resolveAnchorTarget("nodes.a.inputs.fileData", config)).toEqual({
      kind: "nodeInput",
      nodeId: "a",
      port: "fileData",
    });
  });

  it("still names a node the config no longer contains", () => {
    expect(resolveAnchorTarget("nodes.ghost.label", config)).toEqual(
      node("ghost"),
    );
  });

  // G-015 — an inline child graph's errors are anchored
  // `nodes.<parentId>.inline.<inner path>`. The inner graph has no canvas, so
  // the only navigable target is the childWorkflow node holding the JSON.
  it.each<[string, AnchorTarget]>([
    ["nodes.a.inline", node("a")],
    ["nodes.a.inline.entryNodeId", node("a")],
    ["nodes.a.inline.nodes.inner.defaultEdge", node("a")],
    // Deliberately NOT a `nodeInput` — `inner` is not on this canvas, and
    // there is no input picker to open for it.
    ["nodes.a.inline.nodes.inner.inputs.fileData", node("a")],
    ["nodes.a.inline.nodes.inner.inline.nodes.deep.label", node("a")],
  ])("resolves inline-child anchor %s to the parent node", (path, expected) => {
    expect(resolveAnchorTarget(path, config)).toEqual(expected);
  });
});

describe("resolveAnchorTarget — edge-anchored shapes", () => {
  it.each<[string, AnchorTarget]>([
    ["edges[0]", { kind: "edge", edgeId: "e1" }],
    ["edges[0].source", { kind: "edge", edgeId: "e1" }],
    ["edges[1].target", { kind: "edge", edgeId: "e2" }],
    ["edges.e2", { kind: "edge", edgeId: "e2" }],
    ["edges.e2.source", { kind: "edge", edgeId: "e2" }],
  ])("deep-links anchor shape %s", (path, expected) => {
    expect(resolveAnchorTarget(path, config)).toEqual(expected);
  });

  it("does not invent an edge for an out-of-range index", () => {
    expect(resolveAnchorTarget("edges[9]", config)).toBeNull();
  });

  it("does not invent an edge that the config does not contain", () => {
    expect(resolveAnchorTarget("edges.missing", config)).toBeNull();
  });
});

describe("resolveAnchorTarget — group-anchored shapes", () => {
  it.each<[string, AnchorTarget]>([
    ["nodeGroups.g1.nodeIds", { kind: "group", groupId: "g1" }],
    ["nodeGroups.g1.nodeIds[0]", { kind: "group", groupId: "g1" }],
    ["nodeGroups.g1.exposedParams[2].path", { kind: "group", groupId: "g1" }],
  ])("deep-links anchor shape %s", (path, expected) => {
    expect(resolveAnchorTarget(path, config)).toEqual(expected);
  });

  it("does not invent a group that the config does not contain", () => {
    expect(resolveAnchorTarget("nodeGroups.gone.nodeIds", config)).toBeNull();
  });
});

describe("resolveAnchorTarget — workflow-settings shapes", () => {
  it.each<[string, AnchorTarget]>([
    ["ctx.documentId", { kind: "workflowSettings", focus: "ctx" }],
    ["metadata.ctx", { kind: "workflowSettings", focus: "ctx" }],
    [
      "metadata.inputs[0].path",
      { kind: "workflowSettings", focus: "libraryPorts" },
    ],
  ])("deep-links anchor shape %s", (path, expected) => {
    expect(resolveAnchorTarget(path, config)).toEqual(expected);
  });

  it("deep-links a library port descriptor that names a node to that node", () => {
    expect(resolveAnchorTarget("metadata.inputs[1].path", config)).toEqual(
      node("a"),
    );
    expect(resolveAnchorTarget("metadata.outputs[0].path", config)).toEqual(
      node("b"),
    );
  });

  it("deep-links entryNodeId to the entry node when it exists", () => {
    expect(resolveAnchorTarget("entryNodeId", config)).toEqual(node("a"));
  });

  it("deep-links entryNodeId to workflow settings when it does not resolve", () => {
    const broken = { ...config, entryNodeId: "" };
    expect(resolveAnchorTarget("entryNodeId", broken)).toEqual({
      kind: "workflowSettings",
      focus: "entryNode",
    });
  });
});

describe("resolveAnchorTarget — genuinely workflow-level anchors", () => {
  it.each([
    ["", "the whole config is not an object"],
    ["schemaVersion", "unsupported schema version"],
    ["nodes", "the nodes map is empty / not an object"],
    ["edges", "a cycle spans the graph, not one edge"],
  ])("falls back to workflow-level only for genuinely workflow-level anchor %s", (path) => {
    expect(resolveAnchorTarget(path, config)).toBeNull();
  });
});
