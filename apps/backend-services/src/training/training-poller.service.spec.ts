import { TrainingStatus } from "@generated/client";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { TrainingPollerService } from "./training-poller.service";

// Mock the Azure Document Intelligence module
jest.mock("@azure-rest/ai-document-intelligence", () => ({
  __esModule: true,
  default: jest.fn(),
  isUnexpected: jest.fn(),
}));

import DocumentIntelligence, {
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";

describe("TrainingPollerService", () => {
  let service: TrainingPollerService;
  let _mockDbService: jest.Mocked<DatabaseService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockAdminClient: any;
  let mockPrisma: any;

  const mockTrainingJob = {
    id: "job-1",
    project_id: "project-1",
    model_id: "model-123",
    operation_id: "operation-123",
    status: TrainingStatus.TRAINING,
    started_at: new Date(),
    completed_at: null,
    error_message: null,
    dataset_id: "dataset-1",
    build_mode: "template",
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    // Mock Prisma client
    mockPrisma = {
      trainingJob: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      trainedModel: {
        create: jest.fn(),
      },
    };

    // Mock DatabaseService with Prisma access
    const mockDb = {
      prisma: mockPrisma,
    };

    // Mock Azure client methods
    const mockGetOperation = jest.fn();
    const mockGetModel = jest.fn();

    mockAdminClient = {
      path: jest.fn((pathTemplate: string) => {
        if (pathTemplate.includes("/operations/")) {
          return {
            get: mockGetOperation,
          };
        } else if (pathTemplate.includes("/documentModels/")) {
          return {
            get: mockGetModel,
          };
        }
        return { get: jest.fn() };
      }),
    };

    // Mock DocumentIntelligence factory
    (DocumentIntelligence as jest.Mock).mockReturnValue(mockAdminClient);

    const mockConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          AZURE_DOCUMENT_INTELLIGENCE_TRAIN_ENDPOINT: "https://test.api.com",
          AZURE_DOCUMENT_INTELLIGENCE_API_KEY: "test-api-key",
          TRAINING_POLL_INTERVAL_SECONDS: 10,
          TRAINING_MAX_POLL_ATTEMPTS: 60,
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingPollerService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<TrainingPollerService>(TrainingPollerService);
    _mockDbService = module.get(DatabaseService);
    mockConfigService = module.get(ConfigService);
  });

  describe("constructor", () => {
    it("should initialize with Azure credentials", () => {
      expect(service).toBeDefined();
      expect(DocumentIntelligence).toHaveBeenCalled();
    });

    it("should handle missing Azure credentials", async () => {
      const mockConfigNoCredentials = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            TRAINING_POLL_INTERVAL_SECONDS: 10,
            TRAINING_MAX_POLL_ATTEMPTS: 60,
          };
          return config[key] ?? defaultValue;
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          TrainingPollerService,
          {
            provide: DatabaseService,
            useValue: { prisma: mockPrisma },
          },
          {
            provide: ConfigService,
            useValue: mockConfigNoCredentials,
          },
        ],
      }).compile();

      const serviceNoCredentials = module.get<TrainingPollerService>(
        TrainingPollerService,
      );
      expect(serviceNoCredentials).toBeDefined();
      // Should warn but not crash
    });
  });

  describe("pollActiveJobs", () => {
    it("should skip polling when admin client not configured", async () => {
      // Create service without credentials
      const mockConfigNoCredentials = {
        get: jest.fn(() => undefined),
      };

      const module = await Test.createTestingModule({
        providers: [
          TrainingPollerService,
          {
            provide: DatabaseService,
            useValue: { prisma: mockPrisma },
          },
          {
            provide: ConfigService,
            useValue: mockConfigNoCredentials,
          },
        ],
      }).compile();

      const serviceNoClient = module.get<TrainingPollerService>(
        TrainingPollerService,
      );

      await serviceNoClient.pollActiveJobs();

      expect(mockPrisma.trainingJob.findMany).not.toHaveBeenCalled();
    });

    it("should skip polling when no active jobs", async () => {
      mockPrisma.trainingJob.findMany.mockResolvedValueOnce([]);

      await service.pollActiveJobs();

      expect(mockPrisma.trainingJob.findMany).toHaveBeenCalledWith({
        where: {
          status: {
            in: [TrainingStatus.TRAINING, TrainingStatus.UPLOADED],
          },
        },
      });
    });

    it("should poll all active jobs", async () => {
      const jobs = [
        { ...mockTrainingJob, id: "job-1", operation_id: "op-1" },
        { ...mockTrainingJob, id: "job-2", operation_id: "op-2" },
      ];

      mockPrisma.trainingJob.findMany.mockResolvedValueOnce(jobs);
      mockPrisma.trainingJob.findUnique
        .mockResolvedValueOnce(jobs[0])
        .mockResolvedValueOnce(jobs[1]);

      const mockGetOperation = jest.fn().mockResolvedValue({
        status: 200,
        body: { status: "running" },
      });

      mockAdminClient.path.mockReturnValue({
        get: mockGetOperation,
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      await service.pollActiveJobs();

      expect(mockPrisma.trainingJob.findMany).toHaveBeenCalled();
      expect(mockPrisma.trainingJob.findUnique).toHaveBeenCalledTimes(2);
    });

    it("should handle errors gracefully", async () => {
      mockPrisma.trainingJob.findMany.mockRejectedValueOnce(
        new Error("Database error"),
      );

      await service.pollActiveJobs();

      // Should not throw
      expect(mockPrisma.trainingJob.findMany).toHaveBeenCalled();
    });

    it("should handle missing Prisma client", async () => {
      // Create service with db that has no prisma
      const mockDbNoPrisma = {} as any;

      const module = await Test.createTestingModule({
        providers: [
          TrainingPollerService,
          {
            provide: DatabaseService,
            useValue: mockDbNoPrisma,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const serviceNoPrisma = module.get<TrainingPollerService>(
        TrainingPollerService,
      );

      await serviceNoPrisma.pollActiveJobs();

      // Should not throw, just log error
    });
  });

  describe("pollTrainingStatus", () => {
    beforeEach(() => {
      mockPrisma.trainingJob.findUnique.mockResolvedValue(mockTrainingJob);
    });

    it("should handle job with no operation ID", async () => {
      await service["pollTrainingStatus"]("job-1", "model-1", "");

      expect(mockPrisma.trainingJob.update).not.toHaveBeenCalled();
    });

    it("should handle job not found", async () => {
      mockPrisma.trainingJob.findUnique.mockResolvedValueOnce(null);

      await service["pollTrainingStatus"]("non-existent", "model-1", "op-1");

      expect(mockPrisma.trainingJob.update).not.toHaveBeenCalled();
    });

    it("should timeout job after max attempts", async () => {
      const oldJob = {
        ...mockTrainingJob,
        started_at: new Date(Date.now() - 700 * 1000), // 700 seconds ago
      };

      mockPrisma.trainingJob.findUnique.mockResolvedValueOnce(oldJob);

      await service["pollTrainingStatus"]("job-1", "model-1", "operation-123");

      expect(mockPrisma.trainingJob.update).toHaveBeenCalledWith({
        where: { id: "job-1" },
        data: {
          status: TrainingStatus.FAILED,
          error_message: "Training timeout - exceeded maximum polling time",
          completed_at: expect.any(Date),
        },
      });
    });

    it("should handle operation not ready (404)", async () => {
      const mockGetOperation = jest.fn().mockResolvedValue({
        status: "404",
        body: {},
      });

      mockAdminClient.path.mockReturnValue({
        get: mockGetOperation,
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(true);

      await service["pollTrainingStatus"]("job-1", "model-1", "operation-123");

      expect(mockPrisma.trainingJob.update).not.toHaveBeenCalled();
    });

    it("should handle operation error", async () => {
      const mockGetOperation = jest.fn().mockResolvedValue({
        status: "500",
        body: {
          error: {
            message: "Azure error",
          },
        },
      });

      mockAdminClient.path.mockReturnValue({
        get: mockGetOperation,
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(true);

      await service["pollTrainingStatus"]("job-1", "model-1", "operation-123");

      expect(mockPrisma.trainingJob.update).toHaveBeenCalledWith({
        where: { id: "job-1" },
        data: {
          status: TrainingStatus.FAILED,
          error_message: expect.stringContaining("Azure error"),
          completed_at: expect.any(Date),
        },
      });
    });

    it("should handle notStarted status", async () => {
      const mockGetOperation = jest.fn().mockResolvedValue({
        status: 200,
        body: {
          status: "notStarted",
        },
      });

      mockAdminClient.path.mockReturnValue({
        get: mockGetOperation,
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      await service["pollTrainingStatus"]("job-1", "model-1", "operation-123");

      expect(mockPrisma.trainingJob.update).not.toHaveBeenCalled();
    });

    it("should handle running status", async () => {
      const mockGetOperation = jest.fn().mockResolvedValue({
        status: 200,
        body: {
          status: "running",
        },
      });

      mockAdminClient.path.mockReturnValue({
        get: mockGetOperation,
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      await service["pollTrainingStatus"]("job-1", "model-1", "operation-123");

      expect(mockPrisma.trainingJob.update).not.toHaveBeenCalled();
    });

    it("should handle failed status", async () => {
      const mockGetOperation = jest.fn().mockResolvedValue({
        status: 200,
        body: {
          status: "failed",
          error: {
            message: "Training failed",
          },
        },
      });

      mockAdminClient.path.mockReturnValue({
        get: mockGetOperation,
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      await service["pollTrainingStatus"]("job-1", "model-1", "operation-123");

      expect(mockPrisma.trainingJob.update).toHaveBeenCalledWith({
        where: { id: "job-1" },
        data: {
          status: TrainingStatus.FAILED,
          error_message: "Training failed: Training failed",
          completed_at: expect.any(Date),
        },
      });
    });

    it("should handle succeeded status with result", async () => {
      const mockGetOperation = jest.fn().mockResolvedValue({
        status: 200,
        body: {
          status: "succeeded",
          result: {
            docTypes: {
              "custom-model": {
                fieldSchema: {
                  field1: {},
                  field2: {},
                },
              },
            },
            description: "Test model",
          },
        },
      });

      mockAdminClient.path.mockReturnValue({
        get: mockGetOperation,
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      mockPrisma.trainingJob.update.mockResolvedValue(mockTrainingJob);
      mockPrisma.trainedModel.create.mockResolvedValue({
        id: "trained-1",
        model_id: "model-1",
      });

      await service["pollTrainingStatus"]("job-1", "model-1", "operation-123");

      expect(mockPrisma.trainingJob.update).toHaveBeenCalledWith({
        where: { id: "job-1" },
        data: {
          status: TrainingStatus.SUCCEEDED,
          completed_at: expect.any(Date),
        },
      });

      expect(mockPrisma.trainedModel.create).toHaveBeenCalledWith({
        data: {
          project_id: "project-1",
          training_job_id: "job-1",
          model_id: "model-1",
          description: "Test model",
          doc_types: expect.any(Object),
          field_count: 2,
        },
      });
    });

    it("should handle succeeded status without result by fetching model", async () => {
      const mockGetOperation = jest.fn().mockResolvedValue({
        status: 200,
        body: {
          status: "succeeded",
        },
      });

      const mockGetModel = jest.fn().mockResolvedValue({
        status: 200,
        body: {
          docTypes: {
            "custom-model": {
              fieldSchema: {
                field1: {},
                field2: {},
                field3: {},
              },
            },
          },
          description: "Fetched model",
        },
      });

      mockAdminClient.path.mockImplementation((pathTemplate: string) => {
        if (pathTemplate.includes("/operations/")) {
          return { get: mockGetOperation };
        } else if (pathTemplate.includes("/documentModels/")) {
          return { get: mockGetModel };
        }
        return { get: jest.fn() };
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      mockPrisma.trainingJob.update.mockResolvedValue(mockTrainingJob);
      mockPrisma.trainedModel.create.mockResolvedValue({
        id: "trained-1",
        model_id: "model-1",
      });

      await service["pollTrainingStatus"]("job-1", "model-1", "operation-123");

      expect(mockGetModel).toHaveBeenCalled();
      expect(mockPrisma.trainedModel.create).toHaveBeenCalledWith({
        data: {
          project_id: "project-1",
          training_job_id: "job-1",
          model_id: "model-1",
          description: "Fetched model",
          doc_types: expect.any(Object),
          field_count: 3,
        },
      });
    });

    it("should handle model fetch error when no result", async () => {
      const mockGetOperation = jest.fn().mockResolvedValue({
        status: 200,
        body: {
          status: "succeeded",
        },
      });

      const mockGetModel = jest.fn().mockResolvedValue({
        status: "500",
        body: {
          error: {
            message: "Model fetch error",
          },
        },
      });

      mockAdminClient.path.mockImplementation((pathTemplate: string) => {
        if (pathTemplate.includes("/operations/")) {
          return { get: mockGetOperation };
        } else if (pathTemplate.includes("/documentModels/")) {
          return { get: mockGetModel };
        }
        return { get: jest.fn() };
      });

      let callCount = 0;
      (isUnexpected as unknown as jest.Mock).mockImplementation(() => {
        callCount++;
        return callCount > 1; // First call (operation) = false, second call (model) = true
      });

      await service["pollTrainingStatus"]("job-1", "model-1", "operation-123");

      expect(mockPrisma.trainingJob.update).toHaveBeenCalledWith({
        where: { id: "job-1" },
        data: {
          status: TrainingStatus.FAILED,
          error_message: expect.stringContaining("Model fetch error"),
          completed_at: expect.any(Date),
        },
      });
    });

    it("should handle succeeded with no docTypes", async () => {
      const mockGetOperation = jest.fn().mockResolvedValue({
        status: 200,
        body: {
          status: "succeeded",
          result: {
            description: "Model without docTypes",
          },
        },
      });

      mockAdminClient.path.mockReturnValue({
        get: mockGetOperation,
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      mockPrisma.trainingJob.update.mockResolvedValue(mockTrainingJob);
      mockPrisma.trainedModel.create.mockResolvedValue({
        id: "trained-1",
        model_id: "model-1",
      });

      await service["pollTrainingStatus"]("job-1", "model-1", "operation-123");

      expect(mockPrisma.trainedModel.create).toHaveBeenCalledWith({
        data: {
          project_id: "project-1",
          training_job_id: "job-1",
          model_id: "model-1",
          description: "Model without docTypes",
          doc_types: {},
          field_count: 0,
        },
      });
    });
  });

  describe("pollJob", () => {
    it("should throw error when Prisma not available", async () => {
      const mockDbNoPrisma = {} as any;

      const module = await Test.createTestingModule({
        providers: [
          TrainingPollerService,
          {
            provide: DatabaseService,
            useValue: mockDbNoPrisma,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const serviceNoPrisma = module.get<TrainingPollerService>(
        TrainingPollerService,
      );

      await expect(serviceNoPrisma.pollJob("job-1")).rejects.toThrow(
        "Prisma client not available",
      );
    });

    it("should throw error when job not found", async () => {
      mockPrisma.trainingJob.findUnique.mockResolvedValueOnce(null);

      await expect(service.pollJob("non-existent")).rejects.toThrow(
        "Job non-existent not found",
      );
    });

    it("should poll job with TRAINING status", async () => {
      const job = {
        ...mockTrainingJob,
        status: TrainingStatus.TRAINING,
      };

      mockPrisma.trainingJob.findUnique
        .mockResolvedValueOnce(job)
        .mockResolvedValueOnce(job);

      const mockGetOperation = jest.fn().mockResolvedValue({
        status: 200,
        body: { status: "running" },
      });

      mockAdminClient.path.mockReturnValue({
        get: mockGetOperation,
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      await service.pollJob("job-1");

      expect(mockPrisma.trainingJob.findUnique).toHaveBeenCalledWith({
        where: { id: "job-1" },
      });
      expect(mockGetOperation).toHaveBeenCalled();
    });

    it("should poll job with UPLOADED status", async () => {
      const job = {
        ...mockTrainingJob,
        status: TrainingStatus.UPLOADED,
      };

      mockPrisma.trainingJob.findUnique
        .mockResolvedValueOnce(job)
        .mockResolvedValueOnce(job);

      const mockGetOperation = jest.fn().mockResolvedValue({
        status: 200,
        body: { status: "running" },
      });

      mockAdminClient.path.mockReturnValue({
        get: mockGetOperation,
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      await service.pollJob("job-1");

      expect(mockGetOperation).toHaveBeenCalled();
    });

    it("should skip polling for completed job", async () => {
      const job = {
        ...mockTrainingJob,
        status: TrainingStatus.SUCCEEDED,
      };

      mockPrisma.trainingJob.findUnique.mockResolvedValueOnce(job);

      await service.pollJob("job-1");

      expect(mockAdminClient.path).not.toHaveBeenCalled();
    });

    it("should skip polling for failed job", async () => {
      const job = {
        ...mockTrainingJob,
        status: TrainingStatus.FAILED,
      };

      mockPrisma.trainingJob.findUnique.mockResolvedValueOnce(job);

      await service.pollJob("job-1");

      expect(mockAdminClient.path).not.toHaveBeenCalled();
    });
  });
});
