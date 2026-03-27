import {
  CorrectionAction,
  DocumentStatus,
  GroundTruthJobStatus,
  ReviewStatus,
} from "@generated/client";

const mockGroundTruthJobDbService = {
  findVersionForValidation: jest.fn(),
  findWorkflow: jest.fn(),
  findExistingJobs: jest.fn(),
  createManyJobs: jest.fn(),
  findVersionForProcessing: jest.fn(),
  findPendingJobs: jest.fn(),
  findJob: jest.fn(),
  findJobByDocumentId: jest.fn(),
  findJobWithVersionAndDocument: jest.fn(),
  findWorkflowConfig: jest.fn(),
  updateJob: jest.fn(),
  updateManyJobs: jest.fn(),
  findJobs: jest.fn(),
  countJobs: jest.fn(),
  findJobsForReviewQueue: jest.fn(),
  findProcessingJobsWithDocumentStatus: jest.fn(),
  syncProcessingJobStatuses: jest.fn(),
};

jest.mock("@prisma/adapter-pg", () => ({
  PrismaPg: jest.fn(),
}));

jest.mock("@generated/client", () => {
  return {
    PrismaClient: jest.fn(() => ({})),
    GroundTruthJobStatus: {
      pending: "pending",
      processing: "processing",
      awaiting_review: "awaiting_review",
      completed: "completed",
      failed: "failed",
    },
    DocumentStatus: {
      pre_ocr: "pre_ocr",
      ongoing_ocr: "ongoing_ocr",
      completed_ocr: "completed_ocr",
      failed: "failed",
    },
    ReviewStatus: {
      in_progress: "in_progress",
      approved: "approved",
      escalated: "escalated",
      skipped: "skipped",
    },
    CorrectionAction: {
      confirmed: "confirmed",
      corrected: "corrected",
      flagged: "flagged",
      deleted: "deleted",
    },
    Prisma: {
      PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
        code: string;
        constructor(message: string, args: { code: string }) {
          super(message);
          this.code = args.code;
        }
      },
    },
  };
});

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import { DocumentService } from "@/document/document.service";
import { OcrService } from "@/ocr/ocr.service";
import { GroundTruthGenerationService } from "./ground-truth-generation.service";
import { GroundTruthJobDbService } from "./ground-truth-job-db.service";
import { HitlDatasetService } from "./hitl-dataset.service";

const mockBlobStorage: BlobStorageInterface = {
  write: jest.fn().mockResolvedValue(undefined),
  read: jest.fn().mockResolvedValue(Buffer.from("{}")),
  exists: jest.fn().mockResolvedValue(true),
  delete: jest.fn().mockResolvedValue(undefined),
  list: jest.fn().mockResolvedValue([]),
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
};

const mockDocumentService = {
  createDocument: jest.fn(),
};

const mockOcrService = {
  requestOcr: jest.fn(),
};

const mockHitlDatasetService = {
  buildGroundTruth: jest.fn(),
};

const sampleManifest = {
  schemaVersion: "1.0",
  samples: [
    {
      id: "doc-001",
      inputs: [{ path: "inputs/doc-001.pdf", mimeType: "application/pdf" }],
      groundTruth: [],
    },
    {
      id: "doc-002",
      inputs: [{ path: "inputs/doc-002.png", mimeType: "image/png" }],
      groundTruth: [{ path: "ground-truth/doc-002.json", format: "json" }],
    },
    {
      id: "doc-003",
      inputs: [{ path: "inputs/doc-003.pdf", mimeType: "application/pdf" }],
      groundTruth: [],
    },
  ],
};

