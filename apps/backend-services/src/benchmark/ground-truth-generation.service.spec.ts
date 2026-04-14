import {
  CorrectionAction,
  DocumentStatus,
  GroundTruthJobStatus,
} from "@generated/client";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import { DocumentService } from "@/document/document.service";
import { PdfNormalizationService } from "@/document/pdf-normalization.service";
import { ReviewDbService } from "@/hitl/review-db.service";
import { OcrService } from "@/ocr/ocr.service";
import { TemporalClientService } from "@/temporal/temporal-client.service";
import { GroundTruthGenerationService } from "./ground-truth-generation.service";
import { GroundTruthJobDbService } from "./ground-truth-job-db.service";
import { HitlDatasetService } from "./hitl-dataset.service";

const mockJobDb = {
  findVersionForValidation: jest.fn(),
  findVersionForProcessing: jest.fn(),
  findWorkflow: jest.fn(),
  findWorkflowConfig: jest.fn(),
  findStaleJobs: jest.fn(),
  deleteJobsByIds: jest.fn(),
  findCompletedJobSampleIds: jest.fn(),
  createManyJobs: jest.fn(),
  findPendingJobs: jest.fn(),
  findJob: jest.fn(),
  findJobByDocumentId: jest.fn(),
  findJobWithVersionAndDocument: jest.fn(),
  findJobs: jest.fn(),
  findJobsForReviewQueue: jest.fn(),
  countJobs: jest.fn(),
  updateJob: jest.fn(),
  updateManyJobs: jest.fn(),
  findProcessingJobsWithDocumentStatus: jest.fn(),
  syncProcessingJobStatuses: jest.fn(),
  findExistingJobs: jest.fn(),
};

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

const mockReviewDb = {
  findReviewSession: jest.fn(),
};

const mockOcrService = {
  requestOcr: jest.fn(),
};

const mockHitlDatasetService = {
  buildGroundTruth: jest.fn(),
};

const mockTemporalClient = {
  getWorkflowStatus: jest.fn(),
  cancelWorkflow: jest.fn(),
};

