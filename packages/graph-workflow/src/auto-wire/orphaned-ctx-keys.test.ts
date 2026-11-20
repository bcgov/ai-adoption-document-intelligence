// packages/graph-workflow/src/auto-wire/orphaned-ctx-keys.test.ts
import type { GraphNode, GraphWorkflowConfig } from "../types";
import { findOrphanedCtxKeys, pruneCtxDeclarations } from "./orphaned-ctx-keys";

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

/** prep writes `preparedFile`; ocr reads it. */
function prepAndOcr(ctxKey: string, ctx: GraphWorkflowConfig["ctx"] = {}) {
  return makeConfig(
    {
      prep: activity("prep", "file.prepare", {
        outputs: [{ port: "preparedData", ctxKey }],
      }),
      ocr: activity("ocr", "azureOcr.submit", {
        inputs: [{ port: "fileData", ctxKey }],
      }),
    },
    ctx,
  );
}

describe("findOrphanedCtxKeys", () => {
  it("reports a key whose sole producer is being deleted and is still read", () => {
    const cfg = prepAndOcr("preparedFile", {
      preparedFile: { type: "object" },
    });
    expect(findOrphanedCtxKeys(cfg, new Set(["prep"]))).toEqual([
      { ctxKey: "preparedFile", consumerNodeIds: ["ocr"], declared: true },
    ]);
  });

  it("reports an auto key the same way, with no declaration to prune", () => {
    const cfg = prepAndOcr("__auto.prep.preparedData");
    expect(findOrphanedCtxKeys(cfg, new Set(["prep"]))).toEqual([
      {
        ctxKey: "__auto.prep.preparedData",
        consumerNodeIds: ["ocr"],
        declared: false,
      },
    ]);
  });

  it("reports nothing when another surviving node still produces the key", () => {
    const cfg = prepAndOcr("preparedFile", {
      preparedFile: { type: "object" },
    });
    cfg.nodes.prep2 = activity("prep2", "file.prepare", {
      outputs: [{ port: "preparedData", ctxKey: "preparedFile" }],
    });
    expect(findOrphanedCtxKeys(cfg, new Set(["prep"]))).toEqual([]);
  });

  it("reports nothing when nothing consumes the key", () => {
    // The routine case: delete a leaf whose output nobody reads.
    const cfg = makeConfig(
      {
        prep: activity("prep", "file.prepare", {
          outputs: [{ port: "preparedData", ctxKey: "preparedFile" }],
        }),
      },
      { preparedFile: { type: "object" } },
    );
    expect(findOrphanedCtxKeys(cfg, new Set(["prep"]))).toEqual([]);
  });

  it("ignores consumers that are themselves being deleted", () => {
    const cfg = prepAndOcr("preparedFile", {
      preparedFile: { type: "object" },
    });
    expect(findOrphanedCtxKeys(cfg, new Set(["prep", "ocr"]))).toEqual([]);
  });

  it("counts a drilled consumer binding as a reader", () => {
    const cfg = makeConfig(
      {
        prep: activity("prep", "file.prepare", {
          outputs: [{ port: "preparedData", ctxKey: "prepared" }],
        }),
        ocr: activity("ocr", "azureOcr.submit", {
          inputs: [{ port: "fileData", ctxKey: "prepared.blob" }],
        }),
      },
      { prepared: { type: "object" } },
    );
    expect(findOrphanedCtxKeys(cfg, new Set(["prep"]))).toEqual([
      { ctxKey: "prepared", consumerNodeIds: ["ocr"], declared: true },
    ]);
  });

  it("counts a map's collection as a reader", () => {
    const cfg = makeConfig(
      {
        split: activity("split", "document.split", {
          outputs: [{ port: "segments", ctxKey: "segs" }],
        }),
        MAP: {
          id: "MAP",
          type: "map",
          label: "Map",
          collectionCtxKey: "segs",
          itemCtxKey: "currentSegment",
          bodyEntryNodeId: "BODY",
          bodyExitNodeId: "BODY",
        } as GraphNode,
        BODY: activity("BODY", "document.classify"),
      },
      { segs: { type: "array" } },
    );
    expect(findOrphanedCtxKeys(cfg, new Set(["split"]))).toEqual([
      { ctxKey: "segs", consumerNodeIds: ["MAP"], declared: true },
    ]);
  });

  it("counts a switch condition ref as a reader", () => {
    const cfg = makeConfig(
      {
        check: activity("check", "ocr.checkConfidence", {
          outputs: [{ port: "requiresReview", ctxKey: "requiresReview" }],
        }),
        SW: {
          id: "SW",
          type: "switch",
          label: "Review?",
          cases: [
            {
              condition: {
                operator: "equals",
                left: { ref: "ctx.requiresReview" },
                right: { literal: true },
              },
              edgeId: "e1",
            },
          ],
        } as GraphNode,
      },
      { requiresReview: { type: "boolean" } },
    );
    expect(findOrphanedCtxKeys(cfg, new Set(["check"]))).toEqual([
      { ctxKey: "requiresReview", consumerNodeIds: ["SW"], declared: true },
    ]);
  });

  it("returns keys in a stable order with de-duplicated consumers", () => {
    const cfg = makeConfig(
      {
        prep: activity("prep", "file.prepare", {
          outputs: [
            { port: "preparedData", ctxKey: "aKey" },
            { port: "sizeBytes", ctxKey: "bKey" },
          ],
        }),
        c1: activity("c1", "azureOcr.submit", {
          inputs: [{ port: "fileData", ctxKey: "aKey" }],
        }),
        c2: activity("c2", "azureOcr.submit", {
          inputs: [{ port: "fileData", ctxKey: "aKey" }],
        }),
        c3: activity("c3", "azureOcr.poll", {
          inputs: [{ port: "apimRequestId", ctxKey: "bKey" }],
        }),
      },
      { aKey: { type: "object" }, bKey: { type: "number" } },
    );
    expect(findOrphanedCtxKeys(cfg, new Set(["prep"]))).toEqual([
      { ctxKey: "aKey", consumerNodeIds: ["c1", "c2"], declared: true },
      { ctxKey: "bKey", consumerNodeIds: ["c3"], declared: true },
    ]);
  });

  it("returns nothing for an empty removal set", () => {
    const cfg = prepAndOcr("preparedFile", {
      preparedFile: { type: "object" },
    });
    expect(findOrphanedCtxKeys(cfg, new Set())).toEqual([]);
  });
});

