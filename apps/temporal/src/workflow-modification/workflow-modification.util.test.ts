import type { ToolRecommendation } from "../ai-recommendation-types";
import type { GraphWorkflowConfig } from "../graph-workflow-types";
import { applyRecommendations } from "./workflow-modification.util";

function makeSimpleGraph(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "test-ocr-workflow" },
    nodes: {
      extract: {
        id: "extract",
        type: "activity",
        label: "Extract OCR",
        activityType: "azureOcr.extract",
        inputs: [],
        outputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
      },
      cleanup: {
        id: "cleanup",
        type: "activity",
        label: "Post-OCR Cleanup",
        activityType: "ocr.cleanup",
        inputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
        outputs: [{ port: "cleanedResult", ctxKey: "cleanedResult" }],
      },
      enrich: {
        id: "enrich",
        type: "activity",
        label: "Enrich Results",
        activityType: "ocr.enrich",
        inputs: [{ port: "ocrResult", ctxKey: "cleanedResult" }],
        outputs: [{ port: "ocrResult", ctxKey: "cleanedResult" }],
      },
      store: {
        id: "store",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
        inputs: [{ port: "ocrResult", ctxKey: "cleanedResult" }],
        outputs: [],
      },
    },
    edges: [
      { id: "e1", source: "extract", target: "cleanup", type: "normal" },
      { id: "e2", source: "cleanup", target: "enrich", type: "normal" },
      { id: "e3", source: "enrich", target: "store", type: "normal" },
    ],
    entryNodeId: "extract",
    ctx: {
      ocrResult: { type: "object", description: "Raw OCR result" },
      cleanedResult: { type: "object", description: "Cleaned OCR result" },
    },
  };
}