const mockPdfNormalizationService = {
  validateForUpload: jest.fn().mockResolvedValue(undefined),
  normalizeToPdf: jest
    .fn()
    .mockImplementation((buf: Buffer) => Promise.resolve(Buffer.from(buf))),
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
        GroundTruthJobDbService,
        {
          provide: GroundTruthJobDbService,
          useValue: mockJobDb,
        },
        {
          provide: DocumentService,
          useValue: mockDocumentService,
        },
        {
          provide: ReviewDbService,
          useValue: mockReviewDb,
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
          provide: TemporalClientService,
          useValue: mockTemporalClient,
        },
        {
          provide: PdfNormalizationService,
          useValue: mockPdfNormalizationService,
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
    const workflowVersionId = "wv-workflow-1";

    it("should throw NotFoundException if version not found", async () => {
      mockJobDb.findVersionForValidation.mockResolvedValue(null);

      await expect(
        service.startGeneration(
          datasetId,
          versionId,
          workflowVersionId,
          "user-1",
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if version is frozen", async () => {
      mockJobDb.findVersionForValidation.mockResolvedValue({
        id: versionId,
        frozen: true,
        storagePrefix: "datasets/dataset-1/version-1",
      });

      await expect(
        service.startGeneration(
          datasetId,
          versionId,
          workflowVersionId,
          "user-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if version has no files uploaded", async () => {
      mockJobDb.findVersionForValidation.mockResolvedValue({
        id: versionId,
        frozen: false,
        storagePrefix: null,
      });

      await expect(
        service.startGeneration(
          datasetId,
          versionId,
          workflowVersionId,
          "user-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException if workflow config not found", async () => {
      mockJobDb.findVersionForValidation.mockResolvedValue({
        id: versionId,
        frozen: false,
        storagePrefix: "datasets/dataset-1/version-1",
      });
      mockJobDb.findWorkflow.mockResolvedValue(null);

      await expect(
        service.startGeneration(
          datasetId,
          versionId,
          workflowVersionId,
          "user-1",
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("should create jobs only for samples without ground truth", async () => {
      mockJobDb.findVersionForValidation.mockResolvedValue({
        id: versionId,
        datasetId,
        frozen: false,
        storagePrefix: "datasets/dataset-1/version-1",
      });
      mockJobDb.findWorkflow.mockResolvedValue({
        id: workflowVersionId,
      });
      (mockBlobStorage.read as jest.Mock).mockResolvedValue(
        Buffer.from(JSON.stringify(sampleManifest)),
      );
      mockJobDb.findStaleJobs.mockResolvedValue([]);
      mockJobDb.findCompletedJobSampleIds.mockResolvedValue([]);

      const createdJobs = [
        {
          id: "job-1",
          sampleId: "doc-001",
          status: GroundTruthJobStatus.pending,
        },
        {
          id: "job-2",
          sampleId: "doc-003",
          status: GroundTruthJobStatus.pending,
        },
      ];
      mockJobDb.createManyJobs.mockResolvedValue(createdJobs);

      // Background processing mocks
      mockJobDb.findVersionForProcessing.mockResolvedValue({
        storagePrefix: "datasets/dataset-1/version-1",
        dataset: { group_id: "test-group" },
      });
      mockJobDb.findPendingJobs.mockResolvedValue([]);

      const result = await service.startGeneration(
        datasetId,
        versionId,
        workflowVersionId,
        "user-1",
      );

      expect(result.jobCount).toBe(2);
      expect(result.message).toContain("2 samples");
      expect(mockJobDb.createManyJobs).toHaveBeenCalledTimes(1);
      expect(mockJobDb.createManyJobs.mock.calls[0][0]).toHaveLength(2);
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

      mockJobDb.findVersionForValidation.mockResolvedValue({
        id: "version-1",
        frozen: false,
        storagePrefix: "datasets/dataset-1/version-1",
      });
      mockJobDb.findWorkflow.mockResolvedValue({
        id: workflowVersionId,
      });
      (mockBlobStorage.read as jest.Mock).mockResolvedValue(
        Buffer.from(JSON.stringify(allWithGt)),
      );

      await expect(
        service.startGeneration(
          datasetId,
          versionId,
          workflowVersionId,
          "user-1",
        ),
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
          workflowVersionId: "wf-1",
          temporalWorkflowId: "temporal-1",
          status: GroundTruthJobStatus.processing,
          groundTruthPath: null,
          error: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // syncJobStatuses - no processing jobs
      mockJobDb.findProcessingJobsWithDocumentStatus.mockResolvedValue([]);
      mockJobDb.findJobs.mockResolvedValue(mockJobs);
      mockJobDb.countJobs.mockResolvedValue(1);

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
      mockJobDb.findProcessingJobsWithDocumentStatus.mockResolvedValue([]);
      mockJobDb.findJobsForReviewQueue.mockResolvedValue(mockJobsWithDocs);
      mockJobDb.countJobs.mockResolvedValue(1);

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
      mockJobDb.findProcessingJobsWithDocumentStatus.mockResolvedValue([]);

      mockJobDb.countJobs
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
        workflowVersionId: "wf-1",
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

      const session = {
        id: "session-1",
        document_id: "doc-id-1",
        corrections: [
          {
            field_key: "Date",
            original_value: "2026-01-01",
            corrected_value: "2026-01-15",
            action: CorrectionAction.corrected,
          },
        ],
      };

      mockJobDb.findJobWithVersionAndDocument.mockResolvedValue(job);
      mockReviewDb.findReviewSession.mockResolvedValue(session);
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

      mockJobDb.updateJob.mockResolvedValue({
        ...job,
        status: GroundTruthJobStatus.completed,
      });

      await service.completeJob("job-1", "session-1");

      // Should build ground truth
      expect(mockHitlDatasetService.buildGroundTruth).toHaveBeenCalledWith(
        job.document.ocr_result.keyValuePairs,
        session.corrections,
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
      expect(mockJobDb.updateJob).toHaveBeenCalledWith("job-1", {
        status: GroundTruthJobStatus.completed,
        groundTruthPath: "datasets/dataset-1/v-1/ground-truth/doc-001.json",
      });
    });

    it("should throw NotFoundException if job not found", async () => {
      mockJobDb.findJobWithVersionAndDocument.mockResolvedValue(null);

      await expect(
        service.completeJob("nonexistent", "session-1"),
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
      mockJobDb.findJobByDocumentId.mockResolvedValue(mockJob);

      const result = await service.getJobByDocumentId("doc-id-1");

      expect(result).toEqual(mockJob);
      expect(mockJobDb.findJobByDocumentId).toHaveBeenCalledWith("doc-id-1");
    });

    it("should return null if no job found", async () => {
      mockJobDb.findJobByDocumentId.mockResolvedValue(null);

      const result = await service.getJobByDocumentId("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("reopenJob", () => {
    it("should revert job status to awaiting_review and clear groundTruthPath", async () => {
      mockJobDb.updateJob.mockResolvedValue(undefined);

      await service.reopenJob("job-1");

      expect(mockJobDb.updateJob).toHaveBeenCalledWith("job-1", {
        status: GroundTruthJobStatus.awaiting_review,
        groundTruthPath: null,
      });
    });
  });
});
