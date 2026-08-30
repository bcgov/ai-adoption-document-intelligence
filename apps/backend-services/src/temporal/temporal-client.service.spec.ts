import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import {
  Client,
  Connection,
  defaultPayloadConverter,
} from "@temporalio/client";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import {
  computeConfigHash,
  computeConfigHashWithOverrides,
} from "../workflow/config-hash";
import type { GraphWorkflowConfig } from "../workflow/graph-workflow-types";
import { WorkflowService } from "../workflow/workflow.service";
import {
  extractRunTrigger,
  TemporalClientService,
} from "./temporal-client.service";
import { temporalDataConverter } from "./temporal-data-converter";

const graphConfig: GraphWorkflowConfig = {
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
    },
  },
  edges: [],
};

// Mock Temporal client. Spread the real module so value exports the service
// depends on — notably `defaultPayloadConverter` — stay real; only the
// network-touching surfaces (Connection/Client) and the error class are stubbed.
jest.mock("@temporalio/client", () => {
  const actual = jest.requireActual("@temporalio/client");
  const mockWorkflowHandle = {
    workflowId: "workflow-123",
    describe: jest.fn(),
    result: jest.fn(),
    query: jest.fn(),
    signal: jest.fn(),
    fetchHistory: jest.fn(),
  };

  const mockClient = {
    workflow: {
      start: jest.fn(),
      getHandle: jest.fn(() => mockWorkflowHandle),
    },
  };

  const mockConnection = {
    close: jest.fn(),
  };

  return {
    ...actual,
    Connection: {
      connect: jest.fn(() => Promise.resolve(mockConnection)),
    },
    Client: jest.fn(() => mockClient),
    WorkflowNotFoundError: class WorkflowNotFoundError extends Error {},
  };
});

