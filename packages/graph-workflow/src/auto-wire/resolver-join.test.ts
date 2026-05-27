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
          id: "MAP", type: "map", label: "Map",
          collectionCtxKey: "items", itemCtxKey: "currentItem",
          bodyEntryNodeId: "BODY", bodyExitNodeId: "BODY",
        },
        BODY: { id: "BODY", type: "activity", activityType: "document.classify", label: "Body" },
        JOIN: {
          id: "JOIN", type: "join", label: "Join",
          sourceMapNodeId: "MAP", strategy: "all",
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
          id: "MAP", type: "map", label: "Map",
          collectionCtxKey: "items", itemCtxKey: "currentItem",
          bodyEntryNodeId: "BODY", bodyExitNodeId: "BODY",
        },
        BODY: { id: "BODY", type: "activity", activityType: "document.classify", label: "Body" },
        JOIN: {
          id: "JOIN", type: "join", label: "Join",
          sourceMapNodeId: "MAP", strategy: "all",
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