describe("pruneCtxDeclarations", () => {
  it("drops the named declarations", () => {
    const cfg = prepAndOcr("preparedFile", {
      preparedFile: { type: "object" },
      keepMe: { type: "string" },
    });
    const next = pruneCtxDeclarations(cfg, ["preparedFile"]);
    expect(Object.keys(next.ctx)).toEqual(["keepMe"]);
  });

  it("never drops a declaration marked isInput", () => {
    const cfg = prepAndOcr("preparedFile", {
      preparedFile: { type: "object", isInput: true },
    });
    const next = pruneCtxDeclarations(cfg, ["preparedFile"]);
    expect(next.ctx.preparedFile).toBeDefined();
    expect(next).toBe(cfg);
  });

  it("returns the SAME config reference when nothing is pruned", () => {
    const cfg = prepAndOcr("preparedFile", {
      preparedFile: { type: "object" },
    });
    expect(pruneCtxDeclarations(cfg, [])).toBe(cfg);
    expect(pruneCtxDeclarations(cfg, ["noSuchKey"])).toBe(cfg);
  });

  it("prunes by ctx root so a drilled key drops its declaration once", () => {
    const cfg = prepAndOcr("prepared", { prepared: { type: "object" } });
    expect(
      Object.keys(pruneCtxDeclarations(cfg, ["prepared.blob"]).ctx),
    ).toEqual([]);
  });
});

describe("delete → prune → the surfaces report it (G-002 end to end)", () => {
  it("leaves the consumer's key with no source once the declaration is gone", async () => {
    const { resolveCtxKeySource } = await import("./ctx-source");
    const before = prepAndOcr("preparedFile", {
      preparedFile: { type: "object" },
    });
    // Before the delete the key resolves to prep's output.
    expect(resolveCtxKeySource(before, "preparedFile", "ocr")).toMatchObject({
      origin: "node-output",
      nodeId: "prep",
    });

    const orphaned = findOrphanedCtxKeys(before, new Set(["prep"]));
    const afterDelete: GraphWorkflowConfig = {
      ...before,
      nodes: { ocr: before.nodes.ocr },
    };
    // Without the prune the leftover declaration still reads as a source —
    // this is exactly the residual the prune exists to close.
    expect(resolveCtxKeySource(afterDelete, "preparedFile", "ocr")).toEqual({
      origin: "declared-ctx",
    });

    const pruned = pruneCtxDeclarations(
      afterDelete,
      orphaned.map((o) => o.ctxKey),
    );
    expect(resolveCtxKeySource(pruned, "preparedFile", "ocr")).toBeNull();
  });
});