describe("GroundTruthGenerationService", () => {
  let service: GroundTruthGenerationService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroundTruthGenerationService,
        {
          provide: GroundTruthJobDbService,
          useValue: mockGroundTruthJobDbService,
        },
        {
          provide: DocumentService,
          useValue: mockDocumentService,
        },
        {
          provide: OcrService,
          useValue: mockOcrService,
        },
        {
          provide: HitlDatasetService,
          useValue: mockHitlDatasetService,
        },
        {
          provide: BLOB_STORAGE,
          useValue: mockBlobStorage,
        },
      ],
    }).compile();

    service = module.get<GroundTruthGenerationService>(
      GroundTruthGenerationService,
    );
  });

  describe("startGeneration", () => {
    const datasetId = "dataset-1";
    const versionId = "version-1";
    const workflowConfigId = "workflow-1";

    it("should throw NotFoundException if version not found", async () => {
      mockGroundTruthJobDbService.findVersionForValidation.mockResolvedValue(
        null,
      );

      await expect(
        service.startGeneration(datasetId, versionId, workflowConfigId),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if version is frozen", async () => {
      mockGroundTruthJobDbService.findVersionForValidation.mockResolvedValue({
        id: versionId,
        frozen: true,
        storagePrefix: "datasets/dataset-1/version-1",
      });

      await expect(
        service.startGeneration(datasetId, versionId, workflowConfigId),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if version has no files uploaded", async () => {
      mockGroundTruthJobDbService.findVersionForValidation.mockResolvedValue({
        id: versionId,
        frozen: false,
        storagePrefix: null,
      });

      await expect(
        service.startGeneration(datasetId, versionId, workflowConfigId),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException if workflow config not found", async () => {
      mockGroundTruthJobDbService.findVersionForValidation.mockResolvedValue({
        id: versionId,
        frozen: false,
        storagePrefix: "datasets/dataset-1/version-1",
      });
      mockGroundTruthJobDbService.findWorkflow.mockResolvedValue(null);

      await expect(
        service.startGeneration(datasetId, versionId, workflowConfigId),
      ).rejects.toThrow(NotFoundException);
    });

    it("should create jobs only for samples without ground truth", async () => {
      mockGroundTruthJobDbService.findVersionForValidation.mockResolvedValue({
        id: versionId,
        datasetId,
        frozen: false,
        storagePrefix: "datasets/dataset-1/version-1",
        dataset: { group_id: "test-group" },
      });
      mockGroundTruthJobDbService.findWorkflow.mockResolvedValue({
        id: workflowConfigId,
      });
      (mockBlobStorage.read as jest.Mock).mockResolvedValue(
        Buffer.from(JSON.stringify(sampleManifest)),
      );
      mockGroundTruthJobDbService.findExistingJobs.mockResolvedValue([]);

      const createdJob1 = {
        id: "job-1",
        sampleId: "doc-001",
        status: GroundTruthJobStatus.pending,
      };
      const createdJob2 = {
        id: "job-2",
        sampleId: "doc-003",
        status: GroundTruthJobStatus.pending,
      };
      mockGroundTruthJobDbService.createManyJobs.mockResolvedValue([
        createdJob1,
        createdJob2,
      ]);

      // Short-circuit background processing
      mockGroundTruthJobDbService.findVersionForProcessing.mockResolvedValue(
        null,
      );

      const result = await service.startGeneration(
        datasetId,
        versionId,
        workflowConfigId,
      );

      expect(result.jobCount).toBe(2);
      expect(result.message).toContain("2 samples");
      expect(mockGroundTruthJobDbService.createManyJobs).toHaveBeenCalledTimes(
        1,
      );
      const createArg =
        mockGroundTruthJobDbService.createManyJobs.mock.calls[0][0];
      expect(createArg).toHaveLength(2);
    });

    it("should throw BadRequestException if all samples have ground truth", async () => {
      const allWithGt = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "doc-001",
            inputs: [
              { path: "inputs/doc-001.pdf", mimeType: "application/pdf" },
            ],
            groundTruth: [
              { path: "ground-truth/doc-001.json", format: "json" },
            ],
          },
        ],
      };

      mockGroundTruthJobDbService.findVersionForValidation.mockResolvedValue({
        id: versionId,
        frozen: false,
        storagePrefix: "datasets/dataset-1/version-1",
      });
      mockGroundTruthJobDbService.findWorkflow.mockResolvedValue({
        id: workflowConfigId,
      });
      (mockBlobStorage.read as jest.Mock).mockResolvedValue(
        Buffer.from(JSON.stringify(allWithGt)),
      );

      await expect(
        service.startGeneration(datasetId, versionId, workflowConfigId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("getJobs", () => {
    it("should return paginated jobs list", async () => {
      const mockJobs = [
        {
          id: "job-1",
          datasetVersionId: "v-1",
          sampleId: "doc-001",
          documentId: "doc-id-1",
          workflowConfigId: "wf-1",
          temporalWorkflowId: "temporal-1",
          status: GroundTruthJobStatus.processing,
          groundTruthPath: null,
          error: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // syncJobStatuses - no processing jobs
      mockGroundTruthJobDbService.syncProcessingJobStatuses.mockResolvedValue(
        undefined,
      );
      mockGroundTruthJobDbService.findJobs.mockResolvedValue(mockJobs);

      mockGroundTruthJobDbService.countJobs.mockResolvedValue(1);

      const result = await service.getJobs("dataset-1", "v-1", 1, 50);

      expect(result.jobs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.jobs[0].sampleId).toBe("doc-001");
    });
  });

  describe("getReviewQueue", () => {
    it("should return awaiting_review documents with OCR results", async () => {
      const mockJobsWithDocs = [
        {
          id: "job-1",
          sampleId: "doc-001",
          status: GroundTruthJobStatus.awaiting_review,
          document: {
            id: "doc-id-1",
            original_filename: "doc-001.pdf",
            status: DocumentStatus.completed_ocr,
            model_id: "prebuilt-layout",
            created_at: new Date(),
            updated_at: new Date(),
            ocr_result: {
              keyValuePairs: {
                field1: { content: "value1", confidence: 0.95 },
              },
            },
            review_sessions: [],
          },
        },
      ];

      // syncJobStatuses
      mockGroundTruthJobDbService.syncProcessingJobStatuses.mockResolvedValue(
        undefined,
      );
      mockGroundTruthJobDbService.findJobsForReviewQueue.mockResolvedValue(
        mockJobsWithDocs,
      );

      mockGroundTruthJobDbService.countJobs.mockResolvedValue(1);

      const result = await service.getReviewQueue("dataset-1", "v-1", {});

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].sampleId).toBe("doc-001");
      expect(result.documents[0].ocr_result).toBeDefined();
      expect(result.total).toBe(1);
    });
  });

  describe("getReviewStats", () => {
    it("should return correct stats", async () => {
      // syncJobStatuses
      mockGroundTruthJobDbService.syncProcessingJobStatuses.mockResolvedValue(
        undefined,
      );

      mockGroundTruthJobDbService.countJobs
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3) // awaiting_review
        .mockResolvedValueOnce(5) // completed
        .mockResolvedValueOnce(2); // failed

      const result = await service.getReviewStats("dataset-1", "v-1");

      expect(result.totalDocuments).toBe(10);
      expect(result.awaitingReview).toBe(3);
      expect(result.completed).toBe(5);
      expect(result.failed).toBe(2);
    });
  });

  describe("completeJob", () => {
    it("should build ground truth and write to storage", async () => {
      const job = {
        id: "job-1",
        datasetVersionId: "v-1",
        sampleId: "doc-001",
        documentId: "doc-id-1",
        workflowConfigId: "wf-1",
        status: GroundTruthJobStatus.awaiting_review,
        datasetVersion: {
          datasetId: "dataset-1",
          storagePrefix: "datasets/dataset-1/v-1",
        },
        document: {
          ocr_result: {
            keyValuePairs: {
              Name: { content: "John", confidence: 0.95, type: "string" },
              Date: { content: "2026-01-01", confidence: 0.8, type: "date" },
            },
          },
        },
      };

      const corrections = [
        {
          field_key: "Date",
          original_value: "2026-01-01",
          corrected_value: "2026-01-15",
          action: CorrectionAction.corrected,
        },
      ];

      mockGroundTruthJobDbService.findJobWithVersionAndDocument.mockResolvedValue(
        job,
      );
      mockHitlDatasetService.buildGroundTruth.mockReturnValue({
        Name: "John",
        Date: "2026-01-15",
      });

      // Mock manifest read for updateManifestWithGroundTruth
      (mockBlobStorage.read as jest.Mock).mockResolvedValue(
        Buffer.from(
          JSON.stringify({
            schemaVersion: "1.0",
            samples: [
              {
                id: "doc-001",
                inputs: [
                  { path: "inputs/doc-001.pdf", mimeType: "application/pdf" },
                ],
                groundTruth: [],
              },
            ],
          }),
        ),
      );

      mockGroundTruthJobDbService.updateJob.mockResolvedValue({
        ...job,
        status: GroundTruthJobStatus.completed,
      });

      await service.completeJob("job-1", "session-1", corrections as any);

      // Should build ground truth
      expect(mockHitlDatasetService.buildGroundTruth).toHaveBeenCalledWith(
        job.document.ocr_result.keyValuePairs,
        corrections,
      );

      // Should write ground truth JSON
      expect(mockBlobStorage.write).toHaveBeenCalledWith(
        "datasets/dataset-1/v-1/ground-truth/doc-001.json",
        expect.any(Buffer),
      );

      // Should update manifest
      expect(mockBlobStorage.write).toHaveBeenCalledWith(
        "datasets/dataset-1/v-1/dataset-manifest.json",
        expect.any(Buffer),
      );

      // Should update job status to completed
      expect(mockGroundTruthJobDbService.updateJob).toHaveBeenCalledWith(
        "job-1",
        {
          status: GroundTruthJobStatus.completed,
          groundTruthPath: "datasets/dataset-1/v-1/ground-truth/doc-001.json",
        },
      );
    });

    it("should throw NotFoundException if job not found", async () => {
      mockGroundTruthJobDbService.findJobWithVersionAndDocument.mockResolvedValue(
        null,
      );

      await expect(
        service.completeJob("nonexistent", "session-1", []),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getJobByDocumentId", () => {
    it("should return job for given document ID", async () => {
      const mockJob = {
        id: "job-1",
        documentId: "doc-id-1",
        sampleId: "doc-001",
      };
      mockGroundTruthJobDbService.findJobByDocumentId.mockResolvedValue(
        mockJob,
      );

      const result = await service.getJobByDocumentId("doc-id-1");

      expect(result).toEqual(mockJob);
      expect(
        mockGroundTruthJobDbService.findJobByDocumentId,
      ).toHaveBeenCalledWith("doc-id-1");
    });

    it("should return null if no job found", async () => {
      mockGroundTruthJobDbService.findJobByDocumentId.mockResolvedValue(null);

      const result = await service.getJobByDocumentId("nonexistent");

      expect(result).toBeNull();
    });
  });
});
