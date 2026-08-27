import {
  CorrectionAction as DbCorrectionAction,
  DocumentStatus,
  Prisma,
  ReviewStatus,
} from "@generated/client";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditService } from "@/audit/audit.service";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { DocumentService } from "../document/document.service";
import { AnalyticsService } from "./analytics.service";
import { CorrectionAction, SubmitCorrectionsDto } from "./dto/correction.dto";
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
    normalized_file_path: "/path/to/normalized.pdf",
    file_type: "pdf",
    file_size: 1000,
    content_hash:
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    metadata: {},
    source: "upload",
    status: DocumentStatus.extracted,
    model_id: "model-1",
    apim_request_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    purged_at: null,
    workflow_id: null,
    workflow_config_id: null,
    workflow_execution_id: null,
    group_id: "group-1",
    review_plan: null,
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
      updateDocument: jest.fn().mockResolvedValue(undefined),
    };

    const mockReviewDb = {
      findReviewQueue: jest.fn(),
      countReviewQueue: jest.fn().mockResolvedValue(0),
      findQueueFieldPayloads: jest.fn().mockResolvedValue([]),
      countApprovedSessionsSince: jest.fn().mockResolvedValue(0),
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
      findFieldDefinitionsForDocument: jest.fn().mockResolvedValue([]),
    };

    const mockAnalytics = {
      getAnalytics: jest.fn(),
    };

    const mockPrismaService = {
      transaction: jest.fn(
        async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          fn({} as Prisma.TransactionClient),
      ),
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
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ModuleRef,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
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
      mockReviewDbService.countReviewQueue.mockResolvedValueOnce(137);

      const result = await service.getQueue(filters);

      expect(mockReviewDbService.findReviewQueue).toHaveBeenCalledWith({
        statuses: [DocumentStatus.awaiting_review],
        modelId: undefined,
        maxConfidence: 0.9,
        limit: 50,
        offset: 0,
        reviewStatus: "pending",
        groupIds: undefined,
        currentReviewerId: undefined,
      });

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].id).toBe("doc-1");
      expect(result.documents[0].ocr_result.fields).toEqual(
        mockOcrResult.keyValuePairs,
      );
      // The total counts the whole queue, not the page that was returned
      expect(result.total).toBe(137);
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
            actor_id: "reviewer-1",
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
          statuses: [DocumentStatus.extracted, DocumentStatus.awaiting_review],
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

    it("should include complete documents in the REVIEWED filter so approved docs appear", async () => {
      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([
        mockDocumentWithOcr as any,
      ]);

      await service.getQueue({ reviewStatus: ReviewStatusFilter.REVIEWED });

      expect(mockReviewDbService.findReviewQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          statuses: [DocumentStatus.awaiting_review, DocumentStatus.complete],
        }),
      );
    });

    it("should NOT include complete documents in the pending filter", async () => {
      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([]);

      await service.getQueue({ reviewStatus: ReviewStatusFilter.PENDING });

      expect(mockReviewDbService.findReviewQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          statuses: [DocumentStatus.awaiting_review],
        }),
      );
    });

    it("should use default values for optional filters", async () => {
      mockReviewDbService.findReviewQueue.mockResolvedValueOnce([]);

      await service.getQueue({});

      expect(mockReviewDbService.findReviewQueue).toHaveBeenCalledWith({
        statuses: [DocumentStatus.awaiting_review],
        modelId: undefined,
        maxConfidence: 0.9,
        limit: 50,
        offset: 0,
        reviewStatus: "pending",
        groupIds: undefined,
        currentReviewerId: undefined,
      });
    });
  });

  describe("getQueueStats", () => {
    it("should count the whole queue rather than one page of it", async () => {
      mockReviewDbService.countReviewQueue
        .mockResolvedValueOnce(320) // total reviewable documents
        .mockResolvedValueOnce(214); // pending documents
      mockReviewDbService.findQueueFieldPayloads.mockResolvedValueOnce([
        { a: { confidence: 0.9 }, b: { confidence: 0.7 } },
        { a: { confidence: 0.6 } },
      ]);
      mockReviewDbService.countApprovedSessionsSince.mockResolvedValueOnce(7);

      const result = await service.getQueueStats();

      expect(result).toEqual({
        totalDocuments: 320,
        requiresReview: 214,
        averageConfidence: 0.7,
        reviewedToday: 7,
      });
    });

    it("should count reviewed-today from midnight and scope every count to the caller's groups and identity", async () => {
      mockReviewDbService.countReviewQueue.mockResolvedValue(0);
      mockReviewDbService.findQueueFieldPayloads.mockResolvedValueOnce([]);
      mockReviewDbService.countApprovedSessionsSince.mockResolvedValueOnce(0);

      await service.getQueueStats(["group-1"], "reviewer-1");

      expect(mockReviewDbService.countReviewQueue).toHaveBeenCalledWith({
        statuses: [DocumentStatus.awaiting_review, DocumentStatus.complete],
        reviewStatus: "all",
        groupIds: ["group-1"],
        currentReviewerId: "reviewer-1",
      });
      // The caller's own locked document still counts as theirs to review,
      // so this must match what the Pending tab lists.
      expect(mockReviewDbService.countReviewQueue).toHaveBeenCalledWith({
        statuses: [DocumentStatus.awaiting_review],
        reviewStatus: "pending",
        groupIds: ["group-1"],
        currentReviewerId: "reviewer-1",
      });

      const [since, groupIds] =
        mockReviewDbService.countApprovedSessionsSince.mock.calls[0];
      expect(groupIds).toEqual(["group-1"]);
      expect(since.getHours()).toBe(0);
      expect(since.getMinutes()).toBe(0);
      expect(since.toDateString()).toBe(new Date().toDateString());
    });

    it("should report zero average confidence when no document carries field confidence", async () => {
      mockReviewDbService.countReviewQueue.mockResolvedValue(0);
      mockReviewDbService.findQueueFieldPayloads.mockResolvedValueOnce([
        { a: { content: "no confidence here" } },
        null,
      ] as any);
      mockReviewDbService.countApprovedSessionsSince.mockResolvedValueOnce(0);

      const result = await service.getQueueStats();

      expect(result.averageConfidence).toBe(0);
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
        expect.anything(),
      );
      expect(mockReviewDbService.acquireDocumentLock).toHaveBeenCalledWith(
        {
          document_id: "doc-1",
          reviewer_id: "reviewer-1",
          session_id: "session-1",
          expires_at: expect.any(Date),
        },
        expect.anything(),
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
      mockReviewDbService.findFieldDefinitionsForDocument.mockResolvedValueOnce(
        mockFieldDefs,
      );

      const result = await service.getSession("session-1");

      expect(mockReviewDbService.findReviewSession).toHaveBeenCalledWith(
        "session-1",
      );
      expect(
        mockReviewDbService.findFieldDefinitionsForDocument,
      ).toHaveBeenCalledWith({
        templateModelId: undefined,
        groupId: "group-1",
      });

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

    it("should pass templateModelId from document metadata when present", async () => {
      const sessionWithTemplateId = {
        ...mockReviewSession,
        document: {
          ...mockReviewSession.document,
          metadata: { templateModelId: "tmpl-123" },
        },
      };
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        sessionWithTemplateId as any,
      );
      mockReviewDbService.findFieldDefinitionsForDocument.mockResolvedValueOnce(
        [],
      );

      await service.getSession("session-1");

      expect(
        mockReviewDbService.findFieldDefinitionsForDocument,
      ).toHaveBeenCalledWith({
        templateModelId: "tmpl-123",
        groupId: "group-1",
      });
    });

    it("should return empty fieldDefinitions when document has no group_id and no templateModelId", async () => {
      const sessionNoGroup = {
        ...mockReviewSession,
        document: {
          ...mockReviewSession.document,
          group_id: null,
          metadata: {},
        },
      };
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        sessionNoGroup as any,
      );

      const result = await service.getSession("session-1");

      expect(
        mockReviewDbService.findFieldDefinitionsForDocument,
      ).not.toHaveBeenCalled();
      expect(result.fieldDefinitions).toEqual([]);
    });

    it("should still call lookup when templateModelId is set even without group_id", async () => {
      const sessionTemplateOnly = {
        ...mockReviewSession,
        document: {
          ...mockReviewSession.document,
          group_id: null,
          metadata: { templateModelId: "tmpl-456" },
        },
      };
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        sessionTemplateOnly as any,
      );
      mockReviewDbService.findFieldDefinitionsForDocument.mockResolvedValueOnce(
        [],
      );

      await service.getSession("session-1");

      expect(
        mockReviewDbService.findFieldDefinitionsForDocument,
      ).toHaveBeenCalledWith({
        templateModelId: "tmpl-456",
        groupId: null,
      });
    });

    it("should return reviewPlan when document.review_plan is a well-formed array", async () => {
      const reviewPlan = [
        {
          field: "total_amount",
          decision: "review",
          reason: "Low confidence extraction",
          ruleName: "low-confidence",
          confidence: 0.4,
        },
        {
          field: "invoice_number",
          decision: "skip",
          reason: 'No rule matched; default action "skip" applied',
          ruleName: "__default__",
          confidence: 0.99,
        },
      ];
      const sessionWithReviewPlan = {
        ...mockReviewSession,
        document: {
          ...mockReviewSession.document,
          review_plan: reviewPlan,
        },
      };
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        sessionWithReviewPlan as any,
      );
      mockReviewDbService.findFieldDefinitionsForDocument.mockResolvedValueOnce(
        [],
      );

      const result = await service.getSession("session-1");

      expect(result.reviewPlan).toEqual(reviewPlan);
    });

    it("should omit reviewPlan when document.review_plan is null", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockReviewDbService.findFieldDefinitionsForDocument.mockResolvedValueOnce(
        [],
      );

      const result = await service.getSession("session-1");

      expect(result.reviewPlan).toBeUndefined();
    });

    it("should omit reviewPlan when document.review_plan is malformed", async () => {
      const sessionWithBadReviewPlan = {
        ...mockReviewSession,
        document: {
          ...mockReviewSession.document,
          review_plan: [{ field: "total_amount" }], // missing required keys
        },
      };
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        sessionWithBadReviewPlan as any,
      );
      mockReviewDbService.findFieldDefinitionsForDocument.mockResolvedValueOnce(
        [],
      );

      const result = await service.getSession("session-1");

      expect(result.reviewPlan).toBeUndefined();
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
        expect.anything(),
      );
      expect(mockReviewDbService.releaseDocumentLock).toHaveBeenCalledWith(
        "session-1",
        expect.anything(),
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

  describe("skipSession", () => {
    it("should abandon the session and release the lock", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockReviewDbService.updateReviewSession.mockResolvedValueOnce({
        ...mockReviewSession,
        status: ReviewStatus.abandoned,
      } as any);
      mockReviewDbService.releaseDocumentLock.mockResolvedValueOnce(undefined);

      const result = await service.skipSession("session-1");

      expect(mockReviewDbService.findReviewSession).toHaveBeenCalledWith(
        "session-1",
      );
      expect(mockReviewDbService.updateReviewSession).toHaveBeenCalledWith(
        "session-1",
        { status: ReviewStatus.abandoned },
        expect.anything(),
      );
      expect(mockReviewDbService.releaseDocumentLock).toHaveBeenCalledWith(
        "session-1",
        expect.anything(),
      );
      expect(result).toEqual({
        id: "session-1",
        status: ReviewStatus.abandoned,
        message: "Lock released, document returned to queue",
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

  describe("flagSession", () => {
    it("should set status to flagged and release the lock", async () => {
      const flaggedSession = {
        ...mockReviewSession,
        status: ReviewStatus.flagged,
      };

      mockReviewDbService.findReviewSession.mockResolvedValueOnce(
        mockReviewSession as any,
      );
      mockReviewDbService.updateReviewSession.mockResolvedValueOnce(
        flaggedSession as any,
      );
      mockReviewDbService.releaseDocumentLock.mockResolvedValueOnce(undefined);

      const result = await service.flagSession("session-1");

      expect(mockReviewDbService.updateReviewSession).toHaveBeenCalledWith(
        "session-1",
        { status: ReviewStatus.flagged },
        expect.anything(),
      );
      expect(mockReviewDbService.releaseDocumentLock).toHaveBeenCalledWith(
        "session-1",
        expect.anything(),
      );
      expect(result).toEqual({
        id: "session-1",
        status: ReviewStatus.flagged,
        message: "Review session flagged",
      });
    });

    it("should throw NotFoundException if session does not exist", async () => {
      mockReviewDbService.findReviewSession.mockResolvedValueOnce(null);

      await expect(service.flagSession("non-existent")).rejects.toThrow(
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
        expect.anything(),
      );
      expect(mockDocumentService.updateDocument).toHaveBeenCalledWith(
        "doc-1",
        { status: DocumentStatus.awaiting_review },
        expect.anything(),
      );
      expect(mockReviewDbService.acquireDocumentLock).toHaveBeenCalledWith(
        {
          document_id: "doc-1",
          reviewer_id: "reviewer-1",
          session_id: "session-1",
          expires_at: expect.any(Date),
        },
        expect.anything(),
      );
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
        statuses: [DocumentStatus.awaiting_review],
        modelId: undefined,
        maxConfidence: 0.9,
        limit: 10,
        reviewStatus: "pending",
        groupIds: ["group-1"],
        currentReviewerId: "reviewer-1",
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
