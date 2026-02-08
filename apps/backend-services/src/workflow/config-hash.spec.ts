import { computeConfigHash } from "./config-hash";
import type { GraphWorkflowConfig, ActivityNode } from "./graph-workflow-types";

function makeMinimalGraph(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "Test" },
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
  };
}

describe("config-hash", () => {
  describe("computeConfigHash", () => {
    it("produces consistent hash for same config", () => {
      const config = makeMinimalGraph();
      const hash1 = computeConfigHash(config);
      const hash2 = computeConfigHash(config);
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe("string");
      expect(hash1.length).toBe(64); // SHA-256 hex string
    });

    it("produces different hash when execution-relevant fields change", () => {
      const config1 = makeMinimalGraph();
      const config2 = makeMinimalGraph();
      config2.nodes.start.label = "Different Label";

      const hash1 = computeConfigHash(config1);
      const hash2 = computeConfigHash(config2);
      expect(hash1).not.toBe(hash2);
    });

    it("nodeGroups field does NOT affect hash", () => {
      const config1 = makeMinimalGraph();
      const config2 = { ...makeMinimalGraph() };

      // Add nodeGroups to config2
      config2.nodeGroups = {
        group1: {
          label: "Test Group",
          description: "Test description",
          icon: "test-icon",
          color: "#000000",
          nodeIds: ["start"],
          exposedParams: [
            {
              label: "Test Param",
              path: "nodes.start.parameters.test",
              type: "string",
              default: "value",
            },
          ],
        },
      };

      const hash1 = computeConfigHash(config1);
      const hash2 = computeConfigHash(config2);

      // Hashes should be identical because nodeGroups is UI-only
      expect(hash1).toBe(hash2);
    });

    it("changing nodeGroups does NOT change hash", () => {
      const config = makeMinimalGraph();
      config.nodeGroups = {
        group1: {
          label: "Group 1",
          nodeIds: ["start"],
        },
      };

      const hash1 = computeConfigHash(config);

      // Modify nodeGroups
      config.nodeGroups.group1.label = "Updated Label";
      config.nodeGroups.group1.icon = "new-icon";
      config.nodeGroups.group2 = {
        label: "Group 2",
        nodeIds: ["start"],
      };

      const hash2 = computeConfigHash(config);

      // Hash should not change
      expect(hash1).toBe(hash2);
    });

    it("hash is deterministic despite key order", () => {
      const config1: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        entryNodeId: "start",
        metadata: { name: "Test" },
        nodes: {
          start: {
            id: "start",
            type: "activity",
            label: "Start",
            activityType: "document.updateStatus",
          } as ActivityNode,
        },
        edges: [],
        ctx: { documentId: { type: "string" } },
      };

      const config2: GraphWorkflowConfig = {
        ctx: { documentId: { type: "string" } },
        edges: [],
        nodes: {
          start: {
            activityType: "document.updateStatus",
            label: "Start",
            type: "activity",
            id: "start",
          } as ActivityNode,
        },
        metadata: { name: "Test" },
        entryNodeId: "start",
        schemaVersion: "1.0",
      };

      const hash1 = computeConfigHash(config1);
      const hash2 = computeConfigHash(config2);
      expect(hash1).toBe(hash2);
    });
  });
});
