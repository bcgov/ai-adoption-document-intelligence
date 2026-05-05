import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { Client, Connection } from "@temporalio/client";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import type { GraphWorkflowConfig } from "../workflow/graph-workflow-types";
import { WorkflowService } from "../workflow/workflow.service";
import { TemporalClientService } from "./temporal-client.service";

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

// Mock Temporal client
jest.mock("@temporalio/client", () => {
  const mockWorkflowHandle = {
    workflowId: "workflow-123",
    describe: jest.fn(),
    result: jest.fn(),
    query: jest.fn(),
    signal: jest.fn(),
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
    Connection: {
      connect: jest.fn(() => Promise.resolve(mockConnection)),
    },
    Client: jest.fn(() => mockClient),
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
      describe: jest.fn(),
      result: jest.fn(),
      query: jest.fn(),
      signal: jest.fn(),
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
      );

      expect(result).toBe("workflow-123");
      expect(mockClient.workflow.start).toHaveBeenCalledWith(
        "graphWorkflow",
        expect.objectContaining({
          args: [
            {
              graph: graphConfig,
              initialCtx: {
                documentId: "doc-123",
                fileName: "test.pdf",
                fileType: "pdf",
              },
              configHash: expect.any(String),
              runnerVersion: "1.0.0",
              groupId: "g-test",
            },
          ],
          taskQueue: "ocr-processing",
          workflowId: "graph-doc-123",
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
        newService.startGraphWorkflow("doc-123", "workflow-123", {}, null),
      ).rejects.toThrow("Temporal client not initialized");
    });

    it("should handle errors with enhanced messages", async () => {
      mockClient.workflow.start.mockRejectedValue(
        new Error("not found workflow type"),
      );

      await expect(
        service.startGraphWorkflow("doc-123", "workflow-123", {}, null),
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

  describe("handleError", () => {
    it("should enhance error messages for connection errors", async () => {
      mockClient.workflow.start.mockRejectedValue(
        new Error("connection refused"),
      );

      await expect(
        service.startGraphWorkflow("doc-123", "workflow-123", {}, null),
      ).rejects.toThrow("Cannot connect to Temporal server");
    });

    it("should enhance error messages for timeout errors", async () => {
      mockClient.workflow.start.mockRejectedValue(
        new Error("deadline exceeded"),
      );

      await expect(
        service.startGraphWorkflow("doc-123", "workflow-123", {}, null),
      ).rejects.toThrow("Connection to Temporal server timed out");
    });

    it("should enhance error messages for workflow type errors", async () => {
      mockClient.workflow.start.mockRejectedValue(
        new Error("unknown workflow type"),
      );

      await expect(
        service.startGraphWorkflow("doc-123", "workflow-123", {}, null),
      ).rejects.toThrow("The Temporal worker may not be running");
    });
  });
});
