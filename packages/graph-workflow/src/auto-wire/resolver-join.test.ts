// packages/graph-workflow/src/auto-wire/resolver-join.test.ts
import type { GraphWorkflowConfig, JoinNode } from "../types";
import { resolveBindings } from "./resolver";

describe("resolveBindings — join", () => {
  it("synthesises join.resultsCtxKey when absent", () => {
    const cfg: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        MAP: {
          id: "MAP",
          type: "map",
          label: "Map",
          collectionCtxKey: "items",
          itemCtxKey: "currentItem",
          bodyEntryNodeId: "BODY",
          bodyExitNodeId: "BODY",
        },
        BODY: {
          id: "BODY",
          type: "activity",
          activityType: "document.classify",
          label: "Body",
        },
        JOIN: {
          id: "JOIN",
          type: "join",
          label: "Join",
          sourceMapNodeId: "MAP",
          strategy: "all",
          resultsCtxKey: "",
        },
      },
      edges: [{ id: "e", source: "BODY", target: "JOIN", type: "normal" }],
      entryNodeId: "MAP",
      ctx: {},
    };
    const out = resolveBindings(cfg);
    const join = out.nodes.JOIN as JoinNode;
    expect(join.resultsCtxKey).toBe("__auto.JOIN.results");
  });

  it("leaves a hand-authored resultsCtxKey alone", () => {
    const cfg: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        MAP: {
          id: "MAP",
          type: "map",
          label: "Map",
          collectionCtxKey: "items",
          itemCtxKey: "currentItem",
          bodyEntryNodeId: "BODY",
          bodyExitNodeId: "BODY",
        },
        BODY: {
          id: "BODY",
          type: "activity",
          activityType: "document.classify",
          label: "Body",
        },
        JOIN: {
          id: "JOIN",
          type: "join",
          label: "Join",
          sourceMapNodeId: "MAP",
          strategy: "all",
          resultsCtxKey: "myResults",
          metadata: { lockedOutputPorts: ["results"] },
        },
      },
      edges: [{ id: "e", source: "BODY", target: "JOIN", type: "normal" }],
      entryNodeId: "MAP",
      ctx: {},
    };
    const out = resolveBindings(cfg);
    const join = out.nodes.JOIN as JoinNode;
    expect(join.resultsCtxKey).toBe("myResults");
  });
});

describe("resolveBindings — control-flow producers write their own ctx key (G-007)", () => {
  it("binds a consumer to the join's resultsCtxKey, not a synthesised outputs row", () => {
    const cfg: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        JOIN: {
          id: "JOIN",
          type: "join",
          label: "Join",
          sourceMapNodeId: "MAP",
          strategy: "all",
          resultsCtxKey: "branchResults",
        },
        AGG: {
          id: "AGG",
          type: "activity",
          activityType: "benchmark.aggregate",
          label: "Aggregate",
        },
      },
      edges: [{ id: "e", source: "JOIN", target: "AGG", type: "normal" }],
      entryNodeId: "JOIN",
      ctx: {},
    };
    const out = resolveBindings(cfg);
    expect(out.nodes.AGG.inputs).toEqual([
      { port: "results", ctxKey: "branchResults" },
    ]);
    // No phantom `outputs[]` row: the executor writes `resultsCtxKey`, and a
    // synthesised `__auto.JOIN.results` binding would point at nothing.
    expect(out.nodes.JOIN.outputs).toBeUndefined();
  });

  it("binds a consumer to a source node's produced key", () => {
    const cfg: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        S: {
          id: "S",
          type: "source",
          label: "Upload",
          sourceType: "source.upload",
          parameters: { ctxKey: "incomingDoc" },
        },
        READ: {
          id: "READ",
          type: "activity",
          activityType: "blob.read",
          label: "Read blob",
        },
      },
      edges: [{ id: "e", source: "S", target: "READ", type: "normal" }],
      entryNodeId: "S",
      ctx: {},
    };
    const out = resolveBindings(cfg);
    // `source.upload` writes its key with the catalog `outputKind`
    // (`DocumentRef`), which is exactly what `blob.read.blobKey` expects.
    expect(out.nodes.READ.inputs).toContainEqual({
      port: "blobKey",
      ctxKey: "incomingDoc",
    });
    expect(out.nodes.S.outputs).toBeUndefined();
  });
});
