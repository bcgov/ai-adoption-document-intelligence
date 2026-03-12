/**
 * Graph Workflow Integration Tests
 *
 * Tests for the generic DAG workflow execution engine.
 */

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { computeConfigHash } from "./config-hash";
import { GRAPH_WORKFLOW_TYPE, graphWorkflow } from "./graph-workflow";
import type {
  GraphWorkflowConfig,
  GraphWorkflowInput,
  GraphWorkflowProgress,
  GraphWorkflowResult,
  GraphWorkflowStatus,
} from "./graph-workflow-types";

const TASK_QUEUE = "graph-workflow-test";

/**
 * Test helper: Create mock activity implementations
 */
type ActivityMap = Record<
  string,
  (params: Record<string, unknown>) => Promise<Record<string, unknown>>
>;

const mockActivities: ActivityMap = {
  "document.updateStatus": async (_params: Record<string, unknown>) => {
    return { success: true };
  },

  "file.prepare": async (params: Record<string, unknown>) => {
    return { preparedData: { blobKey: params.blobKey as string } };
  },

  "azureOcr.submit": async (_params: Record<string, unknown>) => {
    return { apimRequestId: "test-request-123" };
  },
};

/**
 * Test helper: Create a minimal graph config
 */
function makeMinimalGraph(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {
      name: "Test Graph",
      description: "Minimal test graph",
      version: "1.0.0",
    },
    nodes: {
      a: {
        id: "a",
        type: "activity",
        label: "Node A",
        activityType: "document.updateStatus",
        inputs: [{ port: "documentId", ctxKey: "documentId" }],
        parameters: { status: "test" },
      },
    },
    edges: [],
    entryNodeId: "a",
    ctx: {
      documentId: { type: "string", defaultValue: "doc-123" },
    },
  };
}

/**
 * Test helper: Create a linear 3-node graph (A -> B -> C)
 */
function makeLinearGraph(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {
      name: "Linear Test Graph",
      description: "3-node linear graph",
      version: "1.0.0",
    },
    nodes: {
      a: {
        id: "a",
        type: "activity",
        label: "Node A",
        activityType: "document.updateStatus",
        inputs: [{ port: "documentId", ctxKey: "documentId" }],
        parameters: { status: "started" },
      },
      b: {
        id: "b",
        type: "activity",
        label: "Node B",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        outputs: [{ port: "preparedData", ctxKey: "preparedData" }],
      },
      c: {
        id: "c",
        type: "activity",
        label: "Node C",
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "preparedData" }],
        outputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
      },
    },
    edges: [
      { id: "e1", source: "a", target: "b", type: "normal" },
      { id: "e2", source: "b", target: "c", type: "normal" },
    ],
    entryNodeId: "a",
    ctx: {
      documentId: { type: "string", defaultValue: "doc-123" },
      blobKey: { type: "string", defaultValue: "blobs/test.pdf" },
      preparedData: { type: "object" },
      apimRequestId: { type: "string" },
    },
  };
}

/**
 * Test helper: Create a graph input
 */
function makeMockInput(
  graph: GraphWorkflowConfig,
  initialCtx: Record<string, unknown> = {},
): GraphWorkflowInput {
  return {
    graph,
    initialCtx,
    configHash: computeConfigHash(graph),
    runnerVersion: "1.0.0",
  };
}

/**
 * Test helper: Run a workflow with the test environment
 */
async function runWorkflow(
  testEnv: TestWorkflowEnvironment,
  input: GraphWorkflowInput,
  workflowId: string,
  activitiesOverride: ActivityMap = {},
): Promise<GraphWorkflowResult> {
  const workflowsPath = require.resolve("./graph-workflow");
  const activities = { ...mockActivities, ...activitiesOverride };

  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: "default",
    taskQueue: TASK_QUEUE,
    workflowsPath,
    activities,
  });

  return worker.runUntil(
    testEnv.client.workflow.execute(graphWorkflow, {
      workflowId,
      taskQueue: TASK_QUEUE,
      args: [input],
    }),
  );
}

async function startWorkflowWithWorker(
  testEnv: TestWorkflowEnvironment,
  input: GraphWorkflowInput,
  workflowId: string,
  activitiesOverride: ActivityMap = {},
) {
  const workflowsPath = require.resolve("./graph-workflow");
  const activities = { ...mockActivities, ...activitiesOverride };

  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: "default",
    taskQueue: TASK_QUEUE,
    workflowsPath,
    activities,
  });

  const handle = await testEnv.client.workflow.start(graphWorkflow, {
    workflowId,
    taskQueue: TASK_QUEUE,
    args: [input],
  });

  return { worker, handle };
}

async function runWorkflowWithSignal(
  testEnv: TestWorkflowEnvironment,
  input: GraphWorkflowInput,
  workflowId: string,
  signalName: string,
  payload: Record<string, unknown>,
  activitiesOverride: ActivityMap = {},
): Promise<GraphWorkflowResult> {
  const workflowsPath = require.resolve("./graph-workflow");
  const activities = { ...mockActivities, ...activitiesOverride };

  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: "default",
    taskQueue: TASK_QUEUE,
    workflowsPath,
    activities,
  });

  const handle = await testEnv.client.workflow.start(graphWorkflow, {
    workflowId,
    taskQueue: TASK_QUEUE,
    args: [input],
  });

  const resultPromise = handle.result();
  const runPromise = worker.runUntil(resultPromise);

  await handle.signal(signalName, payload);

  return runPromise;
}

