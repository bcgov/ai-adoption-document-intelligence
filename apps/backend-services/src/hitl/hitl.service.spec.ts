import {
  CorrectionAction as DbCorrectionAction,
  DocumentStatus,
  ReviewStatus,
} from "@generated/client";
import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { DatabaseService } from "../database/database.service";
import { AnalyticsService } from "./analytics.service";
import {
  CorrectionAction,
  EscalateDto,
  SubmitCorrectionsDto,
} from "./dto/correction.dto";
import { QueueFilterDto } from "./dto/queue-filter.dto";
import { ReviewSessionDto } from "./dto/review-session.dto";
import {
  DocumentStatusFilter,
  ReviewStatusFilter,
} from "./dto/status-constants.dto";
import { HitlService } from "./hitl.service";

describe("HitlService", () => {
  let service: HitlService;
  let mockDbService: jest.Mocked<DatabaseService>;
  let mockAnalyticsService: jest.Mocked<AnalyticsService>;

  const mockDocument = {
    id: "doc-1",
    title: "Test Document",
    original_filename: "test.pdf",
    file_path: "/path/to/test.pdf",
    file_type: "pdf",
    file_size: 1000,
    metadata: {},
    source: "upload",
    status: DocumentStatus.completed_ocr,
    model_id: "model-1",
    apim_request_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    workflow_id: null,
    workflow_config_id: null,
    workflow_execution_id: null,
    group_id: "group-1",
  };

  const mockOcrResult = {
    id: "ocr-1",
    document_id: "doc-1",
    processed_at: new Date(),
    keyValuePairs: {
      invoice_number: {
        type: "string",
        content: "INV-12345",
        confidence: 0.85,
      },
      total_amount: {
        type: "string",
        content: "1000",
        confidence: 0.75,
      },
    },
  };

  const mockDocumentWithOcr = {
    ...mockDocument,
    ocr_result: mockOcrResult,
    review_sessions: [],
  };

  const mockReviewSession = {
    id: "session-1",
    document_id: "doc-1",
    reviewer_id: "reviewer-1",
    status: ReviewStatus.in_progress,
    started_at: new Date(),
    completed_at: null,
    document: mockDocumentWithOcr,
    corrections: [],
  };

  const mockFieldCorrection = {
    id: "correction-1",
    session_id: "session-1",
    field_key: "invoice_number",
    original_value: "INV-123",
    corrected_value: "INV-12345",
    original_conf: 0.85,
    action: DbCorrectionAction.corrected,
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockDb = {
      findDocument: jest.fn(),
      findReviewQueue: jest.fn(),
      createReviewSession: jest.fn(),
      findReviewSession: jest.fn(),
      updateReviewSession: jest.fn(),
      createFieldCorrection: jest.fn(),
      findSessionCorrections: jest.fn(),
    };

    const mockAnalytics = {
      getAnalytics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HitlService,
        { provide: AppLoggerService, useValue: mockAppLogger },
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
        {
          provide: AnalyticsService,
          useValue: mockAnalytics,
        },
      ],
    }).compile();

    service = module.get<HitlService>(HitlService);
    mockDbService = module.get(DatabaseService);
    mockAnalyticsService = module.get(AnalyticsService);
  });

  describe("getQueue", () => {
    it("should return filtered documents with low confidence fields", async () => {
      const filters: QueueFilterDto = {
        maxConfidence: 0.9,
        limit: 50,
        offset: 0,
      };

      mockDbService.findReviewQueue.mockResolvedValueOnce([
        mockDocumentWithOcr as any,
      ]);

      const result = await service.getQueue(filters);

      expect(mockDbService.findReviewQueue).toHaveBeenCalledWith({
        status: "completed_ocr",
        modelId: undefined,
        maxConfidence: 0.9,
        limit: 50,
        offset: 0,
        reviewStatus: "pending",
      });

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].id).toBe("doc-1");
      expect(result.documents[0].ocr_result.fields).toEqual(
        mockOcrResult.keyValuePairs,
      );
      expect(result.total).toBe(1);
    });

    it("should filter out documents without OCR results", async () => {
      const docWithoutOcr = {
        ...mockDocument,
        ocr_result: null,
      };

      mockDbService.findReviewQueue.mockResolvedValueOnce([
        docWithoutOcr as any,
      ]);

      const result = await service.getQueue({});

      expect(result.documents).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("should filter out documents with all high confidence fields", async () => {
      const docWithHighConfidence = {
        ...mockDocument,
        ocr_result: {
          ...mockOcrResult,
          keyValuePairs: {
            field1: { type: "string", content: "value1", confidence: 0.95 },
            field2: { type: "string", content: "value2", confidence: 0.98 },
          },
        },
      };

      mockDbService.findReviewQueue.mockResolvedValueOnce([
        docWithHighConfidence as any,
      ]);

      const result = await service.getQueue({ maxConfidence: 0.9 });

      expect(result.documents).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("should include last session information if available", async () => {
      const docWithSession = {
        ...mockDocumentWithOcr,
        review_sessions: [
          {
            id: "session-1",
            reviewer_id: "reviewer-1",
            status: ReviewStatus.in_progress,
            completed_at: null,
            corrections: [mockFieldCorrection],
          },
        ],
      };

      mockDbService.findReviewQueue.mockResolvedValueOnce([
        docWithSession as any,
      ]);

      const result = await service.getQueue({});

      expect(result.documents[0].lastSession).toEqual({
        id: "session-1",
        reviewer_id: "reviewer-1",
        status: ReviewStatus.in_progress,
        completed_at: null,
        corrections_count: 1,
      });
    });

    it("should handle ALL status filter", async () => {
      mockDbService.findReviewQueue.mockResolvedValueOnce([
        mockDocumentWithOcr as any,
      ]);

      await service.getQueue({ status: DocumentStatusFilter.ALL });

      expect(mockDbService.findReviewQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          status: undefined,
        }),
      );
    });

    it("should handle REVIEWED review status filter", async () => {
      mockDbService.findReviewQueue.mockResolvedValueOnce([
        mockDocumentWithOcr as any,
      ]);

      await service.getQueue({ reviewStatus: ReviewStatusFilter.REVIEWED });

      expect(mockDbService.findReviewQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewStatus: "reviewed",
        }),
      );
    });

    it("should use default values for optional filters", async () => {
      mockDbService.findReviewQueue.mockResolvedValueOnce([]);

      await service.getQueue({});

      expect(mockDbService.findReviewQueue).toHaveBeenCalledWith({
        status: "completed_ocr",
        modelId: undefined,
        maxConfidence: 0.9,
        limit: 50,
        offset: 0,
        reviewStatus: "pending",
        groupIds: undefined,
      });
    });
  });

  describe("getQueueStats", () => {
    it("should return queue statistics", async () => {
      mockDbService.findReviewQueue.mockResolvedValueOnce([
        mockDocumentWithOcr,
        {
          ...mockDocument,
          ocr_result: {
            ...mockOcrResult,
            keyValuePairs: {
              field1: { type: "string", content: "value1", confidence: 0.95 },
            },
          },
        } as any,
      ] as any);

      mockAnalyticsService.getAnalytics.mockResolvedValueOnce({
        totalDocuments: 10,
        reviewedDocuments: 5,
        averageConfidence: 0.88,
        correctionRate: 0.5,
        correctionsByAction: {},
        summary: {
          totalSessions: 10,
          completedSessions: 5,
          totalCorrections: 20,
          confirmedFields: 10,
          correctedFields: 5,
          flaggedFields: 3,
          deletedFields: 2,
        },
      });

      const result = await service.getQueueStats();

      expect(result).toEqual({
        totalDocuments: 2,
        requiresReview: 1,
        averageConfidence: 0.88,
        reviewedToday: 5,
      });

      expect(mockDbService.findReviewQueue).toHaveBeenCalledWith({
        status: "completed_ocr",
        limit: 1000,
        reviewStatus: "pending",
        groupIds: undefined,
      });
    });

    it("should handle REVIEWED status filter", async () => {
      mockDbService.findReviewQueue.mockResolvedValueOnce([]);
      mockAnalyticsService.getAnalytics.mockResolvedValueOnce({
        totalDocuments: 0,
        reviewedDocuments: 0,
        averageConfidence: 0,
        correctionRate: 0,
        correctionsByAction: {},
        summary: {
          totalSessions: 0,
          completedSessions: 0,
          totalCorrections: 0,
          confirmedFields: 0,
          correctedFields: 0,
          flaggedFields: 0,
          deletedFields: 0,
        },
      });

      await service.getQueueStats(ReviewStatusFilter.REVIEWED);

      expect(mockDbService.findReviewQueue).toHaveBeenCalledWith({
        status: "completed_ocr",
        limit: 1000,
        reviewStatus: "reviewed",
        groupIds: undefined,
      });
    });
  });

  describe("startSession", () => {
    it("should create a new review session", async () => {
      const dto: ReviewSessionDto = {
        documentId: "doc-1",
      };

      mockDbService.findDocument.mockResolvedValueOnce(mockDocument);
      mockDbService.createReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );

      const result = await service.startSession(dto, "reviewer-1");

      expect(mockDbService.findDocument).toHaveBeenCalledWith("doc-1");
      expect(mockDbService.createReviewSession).toHaveBeenCalledWith(
        "doc-1",
        "reviewer-1",
      );

      expect(result).toEqual({
        id: "session-1",
        documentId: "doc-1",
        reviewerId: "reviewer-1",
        status: ReviewStatus.in_progress,
        startedAt: mockReviewSession.started_at,
        document: {
          id: "doc-1",
          original_filename: "test.pdf",
          storage_path: "/path/to/test.pdf",
          ocr_result: {
            fields: mockOcrResult.keyValuePairs,
          },
        },
      });
    });

    it("should throw NotFoundException if document does not exist", async () => {
      const dto: ReviewSessionDto = {
        documentId: "non-existent",
      };

      mockDbService.findDocument.mockResolvedValueOnce(null);

      await expect(service.startSession(dto, "reviewer-1")).rejects.toThrow(
        NotFoundException,
      );

      expect(mockDbService.createReviewSession).not.toHaveBeenCalled();
    });
  });

  describe("getSession", () => {
    it("should return a review session", async () => {
      mockDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );

      const result = await service.getSession("session-1");

      expect(mockDbService.findReviewSession).toHaveBeenCalledWith("session-1");

      expect(result).toEqual({
        id: "session-1",
        documentId: "doc-1",
        reviewerId: "reviewer-1",
        status: ReviewStatus.in_progress,
        startedAt: mockReviewSession.started_at,
        completedAt: null,
        document: {
          id: "doc-1",
          original_filename: "test.pdf",
          storage_path: "/path/to/test.pdf",
          ocr_result: {
            fields: mockOcrResult.keyValuePairs,
            enrichment_summary: undefined,
          },
        },
        corrections: [],
      });
    });

    it("should throw NotFoundException if session does not exist", async () => {
      mockDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(service.getSession("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("submitCorrections", () => {
    it("should save corrections for a session", async () => {
      const dto: SubmitCorrectionsDto = {
        corrections: [
          {
            field_key: "invoice_number",
            original_value: "INV-123",
            corrected_value: "INV-12345",
            original_conf: 0.85,
            action: CorrectionAction.CORRECTED,
          },
          {
            field_key: "total_amount",
            original_value: "100",
            corrected_value: "1000",
            original_conf: 0.75,
            action: CorrectionAction.CORRECTED,
          },
        ],
      };

      mockDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockDbService.createFieldCorrection
        .mockResolvedValueOnce(mockFieldCorrection)
        .mockResolvedValueOnce({
          ...mockFieldCorrection,
          id: "correction-2",
          field_key: "total_amount",
        });

      const result = await service.submitCorrections("session-1", dto);

      expect(mockDbService.findReviewSession).toHaveBeenCalledWith("session-1");
      expect(mockDbService.createFieldCorrection).toHaveBeenCalledTimes(2);

      expect(result).toEqual({
        sessionId: "session-1",
        corrections: expect.arrayContaining([
          expect.objectContaining({
            field_key: "invoice_number",
          }),
          expect.objectContaining({
            field_key: "total_amount",
          }),
        ]),
        message: "Saved 2 corrections",
      });
    });

    it("should throw NotFoundException if session does not exist", async () => {
      const dto: SubmitCorrectionsDto = {
        corrections: [],
      };

      mockDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(
        service.submitCorrections("non-existent", dto),
      ).rejects.toThrow(NotFoundException);

      expect(mockDbService.createFieldCorrection).not.toHaveBeenCalled();
    });
  });

  describe("approveSession", () => {
    it("should approve a review session", async () => {
      const approvedSession = {
        ...mockReviewSession,
        status: ReviewStatus.approved,
        completed_at: new Date(),
      };

      mockDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockDbService.updateReviewSession.mockResolvedValueOnce(
        approvedSession as any,
      );

      const result = await service.approveSession("session-1");

      expect(mockDbService.findReviewSession).toHaveBeenCalledWith("session-1");
      expect(mockDbService.updateReviewSession).toHaveBeenCalledWith(
        "session-1",
        {
          status: ReviewStatus.approved,
          completed_at: expect.any(Date),
        },
      );

      expect(result).toEqual({
        id: "session-1",
        status: ReviewStatus.approved,
        completedAt: approvedSession.completed_at,
        message: "Review session approved",
      });
    });

    it("should throw NotFoundException if session does not exist", async () => {
      mockDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(service.approveSession("non-existent")).rejects.toThrow(
        NotFoundException,
      );

      expect(mockDbService.updateReviewSession).not.toHaveBeenCalled();
    });
  });

  describe("escalateSession", () => {
    it("should escalate a review session with reason", async () => {
      const dto: EscalateDto = {
        reason: "Complex document requiring expert review",
      };

      const escalatedSession = {
        ...mockReviewSession,
        status: ReviewStatus.escalated,
        completed_at: new Date(),
      };

      mockDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockDbService.createFieldCorrection.mockResolvedValueOnce({
        ...mockFieldCorrection,
        field_key: "_escalation",
        original_value: dto.reason,
        action: DbCorrectionAction.flagged,
      });
      mockDbService.updateReviewSession.mockResolvedValueOnce(
        escalatedSession as any,
      );

      const result = await service.escalateSession("session-1", dto);

      expect(mockDbService.findReviewSession).toHaveBeenCalledWith("session-1");
      expect(mockDbService.createFieldCorrection).toHaveBeenCalledWith(
        "session-1",
        {
          field_key: "_escalation",
          original_value: dto.reason,
          action: DbCorrectionAction.flagged,
        },
      );
      expect(mockDbService.updateReviewSession).toHaveBeenCalledWith(
        "session-1",
        {
          status: ReviewStatus.escalated,
          completed_at: expect.any(Date),
        },
      );

      expect(result).toEqual({
        id: "session-1",
        status: ReviewStatus.escalated,
        reason: dto.reason,
        message: "Review session escalated",
      });
    });

    it("should throw NotFoundException if session does not exist", async () => {
      const dto: EscalateDto = {
        reason: "Test reason",
      };

      mockDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(
        service.escalateSession("non-existent", dto),
      ).rejects.toThrow(NotFoundException);

      expect(mockDbService.createFieldCorrection).not.toHaveBeenCalled();
      expect(mockDbService.updateReviewSession).not.toHaveBeenCalled();
    });
  });

  describe("skipSession", () => {
    it("should skip a review session", async () => {
      const skippedSession = {
        ...mockReviewSession,
        status: ReviewStatus.skipped,
        completed_at: new Date(),
      };

      mockDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockDbService.updateReviewSession.mockResolvedValueOnce(
        skippedSession as any,
      );

      const result = await service.skipSession("session-1");

      expect(mockDbService.findReviewSession).toHaveBeenCalledWith("session-1");
      expect(mockDbService.updateReviewSession).toHaveBeenCalledWith(
        "session-1",
        {
          status: ReviewStatus.skipped,
          completed_at: expect.any(Date),
        },
      );

      expect(result).toEqual({
        id: "session-1",
        status: ReviewStatus.skipped,
        message: "Review session skipped",
      });
    });

    it("should throw NotFoundException if session does not exist", async () => {
      mockDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(service.skipSession("non-existent")).rejects.toThrow(
        NotFoundException,
      );

      expect(mockDbService.updateReviewSession).not.toHaveBeenCalled();
    });
  });

  describe("getCorrections", () => {
    it("should return corrections for a session", async () => {
      const corrections = [
        mockFieldCorrection,
        {
          ...mockFieldCorrection,
          id: "correction-2",
          field_key: "total_amount",
        },
      ];

      mockDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockDbService.findSessionCorrections.mockResolvedValueOnce(corrections);

      const result = await service.getCorrections("session-1");

      expect(mockDbService.findReviewSession).toHaveBeenCalledWith("session-1");
      expect(mockDbService.findSessionCorrections).toHaveBeenCalledWith(
        "session-1",
      );

      expect(result).toEqual({
        sessionId: "session-1",
        corrections: [
          {
            id: "correction-1",
            fieldKey: "invoice_number",
            originalValue: "INV-123",
            correctedValue: "INV-12345",
            originalConfidence: 0.85,
            action: CorrectionAction.CORRECTED,
            createdAt: mockFieldCorrection.created_at,
          },
          {
            id: "correction-2",
            fieldKey: "total_amount",
            originalValue: "INV-123",
            correctedValue: "INV-12345",
            originalConfidence: 0.85,
            action: CorrectionAction.CORRECTED,
            createdAt: mockFieldCorrection.created_at,
          },
        ],
      });
    });

    it("should throw NotFoundException if session does not exist", async () => {
      mockDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(service.getCorrections("non-existent")).rejects.toThrow(
        NotFoundException,
      );

      expect(mockDbService.findSessionCorrections).not.toHaveBeenCalled();
    });
  });

  describe("getAnalytics", () => {
    it("should delegate to analytics service", async () => {
      const mockAnalytics = {
        totalDocuments: 100,
        reviewedDocuments: 80,
        averageConfidence: 0.85,
        correctionRate: 0.5,
        correctionsByAction: {},
        summary: {
          totalSessions: 100,
          completedSessions: 80,
          totalCorrections: 50,
          confirmedFields: 20,
          correctedFields: 15,
          flaggedFields: 10,
          deletedFields: 5,
        },
      };

      mockAnalyticsService.getAnalytics.mockResolvedValueOnce(mockAnalytics);

      const filters = {
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-12-31"),
      };

      const result = await service.getAnalytics(filters);

      expect(mockAnalyticsService.getAnalytics).toHaveBeenCalledWith(
        filters,
        undefined,
      );
      expect(result).toEqual(mockAnalytics);
    });
  });
});