describe("applyRecommendations", () => {
  it("inserts a node between two existing nodes", () => {
    const graph = makeSimpleGraph();
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.spellcheck",
        parameters: { language: "en" },
        insertionPoint: {
          afterNodeId: "cleanup",
          beforeNodeId: "enrich",
        },
        rationale: "Fix spelling errors",
        priority: 1,
      },
    ];

    const result = applyRecommendations(graph, recs);

    expect(result.appliedRecommendations).toHaveLength(1);
    expect(result.rejectedRecommendations).toHaveLength(0);

    const nodeIds = Object.keys(result.newConfig.nodes);
    expect(nodeIds).toContain("correction_ocr_spellcheck_0");

    const newNode = result.newConfig.nodes["correction_ocr_spellcheck_0"];
    expect(newNode.type).toBe("activity");
    expect((newNode as { activityType: string }).activityType).toBe(
      "ocr.spellcheck",
    );

    // Original edge between cleanup and enrich should be removed
    const oldEdge = result.newConfig.edges.find(
      (e) => e.source === "cleanup" && e.target === "enrich",
    );
    expect(oldEdge).toBeUndefined();

    // New edges should connect cleanup -> new node -> enrich
    const newEdge1 = result.newConfig.edges.find(
      (e) =>
        e.source === "cleanup" && e.target === "correction_ocr_spellcheck_0",
    );
    expect(newEdge1).toBeDefined();

    const newEdge2 = result.newConfig.edges.find(
      (e) =>
        e.source === "correction_ocr_spellcheck_0" && e.target === "enrich",
    );
    expect(newEdge2).toBeDefined();
  });

  it("uses ocrResult when splitting extract to cleanup", () => {
    const graph = makeSimpleGraph();
    const result = applyRecommendations(graph, [
      {
        toolId: "ocr.spellcheck",
        parameters: {},
        insertionPoint: {
          afterNodeId: "extract",
          beforeNodeId: "cleanup",
        },
        rationale: "Spellcheck raw extract output",
        priority: 1,
      },
    ]);

    const n = result.newConfig.nodes.correction_ocr_spellcheck_0 as {
      inputs?: { ctxKey: string }[];
      outputs?: { ctxKey: string }[];
    };
    expect(n.inputs?.[0].ctxKey).toBe("ocrResult");
    expect(n.outputs?.[0].ctxKey).toBe("ocrResult");
  });

  it("inserts multiple nodes in sequence", () => {
    const graph = makeSimpleGraph();
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.characterConfusion",
        parameters: {},
        insertionPoint: {
          afterNodeId: "cleanup",
          beforeNodeId: "enrich",
        },
        rationale: "Fix character confusions",
        priority: 1,
      },
      {
        toolId: "ocr.spellcheck",
        parameters: {},
        insertionPoint: {
          afterNodeId: "enrich",
          beforeNodeId: "store",
        },
        rationale: "Fix spelling after enrichment",
        priority: 2,
      },
    ];

    const result = applyRecommendations(graph, recs);

    expect(result.appliedRecommendations).toHaveLength(2);
    expect(Object.keys(result.newConfig.nodes)).toHaveLength(6);
  });

  it("inserts multiple tools between the same nodes", () => {
    const graph = makeSimpleGraph();
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.characterConfusion",
        parameters: {},
        insertionPoint: {
          afterNodeId: "cleanup",
          beforeNodeId: "enrich",
        },
        rationale: "Fix character confusions",
        priority: 1,
      },
      {
        toolId: "ocr.normalizeFields",
        parameters: {},
        insertionPoint: {
          afterNodeId: "cleanup",
          beforeNodeId: "enrich",
        },
        rationale: "Normalize values",
        priority: 2,
      },
    ];

    const result = applyRecommendations(graph, recs);

    expect(result.appliedRecommendations).toHaveLength(2);
    expect(result.rejectedRecommendations).toHaveLength(0);
    expect(
      result.newConfig.edges.find(
        (e) => e.source === "cleanup" && e.target === "enrich",
      ),
    ).toBeUndefined();
    const edgeFromCleanup = result.newConfig.edges.find(
      (e) =>
        e.source === "cleanup" &&
        (e.target === "correction_ocr_characterConfusion_0" ||
          e.target === "correction_ocr_normalizeFields_1"),
    );
    expect(edgeFromCleanup).toBeDefined();
    expect(
      result.newConfig.edges.find(
        (e) =>
          e.source === "correction_ocr_characterConfusion_0" &&
          e.target === "enrich",
      ) ||
        result.newConfig.edges.find(
          (e) =>
            e.source === "correction_ocr_normalizeFields_1" &&
            e.target === "enrich",
        ),
    ).toBeDefined();
    expect(
      result.newConfig.edges.find(
        (e) =>
          (e.source === "correction_ocr_characterConfusion_0" &&
            e.target === "correction_ocr_normalizeFields_1") ||
          (e.source === "correction_ocr_normalizeFields_1" &&
            e.target === "correction_ocr_characterConfusion_0"),
      ),
    ).toBeDefined();
  });

  it("rejects when afterNodeId is missing", () => {
    const graph = makeSimpleGraph();
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.spellcheck",
        parameters: {},
        insertionPoint: {},
        rationale: "test",
        priority: 1,
      },
    ];

    const result = applyRecommendations(graph, recs);

    expect(result.appliedRecommendations).toHaveLength(0);
    expect(result.rejectedRecommendations).toHaveLength(1);
    expect(result.rejectedRecommendations[0].reason).toContain(
      "afterNodeId is required",
    );
  });

  it("rejects when referenced node does not exist", () => {
    const graph = makeSimpleGraph();
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.spellcheck",
        parameters: {},
        insertionPoint: { afterNodeId: "nonexistent" },
        rationale: "test",
        priority: 1,
      },
    ];

    const result = applyRecommendations(graph, recs);

    expect(result.rejectedRecommendations).toHaveLength(1);
    expect(result.rejectedRecommendations[0].reason).toContain("not found");
  });

  it("rejects duplicate tool at same insertion point", () => {
    const graph = makeSimpleGraph();
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.spellcheck",
        parameters: {},
        insertionPoint: {
          afterNodeId: "cleanup",
          beforeNodeId: "enrich",
        },
        rationale: "first",
        priority: 1,
      },
      {
        toolId: "ocr.spellcheck",
        parameters: {},
        insertionPoint: {
          afterNodeId: "cleanup",
          beforeNodeId: "enrich",
        },
        rationale: "duplicate",
        priority: 2,
      },
    ];

    const result = applyRecommendations(graph, recs);

    expect(result.appliedRecommendations).toHaveLength(1);
    expect(result.rejectedRecommendations).toHaveLength(1);
    expect(result.rejectedRecommendations[0].reason).toContain(
      "already inserted",
    );
  });

  it("does not mutate the original config", () => {
    const graph = makeSimpleGraph();
    const originalNodeCount = Object.keys(graph.nodes).length;
    const originalEdgeCount = graph.edges.length;

    applyRecommendations(graph, [
      {
        toolId: "ocr.spellcheck",
        parameters: {},
        insertionPoint: {
          afterNodeId: "cleanup",
          beforeNodeId: "enrich",
        },
        rationale: "test",
        priority: 1,
      },
    ]);

    expect(Object.keys(graph.nodes)).toHaveLength(originalNodeCount);
    expect(graph.edges).toHaveLength(originalEdgeCount);
  });

  it("infers target node when only afterNodeId is specified", () => {
    const graph = makeSimpleGraph();
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.normalizeFields",
        parameters: {},
        insertionPoint: { afterNodeId: "cleanup" },
        rationale: "Normalize after cleanup",
        priority: 1,
      },
    ];

    const result = applyRecommendations(graph, recs);

    expect(result.appliedRecommendations).toHaveLength(1);
    // Should have inserted between cleanup and enrich (first outgoing edge)
    const newEdge = result.newConfig.edges.find(
      (e) => e.source === "correction_ocr_normalizeFields_0",
    );
    expect(newEdge).toBeDefined();
    expect(newEdge!.target).toBe("enrich");
  });
});
