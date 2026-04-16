import { validateGraphConfigForExecution } from "./graph-schema-validator";
import type {
  ActivityNode,
  GraphWorkflowConfig,
  SwitchNode,
  TransformNode,
} from "./graph-workflow-types";

// ---------------------------------------------------------------------------
// Helper: minimal valid graph
// ---------------------------------------------------------------------------

function makeMinimalGraph(
  overrides: Partial<GraphWorkflowConfig> = {},
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { description: "Test graph" },
    entryNodeId: "start",
    ctx: { documentId: { type: "string" } },
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("graph-schema-validator (temporal)", () => {
  describe("valid configs", () => {
    it("valid single-node graph passes", () => {
      const result = validateGraphConfigForExecution(makeMinimalGraph());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("valid linear graph passes", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "a",
        ctx: { documentId: { type: "string" } },
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
        edges: [{ id: "e1", source: "a", target: "b", type: "normal" }],
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("invalid configs", () => {
    it("fails on unknown schema version", () => {
      const config = makeMinimalGraph({ schemaVersion: "2.0" as "1.0" });
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "schemaVersion" }),
        ]),
      );
    });

    it("fails on cycle", () => {
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
        edges: [
          { id: "e1", source: "a", target: "b", type: "normal" },
          { id: "e2", source: "b", target: "a", type: "normal" },
        ],
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Cycle"),
          }),
        ]),
      );
    });

    it("fails on empty nodes", () => {
      const config = makeMinimalGraph({ nodes: {} });
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
    });
  });

  describe("runtime activity registry validation", () => {
    it("fails when activity type not in runtime registry", () => {
      // Using an activity type that's not in REGISTERED_ACTIVITY_TYPES
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
            activityType: "unknown.activity",
          } as ActivityNode,
        },
        edges: [{ id: "e1", source: "a", target: "b", type: "normal" }],
      };

      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "nodes.b.activityType",
            message: expect.stringContaining("not registered"),
          }),
        ]),
      );
    });

    it("passes when all activity types are in registry", () => {
      const config = makeMinimalGraph();
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(true);
    });

    it("validates pollUntil activityType against registry", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "a",
        ctx: { status: { type: "string" } },
        nodes: {
          a: {
            id: "a",
            type: "pollUntil",
            label: "Poll",
            activityType: "unknown.pollActivity",
            condition: {
              operator: "not-equals",
              left: { ref: "ctx.status" },
              right: { literal: "running" },
            },
            interval: "10s",
          },
        },
        edges: [],
      };

      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "nodes.a.activityType",
            message: expect.stringContaining("unknown.pollActivity"),
          }),
        ]),
      );
    });
  });

  describe("GRAPH_VALIDATION_ERROR type usage", () => {
    it("returns structured errors suitable for ApplicationFailure", () => {
      const config = makeMinimalGraph({ schemaVersion: "99.0" as "1.0" });
      const result = validateGraphConfigForExecution(config);

      expect(result.valid).toBe(false);
      for (const error of result.errors) {
        expect(error).toHaveProperty("path");
        expect(error).toHaveProperty("message");
        expect(error).toHaveProperty("severity");
        expect(typeof error.path).toBe("string");
        expect(typeof error.message).toBe("string");
        expect(["error", "warning"]).toContain(error.severity);
      }
    });
  });

  describe("switch node validation", () => {
    it("validates switch defaultEdge exists", () => {
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
            cases: [],
          } as SwitchNode,
          a: {
            id: "a",
            type: "activity",
            label: "A",
            activityType: "document.updateStatus",
          } as ActivityNode,
        },
        edges: [{ id: "e1", source: "sw", target: "a", type: "normal" }],
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("defaultEdge"),
          }),
        ]),
      );
    });
  });

  describe("expression validation", () => {
    it("validates expression operators", () => {
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
                  operator: "bad-op" as "equals",
                  left: { ref: "ctx.flag" },
                  right: { literal: true },
                },
                edgeId: "e1",
              },
            ],
            defaultEdge: "e1",
          } as SwitchNode,
          a: {
            id: "a",
            type: "activity",
            label: "A",
            activityType: "document.updateStatus",
          } as ActivityNode,
        },
        edges: [{ id: "e1", source: "sw", target: "a", type: "conditional" }],
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Unknown expression operator"),
          }),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Node Groups Validation
  // -----------------------------------------------------------------------
  describe("nodeGroups validation", () => {
    it("valid nodeGroups pass validation", () => {
      const config = makeMinimalGraph();
      config.nodes["b"] = {
        id: "b",
        type: "activity",
        label: "Step B",
        activityType: "file.prepare",
      } as ActivityNode;
      config.edges = [
        { id: "e1", source: "start", target: "b", type: "normal" },
      ];
      config.nodeGroups = {
        group1: {
          label: "Group 1",
          nodeIds: ["start", "b"],
        },
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("nodeGroups with empty nodeIds fails", () => {
      const config = makeMinimalGraph();
      config.nodeGroups = {
        emptyGroup: {
          label: "Empty",
          nodeIds: [],
        },
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.path.includes("emptyGroup"));
      expect(error).toBeDefined();
      expect(error?.message).toContain("must have at least one nodeId");
    });

    it("nodeGroups referencing non-existent nodes fails", () => {
      const config = makeMinimalGraph();
      config.nodeGroups = {
        badGroup: {
          label: "Bad Group",
          nodeIds: ["start", "nonExistent"],
        },
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) =>
        e.message.includes("nonExistent"),
      );
      expect(error).toBeDefined();
    });

    it("nodes in multiple groups produce warnings", () => {
      const config = makeMinimalGraph();
      config.nodes["b"] = {
        id: "b",
        type: "activity",
        label: "Step B",
        activityType: "file.prepare",
      } as ActivityNode;
      config.nodeGroups = {
        group1: {
          label: "Group 1",
          nodeIds: ["start"],
        },
        group2: {
          label: "Group 2",
          nodeIds: ["start", "b"],
        },
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(true); // warnings don't fail validation
      const warning = result.errors.find(
        (e) =>
          e.severity === "warning" && e.message.includes("multiple groups"),
      );
      expect(warning).toBeDefined();
    });

    it("config without nodeGroups passes validation", () => {
      const config = makeMinimalGraph();
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("transform node validation", () => {
    it("valid transform node passes validation", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "t",
        ctx: { transformedOutput: { type: "string" } },
        nodes: {
          t: {
            id: "t",
            type: "transform",
            label: "Transform",
            inputFormat: "json",
            outputFormat: "xml",
            fieldMapping: "{}",
            outputs: [{ port: "output", ctxKey: "transformedOutput" }],
          } as TransformNode,
        },
        edges: [],
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails when inputFormat is missing", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "t",
        ctx: {},
        nodes: {
          t: {
            id: "t",
            type: "transform",
            label: "Transform",
            inputFormat: "" as "json",
            outputFormat: "xml",
            fieldMapping: "{}",
          } as TransformNode,
        },
        edges: [],
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "nodes.t.inputFormat",
            message: expect.stringContaining("inputFormat"),
          }),
        ]),
      );
    });

    it("fails when outputFormat is missing", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "t",
        ctx: {},
        nodes: {
          t: {
            id: "t",
            type: "transform",
            label: "Transform",
            inputFormat: "json",
            outputFormat: "" as "xml",
            fieldMapping: "{}",
          } as TransformNode,
        },
        edges: [],
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "nodes.t.outputFormat",
            message: expect.stringContaining("outputFormat"),
          }),
        ]),
      );
    });

    it("fails when fieldMapping is missing", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "t",
        ctx: {},
        nodes: {
          t: {
            id: "t",
            type: "transform",
            label: "Transform",
            inputFormat: "json",
            outputFormat: "xml",
            fieldMapping: "",
          } as TransformNode,
        },
        edges: [],
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "nodes.t.fieldMapping",
            message: expect.stringContaining("fieldMapping"),
          }),
        ]),
      );
    });

    it("fails when all required fields are missing", () => {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "t",
        ctx: {},
        nodes: {
          t: {
            id: "t",
            type: "transform",
            label: "Transform",
            inputFormat: "" as "json",
            outputFormat: "" as "xml",
            fieldMapping: "",
          } as TransformNode,
        },
        edges: [],
      };
      const result = validateGraphConfigForExecution(config);
      expect(result.valid).toBe(false);
      const paths = result.errors.map((e) => e.path);
      expect(paths).toContain("nodes.t.inputFormat");
      expect(paths).toContain("nodes.t.outputFormat");
      expect(paths).toContain("nodes.t.fieldMapping");
    });
  });
});
