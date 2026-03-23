import {
  DocumentStatus,
  LabelingStatus,
  ProjectStatus,
  TrainingStatus,
} from "@generated/client";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { AzureStorageService } from "../blob-storage/azure-storage.service";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { ExportFormat } from "../labeling/dto/export.dto";
import { LabelingService } from "../labeling/labeling.service";
import { TrainingService } from "./training.service";
import { TrainingDbService } from "./training-db.service";

// Mock Azure Document Intelligence
jest.mock("@azure-rest/ai-document-intelligence", () => ({
  __esModule: true,
  default: jest.fn(),
  isUnexpected: jest.fn(),
  parseResultIdFromResponse: jest.fn(),
}));

import DocumentIntelligence, {
  isUnexpected,
  parseResultIdFromResponse,
} from "@azure-rest/ai-document-intelligence";

describe("TrainingService", () => {
  let service: TrainingService;
  let mockBlobStorage: jest.Mocked<AzureStorageService>;
  let mockPrimaryBlobStorage: jest.Mocked<BlobStorageInterface>;
  let mockLabelingService: jest.Mocked<LabelingService>;
  let mockAdminClient: any;
  let mockTrainingDb: {
    createTrainingJob: jest.Mock;
    findTrainingJob: jest.Mock;
    findAllTrainingJobs: jest.Mock;
    findAllActiveTrainingJobs: jest.Mock;
    findAllTrainedModels: jest.Mock;
    updateTrainingJob: jest.Mock;
    createTrainedModel: jest.Mock;
    findTrainedModelByModelId: jest.Mock;
    deleteTrainedModel: jest.Mock;
  };

  const mockProject = {
    id: "project-1",
    name: "Test Project",
    description: "Test",
    created_by: "user-1",
    status: ProjectStatus.active,
    created_at: new Date(),
    updated_at: new Date(),
    field_schema: [
      {
        id: "field-1",
        field_key: "field1",
        field_type: "string",
        field_format: null,
        display_order: 0,
        project_id: "project-1",
      },
    ],
  };

  const mockLabeledDocument = {
    id: "labeled-doc-1",
    project_id: "project-1",
    labeling_document_id: "labeling-doc-1",
    status: LabelingStatus.labeled,
    created_at: new Date(),
    updated_at: new Date(),
    labeling_document: {
      id: "labeling-doc-1",
      title: "Test Doc",
      original_filename: "test.pdf",
      file_path: "labeling-documents/labeling-doc-1/original.pdf",
      file_type: "pdf",
      file_size: 1024,
      metadata: {},
      source: "labeling",
      status: DocumentStatus.completed_ocr,
      created_at: new Date(),
      updated_at: new Date(),
      apim_request_id: null,
      model_id: "prebuilt-layout",
      ocr_result: { analyzeResult: { content: "test" } },
      group_id: "group-1",
    },
    labels: [
      {
        id: "label-1",
        labeled_doc_id: "labeled-doc-1",
        field_key: "field1",
        label_name: "field1",
        value: "value1",
        page_number: 1,
        bounding_box: { polygon: [0, 0, 1, 0, 1, 1, 0, 1] },
        created_at: new Date(),
      },
    ],
  };

  const mockTrainingJob = {
    id: "job-1",
    project_id: "project-1",
    status: TrainingStatus.PENDING,
    container_name: "training-project-1",
    sas_url: null,
    blob_count: null,
    model_id: "custom-model-1",
    operation_id: null,
    error_message: null,
    started_at: new Date(),
    completed_at: null,
    build_mode: "template",
    dataset_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockTrainedModel = {
    id: "trained-1",
    project_id: "project-1",
    training_job_id: "job-1",
    model_id: "custom-model-1",
    description: "Test Model",
    doc_types: { custom: { fieldSchema: { field1: {} } } },
    field_count: 1,
    created_at: new Date(),
  };

  beforeEach(async () => {
    mockTrainingDb = {
      createTrainingJob: jest.fn(),
      findTrainingJob: jest.fn(),
      findAllTrainingJobs: jest.fn(),
      findAllActiveTrainingJobs: jest.fn(),
      findAllTrainedModels: jest.fn(),
      updateTrainingJob: jest.fn(),
      createTrainedModel: jest.fn(),
      findTrainedModelByModelId: jest.fn(),
      deleteTrainedModel: jest.fn(),
    };

    const mockBlob = {
      uploadFiles: jest.fn(),
      generateSasUrl: jest.fn(),
      clearContainerContents: jest.fn(),
    };

    const mockPrimaryBlob = {
      write: jest.fn(),
      read: jest.fn().mockResolvedValue(Buffer.from("test")),
      exists: jest.fn().mockResolvedValue(true),
      delete: jest.fn(),
      list: jest.fn().mockResolvedValue([]),
      deleteByPrefix: jest.fn(),
    };

    const mockLabeling = {
      exportProject: jest.fn(),
      getProject: jest.fn(),
      getProjectDocuments: jest.fn(),
    };

    const mockDeleteModel = jest.fn();
    const mockBuildModel = jest.fn();

    mockAdminClient = {
      path: jest.fn((pathTemplate: string) => {
        if (pathTemplate.includes("/documentModels:build")) {
          return { post: mockBuildModel };
        } else if (pathTemplate.includes("/documentModels/")) {
          return { delete: mockDeleteModel };
        }
        return {};
      }),
    };

    (DocumentIntelligence as jest.Mock).mockReturnValue(mockAdminClient);

    const mockConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://test.api.com",
          AZURE_DOCUMENT_INTELLIGENCE_API_KEY: "test-api-key",
          TRAINING_MIN_DOCUMENTS: 5,
          TRAINING_SAS_EXPIRY_DAYS: 7,
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingService,
        { provide: AppLoggerService, useValue: mockAppLogger },
        {
          provide: TrainingDbService,
          useValue: mockTrainingDb,
        },
        {
          provide: AzureStorageService,
          useValue: mockBlob,
        },
        {
          provide: BLOB_STORAGE,
          useValue: mockPrimaryBlob,
        },
        {
          provide: LabelingService,
          useValue: mockLabeling,
        },
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<TrainingService>(TrainingService);
    mockBlobStorage = module.get(AzureStorageService);
    mockPrimaryBlobStorage = module.get(BLOB_STORAGE);
    mockLabelingService = module.get(LabelingService);
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
            TRAINING_MIN_DOCUMENTS: 5,
            TRAINING_SAS_EXPIRY_DAYS: 7,
          };
          return config[key] ?? defaultValue;
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          TrainingService,
          { provide: AppLoggerService, useValue: mockAppLogger },
          { provide: TrainingDbService, useValue: mockTrainingDb },
          { provide: AzureStorageService, useValue: mockBlobStorage },
          { provide: BLOB_STORAGE, useValue: mockPrimaryBlobStorage },
          { provide: LabelingService, useValue: mockLabelingService },
          { provide: ConfigService, useValue: mockConfigNoCredentials },
        ],
      }).compile();

      const serviceNoCredentials = module.get<TrainingService>(TrainingService);
      expect(serviceNoCredentials).toBeDefined();
    });
  });

  describe("validateTrainingData", () => {
    it("should validate project successfully", async () => {
      const documents = Array(5).fill(mockLabeledDocument);
      mockLabelingService.getProject.mockResolvedValueOnce(mockProject as any);
      mockLabelingService.getProjectDocuments.mockResolvedValueOnce(documents);

      const result = await service.validateTrainingData("project-1");

      expect(result).toEqual({
        valid: true,
        labeledDocumentsCount: 5,
        minimumRequired: 5,
        issues: [],
      });
    });

    it("should throw NotFoundException when project not found", async () => {
      mockLabelingService.getProject.mockRejectedValueOnce(
        new NotFoundException("Project not found"),
      );

      await expect(
        service.validateTrainingData("non-existent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should return issues for insufficient documents", async () => {
      const documents = Array(3).fill(mockLabeledDocument);
      mockLabelingService.getProject.mockResolvedValueOnce(mockProject as any);
      mockLabelingService.getProjectDocuments.mockResolvedValueOnce(documents);

      const result = await service.validateTrainingData("project-1");

      expect(result.valid).toBe(false);
      expect(
        result.issues.some((i) => i.includes("Insufficient labeled documents")),
      ).toBe(true);
    });

    it("should return issues when no field schema", async () => {
      const projectNoSchema = { ...mockProject, field_schema: [] };
      const documents = Array(5).fill(mockLabeledDocument);
      mockLabelingService.getProject.mockResolvedValueOnce(
        projectNoSchema as any,
      );
      mockLabelingService.getProjectDocuments.mockResolvedValueOnce(documents);

      const result = await service.validateTrainingData("project-1");

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes("no field schema"))).toBe(
        true,
      );
    });

    it("should return issues when documents have no labels", async () => {
      const docWithoutLabels = { ...mockLabeledDocument, labels: [] };
      const documents = Array(5).fill(docWithoutLabels);
      mockLabelingService.getProject.mockResolvedValueOnce(mockProject as any);
      mockLabelingService.getProjectDocuments.mockResolvedValueOnce(documents);

      const result = await service.validateTrainingData("project-1");

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes("have no labels"))).toBe(
        true,
      );
    });
  });

  describe("prepareTrainingFiles", () => {
    it("should prepare training files successfully", async () => {
      const exportResult = {
        fieldsJson: { fields: [{ fieldKey: "field1", fieldType: "string" }] },
        labelsFiles: [
          {
            filename: "test.pdf.labels.json",
            content: { document: "test.pdf", labels: [] },
          },
        ],
      };

      mockLabelingService.exportProject.mockResolvedValueOnce(
        exportResult as any,
      );
      mockLabelingService.getProjectDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
      ]);

      const files = await service.prepareTrainingFiles("project-1");

      expect(mockLabelingService.exportProject).toHaveBeenCalledWith(
        "project-1",
        {
          format: ExportFormat.AZURE,
          labeledOnly: true,
        },
      );
      expect(files.length).toBeGreaterThan(0);
      expect(files[0].name).toBe("fields.json");
    });

    it("should throw error when export fails", async () => {
      mockLabelingService.exportProject.mockResolvedValueOnce({
        project: {},
        documents: [],
      } as any);

      await expect(service.prepareTrainingFiles("project-1")).rejects.toThrow(
        "Azure export did not return training data",
      );
    });

    it("should handle missing files gracefully", async () => {
      const exportResult = {
        fieldsJson: { fields: [] },
        labelsFiles: [],
      };

      mockPrimaryBlobStorage.exists.mockResolvedValue(false);

      mockLabelingService.exportProject.mockResolvedValueOnce(
        exportResult as any,
      );
      mockLabelingService.getProjectDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
      ]);

      const files = await service.prepareTrainingFiles("project-1");

      expect(files.length).toBeGreaterThanOrEqual(1); // At least fields.json
    });
  });

  describe("startTraining", () => {
    it("should start training successfully", async () => {
      const dto = {
        modelId: "custom-model-1",
        description: "Test model",
      };

      mockLabelingService.getProject.mockResolvedValueOnce(mockProject as any);
      mockLabelingService.getProjectDocuments.mockResolvedValueOnce(
        Array(5).fill(mockLabeledDocument),
      );
      mockTrainingDb.findTrainedModelByModelId.mockResolvedValueOnce(null);
      mockTrainingDb.createTrainingJob.mockResolvedValueOnce(mockTrainingJob);

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      const result = await service.startTraining("project-1", dto, "user-1");

      expect(result).toHaveProperty("id", "job-1");
      expect(result).toHaveProperty("status", TrainingStatus.PENDING);
      expect(mockTrainingDb.createTrainingJob).toHaveBeenCalled();
    });

    it("should throw BadRequestException for invalid training data", async () => {
      const dto = {
        modelId: "custom-model-1",
        description: "Test model",
      };

      mockLabelingService.getProject.mockResolvedValueOnce(mockProject as any);
      mockLabelingService.getProjectDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
      ]);

      await expect(
        service.startTraining("project-1", dto, "user-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should delete existing model before training", async () => {
      const dto = {
        modelId: "custom-model-1",
        description: "Test model",
      };

      const mockDelete = jest.fn().mockResolvedValue({ status: 200 });
      mockAdminClient.path.mockImplementation((pathTemplate: string) => {
        if (pathTemplate.includes("/documentModels/")) {
          return { delete: mockDelete };
        }
        return { post: jest.fn() };
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      mockLabelingService.getProject.mockResolvedValueOnce(mockProject as any);
      mockLabelingService.getProjectDocuments.mockResolvedValueOnce(
        Array(5).fill(mockLabeledDocument),
      );
      mockTrainingDb.findTrainedModelByModelId.mockResolvedValueOnce(
        mockTrainedModel,
      );
      mockTrainingDb.deleteTrainedModel.mockResolvedValueOnce(mockTrainedModel);
      mockTrainingDb.createTrainingJob.mockResolvedValueOnce(mockTrainingJob);

      await service.startTraining("project-1", dto, "user-1");

      expect(mockDelete).toHaveBeenCalled();
      expect(mockTrainingDb.deleteTrainedModel).toHaveBeenCalled();
    });
  });

  describe("getTrainingJobs", () => {
    it("should return all training jobs for a project", async () => {
      const jobs = [mockTrainingJob, { ...mockTrainingJob, id: "job-2" }];
      mockTrainingDb.findAllTrainingJobs.mockResolvedValueOnce(jobs);

      const result = await service.getTrainingJobs("project-1");

      expect(result).toHaveLength(2);
      expect(mockTrainingDb.findAllTrainingJobs).toHaveBeenCalledWith(
        "project-1",
      );
    });
  });

  describe("getTrainingJob", () => {
    it("should return a specific training job", async () => {
      mockTrainingDb.findTrainingJob.mockResolvedValueOnce(mockTrainingJob);

      const result = await service.getTrainingJob("job-1");

      expect(result).toHaveProperty("id", "job-1");
      expect(mockTrainingDb.findTrainingJob).toHaveBeenCalledWith("job-1");
    });

    it("should throw NotFoundException when job not found", async () => {
      mockTrainingDb.findTrainingJob.mockResolvedValueOnce(null);

      await expect(service.getTrainingJob("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getTrainedModels", () => {
    it("should return all trained models for a project", async () => {
      const models = [mockTrainedModel, { ...mockTrainedModel, id: "model-2" }];
      mockTrainingDb.findAllTrainedModels.mockResolvedValueOnce(models);

      const result = await service.getTrainedModels("project-1");

      expect(result).toHaveLength(2);
      expect(mockTrainingDb.findAllTrainedModels).toHaveBeenCalledWith(
        "project-1",
      );
    });
  });

  describe("cancelTrainingJob", () => {
    it("should cancel a pending job", async () => {
      mockTrainingDb.findTrainingJob.mockResolvedValueOnce(mockTrainingJob);
      mockTrainingDb.updateTrainingJob.mockResolvedValueOnce({
        ...mockTrainingJob,
        status: TrainingStatus.FAILED,
      });

      await service.cancelTrainingJob("job-1");

      expect(mockTrainingDb.updateTrainingJob).toHaveBeenCalledWith("job-1", {
        status: TrainingStatus.FAILED,
        error_message: "Cancelled by user",
        completed_at: expect.any(Date),
      });
    });

    it("should throw NotFoundException when job not found", async () => {
      mockTrainingDb.findTrainingJob.mockResolvedValueOnce(null);

      await expect(service.cancelTrainingJob("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException for completed job", async () => {
      const completedJob = {
        ...mockTrainingJob,
        status: TrainingStatus.SUCCEEDED,
      };
      mockTrainingDb.findTrainingJob.mockResolvedValueOnce(completedJob);

      await expect(service.cancelTrainingJob("job-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException for failed job", async () => {
      const failedJob = { ...mockTrainingJob, status: TrainingStatus.FAILED };
      mockTrainingDb.findTrainingJob.mockResolvedValueOnce(failedJob);

      await expect(service.cancelTrainingJob("job-1")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("deleteModelIfExists", () => {
    it("should delete existing model", async () => {
      const mockDelete = jest.fn().mockResolvedValue({ status: 200 });
      mockAdminClient.path.mockReturnValue({ delete: mockDelete });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      await service["deleteModelIfExists"]("model-1");

      expect(mockDelete).toHaveBeenCalled();
    });

    it("should handle model not found (404)", async () => {
      const mockDelete = jest.fn().mockResolvedValue({ status: "404" });
      mockAdminClient.path.mockReturnValue({ delete: mockDelete });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(true);

      await service["deleteModelIfExists"]("model-1");

      // Should not throw
      expect(mockDelete).toHaveBeenCalled();
    });

    it("should throw error for other failures", async () => {
      const mockDelete = jest.fn().mockResolvedValue({
        status: "500",
        body: { error: { message: "Server error" } },
      });
      mockAdminClient.path.mockReturnValue({ delete: mockDelete });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(true);

      await expect(service["deleteModelIfExists"]("model-1")).rejects.toThrow(
        "Server error",
      );
    });

    it("should skip deletion when admin client not configured", async () => {
      const mockConfigNoCredentials = {
        get: jest.fn(() => undefined),
      };

      const module = await Test.createTestingModule({
        providers: [
          TrainingService,
          { provide: AppLoggerService, useValue: mockAppLogger },
          { provide: TrainingDbService, useValue: mockTrainingDb },
          { provide: AzureStorageService, useValue: mockBlobStorage },
          { provide: BLOB_STORAGE, useValue: mockPrimaryBlobStorage },
          { provide: LabelingService, useValue: mockLabelingService },
          { provide: ConfigService, useValue: mockConfigNoCredentials },
        ],
      }).compile();

      const serviceNoClient = module.get<TrainingService>(TrainingService);

      await serviceNoClient["deleteModelIfExists"]("model-1");

      // Should not throw
    });
  });

  describe("extractOperationIdFromLocation", () => {
    it("should extract operation ID from URL", () => {
      const url =
        "https://test.api.com/documentintelligence/operations/operation-123";

      const result = service["extractOperationIdFromLocation"](url);

      expect(result).toBe("operation-123");
    });

    it("should handle invalid URL", () => {
      const result = service["extractOperationIdFromLocation"]("invalid-url");

      expect(result).toBeUndefined();
    });
  });

  describe("mapTrainingJobToDto", () => {
    it("should map training job to DTO", () => {
      const result = service["mapTrainingJobToDto"](mockTrainingJob);

      expect(result).toHaveProperty("id", "job-1");
      expect(result).toHaveProperty("projectId", "project-1");
      expect(result).toHaveProperty("status", TrainingStatus.PENDING);
      expect(result).toHaveProperty("containerName", "training-project-1");
      expect(result).toHaveProperty("modelId", "custom-model-1");
    });
  });

  describe("mapTrainedModelToDto", () => {
    it("should map trained model to DTO", () => {
      const result = service["mapTrainedModelToDto"](mockTrainedModel);

      expect(result).toHaveProperty("id", "trained-1");
      expect(result).toHaveProperty("projectId", "project-1");
      expect(result).toHaveProperty("trainingJobId", "job-1");
      expect(result).toHaveProperty("modelId", "custom-model-1");
      expect(result).toHaveProperty("fieldCount", 1);
    });
  });
});
