// packages/graph-workflow/src/auto-wire/ctx-source.test.ts
import type { GraphNode, GraphWorkflowConfig } from "../types";
import { resolveCtxKeySource } from "./ctx-source";

function makeConfig(
  nodes: Record<string, GraphNode>,
  ctx: GraphWorkflowConfig["ctx"] = {},
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes,
    edges: [],
    entryNodeId: Object.keys(nodes)[0] ?? "",
    ctx,
  };
}

function activity(
  id: string,
  activityType: string,
  extra: Partial<GraphNode> = {},
): GraphNode {
  return {
    id,
    type: "activity",
    activityType,
    label: id,
    ...extra,
  } as GraphNode;
}

describe("resolveCtxKeySource", () => {
  it("finds a node output that writes the key", () => {
    const cfg = makeConfig({
      a: activity("a", "file.prepare", {
        outputs: [{ port: "preparedData", ctxKey: "ocrResult" }],
      }),
    });
    expect(resolveCtxKeySource(cfg, "ocrResult")).toEqual({
      origin: "node-output",
      nodeId: "a",
      port: "preparedData",
      kind: "PreparedFile",
    });
  });

  it("finds a declared ctx entry with no producing node", () => {
    const cfg = makeConfig(
      { a: activity("a", "file.prepare") },
      { documentUrl: { type: "string", isInput: true } },
    );
    expect(resolveCtxKeySource(cfg, "documentUrl")).toEqual({
      origin: "declared-ctx",
    });
  });

  it("returns null for a key nothing writes and nothing declares", () => {
    const cfg = makeConfig({ a: activity("a", "file.prepare") });
    expect(resolveCtxKeySource(cfg, "ghostKey")).toBeNull();
  });

  it("returns null for a dangling auto key whose producer node was deleted", () => {
    // The realistic G-002 shape: the binding survived, the producer did not.
    const cfg = makeConfig({
      b: activity("b", "azureOcr.submit", {
        inputs: [{ port: "fileData", ctxKey: "__auto.prep.preparedData" }],
      }),
    });
    expect(resolveCtxKeySource(cfg, "__auto.prep.preparedData")).toBeNull();
  });

  it("prefers a node output when a key is both declared and produced", () => {
    const cfg = makeConfig(
      {
        a: activity("a", "file.prepare", {
          outputs: [{ port: "preparedData", ctxKey: "shared" }],
        }),
      },
      { shared: { type: "object" } },
    );
    expect(resolveCtxKeySource(cfg, "shared")).toMatchObject({
      origin: "node-output",
      nodeId: "a",
    });
  });

  it("ignores the writing node itself when a consumerNodeId is supplied", () => {
    const cfg = makeConfig({
      a: activity("a", "file.prepare", {
        outputs: [{ port: "preparedData", ctxKey: "selfKey" }],
      }),
    });
    expect(resolveCtxKeySource(cfg, "selfKey", "a")).toBeNull();
    expect(resolveCtxKeySource(cfg, "selfKey", "b")).toMatchObject({
      origin: "node-output",
      nodeId: "a",
    });
  });

  it("strips a leading `ctx.` prefix before matching", () => {
    const cfg = makeConfig({
      a: activity("a", "file.prepare", {
        outputs: [{ port: "preparedData", ctxKey: "ocrResult" }],
      }),
    });
    expect(resolveCtxKeySource(cfg, "ctx.ocrResult")).toMatchObject({
      origin: "node-output",
      nodeId: "a",
    });
  });

  it("resolves a drilled reference through its producing key", () => {
    const cfg = makeConfig({
      a: activity("a", "file.prepare", {
        outputs: [{ port: "preparedData", ctxKey: "ocrResult" }],
      }),
    });
    expect(resolveCtxKeySource(cfg, "ocrResult.status")).toMatchObject({
      origin: "node-output",
      nodeId: "a",
    });
    // Dot-boundary only — `ocrResultX` must NOT resolve to `ocrResult`.
    expect(resolveCtxKeySource(cfg, "ocrResultX")).toBeNull();
  });

  it("counts a map's item key as a source for its body nodes", () => {
    const cfg = makeConfig({
      MAP: {
        id: "MAP",
        type: "map",
        label: "Map",
        collectionCtxKey: "segments",
        itemCtxKey: "currentSegment",
        indexCtxKey: "segmentIndex",
        bodyEntryNodeId: "BODY",
        bodyExitNodeId: "BODY",
      } as GraphNode,
      BODY: activity("BODY", "document.classify"),
    });
    expect(resolveCtxKeySource(cfg, "currentSegment", "BODY")).toMatchObject({
      origin: "node-output",
      nodeId: "MAP",
      port: "item",
    });
    expect(resolveCtxKeySource(cfg, "segmentIndex", "BODY")).toMatchObject({
      origin: "node-output",
      nodeId: "MAP",
      port: "index",
    });
    // `segment.X` is the namespaced alias for `currentSegment`.
    expect(resolveCtxKeySource(cfg, "segment.type", "BODY")).toMatchObject({
      origin: "node-output",
      nodeId: "MAP",
    });
  });

  it("counts a join's results key as a source", () => {
    const cfg = makeConfig({
      J: {
        id: "J",
        type: "join",
        label: "Join",
        sourceMapNodeId: "MAP",
        strategy: "all",
        resultsCtxKey: "joined",
      } as GraphNode,
    });
    expect(resolveCtxKeySource(cfg, "joined")).toMatchObject({
      origin: "node-output",
      nodeId: "J",
      port: "results",
    });
  });

  it("counts a source node's produced keys as sources", () => {
    const cfg = makeConfig({
      S: {
        id: "S",
        type: "source",
        label: "Upload",
        sourceType: "source.upload",
        parameters: { ctxKey: "incomingDoc" },
      } as GraphNode,
      API: {
        id: "API",
        type: "source",
        label: "API",
        sourceType: "source.api",
        parameters: { fields: [{ name: "caseNumber", kind: "Artifact" }] },
      } as GraphNode,
    });
    expect(resolveCtxKeySource(cfg, "incomingDoc")).toMatchObject({
      origin: "node-output",
      nodeId: "S",
    });
    expect(resolveCtxKeySource(cfg, "caseNumber")).toMatchObject({
      origin: "node-output",
      nodeId: "API",
    });
  });

  it("counts a childWorkflow output mapping as a source", () => {
    const cfg = makeConfig({
      C: {
        id: "C",
        type: "childWorkflow",
        label: "Child",
        workflowRef: { type: "library", workflowId: "w1" },
        outputMappings: [{ port: "result", ctxKey: "childResult" }],
      } as GraphNode,
    });
    expect(resolveCtxKeySource(cfg, "childResult")).toMatchObject({
      origin: "node-output",
      nodeId: "C",
      port: "result",
    });
  });

  it("returns the declared kind for a declared ctx entry that carries one", () => {
    const cfg = makeConfig(
      {},
      { typedInput: { type: "object", kind: "Document" } },
    );
    expect(resolveCtxKeySource(cfg, "typedInput")).toEqual({
      origin: "declared-ctx",
      kind: "Document",
    });
  });

  it("returns null for an empty key", () => {
    expect(resolveCtxKeySource(makeConfig({}), "")).toBeNull();
  });
});
