import { validateGraphConfigForExecution } from "./graph-schema-validator";
import type { ActivityRegistryEntry } from "./activity-registry";
import type {
  GraphWorkflowConfig,
  ActivityNode,
  SwitchNode,
  RetryPolicy,
} from "./graph-workflow-types";

// ---------------------------------------------------------------------------
// Mock registry
// ---------------------------------------------------------------------------

function makeMockRegistry(
  types: string[] = [
    "document.updateStatus",
    "file.prepare",
    "azureOcr.submit",
    "azureOcr.poll",
    "azureOcr.extract",
    "ocr.cleanup",
    "ocr.checkConfidence",
    "ocr.storeResults",
    "document.storeRejection",
    "document.split",
    "document.classify",
    "document.validateFields",
  ],
): ReadonlyMap<string, ActivityRegistryEntry> {
  const map = new Map<string, ActivityRegistryEntry>();
  for (const t of types) {
    map.set(t, {
      activityType: t,
      activityFn: async () => ({}),
      defaultTimeout: "1m",
      defaultRetry: { maximumAttempts: 3 } as RetryPolicy,
      description: `Mock ${t}`,
    });
  }
  return map;
}

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
  const registry = makeMockRegistry();

  describe("valid configs", () => {
    it("valid single-node graph passes", () => {
      const result = validateGraphConfigForExecution(makeMinimalGraph(), registry);
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
          a: { id: "a", type: "activity", label: "A", activityType: "document.updateStatus" } as ActivityNode,
          b: { id: "b", type: "activity", label: "B", activityType: "file.prepare" } as ActivityNode,
        },
        edges: [{ id: "e1", source: "a", target: "b", type: "normal" }],
      };
      const result = validateGraphConfigForExecution(config, registry);
      expect(result.valid).toBe(true);
    });
  });

  describe("invalid configs", () => {
    it("fails on unknown schema version", () => {
      const config = makeMinimalGraph({ schemaVersion: "2.0" as "1.0" });
      const result = validateGraphConfigForExecution(config, registry);
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
          a: { id: "a", type: "activity", label: "A", activityType: "document.updateStatus" } as ActivityNode,
          b: { id: "b", type: "activity", label: "B", activityType: "file.prepare" } as ActivityNode,
        },
        edges: [
          { id: "e1", source: "a", target: "b", type: "normal" },
          { id: "e2", source: "b", target: "a", type: "normal" },
        ],
      };
      const result = validateGraphConfigForExecution(config, registry);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining("Cycle") }),
        ]),
      );
    });

    it("fails on empty nodes", () => {
      const config = makeMinimalGraph({ nodes: {} });
      const result = validateGraphConfigForExecution(config, registry);
      expect(result.valid).toBe(false);
    });
  });

  describe("runtime activity registry validation", () => {
    it("fails when activity type not in runtime registry", () => {
      // Registry missing "file.prepare"
      const limitedRegistry = makeMockRegistry(["document.updateStatus"]);

      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "a",
        ctx: {},
        nodes: {
          a: { id: "a", type: "activity", label: "A", activityType: "document.updateStatus" } as ActivityNode,
          b: { id: "b", type: "activity", label: "B", activityType: "file.prepare" } as ActivityNode,
        },
        edges: [{ id: "e1", source: "a", target: "b", type: "normal" }],
      };

      const result = validateGraphConfigForExecution(config, limitedRegistry);
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
      const result = validateGraphConfigForExecution(config, registry);
      expect(result.valid).toBe(true);
    });

    it("validates pollUntil activityType against registry", () => {
      const limitedRegistry = makeMockRegistry(["document.updateStatus"]);

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
            activityType: "azureOcr.poll",
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

      const result = validateGraphConfigForExecution(config, limitedRegistry);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "nodes.a.activityType",
            message: expect.stringContaining("azureOcr.poll"),
          }),
        ]),
      );
    });
  });

  describe("GRAPH_VALIDATION_ERROR type usage", () => {
    it("returns structured errors suitable for ApplicationFailure", () => {
      const config = makeMinimalGraph({ schemaVersion: "99.0" as "1.0" });
      const result = validateGraphConfigForExecution(config, registry);

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
          a: { id: "a", type: "activity", label: "A", activityType: "document.updateStatus" } as ActivityNode,
        },
        edges: [{ id: "e1", source: "sw", target: "a", type: "normal" }],
      };
      const result = validateGraphConfigForExecution(config, registry);
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
          a: { id: "a", type: "activity", label: "A", activityType: "document.updateStatus" } as ActivityNode,
        },
        edges: [{ id: "e1", source: "sw", target: "a", type: "conditional" }],
      };
      const result = validateGraphConfigForExecution(config, registry);
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
});
