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
        SPLIT: { id: "SPLIT", type: "activity", activityType: "document.split", label: "Split" },
        OCR: { id: "OCR", type: "activity", activityType: "azureOcr.extract", label: "OCR" },
        MAP: {
          id: "MAP", type: "map", label: "Map",
          collectionCtxKey: "", itemCtxKey: "currentSegment",
          bodyEntryNodeId: "BODY", bodyExitNodeId: "BODY",
        },
        BODY: { id: "BODY", type: "activity", activityType: "document.classify", label: "Body" },
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
    const body = out.nodes.BODY as { inputs?: { port: string; ctxKey: string }[] };
    const segmentBinding = body.inputs?.find((b) => b.port === "segment");
    expect(segmentBinding?.ctxKey).toBe("currentSegment");
  });
});
