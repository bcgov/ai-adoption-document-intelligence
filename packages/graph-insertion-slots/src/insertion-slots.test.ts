import {
  buildInsertionSlots,
  findSlotImmediatelyAfterAzureOcrExtract,
  forwardReachableNormalFromNodes,
  isOcrCorrectionInsertionEdgeSourceAllowed,
  resolveRecommendationsInsertionSlots,
  type InsertionSlotsGraphConfig,
} from "./insertion-slots";

describe("graph-insertion-slots", () => {
  const simpleGraph: InsertionSlotsGraphConfig = {
    nodes: {
      a: {
        type: "activity",
        activityType: "azureOcr.poll",
      },
      b: {
        type: "activity",
        activityType: "azureOcr.extract",
      },
      c: {
        type: "activity",
        activityType: "ocr.cleanup",
      },
    },
    edges: [
      { id: "e1", source: "a", target: "b", type: "normal" },
      { id: "e2", source: "b", target: "c", type: "normal" },
    ],
  };

  it("buildInsertionSlots lists one slot per distinct normal edge", () => {
    const slots = buildInsertionSlots(simpleGraph);
    expect(slots).toHaveLength(2);
    expect(slots[0].afterNodeId).toBe("a");
    expect(slots[0].beforeNodeId).toBe("b");
    expect(slots[1].afterNodeId).toBe("b");
    expect(slots[1].beforeNodeId).toBe("c");
  });

  it("findSlotImmediatelyAfterAzureOcrExtract returns the edge leaving extract", () => {
    const slots = buildInsertionSlots(simpleGraph, {
      postAzureOcrExtractOnly: true,
    });
    expect(findSlotImmediatelyAfterAzureOcrExtract(slots)).toEqual({
      afterNodeId: "b",
      beforeNodeId: "c",
    });
  });

  it("buildInsertionSlots with postAzureOcrExtractOnly omits edges before extract", () => {
    const slots = buildInsertionSlots(simpleGraph, {
      postAzureOcrExtractOnly: true,
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].afterNodeId).toBe("b");
    expect(slots[0].beforeNodeId).toBe("c");
    expect(slots[0].afterActivityType).toBe("azureOcr.extract");
  });

  it("forwardReachableNormalFromNodes includes extract and downstream", () => {
    const extractIds = new Set(["b"]);
    const reach = forwardReachableNormalFromNodes(simpleGraph, extractIds);
    expect([...reach].sort()).toEqual(["b", "c"]);
  });

  it("isOcrCorrectionInsertionEdgeSourceAllowed rejects upstream of extract", () => {
    expect(isOcrCorrectionInsertionEdgeSourceAllowed(simpleGraph, "a")).toBe(
      false,
    );
    expect(isOcrCorrectionInsertionEdgeSourceAllowed(simpleGraph, "b")).toBe(
      true,
    );
  });

  it("resolveRecommendationsInsertionSlots maps insertionSlotIndex to node ids", () => {
    const slots = buildInsertionSlots(simpleGraph, {
      postAzureOcrExtractOnly: true,
    });
    const out = resolveRecommendationsInsertionSlots(
      [
        {
          insertionPoint: {},
          insertionSlotIndex: 0,
          toolId: "ocr.characterConfusion",
        },
      ],
      slots,
    );
    expect(out[0].insertionPoint.afterNodeId).toBe("b");
    expect(out[0].insertionPoint.beforeNodeId).toBe("c");
  });

  it("resolveRecommendationsInsertionSlots maps activity types to slot", () => {
    const slots = buildInsertionSlots(simpleGraph, {
      postAzureOcrExtractOnly: true,
    });
    const out = resolveRecommendationsInsertionSlots(
      [
        {
          insertionPoint: {},
          afterActivityType: "azureOcr.extract",
          beforeActivityType: "ocr.cleanup",
        },
      ],
      slots,
    );
    expect(out[0].insertionPoint.afterNodeId).toBe("b");
    expect(out[0].insertionPoint.beforeNodeId).toBe("c");
  });

  it("skips non-normal edges", () => {
    const g: InsertionSlotsGraphConfig = {
      ...simpleGraph,
      edges: [
        ...simpleGraph.edges,
        {
          id: "c1",
          source: "a",
          target: "b",
          type: "conditional",
        },
      ],
    };
    expect(buildInsertionSlots(g)).toHaveLength(2);
  });

  it("findSlotImmediatelyAfterAzureOcrExtract is deterministic with multiple extract edges", () => {
    const g: InsertionSlotsGraphConfig = {
      nodes: {
        ext1: { type: "activity", activityType: "azureOcr.extract" },
        ext2: { type: "activity", activityType: "azureOcr.extract" },
        t1: { type: "activity", activityType: "ocr.cleanup" },
        t2: { type: "activity", activityType: "ocr.cleanup" },
      },
      edges: [
        { id: "e1", source: "ext2", target: "t2", type: "normal" },
        { id: "e2", source: "ext1", target: "t1", type: "normal" },
      ],
    };
    const slots = buildInsertionSlots(g);
    const edge = findSlotImmediatelyAfterAzureOcrExtract(slots);
    expect(edge).toEqual({ afterNodeId: "ext1", beforeNodeId: "t1" });
  });

  const mistralGraph: InsertionSlotsGraphConfig = {
    nodes: {
      prep: { type: "activity", activityType: "file.prepare" },
      mistral: { type: "activity", activityType: "mistralOcr.process" },
      cleanup: { type: "activity", activityType: "ocr.cleanup" },
    },
    edges: [
      { id: "e1", source: "prep", target: "mistral", type: "normal" },
      { id: "e2", source: "mistral", target: "cleanup", type: "normal" },
    ],
  };

  it("findSlotImmediatelyAfterAzureOcrExtract finds edge after mistralOcr.process", () => {
    const slots = buildInsertionSlots(mistralGraph, {
      postAzureOcrExtractOnly: true,
    });
    expect(findSlotImmediatelyAfterAzureOcrExtract(slots)).toEqual({
      afterNodeId: "mistral",
      beforeNodeId: "cleanup",
    });
  });

  it("isOcrCorrectionInsertionEdgeSourceAllowed rejects upstream of mistralOcr.process", () => {
    expect(isOcrCorrectionInsertionEdgeSourceAllowed(mistralGraph, "prep")).toBe(
      false,
    );
    expect(
      isOcrCorrectionInsertionEdgeSourceAllowed(mistralGraph, "mistral"),
    ).toBe(true);
  });

  it("buildInsertionSlots with postAzureOcrExtractOnly falls back to all normal edges when no anchor type exists", () => {
    const unknownOcr: InsertionSlotsGraphConfig = {
      nodes: {
        x: { type: "activity", activityType: "customOcr.extract" },
        y: { type: "activity", activityType: "ocr.cleanup" },
      },
      edges: [{ id: "e1", source: "x", target: "y", type: "normal" }],
    };
    const slots = buildInsertionSlots(unknownOcr, {
      postAzureOcrExtractOnly: true,
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].afterActivityType).toBe("customOcr.extract");
  });
});
