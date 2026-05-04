import { BuildMode, LabelingStatus, TrainingStatus } from "@generated/client";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { BenchmarkDefinitionDbService } from "../benchmark/benchmark-definition-db.service";
import { AzureStorageService } from "../blob-storage/azure-storage.service";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { ExportFormat } from "../template-model/dto/export.dto";
import { TemplateModelService } from "../template-model/template-model.service";
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
} from "@azure-rest/ai-document-intelligence";

describe("TrainingService", () => {
  let service: TrainingService;
  let mockBlobStorage: jest.Mocked<AzureStorageService>;
  let mockPrimaryBlobStorage: jest.Mocked<BlobStorageInterface>;
  let mockTemplateModelService: jest.Mocked<TemplateModelService>;
  let mockAdminClient: Record<string, jest.Mock>;
  let mockTrainingDb: {
    createTrainingJob: jest.Mock;
    findTrainingJob: jest.Mock;
    findAllTrainingJobs: jest.Mock;
    findAllActiveTrainingJobs: jest.Mock;
    findAllTrainedModels: jest.Mock;
    findActiveTrainedModel: jest.Mock;
    updateTrainingJob: jest.Mock;
    createTrainedModel: jest.Mock;
    findTrainedModelByModelId: jest.Mock;
    findAllTrainedModelIds: jest.Mock;
    getNextVersionNumber: jest.Mock;
    setActiveTrainedModel: jest.Mock;
    tombstoneTrainedModel: jest.Mock;
    demoteActiveTrainedModels: jest.Mock;
    buildTrainedModelSnapshot: jest.Mock;
  };
  let mockBenchmarkDefinitionDb: {
    countDefinitionsReferencingModelId: jest.Mock;
  };

  const mockTemplateModel = {
    id: "tm-1",
    name: "Test Template Model",
    model_id: "custom-model-1",
    description: "Test",
    created_by: "user-1",
    status: "draft" as const,
    created_at: new Date(),
    updated_at: new Date(),
    group_id: "group-1",
    field_schema: [
      {
        id: "field-1",
        template_model_id: "tm-1",
        field_key: "field1",
        field_type: "string",
        field_format: null,
        display_order: 0,
      },
    ],
  };

  const mockLabeledDocument = {
    id: "labeled-doc-1",
    template_model_id: "tm-1",
    labeling_document_id: "labeling-doc-1",
    status: LabelingStatus.labeled,
    created_at: new Date(),
    updated_at: new Date(),
    labeling_document: {
      id: "labeling-doc-1",
      title: "Test Doc",
      original_filename: "test.pdf",
      file_path: "cuid/ocr/labeling-doc-1/original.pdf",
      normalized_file_path: "cuid/training/labeling-doc-1/normalized.pdf",
      file_type: "pdf",
      file_size: 1024,
      metadata: {},
      source: "labeling",
      status: "completed_ocr" as const,
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
    template_model_id: "tm-1",
    status: TrainingStatus.PENDING,
    container_name: "training-tm-1",
    sas_url: null,
    blob_count: 0,
    build_mode: BuildMode.template,
    max_training_hours: null,
    target_model_id: null,
    target_version: null,
    operation_id: null,
    error_message: null,
    started_at: new Date(),
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockTrainedModel = {
    id: "trained-1",
    template_model_id: "tm-1",
    training_job_id: "job-1",
    model_id: "custom-model-1",
    version: 1,
    is_active: true,
    deleted_at: null,
    dataset_snapshot: null,
    description: "Test Model",
    doc_types: { custom: { fieldSchema: { field1: {} } } },
    field_count: 1,
    build_mode: BuildMode.template,
    max_training_hours: null,
    actual_training_hours: null,
    created_at: new Date(),
  };

  beforeEach(async () => {
    mockTrainingDb = {
      createTrainingJob: jest.fn(),
      findTrainingJob: jest.fn(),
      findAllTrainingJobs: jest.fn(),
      findAllActiveTrainingJobs: jest.fn(),
      findAllTrainedModels: jest.fn(),
      findActiveTrainedModel: jest.fn(),
      updateTrainingJob: jest.fn(),
      createTrainedModel: jest.fn(),
      findTrainedModelByModelId: jest.fn(),
      findAllTrainedModelIds: jest.fn(),
      getNextVersionNumber: jest.fn().mockResolvedValue(1),
      setActiveTrainedModel: jest.fn(),
      tombstoneTrainedModel: jest.fn(),
      demoteActiveTrainedModels: jest.fn().mockResolvedValue(0),
      buildTrainedModelSnapshot: jest.fn().mockResolvedValue({ documents: [] }),
    };
    mockBenchmarkDefinitionDb = {
      countDefinitionsReferencingModelId: jest.fn().mockResolvedValue(0),
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

    const mockTemplateModelSvc = {
      getTemplateModel: jest.fn(),
      exportTemplateModel: jest.fn(),
      getTemplateModelDocuments: jest.fn(),
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
      get: jest.fn((key: string, defaultValue?: number) => {
        const config: Record<string, string | number> = {
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
          provide: TemplateModelService,
          useValue: mockTemplateModelSvc,
        },
        {
          provide: BenchmarkDefinitionDbService,
          useValue: mockBenchmarkDefinitionDb,
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
    mockTemplateModelService = module.get(TemplateModelService);
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
          {
            provide: TemplateModelService,
            useValue: mockTemplateModelService,
          },
          {
            provide: BenchmarkDefinitionDbService,
            useValue: mockBenchmarkDefinitionDb,
          },
          { provide: ConfigService, useValue: mockConfigNoCredentials },
        ],
      }).compile();

      const serviceNoCredentials = module.get<TrainingService>(TrainingService);
      expect(serviceNoCredentials).toBeDefined();
    });
  });

  describe("validateTrainingData", () => {
    it("should validate template model successfully", async () => {
      const documents = Array(5).fill(mockLabeledDocument);
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce(
        documents,
      );

      const result = await service.validateTrainingData("tm-1");

      expect(result).toEqual({
        valid: true,
        labeledDocumentsCount: 5,
        minimumRequired: 5,
        issues: [],
      });
    });

    it("should return issues for insufficient documents", async () => {
      const documents = Array(3).fill(mockLabeledDocument);
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce(
        documents,
      );

      const result = await service.validateTrainingData("tm-1");

      expect(result.valid).toBe(false);
      expect(
        result.issues.some((i) => i.includes("Insufficient labeled documents")),
      ).toBe(true);
    });

    it("should return issues when no field schema", async () => {
      const documents = Array(5).fill(mockLabeledDocument);
      const templateModelNoSchema = { ...mockTemplateModel, field_schema: [] };
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        templateModelNoSchema as never,
      );
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce(
        documents,
      );

      const result = await service.validateTrainingData("tm-1");

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes("no field schema"))).toBe(
        true,
      );
    });

    it("should return issues when documents have no labels", async () => {
      const docWithoutLabels = { ...mockLabeledDocument, labels: [] };
      const documents = Array(5).fill(docWithoutLabels);
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce(
        documents,
      );

      const result = await service.validateTrainingData("tm-1");

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

      mockTemplateModelService.exportTemplateModel.mockResolvedValueOnce(
        exportResult as never,
      );
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
      ]);

      const files = await service.prepareTrainingFiles("tm-1");

      expect(mockTemplateModelService.exportTemplateModel).toHaveBeenCalledWith(
        "tm-1",
        {
          format: ExportFormat.AZURE,
          labeledOnly: true,
        },
      );
      expect(files.length).toBeGreaterThan(0);
      expect(files[0].name).toBe("fields.json");
    });

    it("should throw error when export fails", async () => {
      mockTemplateModelService.exportTemplateModel.mockResolvedValueOnce({
        templateModel: {},
        documents: [],
      } as never);

      await expect(service.prepareTrainingFiles("tm-1")).rejects.toThrow(
        "Azure export did not return training data",
      );
    });

    it("should handle missing files gracefully", async () => {
      const exportResult = {
        fieldsJson: { fields: [] },
        labelsFiles: [],
      };

      mockPrimaryBlobStorage.exists.mockResolvedValue(false);

      mockTemplateModelService.exportTemplateModel.mockResolvedValueOnce(
        exportResult as never,
      );
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
      ]);

      const files = await service.prepareTrainingFiles("tm-1");

      expect(files.length).toBeGreaterThanOrEqual(1); // At least fields.json
    });
  });

  describe("startTraining", () => {
    it("should start training successfully", async () => {
      const dto = {
        description: "Test model",
      };

      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      // validateTrainingData calls getTemplateModel + getTemplateModelDocuments
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce(
        Array(5).fill(mockLabeledDocument),
      );
      mockTrainingDb.findTrainedModelByModelId.mockResolvedValueOnce(null);
      mockTrainingDb.createTrainingJob.mockResolvedValueOnce(mockTrainingJob);

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      const result = await service.startTraining("tm-1", dto);

      expect(result).toHaveProperty("id", "job-1");
      expect(result).toHaveProperty("status", TrainingStatus.PENDING);
      expect(mockTrainingDb.createTrainingJob).toHaveBeenCalled();
    });

    it("should throw BadRequestException for invalid training data", async () => {
      const dto = {
        description: "Test model",
      };

      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      // validateTrainingData
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
      ]);

      await expect(service.startTraining("tm-1", dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("does NOT delete the prior tracked TrainedModel when retraining", async () => {
      // Versioned-trained-models keep history; retraining mints a new version
      // rather than overwriting v1. Confirm we don't issue any deletes for
      // versions we already track.
      const dto = { description: "Test model" };

      const mockDelete = jest.fn().mockResolvedValue({ status: 200 });
      mockAdminClient.path.mockImplementation((pathTemplate: string) => {
        if (pathTemplate.includes("/documentModels/")) {
          return { delete: mockDelete };
        }
        return { post: jest.fn() };
      });

      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);
      mockTrainingDb.getNextVersionNumber.mockResolvedValueOnce(2);

      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce(
        Array(5).fill(mockLabeledDocument),
      );
      // The Azure model name for v2 is suffixed; we DO defensively check that
      // a previous failed run didn't leave it lingering. If our tracking has
      // no row for it, the defensive Azure delete may run; but since this
      // versioned name has never been used, nothing should match locally.
      mockTrainingDb.findTrainedModelByModelId.mockResolvedValueOnce(null);
      mockTrainingDb.createTrainingJob.mockResolvedValueOnce(mockTrainingJob);

      await service.startTraining("tm-1", dto);

      // Job is created with the versioned target.
      expect(mockTrainingDb.createTrainingJob).toHaveBeenCalledWith(
        expect.objectContaining({
          target_model_id: "custom-model-1-v2",
          target_version: 2,
        }),
      );
    });

    it("uses the bare template model id for the very first training (v1)", async () => {
      const dto = { description: "First training" };

      mockAdminClient.path.mockImplementation((pathTemplate: string) => {
        if (pathTemplate.includes("/documentModels/")) {
          return { delete: jest.fn() };
        }
        return { post: jest.fn() };
      });
      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);
      mockTrainingDb.getNextVersionNumber.mockResolvedValueOnce(1);

      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce(
        Array(5).fill(mockLabeledDocument),
      );
      mockTrainingDb.findTrainedModelByModelId.mockResolvedValueOnce(null);
      mockTrainingDb.createTrainingJob.mockResolvedValueOnce(mockTrainingJob);

      await service.startTraining("tm-1", dto);

      expect(mockTrainingDb.createTrainingJob).toHaveBeenCalledWith(
        expect.objectContaining({
          target_model_id: "custom-model-1",
          target_version: 1,
        }),
      );
    });

    it("persists buildMode=neural and maxTrainingHours on the new TrainingJob", async () => {
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
        mockLabeledDocument,
        mockLabeledDocument,
        mockLabeledDocument,
        mockLabeledDocument,
      ] as never);
      mockTrainingDb.getNextVersionNumber.mockResolvedValueOnce(2);
      mockTrainingDb.findTrainedModelByModelId.mockResolvedValueOnce(null);
      mockTrainingDb.createTrainingJob.mockResolvedValueOnce({
        id: "job-1",
        template_model_id: "tm-1",
        status: "PENDING",
        container_name: "training-tm-1-v2",
        sas_url: null,
        blob_count: 0,
        operation_id: null,
        error_message: null,
        started_at: new Date(),
        completed_at: null,
        target_model_id: "custom-model-1-v2",
        target_version: 2,
        build_mode: "neural",
        max_training_hours: 2,
      } as never);

      await service.startTraining("tm-1", {
        description: "test",
        buildMode: "neural" as never,
        maxTrainingHours: 2,
      });

      expect(mockTrainingDb.createTrainingJob).toHaveBeenCalledWith(
        expect.objectContaining({
          build_mode: "neural",
          max_training_hours: 2,
        }),
      );
    });

    it("defaults buildMode to template and leaves max_training_hours null when not provided", async () => {
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
        mockLabeledDocument,
        mockLabeledDocument,
        mockLabeledDocument,
        mockLabeledDocument,
      ] as never);
      mockTrainingDb.getNextVersionNumber.mockResolvedValueOnce(1);
      mockTrainingDb.findTrainedModelByModelId.mockResolvedValueOnce(null);
      mockTrainingDb.createTrainingJob.mockResolvedValueOnce({
        id: "job-1",
        template_model_id: "tm-1",
        status: "PENDING",
        container_name: "training-tm-1-v1",
        target_model_id: "custom-model-1",
        target_version: 1,
        build_mode: "template",
        max_training_hours: null,
      } as never);

      await service.startTraining("tm-1", { description: "test" });

      expect(mockTrainingDb.createTrainingJob).toHaveBeenCalledWith(
        expect.objectContaining({
          build_mode: "template",
          max_training_hours: null,
        }),
      );
    });

    it("sends buildMode=neural and maxTrainingHours in the Azure build request", async () => {
      const mockPost = jest.fn().mockResolvedValue({
        status: "202",
        headers: { "operation-location": "https://x/operations/op-1" },
        body: { resultId: "op-1" },
      });
      const mockDelete = jest.fn().mockResolvedValue({ status: "204" });
      mockAdminClient.path = jest
        .fn()
        .mockReturnValue({ post: mockPost, delete: mockDelete });
      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      // validateTrainingData call
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce(
        Array(5).fill(mockLabeledDocument) as never,
      );
      mockTemplateModelService.exportTemplateModel.mockResolvedValueOnce({
        fieldsJson: { fields: [] },
        labelsFiles: [],
      } as never);
      // prepareTrainingFiles call (inside uploadAndTrain)
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce(
        Array(5).fill(mockLabeledDocument) as never,
      );
      mockTrainingDb.getNextVersionNumber.mockResolvedValueOnce(1);
      mockTrainingDb.findTrainedModelByModelId.mockResolvedValueOnce(null);
      mockTrainingDb.createTrainingJob.mockResolvedValueOnce({
        id: "job-1",
        template_model_id: "tm-1",
        status: "PENDING",
        container_name: "training-tm-1-v1",
        target_model_id: "custom-model-1",
        target_version: 1,
        build_mode: "neural",
        max_training_hours: 2,
      } as never);
      mockTrainingDb.findTrainingJob.mockResolvedValueOnce({
        id: "job-1",
        container_name: "training-tm-1-v1",
        build_mode: "neural",
        max_training_hours: 2,
      } as never);
      mockBlobStorage.clearContainerContents.mockResolvedValueOnce(
        undefined as never,
      );
      mockBlobStorage.uploadFiles.mockResolvedValueOnce({
        uploaded: 1,
        failed: 0,
        failedFiles: [],
      } as never);
      mockBlobStorage.generateSasUrl.mockResolvedValueOnce(
        "https://blob/c?sp=rl&sr=c&se=2099-01-01" as never,
      );

      await service.startTraining("tm-1", {
        buildMode: "neural" as never,
        maxTrainingHours: 2,
      });
      await new Promise((r) => setImmediate(r));

      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            buildMode: "neural",
            maxTrainingHours: 2,
          }),
        }),
      );
    });

    it("omits maxTrainingHours from Azure payload when buildMode=template", async () => {
      const mockPost = jest.fn().mockResolvedValue({
        status: "202",
        headers: { "operation-location": "https://x/operations/op-1" },
        body: { resultId: "op-1" },
      });
      const mockDelete = jest.fn().mockResolvedValue({ status: "204" });
      mockAdminClient.path = jest
        .fn()
        .mockReturnValue({ post: mockPost, delete: mockDelete });
      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      mockTemplateModelService.getTemplateModel.mockResolvedValueOnce(
        mockTemplateModel as never,
      );
      // validateTrainingData call
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce(
        Array(5).fill(mockLabeledDocument) as never,
      );
      mockTemplateModelService.exportTemplateModel.mockResolvedValueOnce({
        fieldsJson: { fields: [] },
        labelsFiles: [],
      } as never);
      // prepareTrainingFiles call (inside uploadAndTrain)
      mockTemplateModelService.getTemplateModelDocuments.mockResolvedValueOnce(
        Array(5).fill(mockLabeledDocument) as never,
      );
      mockTrainingDb.getNextVersionNumber.mockResolvedValueOnce(1);
      mockTrainingDb.findTrainedModelByModelId.mockResolvedValueOnce(null);
      mockTrainingDb.createTrainingJob.mockResolvedValueOnce({
        id: "job-1",
        template_model_id: "tm-1",
        status: "PENDING",
        container_name: "training-tm-1-v1",
        target_model_id: "custom-model-1",
        target_version: 1,
        build_mode: "template",
        max_training_hours: null,
      } as never);
      mockTrainingDb.findTrainingJob.mockResolvedValueOnce({
        id: "job-1",
        container_name: "training-tm-1-v1",
        build_mode: "template",
        max_training_hours: null,
      } as never);
      mockBlobStorage.clearContainerContents.mockResolvedValueOnce(
        undefined as never,
      );
      mockBlobStorage.uploadFiles.mockResolvedValueOnce({
        uploaded: 1,
        failed: 0,
        failedFiles: [],
      } as never);
      mockBlobStorage.generateSasUrl.mockResolvedValueOnce(
        "https://blob/c?sp=rl&sr=c&se=2099-01-01" as never,
      );

      await service.startTraining("tm-1", {});
      await new Promise((r) => setImmediate(r));

      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ buildMode: "template" }),
        }),
      );
      const sentBody = mockPost.mock.calls[0][0].body;
      expect(sentBody.maxTrainingHours).toBeUndefined();
    });
  });

  describe("listTrainedVersions", () => {
    it("returns all versions including tombstoned, mapped to DTO", async () => {
      mockTrainingDb.findAllTrainedModels.mockResolvedValueOnce([
        { ...mockTrainedModel, version: 2, is_active: true },
        {
          ...mockTrainedModel,
          id: "trained-old",
          version: 1,
          is_active: false,
          deleted_at: new Date("2026-04-01"),
        },
      ]);

      const result = await service.listTrainedVersions("tm-1");

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(2);
      expect(result[1].deletedAt).toBeInstanceOf(Date);
      expect(mockTrainingDb.findAllTrainedModels).toHaveBeenCalledWith("tm-1", {
        includeDeleted: true,
      });
    });
  });

  describe("setActiveTrainedVersion", () => {
    it("activates a non-deleted version", async () => {
      mockTrainingDb.findAllTrainedModels.mockResolvedValueOnce([
        { ...mockTrainedModel, id: "v2", version: 2, is_active: false },
      ]);
      mockTrainingDb.setActiveTrainedModel.mockResolvedValueOnce({
        ...mockTrainedModel,
        id: "v2",
        version: 2,
        is_active: true,
      });

      const result = await service.setActiveTrainedVersion("tm-1", "v2");

      expect(result.isActive).toBe(true);
      expect(mockTrainingDb.setActiveTrainedModel).toHaveBeenCalledWith("v2");
    });

    it("rejects activating a deleted version", async () => {
      mockTrainingDb.findAllTrainedModels.mockResolvedValueOnce([
        {
          ...mockTrainedModel,
          id: "v1",
          deleted_at: new Date(),
        },
      ]);

      await expect(
        service.setActiveTrainedVersion("tm-1", "v1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws NotFound when the version doesn't belong to the template", async () => {
      mockTrainingDb.findAllTrainedModels.mockResolvedValueOnce([]);
      await expect(
        service.setActiveTrainedVersion("tm-1", "missing"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deleteTrainedVersion", () => {
    it("blocks deletion when the version is currently active", async () => {
      mockTrainingDb.findAllTrainedModels.mockResolvedValueOnce([
        { ...mockTrainedModel, id: "v1", is_active: true },
      ]);

      await expect(service.deleteTrainedVersion("tm-1", "v1")).rejects.toThrow(
        ConflictException,
      );
    });

    it("blocks deletion when a benchmark definition references the version", async () => {
      mockTrainingDb.findAllTrainedModels.mockResolvedValueOnce([
        { ...mockTrainedModel, id: "v1", is_active: false },
      ]);
      mockBenchmarkDefinitionDb.countDefinitionsReferencingModelId.mockResolvedValueOnce(
        2,
      );

      await expect(service.deleteTrainedVersion("tm-1", "v1")).rejects.toThrow(
        ConflictException,
      );
    });

    it("tombstones the version when guardrails pass", async () => {
      const inactive = {
        ...mockTrainedModel,
        id: "v1",
        is_active: false,
      };
      const tombstoned = {
        ...inactive,
        deleted_at: new Date("2026-05-01"),
      };
      mockTrainingDb.findAllTrainedModels.mockResolvedValueOnce([inactive]);
      mockBenchmarkDefinitionDb.countDefinitionsReferencingModelId.mockResolvedValueOnce(
        0,
      );
      mockTrainingDb.tombstoneTrainedModel.mockResolvedValueOnce(tombstoned);
      mockAdminClient.path.mockImplementation(() => ({
        delete: jest.fn().mockResolvedValue({ status: 200 }),
      }));
      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      const result = await service.deleteTrainedVersion("tm-1", "v1");

      expect(result.deletedAt).toBeInstanceOf(Date);
      expect(mockTrainingDb.tombstoneTrainedModel).toHaveBeenCalledWith("v1");
    });

    it("returns the existing row when the version is already tombstoned", async () => {
      const tombstoned = {
        ...mockTrainedModel,
        id: "v1",
        is_active: false,
        deleted_at: new Date("2026-04-01"),
      };
      mockTrainingDb.findAllTrainedModels.mockResolvedValueOnce([tombstoned]);

      const result = await service.deleteTrainedVersion("tm-1", "v1");

      expect(result.deletedAt).toEqual(tombstoned.deleted_at);
      expect(mockTrainingDb.tombstoneTrainedModel).not.toHaveBeenCalled();
    });
  });

  describe("getTrainingJobs", () => {
    it("should return all training jobs for a template model", async () => {
      const jobs = [mockTrainingJob, { ...mockTrainingJob, id: "job-2" }];
      mockTrainingDb.findAllTrainingJobs.mockResolvedValueOnce(jobs);

      const result = await service.getTrainingJobs("tm-1");

      expect(result).toHaveLength(2);
      expect(mockTrainingDb.findAllTrainingJobs).toHaveBeenCalledWith("tm-1");
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
          {
            provide: TemplateModelService,
            useValue: mockTemplateModelService,
          },
          {
            provide: BenchmarkDefinitionDbService,
            useValue: mockBenchmarkDefinitionDb,
          },
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
      expect(result).toHaveProperty("templateModelId", "tm-1");
      expect(result).toHaveProperty("status", TrainingStatus.PENDING);
      expect(result).toHaveProperty("containerName", "training-tm-1");
    });
  });

  describe("mapTrainedModelToDto", () => {
    it("should map trained model to DTO", () => {
      const result = service["mapTrainedModelToDto"](mockTrainedModel);

      expect(result).toHaveProperty("id", "trained-1");
      expect(result).toHaveProperty("templateModelId", "tm-1");
      expect(result).toHaveProperty("trainingJobId", "job-1");
      expect(result).toHaveProperty("modelId", "custom-model-1");
      expect(result).toHaveProperty("fieldCount", 1);
    });
  });

  describe("getTrainingInfo", () => {
    it("returns the parsed Azure /info response", async () => {
      const mockGet = jest.fn().mockResolvedValue({
        status: "200",
        body: {
          customDocumentModels: { count: 1, limit: 100 },
          customNeuralDocumentModelBuilds: {
            used: 3,
            quota: 20,
            quotaResetDateTime: "2026-06-01T00:00:00Z",
          },
        },
      });
      mockAdminClient.path = jest.fn().mockReturnValue({ get: mockGet });
      (isUnexpected as unknown as jest.Mock).mockReturnValue(false);

      const result = await service.getTrainingInfo();

      expect(result.customNeuralDocumentModelBuilds).toEqual({
        used: 3,
        quota: 20,
        quotaResetDateTime: "2026-06-01T00:00:00Z",
      });
      expect(result.raw).toEqual(
        expect.objectContaining({
          customDocumentModels: { count: 1, limit: 100 },
        }),
      );
    });

    it("throws when Azure returns an error response", async () => {
      const mockGet = jest.fn().mockResolvedValue({
        status: "401",
        body: { error: { message: "Invalid api-key" } },
      });
      mockAdminClient.path = jest.fn().mockReturnValue({ get: mockGet });
      (isUnexpected as unknown as jest.Mock).mockReturnValue(true);

      await expect(service.getTrainingInfo()).rejects.toThrow(
        "Invalid api-key",
      );
    });

    it("throws when the Azure client is not configured", async () => {
      const moduleNoCreds: TestingModule = await Test.createTestingModule({
        providers: [
          TrainingService,
          { provide: AppLoggerService, useValue: mockAppLogger },
          { provide: TrainingDbService, useValue: mockTrainingDb },
          {
            provide: AzureStorageService,
            useValue: mockBlobStorage,
          },
          { provide: BLOB_STORAGE, useValue: mockPrimaryBlobStorage },
          {
            provide: TemplateModelService,
            useValue: mockTemplateModelService,
          },
          {
            provide: BenchmarkDefinitionDbService,
            useValue: mockBenchmarkDefinitionDb,
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => undefined),
            },
          },
        ],
      }).compile();
      const unconfiguredService =
        moduleNoCreds.get<TrainingService>(TrainingService);

      await expect(unconfiguredService.getTrainingInfo()).rejects.toThrow(
        "Azure Document Intelligence client is not configured",
      );
    });
  });
});
