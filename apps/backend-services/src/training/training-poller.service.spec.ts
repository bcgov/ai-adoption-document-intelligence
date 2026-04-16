import { TrainingStatus } from "@generated/client";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { TrainingDbService } from "./training-db.service";
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
  let mockTrainingDb: {
    createTrainingJob: jest.Mock;
    findTrainingJob: jest.Mock;
    findAllTrainingJobs: jest.Mock;
    findAllActiveTrainingJobs: jest.Mock;
    updateTrainingJob: jest.Mock;
    createTrainedModel: jest.Mock;
    findTrainedModelByModelId: jest.Mock;
    deleteTrainedModel: jest.Mock;
    findAllTrainedModels: jest.Mock;
  };
  let mockAdminClient: Record<string, jest.Mock>;

  const mockTemplateModel = {
    id: "tm-1",
    model_id: "model-123",
  };

  const mockTrainingJob = {
    id: "job-1",
    template_model_id: "tm-1",
    template_model: mockTemplateModel,
    operation_id: "operation-123",
    status: TrainingStatus.TRAINING,
    container_name: "training-project-1",
    sas_url: null,
    blob_count: null,
    started_at: new Date(),
    completed_at: null,
    error_message: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    // Mock TrainingDbService
    mockTrainingDb = {
      createTrainingJob: jest.fn(),
      findTrainingJob: jest.fn(),
      findAllTrainingJobs: jest.fn(),
      findAllActiveTrainingJobs: jest.fn(),
      updateTrainingJob: jest.fn(),
      createTrainedModel: jest.fn(),
      findTrainedModelByModelId: jest.fn(),
      deleteTrainedModel: jest.fn(),
      findAllTrainedModels: jest.fn(),
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
      get: jest.fn((key: string, defaultValue?: number) => {
        const config: Record<string, string | number> = {
          AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://test.api.com",
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
        { provide: AppLoggerService, useValue: mockAppLogger },
        {
          provide: TrainingDbService,
          useValue: mockTrainingDb,
        },
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<TrainingPollerService>(TrainingPollerService);
  });

  describe("constructor", () => {
    it("should initialize with Azure credentials", () => {
      expect(service).toBeDefined();
      expect(DocumentIntelligence).toHaveBeenCalled();
    });

    it("should handle missing Azure credentials", async () => {
      const mockConfigNoCredentials = {
        get: jest.fn((key: string, defaultValue?: number) => {
          const config: Record<string, number> = {
            TRAINING_POLL_INTERVAL_SECONDS: 10,
            TRAINING_MAX_POLL_ATTEMPTS: 60,
          };
          return config[key] ?? defaultValue;
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          TrainingPollerService,
          { provide: AppLoggerService, useValue: mockAppLogger },
          { provide: TrainingDbService, useValue: mockTrainingDb },
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
          { provide: AppLoggerService, useValue: mockAppLogger },
          {
            provide: TrainingDbService,
            useValue: mockTrainingDb,
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

      expect(mockTrainingDb.findAllActiveTrainingJobs).not.toHaveBeenCalled();
    });

    it("should skip polling when no active jobs", async () => {
      mockTrainingDb.findAllActiveTrainingJobs.mockResolvedValueOnce([]);

      await service.pollActiveJobs();

      expect(mockTrainingDb.findAllActiveTrainingJobs).toHaveBeenCalled();
    });

    it("should poll all active jobs", async () => {
      const jobs = [
        {
          ...mockTrainingJob,
          id: "job-1",
          operation_id: "op-1",
        },
        {
          ...mockTrainingJob,
          id: "job-2",
          operation_id: "op-2",
        },
      ];

      mockTrainingDb.findAllActiveTrainingJobs.mockResolvedValueOnce(jobs);
      mockTrainingDb.findTrainingJob
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

      expect(mockTrainingDb.findAllActiveTrainingJobs).toHaveBeenCalled();
      expect(mockTrainingDb.findTrainingJob).toHaveBeenCalledTimes(2);
    });

    it("should handle errors gracefully", async () => {
      mockTrainingDb.findAllActiveTrainingJobs.mockRejectedValueOnce(
        new Error("Database error"),
      );

      await service.pollActiveJobs();

      // Should not throw
      expect(mockTrainingDb.findAllActiveTrainingJobs).toHaveBeenCalled();
    });
  });

  describe("pollTrainingStatus", () => {
    beforeEach(() => {
      mockTrainingDb.findTrainingJob.mockResolvedValue(mockTrainingJob);
    });

    it("should handle job with no operation ID", async () => {
      await service["pollTrainingStatus"]("job-1", "model-1", "");

      expect(mockTrainingDb.updateTrainingJob).not.toHaveBeenCalled();
    });

    it("should handle job not found", async () => {
      mockTrainingDb.findTrainingJob.mockResolvedValueOnce(null);

      await service["pollTrainingStatus"]("non-existent", "model-1", "op-1");

      expect(mockTrainingDb.updateTrainingJob).not.toHaveBeenCalled();
    });

    it("should timeout job after max attempts", async () => {
      const oldJob = {
        ...mockTrainingJob,
        started_at: new Date(Date.now() - 700 * 1000), // 700 seconds ago
      };

      mockTrainingDb.findTrainingJob.mockResolvedValueOnce(oldJob);

      await service["pollTrainingStatus"](
        "job-1",
        "model-123",
        "operation-123",
      );

      expect(mockTrainingDb.updateTrainingJob).toHaveBeenCalledWith("job-1", {
        status: TrainingStatus.FAILED,
        error_message: "Training timeout - exceeded maximum polling time",
        completed_at: expect.any(Date),
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

      await service["pollTrainingStatus"](
        "job-1",
        "model-123",
        "operation-123",
      );

      expect(mockTrainingDb.updateTrainingJob).not.toHaveBeenCalled();
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

      await service["pollTrainingStatus"](
        "job-1",
        "model-123",
        "operation-123",
      );

      expect(mockTrainingDb.updateTrainingJob).toHaveBeenCalledWith("job-1", {
        status: TrainingStatus.FAILED,
        error_message: expect.stringContaining("Azure error"),
        completed_at: expect.any(Date),
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

      await service["pollTrainingStatus"](
        "job-1",
        "model-123",
        "operation-123",
      );

      expect(mockTrainingDb.updateTrainingJob).not.toHaveBeenCalled();
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

      await service["pollTrainingStatus"](
        "job-1",
        "model-123",
        "operation-123",
      );

      expect(mockTrainingDb.updateTrainingJob).not.toHaveBeenCalled();
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

      await service["pollTrainingStatus"](
        "job-1",
        "model-123",
        "operation-123",
      );

      expect(mockTrainingDb.updateTrainingJob).toHaveBeenCalledWith("job-1", {
        status: TrainingStatus.FAILED,
        error_message: "Training failed: Training failed",
        completed_at: expect.any(Date),
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

      mockTrainingDb.updateTrainingJob.mockResolvedValue(mockTrainingJob);
      mockTrainingDb.createTrainedModel.mockResolvedValue({
        id: "trained-1",
        model_id: "model-123",
      });

      await service["pollTrainingStatus"](
        "job-1",
        "model-123",
        "operation-123",
      );

      expect(mockTrainingDb.updateTrainingJob).toHaveBeenCalledWith("job-1", {
        status: TrainingStatus.SUCCEEDED,
        completed_at: expect.any(Date),
      });

      expect(mockTrainingDb.createTrainedModel).toHaveBeenCalledWith({
        template_model_id: "tm-1",
        training_job_id: "job-1",
        model_id: "model-123",
        description: "Test model",
        doc_types: expect.any(Object),
        field_count: 2,
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

      mockTrainingDb.updateTrainingJob.mockResolvedValue(mockTrainingJob);
      mockTrainingDb.createTrainedModel.mockResolvedValue({
        id: "trained-1",
        model_id: "model-123",
      });

      await service["pollTrainingStatus"](
        "job-1",
        "model-123",
        "operation-123",
      );

      expect(mockGetModel).toHaveBeenCalled();
      expect(mockTrainingDb.createTrainedModel).toHaveBeenCalledWith({
        template_model_id: "tm-1",
        training_job_id: "job-1",
        model_id: "model-123",
        description: "Fetched model",
        doc_types: expect.any(Object),
        field_count: 3,
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

      await service["pollTrainingStatus"](
        "job-1",
        "model-123",
        "operation-123",
      );

      expect(mockTrainingDb.updateTrainingJob).toHaveBeenCalledWith("job-1", {
        status: TrainingStatus.FAILED,
        error_message: expect.stringContaining("Model fetch error"),
        completed_at: expect.any(Date),
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

      mockTrainingDb.updateTrainingJob.mockResolvedValue(mockTrainingJob);
      mockTrainingDb.createTrainedModel.mockResolvedValue({
        id: "trained-1",
        model_id: "model-123",
      });

      await service["pollTrainingStatus"](
        "job-1",
        "model-123",
        "operation-123",
      );

      expect(mockTrainingDb.createTrainedModel).toHaveBeenCalledWith({
        template_model_id: "tm-1",
        training_job_id: "job-1",
        model_id: "model-123",
        description: "Model without docTypes",
        doc_types: {},
        field_count: 0,
      });
    });
  });

  describe("pollJob", () => {
    it("should throw error when job not found", async () => {
      mockTrainingDb.findTrainingJob.mockResolvedValueOnce(null);

      await expect(service.pollJob("non-existent")).rejects.toThrow(
        "Job non-existent not found",
      );
    });

    it("should poll job with TRAINING status", async () => {
      const job = {
        ...mockTrainingJob,
        status: TrainingStatus.TRAINING,
      };

      mockTrainingDb.findTrainingJob
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

      expect(mockTrainingDb.findTrainingJob).toHaveBeenCalledWith("job-1");
      expect(mockGetOperation).toHaveBeenCalled();
    });

    it("should poll job with UPLOADED status", async () => {
      const job = {
        ...mockTrainingJob,
        status: TrainingStatus.UPLOADED,
      };

      mockTrainingDb.findTrainingJob
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

      mockTrainingDb.findTrainingJob.mockResolvedValueOnce(job);

      await service.pollJob("job-1");

      expect(mockAdminClient.path).not.toHaveBeenCalled();
    });

    it("should skip polling for failed job", async () => {
      const job = {
        ...mockTrainingJob,
        status: TrainingStatus.FAILED,
      };

      mockTrainingDb.findTrainingJob.mockResolvedValueOnce(job);

      await service.pollJob("job-1");

      expect(mockAdminClient.path).not.toHaveBeenCalled();
    });
  });
});
