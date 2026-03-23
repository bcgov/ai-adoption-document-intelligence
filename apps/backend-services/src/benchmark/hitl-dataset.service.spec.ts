import { CorrectionAction, ReviewStatus } from "@generated/client";
import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import { ReviewDbService } from "@/hitl/review-db.service";
import { ExtractedFields } from "@/ocr/azure-types";
import { AuditLogService } from "./audit-log.service";
import { DatasetService } from "./dataset.service";
import { HitlDatasetService } from "./hitl-dataset.service";

describe("HitlDatasetService", () => {
  let service: HitlDatasetService;
  let mockReviewDbService: jest.Mocked<Partial<ReviewDbService>>;
  let mockDatasetService: jest.Mocked<Partial<DatasetService>>;
  let mockAuditLogService: jest.Mocked<Partial<AuditLogService>>;
  let mockBlobStorage: jest.Mocked<BlobStorageInterface>;

  const mockOcrFields: ExtractedFields = {
    vendor_name: {
      type: "string",
      content: "Acme Corp",
      confidence: 0.72,
      valueString: "Acme Corp",
    },
    total_amount: {
      type: "number",
      content: "1250.00",
      confidence: 0.85,
      valueNumber: 1250.0,
    },
    invoice_date: {
      type: "date",
      content: "2026-01-15",
      confidence: 0.65,
      valueDate: "2026-01-15",
    },
  };

  const mockApprovedSession = {
    id: "session-1",
    reviewer_id: "reviewer-1",
    status: ReviewStatus.approved,
    completed_at: new Date("2026-02-20"),
    corrections: [
      {
        id: "corr-1",
        session_id: "session-1",
        field_key: "vendor_name",
        original_value: "Acme Corp",
        corrected_value: null,
        original_conf: 0.72,
        action: CorrectionAction.confirmed,
        created_at: new Date(),
      },
      {
        id: "corr-2",
        session_id: "session-1",
        field_key: "total_amount",
        original_value: "1250.00",
        corrected_value: "1350.00",
        original_conf: 0.85,
        action: CorrectionAction.corrected,
        created_at: new Date(),
      },
      {
        id: "corr-3",
        session_id: "session-1",
        field_key: "invoice_date",
        original_value: "2026-01-15",
        corrected_value: null,
        original_conf: 0.65,
        action: CorrectionAction.deleted,
        created_at: new Date(),
      },
    ],
  };

  const mockDocuments = [
    {
      id: "doc-1",
      original_filename: "invoice-001.pdf",
      file_path: "documents/doc-1/original.pdf",
      file_type: "pdf",
      status: "completed_ocr",
      ocr_result: { keyValuePairs: mockOcrFields },
      review_sessions: [mockApprovedSession],
    },
    {
      id: "doc-2",
      original_filename: "invoice-002.pdf",
      file_path: "documents/doc-2/original.pdf",
      file_type: "pdf",
      status: "completed_ocr",
      ocr_result: { keyValuePairs: mockOcrFields },
      review_sessions: [
        {
          ...mockApprovedSession,
          id: "session-2",
          completed_at: new Date("2026-02-21"),
        },
      ],
    },
  ];

  beforeEach(async () => {
    mockReviewDbService = {
      findReviewQueue: jest.fn().mockResolvedValue(mockDocuments),
    };

    mockDatasetService = {
      createDataset: jest.fn().mockResolvedValue({
        id: "dataset-1",
        name: "Test Dataset",
        description: null,
        metadata: { source: "hitl" },
        storagePath: "datasets/dataset-1",
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      createVersion: jest.fn().mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        version: "v1",
        name: null,
        storagePrefix: null,
        manifestPath: "dataset-manifest.json",
        documentCount: 0,
        groundTruthSchema: null,
        createdAt: new Date(),
      }),
      updateVersionAfterHitlImport: jest.fn().mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        version: "v1",
        name: null,
        storagePrefix: "datasets/dataset-1/version-1",
        manifestPath: "dataset-manifest.json",
        documentCount: 2,
        groundTruthSchema: null,
        createdAt: new Date(),
      }),
    };

    mockAuditLogService = {
      logVersionPublished: jest.fn().mockResolvedValue({}),
    };

    mockBlobStorage = {
      read: jest.fn().mockResolvedValue(Buffer.from("fake-pdf-content")),
      write: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([]),
      deleteByPrefix: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HitlDatasetService,
        { provide: ReviewDbService, useValue: mockReviewDbService },
        { provide: DatasetService, useValue: mockDatasetService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: BLOB_STORAGE, useValue: mockBlobStorage },
      ],
    }).compile();

    service = module.get<HitlDatasetService>(HitlDatasetService);
  });

  describe("buildGroundTruth", () => {
    it("should produce flat key-value pairs from confirmed fields", () => {
      const result = service.buildGroundTruth(mockOcrFields, [
        {
          id: "c1",
          session_id: "s1",
          field_key: "vendor_name",
          original_value: "Acme Corp",
          corrected_value: null,
          original_conf: 0.72,
          action: CorrectionAction.confirmed,
          created_at: new Date(),
        },
      ]);

      // Flat value resolved via valueString
      expect(result.vendor_name).toBe("Acme Corp");
      // Number field resolved via valueNumber
      expect(result.total_amount).toBe(1250.0);
    });

    it("should update corrected fields with the corrected value", () => {
      const result = service.buildGroundTruth(mockOcrFields, [
        {
          id: "c2",
          session_id: "s1",
          field_key: "total_amount",
          original_value: "1250.00",
          corrected_value: "1350.00",
          original_conf: 0.85,
          action: CorrectionAction.corrected,
          created_at: new Date(),
        },
      ]);

      // corrected_value replaces the content; valueNumber is still on the
      // field but content takes precedence after correction since
      // valueString is not set on the number field and content is updated
      expect(result.total_amount).toBe("1350.00");
    });

    it("should remove deleted fields", () => {
      const result = service.buildGroundTruth(mockOcrFields, [
        {
          id: "c3",
          session_id: "s1",
          field_key: "invoice_date",
          original_value: "2026-01-15",
          corrected_value: null,
          original_conf: 0.65,
          action: CorrectionAction.deleted,
          created_at: new Date(),
        },
      ]);

      expect(result.invoice_date).toBeUndefined();
    });

    it("should keep flagged fields as flat values", () => {
      const result = service.buildGroundTruth(mockOcrFields, [
        {
          id: "c4",
          session_id: "s1",
          field_key: "vendor_name",
          original_value: "Acme Corp",
          corrected_value: null,
          original_conf: 0.72,
          action: CorrectionAction.flagged,
          created_at: new Date(),
        },
      ]);

      expect(result.vendor_name).toBe("Acme Corp");
    });

    it("should skip pseudo-fields starting with underscore", () => {
      const result = service.buildGroundTruth(mockOcrFields, [
        {
          id: "c5",
          session_id: "s1",
          field_key: "_escalation",
          original_value: "Some reason",
          corrected_value: null,
          original_conf: null,
          action: CorrectionAction.flagged,
          created_at: new Date(),
        },
      ]);

      expect(Object.keys(result)).toHaveLength(3);
      expect(result._escalation).toBeUndefined();
    });

    it("should add new fields that were corrected but not in original OCR", () => {
      const result = service.buildGroundTruth(mockOcrFields, [
        {
          id: "c6",
          session_id: "s1",
          field_key: "new_field",
          original_value: null,
          corrected_value: "new value",
          original_conf: null,
          action: CorrectionAction.corrected,
          created_at: new Date(),
        },
      ]);

      expect(result.new_field).toBe("new value");
    });

    it("should apply all correction types together", () => {
      const result = service.buildGroundTruth(
        mockOcrFields,
        mockApprovedSession.corrections,
      );

      // confirmed: vendor_name resolved from valueString
      expect(result.vendor_name).toBe("Acme Corp");

      // corrected: total_amount content updated to "1350.00"
      expect(result.total_amount).toBe("1350.00");

      // deleted: invoice_date removed
      expect(result.invoice_date).toBeUndefined();
    });

    it("should resolve selectionMark fields to selected/unselected strings", () => {
      const fieldsWithCheckbox: ExtractedFields = {
        checkbox_yes: {
          type: "selectionMark",
          content: null,
          confidence: 0.95,
          valueSelectionMark: "selected",
        },
        checkbox_no: {
          type: "selectionMark",
          content: null,
          confidence: 0.9,
          valueSelectionMark: "unselected",
        },
      };

      const result = service.buildGroundTruth(fieldsWithCheckbox, []);

      expect(result.checkbox_yes).toBe("selected");
      expect(result.checkbox_no).toBe("unselected");
    });

    it("should resolve date fields using valueDate", () => {
      const fieldsWithDate: ExtractedFields = {
        date_field: {
          type: "date",
          content: "January 15, 2026",
          confidence: 0.88,
          valueDate: "2026-01-15",
        },
      };

      const result = service.buildGroundTruth(fieldsWithDate, []);

      expect(result.date_field).toBe("2026-01-15");
    });

    it("should resolve number fields using valueNumber", () => {
      const fieldsWithNumber: ExtractedFields = {
        amount: {
          type: "number",
          content: "$1,250.75",
          confidence: 0.92,
          valueNumber: 1250.75,
        },
      };

      const result = service.buildGroundTruth(fieldsWithNumber, []);

      expect(result.amount).toBe(1250.75);
    });
  });

  describe("listEligibleDocuments", () => {
    it("should return eligible documents with approved sessions", async () => {
      const result = await service.listEligibleDocuments({}, ["test-group"]);

      expect(result.documents).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it("should filter by search term", async () => {
      const result = await service.listEligibleDocuments(
        {
          search: "invoice-001",
        },
        ["test-group"],
      );

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].originalFilename).toBe("invoice-001.pdf");
    });

    it("should paginate results", async () => {
      const result = await service.listEligibleDocuments(
        {
          page: 1,
          limit: 1,
        },
        ["test-group"],
      );

      expect(result.documents).toHaveLength(1);
      expect(result.total).toBe(2);
    });

    it("should exclude documents without approved sessions", async () => {
      mockReviewDbService.findReviewQueue = jest.fn().mockResolvedValue([
        {
          ...mockDocuments[0],
          review_sessions: [
            {
              ...mockApprovedSession,
              status: ReviewStatus.escalated,
            },
          ],
        },
      ]);

      const result = await service.listEligibleDocuments({}, ["test-group"]);
      expect(result.documents).toHaveLength(0);
    });

    it("should exclude documents without OCR results", async () => {
      mockReviewDbService.findReviewQueue = jest.fn().mockResolvedValue([
        {
          ...mockDocuments[0],
          ocr_result: null,
        },
      ]);

      const result = await service.listEligibleDocuments({}, ["test-group"]);
      expect(result.documents).toHaveLength(0);
    });
  });

  describe("createDatasetFromHitl", () => {
    it("should create dataset and version from selected documents", async () => {
      const result = await service.createDatasetFromHitl(
        {
          name: "Test Dataset",
          description: "From HITL",
          documentIds: ["doc-1", "doc-2"],
          groupId: "test-group",
        },
        "user-1",
      );

      expect(result.dataset.id).toBe("dataset-1");
      expect(result.version.id).toBe("version-1");
      expect(result.skipped).toHaveLength(0);

      // Should have created dataset with source: hitl metadata
      expect(mockDatasetService.createDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test Dataset",
          metadata: expect.objectContaining({ source: "hitl" }),
        }),
        "user-1",
      );

      // Should have written files for each document
      // 2 documents x (1 input file + 1 ground truth file) + 1 manifest = 5 writes
      expect(mockBlobStorage.write).toHaveBeenCalledTimes(5);

      // Should have read original files
      expect(mockBlobStorage.read).toHaveBeenCalledTimes(2);
    });

    it("should skip documents that are not found", async () => {
      const result = await service.createDatasetFromHitl(
        {
          name: "Test Dataset",
          documentIds: ["doc-1", "nonexistent-doc"],
          groupId: "test-group",
        },
        "user-1",
      );

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].documentId).toBe("nonexistent-doc");
    });

    it("should throw when all documents are skipped", async () => {
      await expect(
        service.createDatasetFromHitl(
          {
            name: "Test Dataset",
            documentIds: ["nonexistent-1", "nonexistent-2"],
            groupId: "test-group",
          },
          "user-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("should deduplicate sample IDs for documents with the same filename", async () => {
      mockReviewDbService.findReviewQueue = jest.fn().mockResolvedValue([
        mockDocuments[0],
        {
          ...mockDocuments[1],
          original_filename: "invoice-001.pdf", // Same filename
        },
      ]);

      const result = await service.createDatasetFromHitl(
        {
          name: "Test Dataset",
          documentIds: ["doc-1", "doc-2"],
          groupId: "test-group",
        },
        "user-1",
      );

      expect(result.skipped).toHaveLength(0);

      // Check manifest was written with deduplicated IDs
      const manifestCall = mockBlobStorage.write.mock.calls.find((call) =>
        (call[0] as string).endsWith("dataset-manifest.json"),
      );
      expect(manifestCall).toBeDefined();
      const manifest = JSON.parse(manifestCall![1].toString());
      const sampleIds = manifest.samples.map((s: { id: string }) => s.id);
      expect(sampleIds).toContain("invoice-001");
      expect(sampleIds).toContain("invoice-001_2");
    });
  });

  describe("addVersionFromHitl", () => {
    it("should add a version to an existing dataset", async () => {
      const result = await service.addVersionFromHitl(
        "dataset-1",
        {
          documentIds: ["doc-1"],
        },
        "user-1",
      );

      expect(result.version.id).toBe("version-1");
      expect(result.skipped).toHaveLength(0);

      expect(mockDatasetService.createVersion).toHaveBeenCalledWith(
        "dataset-1",
        { version: undefined, name: undefined },
      );
    });

    it("should pass version label and name when provided", async () => {
      await service.addVersionFromHitl(
        "dataset-1",
        {
          version: "v2",
          name: "Second batch",
          documentIds: ["doc-1"],
        },
        "user-1",
      );

      expect(mockDatasetService.createVersion).toHaveBeenCalledWith(
        "dataset-1",
        { version: "v2", name: "Second batch" },
      );
    });
  });
});
