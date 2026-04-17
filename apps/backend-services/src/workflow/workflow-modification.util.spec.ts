/**
 * Unit tests for workflow-modification.util (backend).
 * Same algorithm as apps/temporal workflow-modification.util.
 */

import { validateGraphConfig } from "./graph-schema-validator";
import type { GraphWorkflowConfig } from "./graph-workflow-types";
import {
  applyOcrNormalizeFieldsEmptyValueCoercion,
  applyRecommendations,
  type ToolRecommendation,
} from "./workflow-modification.util";

function makeSimpleGraph(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {},
    nodes: {
      cleanup: {
        id: "cleanup",
        type: "activity",
        label: "Cleanup",
        activityType: "ocr.cleanup",
      },
      enrich: {
        id: "enrich",
        type: "activity",
        label: "Enrich",
        activityType: "ocr.enrich",
      },
      store: {
        id: "store",
        type: "activity",
        label: "Store",
        activityType: "document.upsertOcrResult",
      },
    },
    edges: [
      { id: "e1", source: "cleanup", target: "enrich", type: "normal" },
      { id: "e2", source: "enrich", target: "store", type: "normal" },
    ],
    entryNodeId: "cleanup",
    ctx: {},
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
        rationale: "Fix spelling",
        priority: 1,
      },
    ];

    const result = applyRecommendations(graph, recs);

    expect(result.appliedRecommendations).toHaveLength(1);
    expect(result.rejectedRecommendations).toHaveLength(0);
    expect(Object.keys(result.newConfig.nodes)).toContain(
      "correction_ocr_spellcheck_0",
    );
    const newNode = result.newConfig.nodes["correction_ocr_spellcheck_0"];
    expect(newNode.type).toBe("activity");
    expect((newNode as { activityType: string }).activityType).toBe(
      "ocr.spellcheck",
    );

    const oldEdge = result.newConfig.edges.find(
      (e) => e.source === "cleanup" && e.target === "enrich",
    );
    expect(oldEdge).toBeUndefined();

    expect(
      result.newConfig.edges.find(
        (e) =>
          e.source === "cleanup" && e.target === "correction_ocr_spellcheck_0",
      ),
    ).toBeDefined();
    expect(
      result.newConfig.edges.find(
        (e) =>
          e.source === "correction_ocr_spellcheck_0" && e.target === "enrich",
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
        rationale: "x",
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

  it("inserts using real graph node ids between cleanup and confidence nodes", () => {
    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      nodes: {
        postOcrCleanup: {
          id: "postOcrCleanup",
          type: "activity",
          label: "Post-OCR Cleanup",
          activityType: "document.someCleanup",
        },
        checkConfidence: {
          id: "checkConfidence",
          type: "activity",
          label: "Check Confidence",
          activityType: "ocr.checkConfidence",
        },
      },
      edges: [
        {
          id: "e1",
          source: "postOcrCleanup",
          target: "checkConfidence",
          type: "normal",
        },
      ],
      entryNodeId: "postOcrCleanup",
      ctx: {},
    };
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.normalizeFields",
        parameters: {},
        insertionPoint: {
          afterNodeId: "postOcrCleanup",
          beforeNodeId: "checkConfidence",
        },
        rationale: "Normalize between cleanup and confidence",
        priority: 1,
      },
    ];

    const result = applyRecommendations(graph, recs);

    expect(result.rejectedRecommendations).toHaveLength(0);
    expect(result.appliedRecommendations).toHaveLength(1);
    expect(Object.keys(result.newConfig.nodes)).toContain(
      "correction_ocr_normalizeFields_0",
    );
    expect(
      result.newConfig.edges.find(
        (e) =>
          e.source === "postOcrCleanup" &&
          e.target === "correction_ocr_normalizeFields_0",
      ),
    ).toBeDefined();
    expect(
      result.newConfig.edges.find(
        (e) =>
          e.source === "correction_ocr_normalizeFields_0" &&
          e.target === "checkConfidence",
      ),
    ).toBeDefined();
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
        rationale: "Normalize fields",
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

  it("inserts on path from extract to downstream node when given real node ids", () => {
    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      nodes: {
        myExtract: {
          id: "myExtract",
          type: "activity",
          label: "Extract",
          activityType: "azureOcr.extract",
        },
        postOcrCleanup: {
          id: "postOcrCleanup",
          type: "activity",
          label: "Cleanup",
          activityType: "ocr.cleanup",
        },
        checkConfidence: {
          id: "checkConfidence",
          type: "activity",
          label: "Conf",
          activityType: "ocr.checkConfidence",
        },
      },
      edges: [
        {
          id: "e1",
          source: "myExtract",
          target: "postOcrCleanup",
          type: "normal",
        },
        {
          id: "e2",
          source: "postOcrCleanup",
          target: "checkConfidence",
          type: "normal",
        },
      ],
      entryNodeId: "myExtract",
      ctx: {},
    };
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.characterConfusion",
        parameters: {},
        insertionPoint: {
          afterNodeId: "myExtract",
          beforeNodeId: "checkConfidence",
        },
        rationale: "Confusions",
        priority: 1,
      },
    ];

    const result = applyRecommendations(graph, recs);

    expect(result.appliedRecommendations).toHaveLength(1);
    expect(result.rejectedRecommendations).toHaveLength(0);
  });

  it("rejects insertion upstream of azureOcr.extract when extract exists", () => {
    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      nodes: {
        poll: {
          id: "poll",
          type: "activity",
          label: "Poll",
          activityType: "azureOcr.poll",
        },
        extract: {
          id: "extract",
          type: "activity",
          label: "Extract",
          activityType: "azureOcr.extract",
        },
      },
      edges: [{ id: "e1", source: "poll", target: "extract", type: "normal" }],
      entryNodeId: "poll",
      ctx: {},
    };
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.spellcheck",
        parameters: {},
        insertionPoint: {
          afterNodeId: "poll",
          beforeNodeId: "extract",
        },
        rationale: "Invalid",
        priority: 1,
      },
    ];

    const result = applyRecommendations(graph, recs);

    expect(result.appliedRecommendations).toHaveLength(0);
    expect(result.rejectedRecommendations).toHaveLength(1);
    expect(result.rejectedRecommendations[0].reason).toContain(
      "after Azure OCR extract",
    );
  });

  it("binds correction ports to ocrResult when the split edge carries ocrResult", () => {
    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      nodes: {
        extract: {
          id: "extract",
          type: "activity",
          label: "Extract",
          activityType: "azureOcr.extract",
          outputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
        },
        cleanup: {
          id: "cleanup",
          type: "activity",
          label: "Cleanup",
          activityType: "ocr.cleanup",
          inputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
          outputs: [{ port: "cleanedResult", ctxKey: "cleanedResult" }],
        },
      },
      edges: [
        { id: "e1", source: "extract", target: "cleanup", type: "normal" },
      ],
      entryNodeId: "extract",
      ctx: {
        ocrResult: { type: "object" },
        cleanedResult: { type: "object" },
      },
    };
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.spellcheck",
        parameters: {},
        insertionPoint: {
          afterNodeId: "extract",
          beforeNodeId: "cleanup",
        },
        rationale: "Spellcheck on raw extract output",
        priority: 1,
      },
    ];

    const result = applyRecommendations(graph, recs);
    const cn = result.newConfig.nodes.correction_ocr_spellcheck_0 as {
      inputs?: { ctxKey: string }[];
      outputs?: { ctxKey: string }[];
    };
    expect(cn.inputs?.[0].ctxKey).toBe("ocrResult");
    expect(cn.outputs?.[0].ctxKey).toBe("ocrResult");
  });

  it("passes validateGraphConfig after insert and declares pipeline ctx when graph had no port metadata", () => {
    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      nodes: {
        extract: {
          id: "extract",
          type: "activity",
          label: "Extract",
          activityType: "azureOcr.extract",
        },
        cleanup: {
          id: "cleanup",
          type: "activity",
          label: "Cleanup",
          activityType: "ocr.cleanup",
        },
      },
      edges: [
        { id: "e1", source: "extract", target: "cleanup", type: "normal" },
      ],
      entryNodeId: "extract",
      ctx: {},
    };
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.spellcheck",
        parameters: {},
        insertionPoint: {
          afterNodeId: "extract",
          beforeNodeId: "cleanup",
        },
        rationale: "x",
        priority: 1,
      },
    ];

    expect(validateGraphConfig(graph).valid).toBe(true);

    const result = applyRecommendations(graph, recs);
    expect(result.newConfig.ctx.cleanedResult).toBeDefined();
    const v = validateGraphConfig(result.newConfig);
    expect(v.valid).toBe(true);
    expect(v.errors.filter((e) => e.severity === "error")).toHaveLength(0);
  });

  it("inserts using actual node ids confGate and rev", () => {
    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      nodes: {
        ext: {
          id: "ext",
          type: "activity",
          label: "Extract",
          activityType: "azureOcr.extract",
        },
        confGate: {
          id: "confGate",
          type: "activity",
          label: "Conf",
          activityType: "confidenceCheck",
        },
        rev: {
          id: "rev",
          type: "switch",
          label: "Rev",
          cases: [],
        },
      },
      edges: [
        { id: "e1", source: "ext", target: "confGate", type: "normal" },
        { id: "e2", source: "confGate", target: "rev", type: "normal" },
      ],
      entryNodeId: "ext",
      ctx: {},
    };
    const recs: ToolRecommendation[] = [
      {
        toolId: "ocr.spellcheck",
        parameters: {},
        insertionPoint: {
          afterNodeId: "confGate",
          beforeNodeId: "rev",
        },
        rationale: "Spell",
        priority: 3,
      },
    ];

    const result = applyRecommendations(graph, recs);

    expect(result.appliedRecommendations).toHaveLength(1);
    expect(result.rejectedRecommendations).toHaveLength(0);
  });
});

describe("applyOcrNormalizeFieldsEmptyValueCoercion", () => {
  it("sets emptyValueCoercion on all ocr.normalizeFields nodes", () => {
    const graph: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      nodes: {
        n1: {
          id: "n1",
          type: "activity",
          label: "Norm",
          activityType: "ocr.normalizeFields",
          parameters: { documentType: "proj-a", emptyValueCoercion: "blank" },
        },
        n2: {
          id: "n2",
          type: "activity",
          label: "Cleanup",
          activityType: "ocr.cleanup",
        },
      },
      edges: [],
      entryNodeId: "n1",
      ctx: {},
    };

    const out = applyOcrNormalizeFieldsEmptyValueCoercion(graph, "null");

    expect(
      (out.nodes.n1 as { parameters?: { emptyValueCoercion?: string } })
        .parameters?.emptyValueCoercion,
    ).toBe("null");
    expect(
      (out.nodes.n1 as { parameters?: { documentType?: string } }).parameters
        ?.documentType,
    ).toBe("proj-a");
    expect(graph.nodes.n1).not.toEqual(out.nodes.n1);
  });
});