async function runWorkflowWithoutSignal(
  testEnv: TestWorkflowEnvironment,
  input: GraphWorkflowInput,
  workflowId: string,
  activitiesOverride: ActivityMap = {},
): Promise<GraphWorkflowResult> {
  const workflowsPath = require.resolve("./graph-workflow");
  const activities = { ...mockActivities, ...activitiesOverride };

  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace: "default",
    taskQueue: TASK_QUEUE,
    workflowsPath,
    activities,
  });

  const handle = await testEnv.client.workflow.start(graphWorkflow, {
    workflowId,
    taskQueue: TASK_QUEUE,
    args: [input],
  });

  const resultPromise = handle.result();
  return worker.runUntil(resultPromise);
}

describe("Graph Workflow", () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  }, 30000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  describe("US-006: Core DAG Execution", () => {
    it("has correct workflow type constant", () => {
      expect(GRAPH_WORKFLOW_TYPE).toBe("graphWorkflow");
    });

    it("initializes context from defaults and initialCtx", async () => {
      const graph = makeMinimalGraph();
      const input = makeMockInput(graph, { documentId: "override-123" });

      const result = await runWorkflow(testEnv, input, "test-ctx-init");

      expect(result.ctx.documentId).toBe("override-123");
      expect(result.status).toBe("completed");
    });

    it("executes a linear 3-node graph (A -> B -> C)", async () => {
      const graph = makeLinearGraph();
      const input = makeMockInput(graph);

      const result = await runWorkflow(testEnv, input, "test-linear-execution");

      expect(result.status).toBe("completed");
      expect(result.completedNodes).toHaveLength(3);
      expect(result.completedNodes).toContain("a");
      expect(result.completedNodes).toContain("b");
      expect(result.completedNodes).toContain("c");

      // Verify context flows correctly
      expect(result.ctx.preparedData).toBeDefined();
      expect(result.ctx.apimRequestId).toBe("test-request-123");
    });

    it("returns final result with completed status", async () => {
      const graph = makeMinimalGraph();
      const input = makeMockInput(graph);

      const result = await runWorkflow(testEnv, input, "test-final-result");

      expect(result).toMatchObject({
        status: "completed",
        completedNodes: ["a"],
      });
      expect(result.ctx).toBeDefined();
    });
  });

  describe("US-007: Activity Node Handler", () => {
    it("resolves input port bindings from ctx", async () => {
      const graph = makeMinimalGraph();
      const input = makeMockInput(graph, { documentId: "test-doc-456" });

      const result = await runWorkflow(testEnv, input, "test-port-bindings");

      expect(result.status).toBe("completed");
      expect(result.ctx.documentId).toBe("test-doc-456");
    });

    it("writes output port bindings to ctx", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Output Test",
          description: "Test output bindings",
          version: "1.0.0",
        },
        nodes: {
          prepare: {
            id: "prepare",
            type: "activity",
            label: "Prepare File",
            activityType: "file.prepare",
            inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
            outputs: [{ port: "preparedData", ctxKey: "result" }],
          },
        },
        edges: [],
        entryNodeId: "prepare",
        ctx: {
          blobKey: { type: "string", defaultValue: "blobs/test.pdf" },
          result: { type: "object" },
        },
      };

      const input = makeMockInput(graph);

      const result = await runWorkflow(testEnv, input, "test-output-bindings");

      expect(result.status).toBe("completed");
      expect(result.ctx.result).toBeDefined();
      expect(result.ctx.result).toHaveProperty("blobKey", "blobs/test.pdf");
    });

    it("fails with ACTIVITY_NOT_FOUND for unknown activity type", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Invalid Activity Test",
          description: "Test unknown activity",
          version: "1.0.0",
        },
        nodes: {
          invalid: {
            id: "invalid",
            type: "activity",
            label: "Invalid Activity",
            activityType: "unknown.activity",
          },
        },
        edges: [],
        entryNodeId: "invalid",
        ctx: {},
      };

      const input = makeMockInput(graph);

      await expect(
        runWorkflow(testEnv, input, "test-unknown-activity"),
      ).rejects.toThrow();
    });
  });

  describe("US-008: Switch Node Handler", () => {
    it("follows the true case when condition matches", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Switch True Test",
          description: "Test switch routing with true condition",
          version: "1.0.0",
        },
        nodes: {
          start: {
            id: "start",
            type: "activity",
            label: "Start",
            activityType: "document.updateStatus",
            parameters: { status: "test" },
          },
          switch: {
            id: "switch",
            type: "switch",
            label: "Check Review",
            cases: [
              {
                condition: {
                  operator: "equals",
                  left: { ref: "ctx.requiresReview" },
                  right: { literal: true },
                },
                edgeId: "edge-switch-to-review",
              },
            ],
            defaultEdge: "edge-switch-to-skip",
          },
          review: {
            id: "review",
            type: "activity",
            label: "Review Activity",
            activityType: "document.updateStatus",
            parameters: { status: "reviewed" },
          },
          skip: {
            id: "skip",
            type: "activity",
            label: "Skip Activity",
            activityType: "document.updateStatus",
            parameters: { status: "skipped" },
          },
        },
        edges: [
          { id: "e1", source: "start", target: "switch", type: "normal" },
          {
            id: "edge-switch-to-review",
            source: "switch",
            target: "review",
            type: "conditional",
          },
          {
            id: "edge-switch-to-skip",
            source: "switch",
            target: "skip",
            type: "conditional",
          },
        ],
        entryNodeId: "start",
        ctx: {
          requiresReview: { type: "boolean", defaultValue: true },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflow(testEnv, input, "test-switch-true");

      expect(result.status).toBe("completed");
      expect(result.completedNodes).toContain("review");
      expect(result.completedNodes).not.toContain("skip");
    });

    it("follows the default edge when no case matches", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Switch Default Test",
          description: "Test switch routing with default edge",
          version: "1.0.0",
        },
        nodes: {
          start: {
            id: "start",
            type: "activity",
            label: "Start",
            activityType: "document.updateStatus",
            parameters: { status: "test" },
          },
          switch: {
            id: "switch",
            type: "switch",
            label: "Check Review",
            cases: [
              {
                condition: {
                  operator: "equals",
                  left: { ref: "ctx.requiresReview" },
                  right: { literal: true },
                },
                edgeId: "edge-switch-to-review",
              },
            ],
            defaultEdge: "edge-switch-to-skip",
          },
          review: {
            id: "review",
            type: "activity",
            label: "Review Activity",
            activityType: "document.updateStatus",
            parameters: { status: "reviewed" },
          },
          skip: {
            id: "skip",
            type: "activity",
            label: "Skip Activity",
            activityType: "document.updateStatus",
            parameters: { status: "skipped" },
          },
        },
        edges: [
          { id: "e1", source: "start", target: "switch", type: "normal" },
          {
            id: "edge-switch-to-review",
            source: "switch",
            target: "review",
            type: "conditional",
          },
          {
            id: "edge-switch-to-skip",
            source: "switch",
            target: "skip",
            type: "conditional",
          },
        ],
        entryNodeId: "start",
        ctx: {
          requiresReview: { type: "boolean", defaultValue: false },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflow(testEnv, input, "test-switch-default");

      expect(result.status).toBe("completed");
      expect(result.completedNodes).toContain("skip");
      expect(result.completedNodes).not.toContain("review");
    });
  });

  describe("US-009: Map/Join Node Handlers", () => {
    it("executes map node over a collection", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Map Test",
          description: "Test map over collection",
          version: "1.0.0",
        },
        nodes: {
          start: {
            id: "start",
            type: "activity",
            label: "Start",
            activityType: "document.updateStatus",
            parameters: { status: "started" },
          },
          mapNode: {
            id: "mapNode",
            type: "map",
            label: "Map Over Items",
            collectionCtxKey: "items",
            itemCtxKey: "currentItem",
            indexCtxKey: "currentIndex",
            bodyEntryNodeId: "processItem",
            bodyExitNodeId: "processItem",
          },
          processItem: {
            id: "processItem",
            type: "activity",
            label: "Process Item",
            activityType: "file.prepare",
            inputs: [{ port: "blobKey", ctxKey: "currentItem" }],
            outputs: [{ port: "preparedData", ctxKey: "itemResult" }],
          },
          joinNode: {
            id: "joinNode",
            type: "join",
            label: "Join Results",
            sourceMapNodeId: "mapNode",
            strategy: "all",
            resultsCtxKey: "allResults",
          },
        },
        edges: [
          { id: "e1", source: "start", target: "mapNode", type: "normal" },
          { id: "e2", source: "mapNode", target: "joinNode", type: "normal" },
        ],
        entryNodeId: "start",
        ctx: {
          items: {
            type: "array",
            defaultValue: ["item1", "item2", "item3"],
          },
          currentItem: { type: "string" },
          currentIndex: { type: "number" },
          itemResult: { type: "object" },
          allResults: { type: "array" },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflow(testEnv, input, "test-map-execution");

      expect(result.status).toBe("completed");
      expect(result.completedNodes).toContain("mapNode");
      expect(result.completedNodes).toContain("joinNode");
      expect(result.ctx.allResults).toBeDefined();
      expect(Array.isArray(result.ctx.allResults)).toBe(true);
      expect((result.ctx.allResults as unknown[]).length).toBe(3);
    });

    it("handles empty collection in map node", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Empty Map Test",
          description: "Test map with empty collection",
          version: "1.0.0",
        },
        nodes: {
          mapNode: {
            id: "mapNode",
            type: "map",
            label: "Map Over Items",
            collectionCtxKey: "items",
            itemCtxKey: "currentItem",
            bodyEntryNodeId: "processItem",
            bodyExitNodeId: "processItem",
          },
          processItem: {
            id: "processItem",
            type: "activity",
            label: "Process Item",
            activityType: "file.prepare",
            inputs: [{ port: "blobKey", ctxKey: "currentItem" }],
          },
          joinNode: {
            id: "joinNode",
            type: "join",
            label: "Join Results",
            sourceMapNodeId: "mapNode",
            strategy: "all",
            resultsCtxKey: "allResults",
          },
        },
        edges: [
          { id: "e1", source: "mapNode", target: "joinNode", type: "normal" },
        ],
        entryNodeId: "mapNode",
        ctx: {
          items: { type: "array", defaultValue: [] },
          currentItem: { type: "string" },
          allResults: { type: "array" },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflow(testEnv, input, "test-map-empty");

      expect(result.status).toBe("completed");
      expect(result.ctx.allResults).toBeDefined();
      expect(Array.isArray(result.ctx.allResults)).toBe(true);
      expect((result.ctx.allResults as unknown[]).length).toBe(0);
    });

    it("map node respects maxConcurrency", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Map Concurrency Test",
          description: "Test map concurrency limiting",
          version: "1.0.0",
        },
        nodes: {
          mapNode: {
            id: "mapNode",
            type: "map",
            label: "Map Over Items",
            collectionCtxKey: "items",
            itemCtxKey: "currentItem",
            maxConcurrency: 2,
            bodyEntryNodeId: "processItem",
            bodyExitNodeId: "processItem",
          },
          processItem: {
            id: "processItem",
            type: "activity",
            label: "Process Item",
            activityType: "file.prepare",
            inputs: [{ port: "blobKey", ctxKey: "currentItem" }],
          },
          joinNode: {
            id: "joinNode",
            type: "join",
            label: "Join Results",
            sourceMapNodeId: "mapNode",
            strategy: "all",
            resultsCtxKey: "allResults",
          },
        },
        edges: [
          { id: "e1", source: "mapNode", target: "joinNode", type: "normal" },
        ],
        entryNodeId: "mapNode",
        ctx: {
          items: {
            type: "array",
            defaultValue: ["item1", "item2", "item3", "item4", "item5"],
          },
          currentItem: { type: "string" },
          allResults: { type: "array" },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflow(testEnv, input, "test-map-concurrency");

      expect(result.status).toBe("completed");
      expect((result.ctx.allResults as unknown[]).length).toBe(5);
    });
  });

  describe("US-010: PollUntil Node Handler", () => {
    it("polls until condition is met and writes outputs", async () => {
      let pollCount = 0;
      let receivedRequestId: string | undefined;

      const pollActivities: ActivityMap = {
        "azureOcr.poll": async (params: Record<string, unknown>) => {
          receivedRequestId = params.apimRequestId as string;
          const status = pollCount < 2 ? "running" : "succeeded";
          pollCount += 1;
          return { response: { status } };
        },
      };

      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "PollUntil Success Test",
          description: "Test pollUntil success path",
          version: "1.0.0",
        },
        nodes: {
          pollOcr: {
            id: "pollOcr",
            type: "pollUntil",
            label: "Poll OCR",
            activityType: "azureOcr.poll",
            inputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
            outputs: [{ port: "response", ctxKey: "ocrResponse" }],
            condition: {
              operator: "not-equals",
              left: { ref: "ctx.ocrResponse.status" },
              right: { literal: "running" },
            },
            interval: "1s",
            initialDelay: "1s",
            maxAttempts: 5,
          },
        },
        edges: [],
        entryNodeId: "pollOcr",
        ctx: {
          apimRequestId: { type: "string", defaultValue: "req-123" },
          ocrResponse: { type: "object" },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflow(
        testEnv,
        input,
        "test-polluntil-success",
        pollActivities,
      );

      expect(result.status).toBe("completed");
      expect(result.ctx.ocrResponse).toBeDefined();
      expect((result.ctx.ocrResponse as { status: string }).status).toBe(
        "succeeded",
      );
      expect(pollCount).toBe(3);
      expect(receivedRequestId).toBe("req-123");
    });

    it("fails with POLL_TIMEOUT when maxAttempts exceeded", async () => {
      const pollActivities: ActivityMap = {
        "azureOcr.poll": async () => {
          return { response: { status: "running" } };
        },
      };

      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "PollUntil Timeout Test",
          description: "Test pollUntil maxAttempts timeout",
          version: "1.0.0",
        },
        nodes: {
          pollOcr: {
            id: "pollOcr",
            type: "pollUntil",
            label: "Poll OCR",
            activityType: "azureOcr.poll",
            outputs: [{ port: "response", ctxKey: "ocrResponse" }],
            condition: {
              operator: "not-equals",
              left: { ref: "ctx.ocrResponse.status" },
              right: { literal: "running" },
            },
            interval: "1s",
            maxAttempts: 3,
          },
        },
        edges: [],
        entryNodeId: "pollOcr",
        ctx: {
          ocrResponse: { type: "object" },
        },
      };

      const input = makeMockInput(graph);

      try {
        await runWorkflow(
          testEnv,
          input,
          "test-polluntil-timeout",
          pollActivities,
        );
        throw new Error("Expected pollUntil to timeout");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const causeMessage =
          (error as { cause?: { message?: string } }).cause?.message ?? "";
        expect(`${errorMessage} ${causeMessage}`).toMatch(/POLL_TIMEOUT/);
      }
    });

    it("fails with POLL_TIMEOUT when overall timeout elapses", async () => {
      const pollActivities: ActivityMap = {
        "azureOcr.poll": async () => {
          return { response: { status: "running" } };
        },
      };

      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "PollUntil Overall Timeout Test",
          description: "Test pollUntil overall timeout",
          version: "1.0.0",
        },
        nodes: {
          pollOcr: {
            id: "pollOcr",
            type: "pollUntil",
            label: "Poll OCR",
            activityType: "azureOcr.poll",
            outputs: [{ port: "response", ctxKey: "ocrResponse" }],
            condition: {
              operator: "not-equals",
              left: { ref: "ctx.ocrResponse.status" },
              right: { literal: "running" },
            },
            interval: "5s",
            timeout: "3s",
            maxAttempts: 50,
          },
        },
        edges: [],
        entryNodeId: "pollOcr",
        ctx: {
          ocrResponse: { type: "object" },
        },
      };

      const input = makeMockInput(graph);

      try {
        await runWorkflow(
          testEnv,
          input,
          "test-polluntil-overall-timeout",
          pollActivities,
        );
        throw new Error("Expected pollUntil to timeout");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const causeMessage =
          (error as { cause?: { message?: string } }).cause?.message ?? "";
        expect(`${errorMessage} ${causeMessage}`).toMatch(/POLL_TIMEOUT/);
      }
    });
  });

  describe("US-011: HumanGate Node Handler", () => {
    it("continues on approval and writes payload to ctx", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "HumanGate Approval Test",
          description: "Test humanGate approval path",
          version: "1.0.0",
        },
        nodes: {
          gate: {
            id: "gate",
            type: "humanGate",
            label: "Human Review",
            signal: { name: "humanApproval" },
            timeout: "1m",
            onTimeout: "fail",
            outputs: [
              { port: "approved", ctxKey: "approved" },
              { port: "reviewer", ctxKey: "reviewer" },
            ],
          },
          next: {
            id: "next",
            type: "activity",
            label: "Next Step",
            activityType: "document.updateStatus",
            parameters: { status: "approved" },
          },
        },
        edges: [{ id: "e1", source: "gate", target: "next", type: "normal" }],
        entryNodeId: "gate",
        ctx: {
          approved: { type: "boolean" },
          reviewer: { type: "string" },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflowWithSignal(
        testEnv,
        input,
        "test-humangate-approval",
        "humanApproval",
        { approved: true, reviewer: "alice" },
      );

      expect(result.status).toBe("completed");
      expect(result.completedNodes).toContain("next");
      expect(result.ctx.approved).toBe(true);
      expect(result.ctx.reviewer).toBe("alice");
    });

    it("fails with HUMAN_GATE_REJECTED on rejection signal", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "HumanGate Rejection Test",
          description: "Test humanGate rejection path",
          version: "1.0.0",
        },
        nodes: {
          gate: {
            id: "gate",
            type: "humanGate",
            label: "Human Review",
            signal: { name: "humanApproval" },
            timeout: "1m",
            onTimeout: "fail",
          },
        },
        edges: [],
        entryNodeId: "gate",
        ctx: {},
      };

      const input = makeMockInput(graph);

      try {
        await runWorkflowWithSignal(
          testEnv,
          input,
          "test-humangate-rejection",
          "humanApproval",
          { approved: false, reviewer: "bob" },
        );
        throw new Error("Expected humanGate to reject");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const cause = (error as { cause?: { message?: string; type?: string } })
          .cause;
        const combined = `${errorMessage} ${cause?.message ?? ""}`;
        expect(cause?.type ?? combined).toMatch(/HUMAN_GATE_REJECTED/);
      }
    });

    it("fails with HUMAN_GATE_TIMEOUT on timeout when onTimeout is fail", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "HumanGate Timeout Test",
          description: "Test humanGate timeout failure",
          version: "1.0.0",
        },
        nodes: {
          gate: {
            id: "gate",
            type: "humanGate",
            label: "Human Review",
            signal: { name: "humanApproval" },
            timeout: "1s",
            onTimeout: "fail",
          },
        },
        edges: [],
        entryNodeId: "gate",
        ctx: {},
      };

      const input = makeMockInput(graph);

      try {
        await runWorkflowWithoutSignal(
          testEnv,
          input,
          "test-humangate-timeout",
        );
        throw new Error("Expected humanGate to timeout");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const cause = (error as { cause?: { message?: string; type?: string } })
          .cause;
        const combined = `${errorMessage} ${cause?.message ?? ""}`;
        expect(cause?.type ?? combined).toMatch(/HUMAN_GATE_TIMEOUT/);
      }
    });

    it("continues on timeout when onTimeout is continue", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "HumanGate Continue Timeout Test",
          description: "Test humanGate continue on timeout",
          version: "1.0.0",
        },
        nodes: {
          gate: {
            id: "gate",
            type: "humanGate",
            label: "Human Review",
            signal: { name: "humanApproval" },
            timeout: "1s",
            onTimeout: "continue",
          },
          next: {
            id: "next",
            type: "activity",
            label: "Next Step",
            activityType: "document.updateStatus",
            parameters: { status: "continued" },
          },
        },
        edges: [{ id: "e1", source: "gate", target: "next", type: "normal" }],
        entryNodeId: "gate",
        ctx: {},
      };

      const input = makeMockInput(graph);
      const result = await runWorkflowWithoutSignal(
        testEnv,
        input,
        "test-humangate-timeout-continue",
      );

      expect(result.status).toBe("completed");
      expect(result.completedNodes).toContain("next");
    });

    it("routes to fallback edge on timeout when onTimeout is fallback", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "HumanGate Fallback Timeout Test",
          description: "Test humanGate fallback on timeout",
          version: "1.0.0",
        },
        nodes: {
          gate: {
            id: "gate",
            type: "humanGate",
            label: "Human Review",
            signal: { name: "humanApproval" },
            timeout: "1s",
            onTimeout: "fallback",
            fallbackEdgeId: "edge-fallback",
          },
          approved: {
            id: "approved",
            type: "activity",
            label: "Approved Path",
            activityType: "document.updateStatus",
            parameters: { status: "approved" },
          },
          fallback: {
            id: "fallback",
            type: "activity",
            label: "Fallback Path",
            activityType: "document.updateStatus",
            parameters: { status: "fallback" },
          },
        },
        edges: [
          {
            id: "edge-approved",
            source: "gate",
            target: "approved",
            type: "normal",
          },
          {
            id: "edge-fallback",
            source: "gate",
            target: "fallback",
            type: "error",
          },
        ],
        entryNodeId: "gate",
        ctx: {},
      };

      const input = makeMockInput(graph);
      const result = await runWorkflowWithoutSignal(
        testEnv,
        input,
        "test-humangate-timeout-fallback",
      );

      expect(result.status).toBe("completed");
      expect(result.completedNodes).toContain("fallback");
      expect(result.completedNodes).not.toContain("approved");
    });
  });

  describe("US-012: ChildWorkflow Node Handler", () => {
    it("runs an inline child workflow and maps outputs to parent ctx", async () => {
      const childGraph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Child Inline Graph",
          description: "Inline child graph",
          version: "1.0.0",
        },
        nodes: {
          prepare: {
            id: "prepare",
            type: "activity",
            label: "Prepare",
            activityType: "file.prepare",
            inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
            outputs: [{ port: "preparedData", ctxKey: "ocrResult" }],
          },
        },
        edges: [],
        entryNodeId: "prepare",
        ctx: {
          blobKey: { type: "string" },
          ocrResult: { type: "object" },
        },
      };

      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Parent Inline Child Test",
          description: "Parent graph with inline child",
          version: "1.0.0",
        },
        nodes: {
          child: {
            id: "child",
            type: "childWorkflow",
            label: "Child Inline",
            workflowRef: { type: "inline", graph: childGraph },
            inputMappings: [{ port: "blobKey", ctxKey: "blobKey" }],
            outputMappings: [{ port: "ocrResult", ctxKey: "segmentOcrResult" }],
          },
        },
        edges: [],
        entryNodeId: "child",
        ctx: {
          blobKey: { type: "string", defaultValue: "blobs/segment.pdf" },
          segmentOcrResult: { type: "object" },
        },
      };

      const input = makeMockInput(graph);
      const result = await runWorkflow(testEnv, input, "test-child-inline");

      expect(result.status).toBe("completed");
      expect(result.ctx.segmentOcrResult).toBeDefined();
      expect(result.ctx.segmentOcrResult).toHaveProperty(
        "blobKey",
        "blobs/segment.pdf",
      );
    });

    it("runs a library child workflow via activity lookup", async () => {
      const libraryGraph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Library Graph",
          description: "Library child graph",
          version: "1.0.0",
        },
        nodes: {
          prepare: {
            id: "prepare",
            type: "activity",
            label: "Prepare",
            activityType: "file.prepare",
            inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
            outputs: [{ port: "preparedData", ctxKey: "ocrResult" }],
          },
        },
        edges: [],
        entryNodeId: "prepare",
        ctx: {
          blobKey: { type: "string" },
          ocrResult: { type: "object" },
        },
      };

      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Parent Library Child Test",
          description: "Parent graph with library child",
          version: "1.0.0",
        },
        nodes: {
          child: {
            id: "child",
            type: "childWorkflow",
            label: "Child Library",
            workflowRef: { type: "library", workflowId: "workflow-123" },
            inputMappings: [{ port: "blobKey", ctxKey: "blobKey" }],
            outputMappings: [{ port: "ocrResult", ctxKey: "segmentOcrResult" }],
          },
        },
        edges: [],
        entryNodeId: "child",
        ctx: {
          blobKey: { type: "string", defaultValue: "blobs/library.pdf" },
          segmentOcrResult: { type: "object" },
        },
      };

      const input = makeMockInput(graph);
      const activitiesOverride: ActivityMap = {
        getWorkflowGraphConfig: async () => ({ graph: libraryGraph }),
      };

      const result = await runWorkflow(
        testEnv,
        input,
        "test-child-library",
        activitiesOverride,
      );

      expect(result.status).toBe("completed");
      expect(result.ctx.segmentOcrResult).toBeDefined();
      expect(result.ctx.segmentOcrResult).toHaveProperty(
        "blobKey",
        "blobs/library.pdf",
      );
    });
  });

  describe("US-013: Error Policy Handling", () => {
    it("fails the workflow when no error policy is defined", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Error Policy Fail Test",
          description: "Fail on node error",
          version: "1.0.0",
        },
        nodes: {
          failing: {
            id: "failing",
            type: "activity",
            label: "Failing Activity",
            activityType: "file.prepare",
            inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
          },
        },
        edges: [],
        entryNodeId: "failing",
        ctx: {
          blobKey: { type: "string", defaultValue: "blobs/fail.pdf" },
        },
      };

      const input = makeMockInput(graph);
      const activitiesOverride: ActivityMap = {
        "file.prepare": async () => {
          throw new Error("boom");
        },
      };

      try {
        await runWorkflow(
          testEnv,
          input,
          "test-error-policy-fail",
          activitiesOverride,
        );
        throw new Error("Expected workflow to fail");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        expect(errorMessage).toMatch(/Workflow execution failed/);
      }
    });

    it("routes to fallback edge when onError is fallback", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Error Policy Fallback Test",
          description: "Fallback on node error",
          version: "1.0.0",
        },
        nodes: {
          failing: {
            id: "failing",
            type: "activity",
            label: "Failing Activity",
            activityType: "file.prepare",
            inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
            errorPolicy: {
              onError: "fallback",
              fallbackEdgeId: "edge-fallback",
              retryable: false,
            },
          },
          fallback: {
            id: "fallback",
            type: "activity",
            label: "Fallback Activity",
            activityType: "document.updateStatus",
            parameters: { status: "fallback" },
          },
        },
        edges: [
          {
            id: "edge-fallback",
            source: "failing",
            target: "fallback",
            type: "error",
          },
        ],
        entryNodeId: "failing",
        ctx: {
          blobKey: { type: "string", defaultValue: "blobs/fallback.pdf" },
        },
      };

      const input = makeMockInput(graph);
      const activitiesOverride: ActivityMap = {
        "file.prepare": async () => {
          throw new Error("boom");
        },
      };

      const result = await runWorkflow(
        testEnv,
        input,
        "test-error-policy-fallback",
        activitiesOverride,
      );

      expect(result.status).toBe("completed");
      expect(result.completedNodes).toContain("fallback");
    });

    it("skips a failed node when onError is skip", async () => {
      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Error Policy Skip Test",
          description: "Skip on node error",
          version: "1.0.0",
        },
        nodes: {
          failing: {
            id: "failing",
            type: "activity",
            label: "Failing Activity",
            activityType: "file.prepare",
            inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
            errorPolicy: {
              onError: "skip",
              retryable: false,
            },
          },
          next: {
            id: "next",
            type: "activity",
            label: "Next Activity",
            activityType: "document.updateStatus",
            parameters: { status: "skipped" },
          },
        },
        edges: [
          {
            id: "edge-next",
            source: "failing",
            target: "next",
            type: "normal",
          },
        ],
        entryNodeId: "failing",
        ctx: {
          blobKey: { type: "string", defaultValue: "blobs/skip.pdf" },
        },
      };

      const input = makeMockInput(graph);
      const activitiesOverride: ActivityMap = {
        "file.prepare": async () => {
          throw new Error("boom");
        },
      };

      const result = await runWorkflow(
        testEnv,
        input,
        "test-error-policy-skip",
        activitiesOverride,
      );

      expect(result.status).toBe("completed");
      expect(result.completedNodes).toContain("next");
    });
  });

  describe("US-014: Query and Signal Handlers", () => {
    it("getStatus and getProgress reflect running state", async () => {
      let activityStartedResolve: (() => void) | undefined;
      let finishActivityResolve: (() => void) | undefined;
      const activityStarted = new Promise<void>((resolve) => {
        activityStartedResolve = resolve;
      });
      const finishActivity = new Promise<void>((resolve) => {
        finishActivityResolve = resolve;
      });

      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Query Status Test",
          description: "Test getStatus and getProgress",
          version: "1.0.0",
        },
        nodes: {
          a: {
            id: "a",
            type: "activity",
            label: "Step A",
            activityType: "file.prepare",
            inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
          },
          b: {
            id: "b",
            type: "activity",
            label: "Step B",
            activityType: "document.updateStatus",
            parameters: { status: "done" },
          },
        },
        edges: [{ id: "e1", source: "a", target: "b", type: "normal" }],
        entryNodeId: "a",
        ctx: {
          blobKey: { type: "string", defaultValue: "blobs/query.pdf" },
        },
      };

      const input = makeMockInput(graph);
      const activitiesOverride: ActivityMap = {
        "file.prepare": async () => {
          activityStartedResolve?.();
          await finishActivity;
          return { preparedData: { blobKey: "blobs/query.pdf" } };
        },
      };

      const { worker, handle } = await startWorkflowWithWorker(
        testEnv,
        input,
        "test-query-status",
        activitiesOverride,
      );

      const resultPromise = handle.result();
      const runPromise = worker.runUntil(resultPromise);

      await activityStarted;

      const status = (await handle.query("getStatus")) as GraphWorkflowStatus;
      expect(status.overallStatus).toBe("running");
      expect(status.currentNodes).toContain("a");
      expect(status.nodeStatuses.a.status).toBe("running");
      expect(status.nodeStatuses.b.status).toBe("pending");
      expect(status.nodeStatuses.a.startedAt).toBeDefined();

      const progress = (await handle.query(
        "getProgress",
      )) as GraphWorkflowProgress;
      expect(progress.totalCount).toBe(2);
      expect(progress.completedCount).toBe(0);
      expect(progress.currentNodes).toContain("a");

      if (!finishActivityResolve) {
        throw new Error("finishActivityResolve not set");
      }
      finishActivityResolve();

      const result = await runPromise;
      expect(result.status).toBe("completed");
    });

    it("cancel signal stops workflow in graceful mode", async () => {
      let activityStartedResolve: (() => void) | undefined;
      let finishActivityResolve: (() => void) | undefined;
      const activityStarted = new Promise<void>((resolve) => {
        activityStartedResolve = resolve;
      });
      const finishActivity = new Promise<void>((resolve) => {
        finishActivityResolve = resolve;
      });

      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Cancel Graceful Test",
          description: "Test graceful cancel",
          version: "1.0.0",
        },
        nodes: {
          a: {
            id: "a",
            type: "activity",
            label: "Step A",
            activityType: "file.prepare",
          },
          b: {
            id: "b",
            type: "activity",
            label: "Step B",
            activityType: "document.updateStatus",
            parameters: { status: "done" },
          },
        },
        edges: [{ id: "e1", source: "a", target: "b", type: "normal" }],
        entryNodeId: "a",
        ctx: {},
      };

      const input = makeMockInput(graph);
      const activitiesOverride: ActivityMap = {
        "file.prepare": async () => {
          activityStartedResolve?.();
          await finishActivity;
          return { preparedData: { blobKey: "blobs/graceful.pdf" } };
        },
      };

      const { worker, handle } = await startWorkflowWithWorker(
        testEnv,
        input,
        "test-cancel-graceful",
        activitiesOverride,
      );

      const resultPromise = handle.result();
      const runPromise = worker.runUntil(resultPromise);

      await activityStarted;
      await handle.signal("cancel", { mode: "graceful" });

      if (!finishActivityResolve) {
        throw new Error("finishActivityResolve not set");
      }
      finishActivityResolve();

      const result = await runPromise;
      expect(result.status).toBe("cancelled");
      expect(result.completedNodes).toContain("a");
      expect(result.completedNodes).not.toContain("b");
    });

    it("cancel signal stops workflow in immediate mode", async () => {
      let activityStartedResolve: (() => void) | undefined;
      let finishActivityResolve: (() => void) | undefined;
      const activityStarted = new Promise<void>((resolve) => {
        activityStartedResolve = resolve;
      });
      const finishActivity = new Promise<void>((resolve) => {
        finishActivityResolve = resolve;
      });

      const graph: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Cancel Immediate Test",
          description: "Test immediate cancel",
          version: "1.0.0",
        },
        nodes: {
          a: {
            id: "a",
            type: "activity",
            label: "Step A",
            activityType: "file.prepare",
          },
          b: {
            id: "b",
            type: "activity",
            label: "Step B",
            activityType: "document.updateStatus",
            parameters: { status: "done" },
          },
        },
        edges: [{ id: "e1", source: "a", target: "b", type: "normal" }],
        entryNodeId: "a",
        ctx: {},
      };

      const input = makeMockInput(graph);
      const activitiesOverride: ActivityMap = {
        "file.prepare": async () => {
          activityStartedResolve?.();
          await finishActivity;
          return { preparedData: { blobKey: "blobs/immediate.pdf" } };
        },
      };

      const { worker, handle } = await startWorkflowWithWorker(
        testEnv,
        input,
        "test-cancel-immediate",
        activitiesOverride,
      );

      const resultPromise = handle.result();
      const runPromise = worker.runUntil(resultPromise);

      await activityStarted;
      await handle.signal("cancel", { mode: "immediate" });

      if (!finishActivityResolve) {
        throw new Error("finishActivityResolve not set");
      }
      finishActivityResolve();

      const result = await runPromise;
      expect(result.status).toBe("cancelled");
      expect(result.completedNodes).toContain("a");
      expect(result.completedNodes).not.toContain("b");
    });
  });

  describe("US-015: Config Hash and Versioning", () => {
    it("computes the same hash for semantically identical configs", () => {
      const baseConfig: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "Hash Test",
          description: "Test hash defaults",
          version: "1.0.0",
        },
        nodes: {
          activity: {
            id: "activity",
            type: "activity",
            label: "Activity",
            activityType: "document.updateStatus",
            parameters: { status: "test" },
          },
        },
        edges: [],
        entryNodeId: "activity",
        ctx: {},
      };

      const configWithDefaults: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          description: "Test hash defaults",
          name: "Hash Test",
          tags: [],
          version: "1.0.0",
        },
        nodes: {
          activity: {
            id: "activity",
            type: "activity",
            label: "Activity",
            activityType: "document.updateStatus",
            parameters: { status: "test" },
            inputs: [],
            outputs: [],
            retry: { maximumAttempts: 3 },
            timeout: { startToClose: "2m" },
          },
        },
        edges: [],
        entryNodeId: "activity",
        ctx: {},
      };

      const hashA = computeConfigHash(baseConfig);
      const hashB = computeConfigHash(configWithDefaults);

      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64);
    });
  });
});