describe("TemporalClientService", () => {
  let service: TemporalClientService;
  let configService: ConfigService;
  let mockWorkflowService: jest.Mocked<WorkflowService>;
  let mockConnection: any;
  let mockClient: any;
  let mockWorkflowHandle: any;

  beforeEach(async () => {
    mockWorkflowService = {} as jest.Mocked<WorkflowService>;
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock workflow handle
    mockWorkflowHandle = {
      workflowId: "workflow-123",
      firstExecutionRunId: "run-id-456",
      describe: jest.fn(),
      result: jest.fn(),
      query: jest.fn(),
      signal: jest.fn(),
      fetchHistory: jest.fn(),
    };

    // Setup mock client
    mockClient = {
      workflow: {
        start: jest.fn(),
        getHandle: jest.fn(() => mockWorkflowHandle),
      },
    };

    // Setup mock connection (Temporal Connection has workflowService and operatorService)
    mockConnection = {
      close: jest.fn(),
      workflowService: {
        describeNamespace: jest.fn().mockResolvedValue(undefined),
        registerNamespace: jest.fn().mockResolvedValue(undefined),
        deleteWorkflowExecution: jest.fn().mockResolvedValue(undefined),
      },
      operatorService: {
        addSearchAttributes: jest.fn().mockResolvedValue(undefined),
      },
    };

    // Mock Connection.connect
    (Connection.connect as jest.Mock).mockResolvedValue(mockConnection);
    (Client as jest.Mock).mockImplementation(() => mockClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemporalClientService,
        { provide: AppLoggerService, useValue: mockAppLogger },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                TEMPORAL_ADDRESS: "localhost:7233",
                TEMPORAL_NAMESPACE: "default",
                TEMPORAL_TASK_QUEUE: "ocr-processing",
              };
              return config[key];
            }),
          },
        },
        {
          provide: WorkflowService,
          useValue: mockWorkflowService,
        },
      ],
    }).compile();

    service = module.get<TemporalClientService>(TemporalClientService);
    configService = module.get<ConfigService>(ConfigService);

    mockWorkflowService.getWorkflowVersionById = jest.fn().mockResolvedValue({
      id: "workflow-123",
      name: "Graph Workflow",
      description: "Test graph",
      userId: "user-1",
      config: graphConfig,
      schemaVersion: "1.0",
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Initialize the service
    await service.onModuleInit();
  });

  afterEach(async () => {
    if (service) {
      await service.onModuleDestroy();
    }
  });

  describe("onModuleInit", () => {
    it("should connect to Temporal server", async () => {
      expect(Connection.connect).toHaveBeenCalledWith({
        address: "localhost:7233",
      });
      expect(Client).toHaveBeenCalledWith({
        connection: mockConnection,
        namespace: "default",
        dataConverter: temporalDataConverter,
      });
    });

    it("should use default values if config not provided", async () => {
      const newModule = await Test.createTestingModule({
        providers: [
          TemporalClientService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
          {
            provide: WorkflowService,
            useValue: mockWorkflowService,
          },
          { provide: AppLoggerService, useValue: mockAppLogger },
        ],
      }).compile();

      const newService = newModule.get<TemporalClientService>(
        TemporalClientService,
      );
      await newService.onModuleInit();

      expect(Connection.connect).toHaveBeenCalledWith({
        address: "localhost:7233",
      });
      expect(Client).toHaveBeenCalledWith({
        connection: mockConnection,
        namespace: "default",
        dataConverter: temporalDataConverter,
      });

      await newService.onModuleDestroy();
    });

    it("should throw error if connection fails", async () => {
      (Connection.connect as jest.Mock).mockRejectedValueOnce(
        new Error("Connection failed"),
      );

      const newModule = await Test.createTestingModule({
        providers: [
          TemporalClientService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
          {
            provide: WorkflowService,
            useValue: mockWorkflowService,
          },
          { provide: AppLoggerService, useValue: mockAppLogger },
        ],
      }).compile();

      const newService = newModule.get<TemporalClientService>(
        TemporalClientService,
      );

      await expect(newService.onModuleInit()).rejects.toThrow(
        "Connection failed",
      );
    });
  });

  describe("onModuleDestroy", () => {
    it("should close connection", async () => {
      await service.onModuleDestroy();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it("should not throw if connection is null", async () => {
      const newService = new TemporalClientService(
        configService,
        mockWorkflowService,
        mockAppLogger,
      );
      await expect(newService.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe("startGraphWorkflow", () => {
    it("should start graph workflow successfully", async () => {
      mockClient.workflow.start.mockResolvedValue(mockWorkflowHandle);

      const result = await service.startGraphWorkflow(
        "doc-123",
        "workflow-123",
        { documentId: "doc-123", fileName: "test.pdf", fileType: "pdf" },
        "g-test",
        "api",
      );

      expect(result).toBe("run-id-456");
      expect(mockClient.workflow.start).toHaveBeenCalledWith(
        "graphWorkflow",
        expect.objectContaining({
          args: [
            {
              workflowVersionId: "workflow-123",
              initialCtx: {
                documentId: "doc-123",
                fileName: "test.pdf",
                fileType: "pdf",
              },
              configHash: computeConfigHash(graphConfig),
              runnerVersion: "1.0.0",
              groupId: "g-test",
              // Phase 4 (US-133): lineage id is `workflowConfig.id` from
              // `WorkflowService.getWorkflowVersionById`, which the test
              // fixture maps to the requested `workflowConfigId`.
              workflowLineageId: "workflow-123",
              // Change A: the trigger travels IN the workflow input too, so
              // the worker can gate the activity-output cache to Try runs.
              trigger: "api",
            },
          ],
          taskQueue: "ocr-processing",
          workflowId: "graph-doc-123",
        }),
      );
      // Doc-seeded search attributes are present, plus the Phase 4
      // visibility-query attributes (WorkflowLineageId / WorkflowVersionId)
      // that drive the cancel-in-flight + run-history + version-run-count
      // endpoints.
      const callArg = mockClient.workflow.start.mock.calls[0][1];
      expect(callArg.searchAttributes).toEqual({
        DocumentId: ["doc-123"],
        FileName: ["test.pdf"],
        FileType: ["pdf"],
        Status: ["ongoing_ocr"],
        WorkflowLineageId: ["workflow-123"],
        WorkflowVersionId: ["workflow-123"],
        // G-021: every start records what triggered it.
        RunTrigger: ["api"],
      });
      expect(callArg.memo.documentId).toBe("doc-123");
    });

    it("should start an ad-hoc graph workflow without a documentId", async () => {
      mockClient.workflow.start.mockResolvedValue(mockWorkflowHandle);

      const result = await service.startGraphWorkflow(
        undefined,
        "workflow-123",
        { customerId: "cust-001" },
        null,
        "try",
      );

      // The billing execution id is the runId (unique per attempt), for
      // ad-hoc starts exactly as for doc-mode starts.
      expect(result).toBe("run-id-456");

      const callArg = mockClient.workflow.start.mock.calls[0][1];
      // Ad-hoc workflow id prefix
      expect(callArg.workflowId).toMatch(/^graph-adhoc-/);
      // Only the caller's initialCtx is passed through; no doc seed keys
      expect(callArg.args[0].initialCtx).toEqual({ customerId: "cust-001" });
      expect(callArg.args[0].initialCtx).not.toHaveProperty("documentId");
      expect(callArg.args[0].initialCtx).not.toHaveProperty("blobKey");
      // Search attributes are minimal (no doc-seeded keys), but the
      // Phase 4 lineage + version attributes are always present so the
      // cancel-in-flight + run-history + version-run-count endpoints
      // can query visibility.
      expect(callArg.searchAttributes).toEqual({
        Status: ["ongoing_adhoc"],
        WorkflowLineageId: ["workflow-123"],
        WorkflowVersionId: ["workflow-123"],
        // G-021: every start records what triggered it.
        RunTrigger: ["try"],
      });
      // Memo omits the documentId key entirely
      expect(callArg.memo).not.toHaveProperty("documentId");
      expect(callArg.memo).toMatchObject({
        workflowConfigId: "workflow-123",
        runnerVersion: "1.0.0",
      });
    });

    it("includes workflowConfigOverrides and merged configHash when provided", async () => {
      mockClient.workflow.start.mockResolvedValue(mockWorkflowHandle);

      const overrides = { "ctx.modelId.defaultValue": "prebuilt-read" };
      const graphWithModel: GraphWorkflowConfig = {
        ...graphConfig,
        ctx: {
          ...graphConfig.ctx,
          modelId: { type: "string", defaultValue: "prebuilt-layout" },
        },
      };
      mockWorkflowService.getWorkflowVersionById.mockResolvedValue({
        id: "workflow-123",
        workflowVersionId: "workflow-123",
        slug: "graph-workflow",
        name: "Graph Workflow",
        description: "Test graph",
        actorId: "user-1",
        groupId: "g-test",
        config: graphWithModel,
        schemaVersion: "1.0",
        version: 1,
        configHash: computeConfigHash(graphWithModel),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.startGraphWorkflow(
        "doc-123",
        "workflow-123",
        { documentId: "doc-123" },
        "g-test",
        "api",
        overrides,
      );

      expect(mockClient.workflow.start).toHaveBeenCalledWith(
        "graphWorkflow",
        expect.objectContaining({
          args: [
            expect.objectContaining({
              workflowConfigOverrides: overrides,
              configHash: computeConfigHashWithOverrides(
                graphWithModel,
                overrides,
              ),
            }),
          ],
        }),
      );
    });

    it("should throw error if client not initialized", async () => {
      const newService = new TemporalClientService(
        configService,
        mockWorkflowService,
        mockAppLogger,
      );

      await expect(
        newService.startGraphWorkflow(
          "doc-123",
          "workflow-123",
          {},
          null,
          "api",
        ),
      ).rejects.toThrow("Temporal client not initialized");
    });

    it("should handle errors with enhanced messages", async () => {
      mockClient.workflow.start.mockRejectedValue(
        new Error("not found workflow type"),
      );

      await expect(
        service.startGraphWorkflow("doc-123", "workflow-123", {}, null, "api"),
      ).rejects.toThrow("Failed to start graph workflow");
    });
  });

  describe("getWorkflowStatus", () => {
    it("should get workflow status", async () => {
      mockWorkflowHandle.describe.mockResolvedValue({
        status: { name: "RUNNING" },
      });

      const result = await service.getWorkflowStatus("workflow-123");

      expect(result.status).toBe("RUNNING");
      expect(mockClient.workflow.getHandle).toHaveBeenCalledWith(
        "workflow-123",
      );
    });

    it("should return result if workflow is completed", async () => {
      mockWorkflowHandle.describe.mockResolvedValue({
        status: { name: "COMPLETED" },
      });
      mockWorkflowHandle.result.mockResolvedValue({ success: true });

      const result = await service.getWorkflowStatus("workflow-123");

      expect(result.status).toBe("COMPLETED");
      expect(result.result).toEqual({ success: true });
    });

    it("should throw error if client not initialized", async () => {
      const newService = new TemporalClientService(
        configService,
        mockWorkflowService,
        mockAppLogger,
      );

      await expect(
        newService.getWorkflowStatus("workflow-123"),
      ).rejects.toThrow("Temporal client not initialized");
    });
  });

  describe("isWorkflowRunning", () => {
    it("returns true when the execution is Running", async () => {
      mockWorkflowHandle.describe.mockResolvedValue({
        status: { name: "RUNNING" },
      });
      await expect(service.isWorkflowRunning("graph-1")).resolves.toBe(true);
    });

    it("returns false when the execution is closed", async () => {
      mockWorkflowHandle.describe.mockResolvedValue({
        status: { name: "FAILED" },
      });
      await expect(service.isWorkflowRunning("graph-1")).resolves.toBe(false);
    });

    it("returns false when no execution exists", async () => {
      const { WorkflowNotFoundError } = jest.requireMock("@temporalio/client");
      mockWorkflowHandle.describe.mockRejectedValue(
        new WorkflowNotFoundError("not found"),
      );
      await expect(service.isWorkflowRunning("graph-1")).resolves.toBe(false);
    });
  });

  describe("getWorkflowResult", () => {
    it("should get workflow result", async () => {
      mockWorkflowHandle.result.mockResolvedValue({ success: true });

      const result = await service.getWorkflowResult("workflow-123");

      expect(result).toEqual({ success: true });
      expect(mockWorkflowHandle.result).toHaveBeenCalled();
    });

    it("should throw error if client not initialized", async () => {
      const newService = new TemporalClientService(
        configService,
        mockWorkflowService,
        mockAppLogger,
      );

      await expect(
        newService.getWorkflowResult("workflow-123"),
      ).rejects.toThrow("Temporal client not initialized");
    });
  });

  describe("queryWorkflowStatus", () => {
    it("should query workflow status", async () => {
      const mockStatus = {
        currentStep: "processing",
        status: "running",
        retryCount: 1,
        maxRetries: 5,
      };
      mockWorkflowHandle.query.mockResolvedValue(mockStatus);

      const result = await service.queryWorkflowStatus("workflow-123");

      expect(result).toEqual(mockStatus);
      expect(mockWorkflowHandle.query).toHaveBeenCalledWith("getStatus");
    });

    it("should throw error if client not initialized", async () => {
      const newService = new TemporalClientService(
        configService,
        mockWorkflowService,
        mockAppLogger,
      );

      await expect(
        newService.queryWorkflowStatus("workflow-123"),
      ).rejects.toThrow("Temporal client not initialized");
    });
  });

  describe("queryWorkflowProgress", () => {
    it("should query workflow progress", async () => {
      const mockProgress = {
        retryCount: 2,
        maxRetries: 5,
        currentStep: "processing",
        progressPercentage: 40,
      };
      mockWorkflowHandle.query.mockResolvedValue(mockProgress);

      const result = await service.queryWorkflowProgress("workflow-123");

      expect(result).toEqual(mockProgress);
      expect(mockWorkflowHandle.query).toHaveBeenCalledWith("getProgress");
    });

    it("should throw error if client not initialized", async () => {
      const newService = new TemporalClientService(
        configService,
        mockWorkflowService,
        mockAppLogger,
      );

      await expect(
        newService.queryWorkflowProgress("workflow-123"),
      ).rejects.toThrow("Temporal client not initialized");
    });
  });

  describe("getRunInput (gzip payload decode — node-statuses 500 regression)", () => {
    // Encode a start-args object exactly as the client does on the wire:
    // PayloadConverter → GzipPayloadCodec. This is the shape `fetchHistory()`
    // returns, and the shape that previously broke `fromPayload` with
    // `ValueError: Unknown encoding: binary/gzip`.
    async function gzipStartHistory(startArgs: Record<string, unknown>) {
      const raw = defaultPayloadConverter.toPayload(startArgs);
      const [gzipped] = await temporalDataConverter.payloadCodecs[0].encode([
        raw,
      ]);
      return {
        events: [
          {
            workflowExecutionStartedEventAttributes: {
              input: { payloads: [gzipped] },
            },
          },
        ],
      };
    }

    it("decodes a gzip-encoded start payload into initialCtx + lineage id", async () => {
      mockWorkflowHandle.fetchHistory.mockResolvedValue(
        await gzipStartHistory({
          workflowVersionId: "wv-1",
          initialCtx: { documentId: "doc-1" },
          workflowLineageId: "lin-1",
        }),
      );

      const result = await service.getRunInput("graph-adhoc-1");

      expect(result).toEqual({
        initialCtx: { documentId: "doc-1" },
        workflowLineageId: "lin-1",
      });
    });

    it("returns null when the decoded start payload carries no initialCtx", async () => {
      mockWorkflowHandle.fetchHistory.mockResolvedValue(
        await gzipStartHistory({ workflowLineageId: "lin-1" }),
      );

      expect(await service.getRunInput("graph-adhoc-1")).toBeNull();
    });

    it("returns null when the run has no history events", async () => {
      mockWorkflowHandle.fetchHistory.mockResolvedValue({ events: [] });
      expect(await service.getRunInput("graph-adhoc-1")).toBeNull();
    });
  });

  describe("cancelWorkflow", () => {
    it("should cancel workflow gracefully by default", async () => {
      mockWorkflowHandle.signal.mockResolvedValue(undefined);

      await service.cancelWorkflow("workflow-123");

      expect(mockWorkflowHandle.signal).toHaveBeenCalledWith("cancel", {
        mode: "graceful",
      });
    });

    it("should cancel workflow immediately when specified", async () => {
      mockWorkflowHandle.signal.mockResolvedValue(undefined);

      await service.cancelWorkflow("workflow-123", "immediate");

      expect(mockWorkflowHandle.signal).toHaveBeenCalledWith("cancel", {
        mode: "immediate",
      });
    });

    it("should throw error if client not initialized", async () => {
      const newService = new TemporalClientService(
        configService,
        mockWorkflowService,
        mockAppLogger,
      );

      await expect(newService.cancelWorkflow("workflow-123")).rejects.toThrow(
        "Temporal client not initialized",
      );
    });
  });

  describe("deleteWorkflowExecution", () => {
    it("deletes the execution record via the workflow service", async () => {
      await service.deleteWorkflowExecution("workflow-123");

      expect(
        mockConnection.workflowService.deleteWorkflowExecution,
      ).toHaveBeenCalledWith({
        namespace: "default",
        workflowExecution: { workflowId: "workflow-123" },
      });
    });

    it("treats a NOT_FOUND response as success (idempotent)", async () => {
      mockConnection.workflowService.deleteWorkflowExecution.mockRejectedValueOnce(
        new Error("workflow execution not found"),
      );

      await expect(
        service.deleteWorkflowExecution("workflow-123"),
      ).resolves.toBeUndefined();
    });

    it("throws on other errors", async () => {
      mockConnection.workflowService.deleteWorkflowExecution.mockRejectedValueOnce(
        new Error("permission denied"),
      );

      await expect(
        service.deleteWorkflowExecution("workflow-123"),
      ).rejects.toThrow("delete Temporal execution workflow-123");
    });

    it("throws if the connection is not initialized", async () => {
      const newService = new TemporalClientService(
        configService,
        mockWorkflowService,
        mockAppLogger,
      );

      await expect(
        newService.deleteWorkflowExecution("workflow-123"),
      ).rejects.toThrow("Temporal client not initialized");
    });
  });

  describe("handleError", () => {
    it("should enhance error messages for connection errors", async () => {
      mockClient.workflow.start.mockRejectedValue(
        new Error("connection refused"),
      );

      await expect(
        service.startGraphWorkflow("doc-123", "workflow-123", {}, null, "api"),
      ).rejects.toThrow("Cannot connect to Temporal server");
    });

    it("should enhance error messages for timeout errors", async () => {
      mockClient.workflow.start.mockRejectedValue(
        new Error("deadline exceeded"),
      );

      await expect(
        service.startGraphWorkflow("doc-123", "workflow-123", {}, null, "api"),
      ).rejects.toThrow("Connection to Temporal server timed out");
    });

    it("should enhance error messages for workflow type errors", async () => {
      mockClient.workflow.start.mockRejectedValue(
        new Error("unknown workflow type"),
      );

      await expect(
        service.startGraphWorkflow("doc-123", "workflow-123", {}, null, "api"),
      ).rejects.toThrow("The Temporal worker may not be running");
    });
  });

  // ---------------------------------------------------------------------------
  // US-146 — listRunningInLineage + cancelRun helpers
  // ---------------------------------------------------------------------------
  describe("listRunningInLineage (US-146)", () => {
    function setListResults(executions: Array<{ workflowId: string }>): void {
      mockClient.workflow.list = jest.fn().mockImplementation(() => {
        // @temporalio/client returns an AsyncIterable — we mirror the
        // shape with a generator so the production `for await` loop
        // works unmodified.
        return {
          // eslint-disable-next-line @typescript-eslint/require-await
          [Symbol.asyncIterator]: async function* () {
            for (const item of executions) {
              yield item;
            }
          },
        };
      });
    }

    it("issues the WorkflowLineageId + ExecutionStatus visibility query and collects workflow ids", async () => {
      setListResults([
        { workflowId: "graph-adhoc-run-1" },
        { workflowId: "graph-adhoc-run-2" },
      ]);

      const result = await service.listRunningInLineage("lineage-abc");

      expect(mockClient.workflow.list).toHaveBeenCalledWith({
        query:
          'WorkflowLineageId = "lineage-abc" AND ExecutionStatus = "Running"',
      });
      expect(result).toEqual(["graph-adhoc-run-1", "graph-adhoc-run-2"]);
    });

    it("returns an empty array when visibility reports no running runs", async () => {
      setListResults([]);

      const result = await service.listRunningInLineage("empty-lin");

      expect(result).toEqual([]);
    });

    it("rejects lineage ids containing quote characters (query-injection guard)", async () => {
      await expect(service.listRunningInLineage('weird"id')).rejects.toThrow(
        /Invalid workflowLineageId/,
      );
    });
  });

  describe("cancelRun (US-146)", () => {
    it("calls .cancel() on the workflow handle", async () => {
      mockWorkflowHandle.cancel = jest.fn().mockResolvedValue(undefined);

      await service.cancelRun("graph-adhoc-run-x");

      expect(mockClient.workflow.getHandle).toHaveBeenCalledWith(
        "graph-adhoc-run-x",
      );
      expect(mockWorkflowHandle.cancel).toHaveBeenCalledTimes(1);
    });

    it("swallows already-completed errors as a race-tolerant no-op", async () => {
      mockWorkflowHandle.cancel = jest
        .fn()
        .mockRejectedValue(new Error("workflow execution already completed"));

      await expect(
        service.cancelRun("graph-adhoc-already-done"),
      ).resolves.toBeUndefined();
    });

    it("propagates non-completion errors (e.g. network) unmodified", async () => {
      mockWorkflowHandle.cancel = jest
        .fn()
        .mockRejectedValue(new Error("gRPC: connection reset"));

      await expect(service.cancelRun("graph-adhoc-net-err")).rejects.toThrow(
        /connection reset/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // G-021 — cancel-on-new-Try must only cancel Tries, never production runs
  // ---------------------------------------------------------------------------
  describe("RunTrigger (G-021)", () => {
    /**
     * Stands in for the Temporal visibility store: holds executions tagged
     * with their `RunTrigger` and answers `workflow.list({ query })` by
     * honouring the `RunTrigger = "<x>"` clause of the query the production
     * code builds. Filtering here (rather than hard-coding the result set) is
     * what makes "a production run is not in the cancel set" a real
     * assertion — the query string is the thing under test.
     */
    function seedVisibility(
      executions: Array<{ workflowId: string; runTrigger?: string }>,
    ): void {
      mockClient.workflow.list = jest
        .fn()
        .mockImplementation(({ query }: { query: string }) => {
          const triggerClause = /RunTrigger = "([^"]+)"/.exec(query);
          const matching = triggerClause
            ? executions.filter((e) => e.runTrigger === triggerClause[1])
            : executions;
          return {
            // eslint-disable-next-line @typescript-eslint/require-await
            [Symbol.asyncIterator]: async function* () {
              for (const item of matching) {
                yield { workflowId: item.workflowId };
              }
            },
          };
        });
    }

    it("registers RunTrigger as a search attribute on startup", () => {
      expect(
        mockConnection.operatorService.addSearchAttributes,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          searchAttributes: { RunTrigger: 2 },
        }),
      );
    });

    it("stamps RunTrigger on the search attributes at start (doc mode)", async () => {
      mockClient.workflow.start.mockResolvedValue(mockWorkflowHandle);

      await service.startGraphWorkflow(
        "doc-123",
        "workflow-123",
        { documentId: "doc-123" },
        "g-test",
        "api",
      );

      const callArg = mockClient.workflow.start.mock.calls[0][1];
      expect(callArg.searchAttributes.RunTrigger).toEqual(["api"]);
    });

    it("stamps RunTrigger on the search attributes at start (ad-hoc mode)", async () => {
      mockClient.workflow.start.mockResolvedValue(mockWorkflowHandle);

      await service.startGraphWorkflow(
        undefined,
        "workflow-123",
        {},
        null,
        "try",
      );

      const callArg = mockClient.workflow.start.mock.calls[0][1];
      expect(callArg.searchAttributes.RunTrigger).toEqual(["try"]);
    });

    it("only cancels runs explicitly marked as tries", async () => {
      seedVisibility([
        { workflowId: "graph-adhoc-try-1", runTrigger: "try" },
        { workflowId: "graph-adhoc-api-1", runTrigger: "api" },
        { workflowId: "graph-adhoc-try-2", runTrigger: "try" },
      ]);
      mockWorkflowHandle.cancel = jest.fn().mockResolvedValue(undefined);

      const result = await service.cancelInFlightTriesForLineage("lineage-abc");

      expect(mockClient.workflow.list).toHaveBeenCalledWith({
        query:
          'WorkflowLineageId = "lineage-abc" AND ExecutionStatus = "Running" AND RunTrigger = "try"',
      });
      expect(result.cancelledCount).toBe(2);
      const cancelledIds = (
        mockClient.workflow.getHandle as jest.Mock
      ).mock.calls.map((call: unknown[]) => call[0]);
      expect(cancelledIds).toEqual(["graph-adhoc-try-1", "graph-adhoc-try-2"]);
    });

    it("does not cancel a production run started via the API", async () => {
      seedVisibility([
        { workflowId: "graph-adhoc-api-1", runTrigger: "api" },
        { workflowId: "graph-adhoc-api-2", runTrigger: "api" },
      ]);
      mockWorkflowHandle.cancel = jest.fn().mockResolvedValue(undefined);

      const result = await service.cancelInFlightTriesForLineage("lineage-abc");

      expect(result.cancelledCount).toBe(0);
      expect(mockWorkflowHandle.cancel).not.toHaveBeenCalled();
    });

    it("leaves pre-migration runs that carry no RunTrigger alone", async () => {
      seedVisibility([{ workflowId: "graph-adhoc-legacy" }]);
      mockWorkflowHandle.cancel = jest.fn().mockResolvedValue(undefined);

      const result = await service.cancelInFlightTriesForLineage("lineage-abc");

      expect(result.cancelledCount).toBe(0);
      expect(mockWorkflowHandle.cancel).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Changes B/B+ — run history and the version run-count are editor surfaces:
  // every visibility query is scoped to RunTrigger = "try" so production runs
  // (and their document-bearing initialCtx) never reach the designer.
  // ---------------------------------------------------------------------------
  describe("Try-only visibility scoping (Changes B/B+)", () => {
    it("listRunsForWorkflow always includes the RunTrigger try clause", async () => {
      mockConnection.workflowService.listWorkflowExecutions = jest
        .fn()
        .mockResolvedValue({ executions: [], nextPageToken: new Uint8Array() });

      await service.listRunsForWorkflow({
        workflowLineageId: "lineage-abc",
        status: "Completed",
        pageSize: 20,
      });

      const { query } =
        mockConnection.workflowService.listWorkflowExecutions.mock.calls[0][0];
      expect(query).toContain('WorkflowLineageId = "lineage-abc"');
      expect(query).toContain('RunTrigger = "try"');
      expect(query).toContain('ExecutionStatus = "Completed"');
    });

    it("countRunsForVersion counts Try runs only, matching the drawer it badges", async () => {
      mockConnection.workflowService.countWorkflowExecutions = jest
        .fn()
        .mockResolvedValue({ count: 4 });

      const count = await service.countRunsForVersion("lineage-abc", "wv-1");

      expect(count).toBe(4);
      const { query } =
        mockConnection.workflowService.countWorkflowExecutions.mock.calls[0][0];
      expect(query).toContain('RunTrigger = "try"');
    });
  });

  // ---------------------------------------------------------------------------
  // Change C support — RunTrigger resolution off describe() for the per-run
  // editor endpoints' fail-closed Try gate.
  // ---------------------------------------------------------------------------
  describe("getRunTrigger + getRunWindow trigger (Change C)", () => {
    it("getRunTrigger reads the RunTrigger search attribute from describe()", async () => {
      mockWorkflowHandle.describe.mockResolvedValue({
        startTime: new Date("2026-08-01T00:00:00Z"),
        closeTime: null,
        searchAttributes: { RunTrigger: ["try"] },
      });
      await expect(service.getRunTrigger("run-1")).resolves.toBe("try");
    });

    it("getRunTrigger returns null when the attribute is absent (fail-closed input)", async () => {
      mockWorkflowHandle.describe.mockResolvedValue({
        startTime: new Date("2026-08-01T00:00:00Z"),
        closeTime: null,
        searchAttributes: {},
      });
      await expect(service.getRunTrigger("run-legacy")).resolves.toBeNull();
    });

    it("getRunWindow carries the trigger alongside the execution window", async () => {
      const startTime = new Date("2026-08-01T00:00:00Z");
      const closeTime = new Date("2026-08-01T00:05:00Z");
      mockWorkflowHandle.describe.mockResolvedValue({
        startTime,
        closeTime,
        searchAttributes: { RunTrigger: ["api"] },
      });
      await expect(service.getRunWindow("run-2")).resolves.toEqual({
        startedAt: startTime,
        endedAt: closeTime,
        trigger: "api",
      });
    });
  });
});

describe("extractRunTrigger", () => {
  it("accepts the array form Temporal's describe() returns", () => {
    expect(extractRunTrigger({ RunTrigger: ["try"] })).toBe("try");
    expect(extractRunTrigger({ RunTrigger: ["api"] })).toBe("api");
  });

  it("accepts the scalar form some server versions return", () => {
    expect(extractRunTrigger({ RunTrigger: "try" })).toBe("try");
  });

  it("returns null for absent, empty, unknown or malformed values", () => {
    expect(extractRunTrigger(undefined)).toBeNull();
    expect(extractRunTrigger(null)).toBeNull();
    expect(extractRunTrigger({})).toBeNull();
    expect(extractRunTrigger({ RunTrigger: [] })).toBeNull();
    expect(extractRunTrigger({ RunTrigger: ["something-else"] })).toBeNull();
    expect(extractRunTrigger({ RunTrigger: 7 })).toBeNull();
  });
});
