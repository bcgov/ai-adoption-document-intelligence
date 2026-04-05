import {
  CorrectionAction as DbCorrectionAction,
  DocumentStatus,
  ReviewStatus,
} from "@generated/client";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditService } from "@/audit/audit.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { DocumentService } from "../document/document.service";
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
import { ReviewDbService } from "./review-db.service";

describe("HitlService", () => {
  let service: HitlService;
  let mockDocumentService: jest.Mocked<DocumentService>;
  let mockReviewDbService: jest.Mocked<ReviewDbService>;
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
    actor_id: "reviewer-1",
    status: ReviewStatus.in_progress,
    started_at: new Date(),
    completed_at: null,
    document: mockDocumentWithOcr,
    corrections: [],
  };

  const mockDocumentLock = {
    id: "lock-1",
    document_id: "doc-1",
    reviewer_id: "reviewer-1",
    session_id: "session-1",
    acquired_at: new Date(),
    last_heartbeat: new Date(),
    expires_at: new Date(Date.now() + 600000),
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
    };

    const mockReviewDb = {
      findReviewQueue: jest.fn(),
      createReviewSession: jest.fn(),
      findReviewSession: jest.fn(),
      updateReviewSession: jest.fn(),
      createFieldCorrection: jest.fn(),
      findSessionCorrections: jest.fn(),
      findActiveLock: jest.fn(),
      acquireDocumentLock: jest.fn(),
      releaseDocumentLock: jest.fn(),
      refreshLockHeartbeat: jest.fn(),
      deleteCorrection: jest.fn(),
      findFieldDefinitionsByGroupId: jest.fn().mockResolvedValue([]),
    };

    const mockAnalytics = {
      getAnalytics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HitlService,
        { provide: AppLoggerService, useValue: mockAppLogger },
        {
          provide: DocumentService,
          useValue: mockDb,
        },
        {
          provide: ReviewDbService,
          useValue: mockReviewDb,
        },
        {
          provide: AnalyticsService,
          useValue: mockAnalytics,
        },
        {
          provide: AuditService,
          useValue: { recordEvent: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<HitlService>(HitlService);
    mockDocumentService = module.get(DocumentService);
    mockReviewDbService = module.get(ReviewDbService);
    mockAnalyticsService = module.get(AnalyticsService);
  });

  describe("getQueue", () => {
    it("should return filtered documents with low confidence fields", async () => {
      const filters: QueueFilterDto = {
        maxConfidence: 0.9,
        limit: 50,
        offset: 0,
      };

      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([
        mockDocumentWithOcr as any,
      ]);

      const result = await service.getQueue(filters);

      expect(mockReviewDbService.findReviewQueue).toHaveBeenCalledWith({
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

      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([
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

      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([
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

      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([
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
      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([
        mockDocumentWithOcr as any,
      ]);

      await service.getQueue({ status: DocumentStatusFilter.ALL });

      expect(mockReviewDbService.findReviewQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          status: undefined,
        }),
      );
    });

    it("should handle REVIEWED review status filter", async () => {
      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([
        mockDocumentWithOcr as any,
      ]);

      await service.getQueue({ reviewStatus: ReviewStatusFilter.REVIEWED });

      expect(mockReviewDbService.findReviewQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewStatus: "reviewed",
        }),
      );
    });

    it("should use default values for optional filters", async () => {
      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([]);

      await service.getQueue({});

      expect(mockReviewDbService.findReviewQueue).toHaveBeenCalledWith({
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
      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([
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

      expect(mockReviewDbService.findReviewQueue).toHaveBeenCalledWith({
        status: "completed_ocr",
        limit: 1000,
        reviewStatus: "pending",
        groupIds: undefined,
      });
    });

    it("should handle REVIEWED status filter", async () => {
      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([]);
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

      expect(mockReviewDbService.findReviewQueue).toHaveBeenCalledWith({
        status: "completed_ocr",
        limit: 1000,
        reviewStatus: "reviewed",
        groupIds: undefined,
      });
    });
  });

  describe("startSession", () => {
    it("should create a new review session and acquire a lock", async () => {
      const dto: ReviewSessionDto = {
        documentId: "doc-1",
      };

      mockDocumentService.findDocument.mockResolvedValueOnce(mockDocument);
      mockReviewDbService.findActiveLock.mockResolvedValueOnce(null);
      mockReviewDbService.createReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockReviewDbService.acquireDocumentLock.mockResolvedValueOnce(
        mockDocumentLock,
      );

      const result = await service.startSession(dto, "reviewer-1");

      expect(mockDocumentService.findDocument).toHaveBeenCalledWith("doc-1");
      expect(mockReviewDbService.findActiveLock).toHaveBeenCalledWith("doc-1");
      expect(mockReviewDbService.createReviewSession).toHaveBeenCalledWith(
        "doc-1",
        "reviewer-1",
      );
      expect(mockReviewDbService.acquireDocumentLock).toHaveBeenCalledWith({
        document_id: "doc-1",
        reviewer_id: "reviewer-1",
        session_id: "session-1",
        expires_at: expect.any(Date),
      });

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

    it("should return existing session when same reviewer has lock", async () => {
      const dto: ReviewSessionDto = {
        documentId: "doc-1",
      };

      mockDocumentService.findDocument.mockResolvedValueOnce(mockDocument);
      mockReviewDbService.findActiveLock.mockResolvedValueOnce({
        ...mockDocumentLock,
        reviewer_id: "reviewer-1",
      });
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );

      const result = await service.startSession(dto, "reviewer-1");

      expect(mockReviewDbService.createReviewSession).not.toHaveBeenCalled();
      expect(result.id).toBe("session-1");
    });

    it("should throw ConflictException when different reviewer has lock", async () => {
      const dto: ReviewSessionDto = {
        documentId: "doc-1",
      };

      mockDocumentService.findDocument.mockResolvedValueOnce(mockDocument);
      mockReviewDbService.findActiveLock.mockResolvedValueOnce({
        ...mockDocumentLock,
        reviewer_id: "other-reviewer",
        session_id: "session-2",
      });

      await expect(service.startSession(dto, "reviewer-1")).rejects.toThrow(
        ConflictException,
      );

      expect(mockReviewDbService.createReviewSession).not.toHaveBeenCalled();
    });

    it("should throw NotFoundException if document does not exist", async () => {
      const dto: ReviewSessionDto = {
        documentId: "non-existent",
      };

      mockDocumentService.findDocument.mockResolvedValueOnce(null);

      await expect(service.startSession(dto, "reviewer-1")).rejects.toThrow(
        NotFoundException,
      );

      expect(mockReviewDbService.createReviewSession).not.toHaveBeenCalled();
    });
  });

  describe("getSession", () => {
    it("should return a review session with field definitions", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      const mockFieldDefs = [
        { field_key: "invoice_number", format_spec: null },
        {
          field_key: "total_amount",
          format_spec: '{"canonicalize": "digits", "pattern": "^\\\\d+$"}',
        },
      ];
      mockReviewDbService.findFieldDefinitionsByGroupId.mockResolvedValueOnce(
        mockFieldDefs,
      );

      const result = await service.getSession("session-1");

      expect(mockReviewDbService.findReviewSession).toHaveBeenCalledWith(
        "session-1",
      );
      expect(
        mockReviewDbService.findFieldDefinitionsByGroupId,
      ).toHaveBeenCalledWith("group-1");

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
        fieldDefinitions: mockFieldDefs,
      });
    });

    it("should return empty fieldDefinitions when document has no group_id", async () => {
      const sessionNoGroup = {
        ...mockReviewSession,
        document: {
          ...mockReviewSession.document,
          group_id: null,
        },
      };
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        sessionNoGroup as any,
      );

      const result = await service.getSession("session-1");

      expect(
        mockReviewDbService.findFieldDefinitionsByGroupId,
      ).not.toHaveBeenCalled();
      expect(result.fieldDefinitions).toEqual([]);
    });

    it("should throw NotFoundException if session does not exist", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(null);

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

      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockReviewDbService.createFieldCorrection
        .mockResolvedValueOnce(mockFieldCorrection)
        .mockResolvedValueOnce({
          ...mockFieldCorrection,
          id: "correction-2",
          field_key: "total_amount",
        });

      const result = await service.submitCorrections("session-1", dto);

      expect(mockReviewDbService.findReviewSession).toHaveBeenCalledWith(
        "session-1",
      );
      expect(mockReviewDbService.createFieldCorrection).toHaveBeenCalledTimes(
        2,
      );

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

      mockReviewDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(
        service.submitCorrections("non-existent", dto),
      ).rejects.toThrow(NotFoundException);

      expect(mockReviewDbService.createFieldCorrection).not.toHaveBeenCalled();
    });
  });

  describe("approveSession", () => {
    it("should approve a review session and release the lock", async () => {
      const approvedSession = {
        ...mockReviewSession,
        status: ReviewStatus.approved,
        completed_at: new Date(),
      };

      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockReviewDbService.updateReviewSession.mockResolvedValueOnce(
        approvedSession as any,
      );
      mockReviewDbService.releaseDocumentLock.mockResolvedValueOnce(undefined);

      const result = await service.approveSession("session-1");

      expect(mockReviewDbService.findReviewSession).toHaveBeenCalledWith(
        "session-1",
      );
      expect(mockReviewDbService.updateReviewSession).toHaveBeenCalledWith(
        "session-1",
        {
          status: ReviewStatus.approved,
          completed_at: expect.any(Date),
        },
      );
      expect(mockReviewDbService.releaseDocumentLock).toHaveBeenCalledWith(
        "session-1",
      );

      expect(result).toEqual({
        id: "session-1",
        status: ReviewStatus.approved,
        completedAt: approvedSession.completed_at,
        message: "Review session approved",
      });
    });

    it("should throw NotFoundException if session does not exist", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(service.approveSession("non-existent")).rejects.toThrow(
        NotFoundException,
      );

      expect(mockReviewDbService.updateReviewSession).not.toHaveBeenCalled();
    });
  });

  describe("escalateSession", () => {
    it("should escalate a review session with reason and release the lock", async () => {
      const dto: EscalateDto = {
        reason: "Complex document requiring expert review",
      };

      const escalatedSession = {
        ...mockReviewSession,
        status: ReviewStatus.escalated,
        completed_at: new Date(),
      };

      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockReviewDbService.createFieldCorrection.mockResolvedValueOnce({
        ...mockFieldCorrection,
        field_key: "_escalation",
        original_value: dto.reason,
        action: DbCorrectionAction.flagged,
      });
      mockReviewDbService.updateReviewSession.mockResolvedValueOnce(
        escalatedSession as any,
      );
      mockReviewDbService.releaseDocumentLock.mockResolvedValueOnce(undefined);

      const result = await service.escalateSession("session-1", dto);

      expect(mockReviewDbService.findReviewSession).toHaveBeenCalledWith(
        "session-1",
      );
      expect(mockReviewDbService.createFieldCorrection).toHaveBeenCalledWith(
        "session-1",
        {
          field_key: "_escalation",
          original_value: dto.reason,
          action: DbCorrectionAction.flagged,
        },
      );
      expect(mockReviewDbService.updateReviewSession).toHaveBeenCalledWith(
        "session-1",
        {
          status: ReviewStatus.escalated,
          completed_at: expect.any(Date),
        },
      );
      expect(mockReviewDbService.releaseDocumentLock).toHaveBeenCalledWith(
        "session-1",
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

      mockReviewDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(
        service.escalateSession("non-existent", dto),
      ).rejects.toThrow(NotFoundException);

      expect(mockReviewDbService.createFieldCorrection).not.toHaveBeenCalled();
      expect(mockReviewDbService.updateReviewSession).not.toHaveBeenCalled();
    });
  });

  describe("skipSession", () => {
    it("should skip a review session and release the lock", async () => {
      const skippedSession = {
        ...mockReviewSession,
        status: ReviewStatus.skipped,
        completed_at: new Date(),
      };

      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockReviewDbService.updateReviewSession.mockResolvedValueOnce(
        skippedSession as any,
      );
      mockReviewDbService.releaseDocumentLock.mockResolvedValueOnce(undefined);

      const result = await service.skipSession("session-1");

      expect(mockReviewDbService.findReviewSession).toHaveBeenCalledWith(
        "session-1",
      );
      expect(mockReviewDbService.updateReviewSession).toHaveBeenCalledWith(
        "session-1",
        {
          status: ReviewStatus.skipped,
          completed_at: expect.any(Date),
        },
      );
      expect(mockReviewDbService.releaseDocumentLock).toHaveBeenCalledWith(
        "session-1",
      );

      expect(result).toEqual({
        id: "session-1",
        status: ReviewStatus.skipped,
        message: "Review session skipped",
      });
    });

    it("should throw NotFoundException if session does not exist", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(service.skipSession("non-existent")).rejects.toThrow(
        NotFoundException,
      );

      expect(mockReviewDbService.updateReviewSession).not.toHaveBeenCalled();
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

      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockReviewDbService.findSessionCorrections.mockResolvedValueOnce(
        corrections,
      );

      const result = await service.getCorrections("session-1");

      expect(mockReviewDbService.findReviewSession).toHaveBeenCalledWith(
        "session-1",
      );
      expect(mockReviewDbService.findSessionCorrections).toHaveBeenCalledWith(
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
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(service.getCorrections("non-existent")).rejects.toThrow(
        NotFoundException,
      );

      expect(mockReviewDbService.findSessionCorrections).not.toHaveBeenCalled();
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

  describe("heartbeat", () => {
    it("should refresh lock and return new expiry", async () => {
      mockReviewDbService.refreshLockHeartbeat.mockResolvedValueOnce(true);

      const result = await service.heartbeat("session-1");

      expect(mockReviewDbService.refreshLockHeartbeat).toHaveBeenCalledWith(
        "session-1",
        expect.any(Date),
      );
      expect(result.ok).toBe(true);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it("should throw ConflictException when lock is expired or not found", async () => {
      mockReviewDbService.refreshLockHeartbeat.mockResolvedValueOnce(false);

      await expect(service.heartbeat("session-1")).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("deleteCorrection", () => {
    it("should delete a correction", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockReviewDbService.deleteCorrection.mockResolvedValueOnce(true);

      const result = await service.deleteCorrection(
        "session-1",
        "correction-1",
      );

      expect(mockReviewDbService.findReviewSession).toHaveBeenCalledWith(
        "session-1",
      );
      expect(mockReviewDbService.deleteCorrection).toHaveBeenCalledWith(
        "correction-1",
        "session-1",
      );
      expect(result).toEqual({ deleted: true });
    });

    it("should throw NotFoundException when session not found", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(
        service.deleteCorrection("session-1", "correction-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when correction not found", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockReviewDbService.deleteCorrection.mockResolvedValueOnce(false);

      await expect(
        service.deleteCorrection("session-1", "correction-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("reopenSession", () => {
    it("should reopen a completed session within the 5-minute window", async () => {
      const completedSession = {
        ...mockReviewSession,
        status: ReviewStatus.approved,
        completed_at: new Date(Date.now() - 60_000), // 1 minute ago
        document: {
          ...mockDocumentWithOcr,
          groundTruthJob: null,
        },
      };

      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        completedSession as any,
      );
      mockReviewDbService.updateReviewSession.mockResolvedValueOnce({
        ...completedSession,
        status: ReviewStatus.in_progress,
        completed_at: null,
      } as any);
      mockReviewDbService.acquireDocumentLock.mockResolvedValueOnce(
        mockDocumentLock,
      );

      const result = await service.reopenSession("session-1", "reviewer-1");

      expect(mockReviewDbService.updateReviewSession).toHaveBeenCalledWith(
        "session-1",
        {
          status: ReviewStatus.in_progress,
          completed_at: null,
        },
      );
      expect(mockReviewDbService.acquireDocumentLock).toHaveBeenCalledWith({
        document_id: "doc-1",
        reviewer_id: "reviewer-1",
        session_id: "session-1",
        expires_at: expect.any(Date),
      });
      expect(result).toEqual({
        id: "session-1",
        status: ReviewStatus.in_progress,
        message: "Review session reopened",
      });
    });

    it("should throw ForbiddenException when different reviewer tries to reopen", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );

      await expect(
        service.reopenSession("session-1", "other-reviewer"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw ConflictException when session is already in progress", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );

      await expect(
        service.reopenSession("session-1", "reviewer-1"),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw ConflictException when reopen window has expired", async () => {
      const completedSession = {
        ...mockReviewSession,
        status: ReviewStatus.approved,
        completed_at: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        document: {
          ...mockDocumentWithOcr,
          groundTruthJob: null,
        },
      };

      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        completedSession as any,
      );

      await expect(
        service.reopenSession("session-1", "reviewer-1"),
      ).rejects.toThrow(ConflictException);
    });

    it("should allow reopen for dataset labeling when version is not frozen", async () => {
      const completedSession = {
        ...mockReviewSession,
        status: ReviewStatus.approved,
        completed_at: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        document: {
          ...mockDocumentWithOcr,
          groundTruthJob: {
            id: "gt-1",
            datasetVersion: { frozen: false },
          },
        },
      };

      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        completedSession as any,
      );
      mockReviewDbService.updateReviewSession.mockResolvedValueOnce({
        ...completedSession,
        status: ReviewStatus.in_progress,
        completed_at: null,
      } as any);
      mockReviewDbService.acquireDocumentLock.mockResolvedValueOnce(
        mockDocumentLock,
      );

      const result = await service.reopenSession("session-1", "reviewer-1");

      expect(result.status).toBe(ReviewStatus.in_progress);
    });

    it("should throw ConflictException for dataset labeling when version is frozen", async () => {
      const completedSession = {
        ...mockReviewSession,
        status: ReviewStatus.approved,
        completed_at: new Date(),
        document: {
          ...mockDocumentWithOcr,
          groundTruthJob: {
            id: "gt-1",
            datasetVersion: { frozen: true },
          },
        },
      };

      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        completedSession as any,
      );

      await expect(
        service.reopenSession("session-1", "reviewer-1"),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw NotFoundException when session not found", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(
        service.reopenSession("session-1", "reviewer-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getNextSession", () => {
    it("should return a new session for the first eligible document", async () => {
      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([
        mockDocumentWithOcr,
      ] as any);
      mockDocumentService.findDocument.mockResolvedValueOnce(mockDocument);
      mockReviewDbService.findActiveLock.mockResolvedValueOnce(null);
      mockReviewDbService.createReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockReviewDbService.acquireDocumentLock.mockResolvedValueOnce(
        mockDocumentLock,
      );

      const result = await service.getNextSession({}, "reviewer-1", [
        "group-1",
      ]);

      expect(mockReviewDbService.findReviewQueue).toHaveBeenCalledWith({
        status: DocumentStatus.completed_ocr,
        modelId: undefined,
        maxConfidence: 0.9,
        limit: 10,
        reviewStatus: "pending",
        groupIds: ["group-1"],
      });
      expect(result).not.toBeNull();
      expect(result?.id).toBe("session-1");
    });

    it("should return null when no eligible documents", async () => {
      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([]);

      const result = await service.getNextSession({}, "reviewer-1", [
        "group-1",
      ]);

      expect(result).toBeNull();
    });

    it("should return null when documents have high confidence", async () => {
      const highConfDoc = {
        ...mockDocument,
        ocr_result: {
          ...mockOcrResult,
          keyValuePairs: {
            field1: { type: "string", content: "value", confidence: 0.95 },
          },
        },
      };
      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([
        highConfDoc,
      ] as any);

      const result = await service.getNextSession({}, "reviewer-1", [
        "group-1",
      ]);

      expect(result).toBeNull();
    });
  });
});
