import { readFileSync } from "fs";
import { join } from "path";
import { validateGraphConfig } from "./graph-schema-validator";
import type {
  ActivityNode,
  GraphWorkflowConfig,
  JoinNode,
  MapNode,
  SwitchNode,
} from "./graph-workflow-types";

// ---------------------------------------------------------------------------
// Helper: minimal valid graph factory
// ---------------------------------------------------------------------------

function makeMinimalGraph(
  overrides: Partial<GraphWorkflowConfig> = {},
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { description: "Test graph" },
    entryNodeId: "start",
    ctx: {
      documentId: { type: "string" },
    },
    nodes: {
      start: {
        id: "start",
        type: "activity",
        label: "Start",
        activityType: "document.updateStatus",
        inputs: [{ port: "documentId", ctxKey: "documentId" }],
      } as ActivityNode,
    },
    edges: [],
    ...overrides,
  };
}

function makeLinearGraph(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { description: "Linear 3-node graph" },
    entryNodeId: "a",
    ctx: {
      documentId: { type: "string" },
      result: { type: "object" },
    },
    nodes: {
      a: {
        id: "a",
        type: "activity",
        label: "Step A",
        activityType: "document.updateStatus",
        inputs: [{ port: "documentId", ctxKey: "documentId" }],
      } as ActivityNode,
      b: {
        id: "b",
        type: "activity",
        label: "Step B",
        activityType: "file.prepare",
      } as ActivityNode,
      c: {
        id: "c",
        type: "activity",
        label: "Step C",
        activityType: "ocr.storeResults",
        outputs: [{ port: "result", ctxKey: "result" }],
      } as ActivityNode,
    },
    edges: [
      { id: "e1", source: "a", target: "b", type: "normal" },
      { id: "e2", source: "b", target: "c", type: "normal" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("graph-schema-validator", () => {
  // -----------------------------------------------------------------------
  // Scenario 13: Valid graphs pass
  // -----------------------------------------------------------------------
  describe("valid graphs", () => {
    it("valid simple linear graph passes", () => {
      const result = validateGraphConfig(makeLinearGraph());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("single node graph (entry only, no edges) passes", () => {
      const result = validateGraphConfig(makeMinimalGraph());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("valid branching graph with switch passes", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "check",
        ctx: {
          requiresReview: { type: "boolean" },
          documentId: { type: "string" },
        },
        nodes: {
          check: {
            id: "check",
            type: "switch",
            label: "Check Review",
            cases: [
              {
                condition: {
                  operator: "equals",
                  left: { ref: "ctx.requiresReview" },
                  right: { literal: true },
                },
                edgeId: "e-review",
              },
            ],
            defaultEdge: "e-done",
          } as SwitchNode,
          review: {
            id: "review",
            type: "activity",
            label: "Review",
            activityType: "document.updateStatus",
          } as ActivityNode,
          done: {
            id: "done",
            type: "activity",
            label: "Done",
            activityType: "ocr.storeResults",
          } as ActivityNode,
        },
        edges: [
          {
            id: "e-review",
            source: "check",
            target: "review",
            type: "conditional",
          },
          {
            id: "e-done",
            source: "check",
            target: "done",
            type: "conditional",
          },
          { id: "e-finish", source: "review", target: "done", type: "normal" },
        ],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("valid map/join graph passes", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "split",
        ctx: {
          segments: { type: "array" },
          currentSegment: { type: "object" },
          results: { type: "array" },
        },
        nodes: {
          split: {
            id: "split",
            type: "activity",
            label: "Split",
            activityType: "document.split",
            outputs: [{ port: "segments", ctxKey: "segments" }],
          } as ActivityNode,
          mapNode: {
            id: "mapNode",
            type: "map",
            label: "Map",
            collectionCtxKey: "segments",
            itemCtxKey: "currentSegment",
            bodyEntryNodeId: "processSegment",
            bodyExitNodeId: "processSegment",
          } as MapNode,
          processSegment: {
            id: "processSegment",
            type: "activity",
            label: "Process Segment",
            activityType: "ocr.cleanup",
          } as ActivityNode,
          joinNode: {
            id: "joinNode",
            type: "join",
            label: "Join",
            sourceMapNodeId: "mapNode",
            strategy: "all",
            resultsCtxKey: "results",
          } as JoinNode,
        },
        edges: [
          { id: "e1", source: "split", target: "mapNode", type: "normal" },
          { id: "e2", source: "mapNode", target: "joinNode", type: "normal" },
        ],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("valid fallback edge policy passes when edge type is error", () => {
      const config = makeMinimalGraph({
        nodes: {
          start: {
            id: "start",
            type: "activity",
            label: "Start",
            activityType: "document.updateStatus",
            inputs: [{ port: "documentId", ctxKey: "documentId" }],
            errorPolicy: {
              onError: "fallback",
              fallbackEdgeId: "e-fallback",
              retryable: false,
            },
          } as ActivityNode,
          fallback: {
            id: "fallback",
            type: "activity",
            label: "Fallback",
            activityType: "document.updateStatus",
          } as ActivityNode,
        },
        edges: [
          {
            id: "e-fallback",
            source: "start",
            target: "fallback",
            type: "error",
          },
        ],
      });

      const result = validateGraphConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("error policy validation", () => {
    it("fails when fallback edge is not type error", () => {
      const config = makeMinimalGraph({
        nodes: {
          start: {
            id: "start",
            type: "activity",
            label: "Start",
            activityType: "document.updateStatus",
            inputs: [{ port: "documentId", ctxKey: "documentId" }],
            errorPolicy: {
              onError: "fallback",
              fallbackEdgeId: "e-fallback",
              retryable: false,
            },
          } as ActivityNode,
          fallback: {
            id: "fallback",
            type: "activity",
            label: "Fallback",
            activityType: "document.updateStatus",
          } as ActivityNode,
        },
        edges: [
          {
            id: "e-fallback",
            source: "start",
            target: "fallback",
            type: "normal",
          },
        ],
      });

      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((error) => error.message.includes('type "error"')),
      ).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Schema version validation
  // -----------------------------------------------------------------------
  describe("schema version", () => {
    it("rejects unrecognized schema version", () => {
      const config = makeMinimalGraph({
        schemaVersion: "99.0" as "1.0",
      });
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "schemaVersion",
            severity: "error",
          }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Node ID uniqueness and entry node
  // -----------------------------------------------------------------------
  describe("node IDs and entry node", () => {
    it("errors on missing entryNodeId in nodes", () => {
      const config = makeMinimalGraph({ entryNodeId: "nonexistent" });
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "entryNodeId",
            message: expect.stringContaining("not found"),
          }),
        ]),
      );
    });

    it("errors on mismatched node id vs key", () => {
      const config = makeMinimalGraph({
        nodes: {
          start: {
            id: "wrong-id",
            type: "activity",
            label: "Start",
            activityType: "document.updateStatus",
          } as ActivityNode,
        },
      });
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("does not match"),
          }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Entry node has no incoming edges
  // -----------------------------------------------------------------------
  describe("entry node incoming edges", () => {
    it("errors when entry node has incoming edges", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "a",
        ctx: {},
        nodes: {
          a: {
            id: "a",
            type: "activity",
            label: "A",
            activityType: "document.updateStatus",
          } as ActivityNode,
          b: {
            id: "b",
            type: "activity",
            label: "B",
            activityType: "file.prepare",
          } as ActivityNode,
        },
        edges: [{ id: "e1", source: "b", target: "a", type: "normal" }],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "entryNodeId",
            message: expect.stringContaining("must not have incoming edges"),
          }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Activity type validation
  // -----------------------------------------------------------------------
  describe("activity type validation", () => {
    it("errors for unknown activity type", () => {
      const config = makeMinimalGraph({
        nodes: {
          start: {
            id: "start",
            type: "activity",
            label: "Start",
            activityType: "nonexistent.activity",
          } as ActivityNode,
        },
      });
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "nodes.start.activityType",
            message: expect.stringContaining("nonexistent.activity"),
          }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Edge validation
  // -----------------------------------------------------------------------
  describe("edge validation", () => {
    it("errors on duplicate edge IDs", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "a",
        ctx: {},
        nodes: {
          a: {
            id: "a",
            type: "activity",
            label: "A",
            activityType: "document.updateStatus",
          } as ActivityNode,
          b: {
            id: "b",
            type: "activity",
            label: "B",
            activityType: "file.prepare",
          } as ActivityNode,
          c: {
            id: "c",
            type: "activity",
            label: "C",
            activityType: "ocr.cleanup",
          } as ActivityNode,
        },
        edges: [
          { id: "e1", source: "a", target: "b", type: "normal" },
          { id: "e1", source: "b", target: "c", type: "normal" },
        ],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Duplicate edge ID"),
          }),
        ]),
      );
    });

    it("errors on edges referencing non-existent nodes", () => {
      const config = makeMinimalGraph({
        edges: [
          { id: "e1", source: "start", target: "nonexistent", type: "normal" },
        ],
      });
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("non-existent target node"),
          }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Cycle detection
  // -----------------------------------------------------------------------
  describe("cycle detection", () => {
    it("detects A -> B -> C -> A cycle", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "a",
        ctx: {},
        nodes: {
          a: {
            id: "a",
            type: "activity",
            label: "A",
            activityType: "document.updateStatus",
          } as ActivityNode,
          b: {
            id: "b",
            type: "activity",
            label: "B",
            activityType: "file.prepare",
          } as ActivityNode,
          c: {
            id: "c",
            type: "activity",
            label: "C",
            activityType: "ocr.cleanup",
          } as ActivityNode,
        },
        edges: [
          { id: "e1", source: "a", target: "b", type: "normal" },
          { id: "e2", source: "b", target: "c", type: "normal" },
          { id: "e3", source: "c", target: "a", type: "normal" },
        ],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Cycle detected"),
          }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Reachability
  // -----------------------------------------------------------------------
  describe("reachability", () => {
    it("warns about orphan node not reachable from entry", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "a",
        ctx: {},
        nodes: {
          a: {
            id: "a",
            type: "activity",
            label: "A",
            activityType: "document.updateStatus",
          } as ActivityNode,
          b: {
            id: "b",
            type: "activity",
            label: "B",
            activityType: "file.prepare",
          } as ActivityNode,
          orphan: {
            id: "orphan",
            type: "activity",
            label: "Orphan",
            activityType: "ocr.cleanup",
          } as ActivityNode,
        },
        edges: [{ id: "e1", source: "a", target: "b", type: "normal" }],
      };
      const result = validateGraphConfig(config);
      // Warnings don't make the graph invalid
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "nodes.orphan",
            severity: "warning",
            message: expect.stringContaining("not reachable"),
          }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 8: Switch node validation
  // -----------------------------------------------------------------------
  describe("switch node validation", () => {
    it("errors when switch node missing defaultEdge", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "sw",
        ctx: { flag: { type: "boolean" } },
        nodes: {
          sw: {
            id: "sw",
            type: "switch",
            label: "Switch",
            cases: [
              {
                condition: {
                  operator: "equals",
                  left: { ref: "ctx.flag" },
                  right: { literal: true },
                },
                edgeId: "e-case",
              },
            ],
          } as SwitchNode,
          a: {
            id: "a",
            type: "activity",
            label: "A",
            activityType: "document.updateStatus",
          } as ActivityNode,
        },
        edges: [
          { id: "e-case", source: "sw", target: "a", type: "conditional" },
        ],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("defaultEdge"),
          }),
        ]),
      );
    });

    it("errors when case edge ID does not exist", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "sw",
        ctx: { flag: { type: "boolean" } },
        nodes: {
          sw: {
            id: "sw",
            type: "switch",
            label: "Switch",
            cases: [
              {
                condition: {
                  operator: "equals",
                  left: { ref: "ctx.flag" },
                  right: { literal: true },
                },
                edgeId: "nonexistent-edge",
              },
            ],
            defaultEdge: "e-default",
          } as SwitchNode,
          a: {
            id: "a",
            type: "activity",
            label: "A",
            activityType: "document.updateStatus",
          } as ActivityNode,
        },
        edges: [
          { id: "e-default", source: "sw", target: "a", type: "conditional" },
        ],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("nonexistent-edge"),
          }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 9: Map/Join cross-references
  // -----------------------------------------------------------------------
  describe("map/join validation", () => {
    it("errors when map node has invalid bodyEntryNodeId", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "m",
        ctx: { items: { type: "array" }, item: { type: "object" } },
        nodes: {
          m: {
            id: "m",
            type: "map",
            label: "Map",
            collectionCtxKey: "items",
            itemCtxKey: "item",
            bodyEntryNodeId: "nonexistent",
            bodyExitNodeId: "nonexistent",
          } as MapNode,
        },
        edges: [],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("bodyEntryNodeId"),
          }),
        ]),
      );
    });

    it("errors when join node references non-existent sourceMapNodeId", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "j",
        ctx: { results: { type: "array" } },
        nodes: {
          j: {
            id: "j",
            type: "join",
            label: "Join",
            sourceMapNodeId: "nonexistent",
            strategy: "all",
            resultsCtxKey: "results",
          } as JoinNode,
        },
        edges: [],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("sourceMapNodeId"),
          }),
        ]),
      );
    });

    it("errors when join node sourceMapNodeId references a non-map node", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "a",
        ctx: { results: { type: "array" } },
        nodes: {
          a: {
            id: "a",
            type: "activity",
            label: "A",
            activityType: "document.updateStatus",
          } as ActivityNode,
          j: {
            id: "j",
            type: "join",
            label: "Join",
            sourceMapNodeId: "a",
            strategy: "all",
            resultsCtxKey: "results",
          } as JoinNode,
        },
        edges: [{ id: "e1", source: "a", target: "j", type: "normal" }],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('not a "map" node'),
          }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 10: Port binding ctx key validation
  // -----------------------------------------------------------------------
  describe("port binding validation", () => {
    it("errors when input port references undeclared ctx key", () => {
      const config = makeMinimalGraph({
        nodes: {
          start: {
            id: "start",
            type: "activity",
            label: "Start",
            activityType: "document.updateStatus",
            inputs: [{ port: "x", ctxKey: "undeclaredKey" }],
          } as ActivityNode,
        },
      });
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("undeclaredKey"),
          }),
        ]),
      );
    });

    it("errors when output port references undeclared ctx key", () => {
      const config = makeMinimalGraph({
        nodes: {
          start: {
            id: "start",
            type: "activity",
            label: "Start",
            activityType: "document.updateStatus",
            outputs: [{ port: "y", ctxKey: "undeclaredOutput" }],
          } as ActivityNode,
        },
      });
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("undeclaredOutput"),
          }),
        ]),
      );
    });

    it("allows nested ctx key when root key is declared", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "start",
        ctx: {
          currentSegment: { type: "object" },
        },
        nodes: {
          start: {
            id: "start",
            type: "activity",
            label: "Start",
            activityType: "document.updateStatus",
            inputs: [{ port: "blobKey", ctxKey: "currentSegment.blobKey" }],
          } as ActivityNode,
        },
        edges: [],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 11: Expression validation
  // -----------------------------------------------------------------------
  describe("expression validation", () => {
    it("errors for unknown operator in switch condition", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "sw",
        ctx: { flag: { type: "boolean" } },
        nodes: {
          sw: {
            id: "sw",
            type: "switch",
            label: "Switch",
            cases: [
              {
                condition: {
                  operator: "unknown-op" as "equals",
                  left: { ref: "ctx.flag" },
                  right: { literal: true },
                },
                edgeId: "e-default",
              },
            ],
            defaultEdge: "e-default",
          } as SwitchNode,
          a: {
            id: "a",
            type: "activity",
            label: "A",
            activityType: "document.updateStatus",
          } as ActivityNode,
        },
        edges: [
          { id: "e-default", source: "sw", target: "a", type: "conditional" },
        ],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Unknown expression operator"),
          }),
        ]),
      );
    });

    it("errors for expression referencing undeclared ctx variable", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "sw",
        ctx: {},
        nodes: {
          sw: {
            id: "sw",
            type: "switch",
            label: "Switch",
            cases: [
              {
                condition: {
                  operator: "equals",
                  left: { ref: "ctx.undeclared" },
                  right: { literal: true },
                },
                edgeId: "e-default",
              },
            ],
            defaultEdge: "e-default",
          } as SwitchNode,
          a: {
            id: "a",
            type: "activity",
            label: "A",
            activityType: "document.updateStatus",
          } as ActivityNode,
        },
        edges: [
          { id: "e-default", source: "sw", target: "a", type: "conditional" },
        ],
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("undeclared"),
          }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 12: Structured error format
  // -----------------------------------------------------------------------
  describe("error structure", () => {
    it("each error has path, message, and severity", () => {
      const config = makeMinimalGraph({
        schemaVersion: "99.0" as "1.0",
      });
      const result = validateGraphConfig(config);
      for (const error of result.errors) {
        expect(error).toHaveProperty("path");
        expect(error).toHaveProperty("message");
        expect(error).toHaveProperty("severity");
        expect(["error", "warning"]).toContain(error.severity);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Empty graph
  // -----------------------------------------------------------------------
  describe("empty graph", () => {
    it("errors when no nodes", () => {
      const config = makeMinimalGraph({ nodes: {} });
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "nodes",
            message: expect.stringContaining("at least one node"),
          }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Full OCR workflow from spec Section 4.4
  // -----------------------------------------------------------------------
  describe("spec example: standard OCR workflow", () => {
    it("validates the standard OCR workflow from Section 4.4", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          description: "Standard OCR processing workflow",
          tags: ["ocr", "azure", "standard"],
        },
        entryNodeId: "updateStatus",
        ctx: {
          documentId: { type: "string" },
          blobKey: { type: "string" },
          fileName: { type: "string" },
          fileType: { type: "string" },
          contentType: { type: "string" },
          modelId: { type: "string", defaultValue: "prebuilt-layout" },
          apimRequestId: { type: "string" },
          ocrResponse: { type: "object" },
          ocrResult: { type: "object" },
          cleanedResult: { type: "object" },
          averageConfidence: { type: "number" },
          requiresReview: { type: "boolean", defaultValue: false },
          preparedFileData: { type: "object" },
        },
        nodes: {
          updateStatus: {
            id: "updateStatus",
            type: "activity",
            label: "Update Status",
            activityType: "document.updateStatus",
            inputs: [{ port: "documentId", ctxKey: "documentId" }],
            parameters: { status: "ongoing_ocr" },
          } as ActivityNode,
          prepareFileData: {
            id: "prepareFileData",
            type: "activity",
            label: "Prepare File Data",
            activityType: "file.prepare",
            inputs: [
              { port: "blobKey", ctxKey: "blobKey" },
              { port: "fileName", ctxKey: "fileName" },
            ],
            outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
          } as ActivityNode,
          submitOcr: {
            id: "submitOcr",
            type: "activity",
            label: "Submit to Azure OCR",
            activityType: "azureOcr.submit",
            inputs: [{ port: "fileData", ctxKey: "preparedFileData" }],
            outputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
          } as ActivityNode,
          pollOcrResults: {
            id: "pollOcrResults",
            type: "pollUntil",
            label: "Poll OCR Results",
            activityType: "azureOcr.poll",
            inputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
            outputs: [{ port: "response", ctxKey: "ocrResponse" }],
            condition: {
              operator: "not-equals",
              left: { ref: "ctx.ocrResponse.status" },
              right: { literal: "running" },
            },
            interval: "10s",
            maxAttempts: 20,
          },
          extractResults: {
            id: "extractResults",
            type: "activity",
            label: "Extract OCR Results",
            activityType: "azureOcr.extract",
            inputs: [{ port: "ocrResponse", ctxKey: "ocrResponse" }],
            outputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
          } as ActivityNode,
          postOcrCleanup: {
            id: "postOcrCleanup",
            type: "activity",
            label: "Post-OCR Cleanup",
            activityType: "ocr.cleanup",
            inputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
            outputs: [{ port: "cleanedResult", ctxKey: "cleanedResult" }],
          } as ActivityNode,
          checkConfidence: {
            id: "checkConfidence",
            type: "activity",
            label: "Check OCR Confidence",
            activityType: "ocr.checkConfidence",
            inputs: [{ port: "ocrResult", ctxKey: "cleanedResult" }],
            outputs: [
              { port: "averageConfidence", ctxKey: "averageConfidence" },
              { port: "requiresReview", ctxKey: "requiresReview" },
            ],
          } as ActivityNode,
          reviewSwitch: {
            id: "reviewSwitch",
            type: "switch",
            label: "Needs Review?",
            cases: [
              {
                condition: {
                  operator: "equals",
                  left: { ref: "ctx.requiresReview" },
                  right: { literal: true },
                },
                edgeId: "edge-switch-to-humanGate",
              },
            ],
            defaultEdge: "edge-switch-to-store",
          } as SwitchNode,
          humanReview: {
            id: "humanReview",
            type: "humanGate",
            label: "Human Review",
            signal: { name: "humanApproval" },
            timeout: "24h",
            onTimeout: "fail",
          },
          storeResults: {
            id: "storeResults",
            type: "activity",
            label: "Store Results",
            activityType: "ocr.storeResults",
            inputs: [
              { port: "documentId", ctxKey: "documentId" },
              { port: "ocrResult", ctxKey: "cleanedResult" },
            ],
          } as ActivityNode,
        },
        edges: [
          {
            id: "e1",
            source: "updateStatus",
            target: "prepareFileData",
            type: "normal",
          },
          {
            id: "e2",
            source: "prepareFileData",
            target: "submitOcr",
            type: "normal",
          },
          {
            id: "e3",
            source: "submitOcr",
            target: "pollOcrResults",
            type: "normal",
          },
          {
            id: "e4",
            source: "pollOcrResults",
            target: "extractResults",
            type: "normal",
          },
          {
            id: "e5",
            source: "extractResults",
            target: "postOcrCleanup",
            type: "normal",
          },
          {
            id: "e6",
            source: "postOcrCleanup",
            target: "checkConfidence",
            type: "normal",
          },
          {
            id: "e7",
            source: "checkConfidence",
            target: "reviewSwitch",
            type: "normal",
          },
          {
            id: "edge-switch-to-humanGate",
            source: "reviewSwitch",
            target: "humanReview",
            type: "conditional",
          },
          {
            id: "edge-switch-to-store",
            source: "reviewSwitch",
            target: "storeResults",
            type: "conditional",
          },
          {
            id: "e10",
            source: "humanReview",
            target: "storeResults",
            type: "normal",
          },
        ],
      };

      const result = validateGraphConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("template validation", () => {
    it("validates the standard OCR template", () => {
      const templatePath = join(
        __dirname,
        "..",
        "..",
        "..",
        "..",
        "docs-md",
        "graph-workflows",
        "templates",
        "standard-ocr-workflow.json",
      );
      const templateJson = readFileSync(templatePath, "utf8");
      const template = JSON.parse(
        templateJson,
      ) as unknown as GraphWorkflowConfig;
      const result = validateGraphConfig(template);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("validates the multi-page report template", () => {
      const templatePath = join(
        __dirname,
        "..",
        "..",
        "..",
        "..",
        "docs-md",
        "graph-workflows",
        "templates",
        "multi-page-report-workflow.json",
      );
      const templateJson = readFileSync(templatePath, "utf8");
      const template = JSON.parse(
        templateJson,
      ) as unknown as GraphWorkflowConfig;
      const result = validateGraphConfig(template);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Node Groups Validation
  // -----------------------------------------------------------------------
  describe("nodeGroups validation", () => {
    it("valid nodeGroups pass validation", () => {
      const config = makeLinearGraph();
      config.nodeGroups = {
        group1: {
          label: "Group 1",
          description: "First group",
          icon: "test",
          color: "#000000",
          nodeIds: ["a", "b"],
        },
        group2: {
          label: "Group 2",
          nodeIds: ["c"],
        },
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("nodeGroups with empty nodeIds fails", () => {
      const config = makeLinearGraph();
      config.nodeGroups = {
        emptyGroup: {
          label: "Empty",
          nodeIds: [],
        },
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.path.includes("emptyGroup"));
      expect(error).toBeDefined();
      expect(error?.message).toContain("must have at least one nodeId");
    });

    it("nodeGroups referencing non-existent nodes fails", () => {
      const config = makeLinearGraph();
      config.nodeGroups = {
        badGroup: {
          label: "Bad Group",
          nodeIds: ["a", "nonExistent"],
        },
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) =>
        e.message.includes("nonExistent"),
      );
      expect(error).toBeDefined();
      expect(error?.severity).toBe("error");
    });

    it("nodes in multiple groups produce warnings", () => {
      const config = makeLinearGraph();
      config.nodeGroups = {
        group1: {
          label: "Group 1",
          nodeIds: ["a", "b"],
        },
        group2: {
          label: "Group 2",
          nodeIds: ["b", "c"],
        },
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(true); // warnings don't fail validation
      const warning = result.errors.find(
        (e) =>
          e.severity === "warning" && e.message.includes("multiple groups"),
      );
      expect(warning).toBeDefined();
      expect(warning?.message).toContain("group1, group2");
    });

    it("exposedParams with valid node paths pass", () => {
      const config = makeLinearGraph();
      config.nodeGroups = {
        group1: {
          label: "Group 1",
          nodeIds: ["a"],
          exposedParams: [
            {
              label: "Test Param",
              path: "nodes.a.parameters.testParam",
              type: "string",
              default: "test",
            },
          ],
        },
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("exposedParams referencing non-existent nodes fails", () => {
      const config = makeLinearGraph();
      config.nodeGroups = {
        group1: {
          label: "Group 1",
          nodeIds: ["a"],
          exposedParams: [
            {
              label: "Bad Param",
              path: "nodes.nonExistent.parameters.test",
              type: "string",
            },
          ],
        },
      };
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) =>
        e.message.includes("non-existent node"),
      );
      expect(error).toBeDefined();
    });

    it("config without nodeGroups passes validation", () => {
      const config = makeLinearGraph();
      // No nodeGroups field
      const result = validateGraphConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
