// packages/graph-workflow/src/auto-wire/resolver-map.test.ts
import type { GraphWorkflowConfig } from "../types";
import { resolveBindings } from "./resolver";

describe("resolveBindings — map", () => {
  it("auto-binds map.collectionCtxKey to the nearest upstream T[] producer", () => {
    // SPLIT (output `segments` kind Segment[]) → MAP → ENTRY (body)
    const cfg: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        SPLIT: {
          id: "SPLIT",
          type: "activity",
          activityType: "document.split",
          label: "Split",
        },
        MAP: {
          id: "MAP",
          type: "map",
          label: "Map",
          collectionCtxKey: "",
          itemCtxKey: "currentSegment",
          bodyEntryNodeId: "BODY",
          bodyExitNodeId: "BODY",
        },
        BODY: {
          id: "BODY",
          type: "activity",
          activityType: "document.classify",
          label: "Body",
        },
      },
      edges: [{ id: "e", source: "SPLIT", target: "MAP", type: "normal" }],
      entryNodeId: "SPLIT",
      ctx: {},
    };
    const out = resolveBindings(cfg);
    const map = out.nodes.MAP as typeof cfg.nodes.MAP & {
      collectionCtxKey: string;
    };
    expect(map.collectionCtxKey).toBe("__auto.SPLIT.segments");
  });

  it("treats the map node as a synthetic Segment producer for body nodes", () => {
    // SPLIT(Segment[]) → MAP → BODY (document.classify wants Segment + OcrResult)
    // OCR (OcrResult) → BODY. After resolution BODY.segment should bind to
    // the map's itemCtxKey ("currentSegment").
    const cfg: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        SPLIT: {
          id: "SPLIT",
          type: "activity",
          activityType: "document.split",
          label: "Split",
        },
        OCR: {
          id: "OCR",
          type: "activity",
          activityType: "azureOcr.extract",
          label: "OCR",
        },
        MAP: {
          id: "MAP",
          type: "map",
          label: "Map",
          collectionCtxKey: "",
          itemCtxKey: "currentSegment",
          bodyEntryNodeId: "BODY",
          bodyExitNodeId: "BODY",
        },
        BODY: {
          id: "BODY",
          type: "activity",
          activityType: "document.classify",
          label: "Body",
        },
      },
      edges: [
        { id: "e0", source: "SPLIT", target: "MAP", type: "normal" },
        { id: "e1", source: "OCR", target: "MAP", type: "normal" },
        { id: "e2", source: "MAP", target: "BODY", type: "normal" },
      ],
      entryNodeId: "SPLIT",
      ctx: {},
    };
    const out = resolveBindings(cfg);
    const body = out.nodes.BODY as {
      inputs?: { port: string; ctxKey: string }[];
    };
    const segmentBinding = body.inputs?.find((b) => b.port === "segment");
    expect(segmentBinding?.ctxKey).toBe("currentSegment");
  });
});

describe("resolveBindings — map collection re-resolution (G-013)", () => {
  function mapGraph(
    collectionCtxKey: string,
    mapExtra: Record<string, unknown> = {},
  ): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        SPLIT: {
          id: "SPLIT",
          type: "activity",
          activityType: "document.split",
          label: "Split",
        },
        MAP: {
          id: "MAP",
          type: "map",
          label: "Map",
          collectionCtxKey,
          itemCtxKey: "currentSegment",
          bodyEntryNodeId: "BODY",
          bodyExitNodeId: "BODY",
          ...mapExtra,
        },
        BODY: {
          id: "BODY",
          type: "activity",
          activityType: "document.classify",
          label: "Body",
        },
      } as GraphWorkflowConfig["nodes"],
      edges: [{ id: "e", source: "SPLIT", target: "MAP", type: "normal" }],
      entryNodeId: "SPLIT",
      ctx: {},
    };
  }

  function collectionKeyOf(cfg: GraphWorkflowConfig): string {
    const map = resolveBindings(cfg).nodes.MAP;
    return map.type === "map" ? map.collectionCtxKey : "";
  }

  it("re-resolves a map collection whose producer was deleted", () => {
    // The key names a node that is gone; a valid `Segment[]` producer exists.
    expect(collectionKeyOf(mapGraph("__auto.OLD_SPLIT.segments"))).toBe(
      "__auto.SPLIT.segments",
    );
  });

  it("does not re-resolve a collection the author pinned", () => {
    expect(
      collectionKeyOf(
        mapGraph("__auto.OLD_SPLIT.segments", {
          metadata: { lockedInputPorts: ["collection"] },
        }),
      ),
    ).toBe("__auto.OLD_SPLIT.segments");
  });

  it("leaves a healthy collection binding untouched", () => {
    const cfg = mapGraph("mySegments");
    cfg.nodes.SPLIT = {
      ...cfg.nodes.SPLIT,
      outputs: [{ port: "segments", ctxKey: "mySegments" }],
    };
    expect(collectionKeyOf(cfg)).toBe("mySegments");
  });

  it("leaves a declared-ctx collection binding untouched", () => {
    const cfg = mapGraph("incomingSegments");
    cfg.ctx = { incomingSegments: { type: "array", isInput: true } };
    expect(collectionKeyOf(cfg)).toBe("incomingSegments");
  });

  it("leaves a dangling collection alone when there is no replacement", () => {
    const cfg = mapGraph("__auto.OLD_SPLIT.segments");
    delete (cfg.nodes as Record<string, unknown>).SPLIT;
    cfg.edges = [];
    cfg.entryNodeId = "MAP";
    expect(collectionKeyOf(cfg)).toBe("__auto.OLD_SPLIT.segments");
  });
});
