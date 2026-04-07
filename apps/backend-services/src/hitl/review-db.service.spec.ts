import {
  CorrectionAction,
  DocumentStatus,
  ReviewStatus,
} from "@generated/client";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { PrismaService } from "../database/prisma.service";
import { ReviewDbService } from "./review-db.service";
import type { ReviewSessionData } from "./review-db.types";

const mockReviewSession = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
  findMany: jest.fn(),
};

const mockFieldCorrection = {
  create: jest.fn(),
  findMany: jest.fn(),
  deleteMany: jest.fn(),
};

const mockDocument = {
  findMany: jest.fn(),
};

const mockDocumentLock = {
  create: jest.fn(),
  upsert: jest.fn(),
  deleteMany: jest.fn(),
  updateMany: jest.fn(),
  findFirst: jest.fn(),
};

const mockPrismaClient = {
  reviewSession: mockReviewSession,
  fieldCorrection: mockFieldCorrection,
  document: mockDocument,
  documentLock: mockDocumentLock,
};

const mockPrismaService = {
  get prisma() {
    return mockPrismaClient;
  },
};

const makeReviewSession = (
  overrides: Partial<ReviewSessionData> = {},
): ReviewSessionData =>
  ({
    id: "session-1",
    document_id: "doc-1",
    reviewer_id: "reviewer-1",
    status: ReviewStatus.in_progress,
    started_at: new Date("2024-01-01"),
    completed_at: null,
    document: {
      id: "doc-1",
      title: "Test Document",
      original_filename: "test.pdf",
      file_path: "documents/doc-1/original.pdf",
      file_type: "pdf",
      file_size: 1024,
      metadata: {},
      source: "upload",
      status: DocumentStatus.completed_ocr,
      apim_request_id: null,
      model_id: "model-1",
      workflow_id: null,
      workflow_config_id: null,
      workflow_execution_id: null,
      group_id: "group-1",
      created_at: new Date("2024-01-01"),
      updated_at: new Date("2024-01-01"),
      ocr_result: null,
    },
    corrections: [],
    ...overrides,
  }) as unknown as ReviewSessionData;

const makeFieldCorrection = () => ({
  id: "correction-1",
  session_id: "session-1",
  field_key: "invoice_number",
  original_value: "INV-123",
  corrected_value: "INV-12345",
  original_conf: 0.85,
  action: CorrectionAction.corrected,
  created_at: new Date("2024-01-01"),
});

describe("ReviewDbService", () => {
  let service: ReviewDbService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReviewDbService(
      mockPrismaService as unknown as PrismaService,
      mockAppLogger,
    );
  });

  describe("createReviewSession", () => {
    it("should create and return a review session", async () => {
      const session = makeReviewSession();
      mockReviewSession.create.mockResolvedValue(session);

      const result = await service.createReviewSession("doc-1", "reviewer-1");

      expect(result).toEqual(session);
      expect(mockReviewSession.create).toHaveBeenCalledWith({
        data: {
          document_id: "doc-1",
          actor_id: "reviewer-1",
          status: ReviewStatus.in_progress,
        },
        include: {
          document: {
            include: {
              ocr_result: true,
              groundTruthJob: {
                include: {
                  datasetVersion: { select: { frozen: true } },
                },
              },
            },
          },
          corrections: true,
        },
      });
    });

    it("should throw if prisma create fails", async () => {
      mockReviewSession.create.mockRejectedValue(new Error("DB error"));
      await expect(
        service.createReviewSession("doc-1", "reviewer-1"),
      ).rejects.toThrow("DB error");
    });
  });

  describe("findReviewSession", () => {
    it("should return a session when found", async () => {
      const session = makeReviewSession();
      mockReviewSession.findUnique.mockResolvedValue(session);

      const result = await service.findReviewSession("session-1");

      expect(result).toEqual(session);
      expect(mockReviewSession.findUnique).toHaveBeenCalledWith({
        where: { id: "session-1" },
        include: {
          document: {
            include: {
              ocr_result: true,
              groundTruthJob: {
                include: {
                  datasetVersion: { select: { frozen: true } },
                },
              },
            },
          },
          corrections: true,
        },
      });
    });

    it("should return null when session is not found", async () => {
      mockReviewSession.findUnique.mockResolvedValue(null);

      const result = await service.findReviewSession("not-found");

      expect(result).toBeNull();
    });
  });

  describe("findReviewQueue", () => {
    it("should return documents matching default filters", async () => {
      const docs = [{ id: "doc-1" }];
      mockDocument.findMany.mockResolvedValue(docs);

      const result = await service.findReviewQueue({});

      expect(result).toEqual(docs);
      expect(mockDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: DocumentStatus.completed_ocr,
          }),
          take: 50,
          skip: 0,
        }),
      );
    });

    it("should restrict the queue to api-sourced documents and exclude ground truth jobs", async () => {
      mockDocument.findMany.mockResolvedValue([]);

      await service.findReviewQueue({});

      expect(mockDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            source: "api",
            groundTruthJob: { is: null },
          }),
        }),
      );
    });

    it("should apply pending review status filter", async () => {
      mockDocument.findMany.mockResolvedValue([]);

      await service.findReviewQueue({ reviewStatus: "pending" });

      expect(mockDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ review_sessions: { none: {} } }]),
          }),
        }),
      );
    });

    it("should apply reviewed review status filter", async () => {
      mockDocument.findMany.mockResolvedValue([]);

      await service.findReviewQueue({ reviewStatus: "reviewed" });

      expect(mockDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            review_sessions: { some: { status: { in: expect.any(Array) } } },
          }),
        }),
      );
    });

    it("should apply groupIds filter", async () => {
      mockDocument.findMany.mockResolvedValue([]);

      await service.findReviewQueue({ groupIds: ["g-1", "g-2"] });

      expect(mockDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            group_id: { in: ["g-1", "g-2"] },
          }),
        }),
      );
    });

    it("should apply modelId filter", async () => {
      mockDocument.findMany.mockResolvedValue([]);

      await service.findReviewQueue({ modelId: "model-42" });

      expect(mockDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ model_id: "model-42" }),
        }),
      );
    });

    it("should apply limit and offset", async () => {
      mockDocument.findMany.mockResolvedValue([]);

      await service.findReviewQueue({ limit: 10, offset: 5 });

      expect(mockDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 5 }),
      );
    });

    it("should exclude documents with active locks", async () => {
      mockDocument.findMany.mockResolvedValue([]);

      await service.findReviewQueue({});

      expect(mockDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            NOT: {
              lock: {
                expires_at: { gt: expect.any(Date) },
              },
            },
          }),
        }),
      );
    });
  });

  describe("updateReviewSession", () => {
    it("should update and return the session", async () => {
      const updated = makeReviewSession({
        status: ReviewStatus.approved,
        completed_at: new Date("2024-01-02"),
      });
      mockReviewSession.update.mockResolvedValue(updated);

      const result = await service.updateReviewSession("session-1", {
        status: ReviewStatus.approved,
        completed_at: new Date("2024-01-02"),
      });

      expect(result).toEqual(updated);
      expect(mockReviewSession.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: expect.objectContaining({ status: ReviewStatus.approved }),
        include: { document: true, corrections: true },
      });
    });

    it("should return null when session is not found (P2025)", async () => {
      mockReviewSession.update.mockRejectedValue({ code: "P2025" });

      const result = await service.updateReviewSession("not-found", {
        status: ReviewStatus.skipped,
      });

      expect(result).toBeNull();
    });

    it("should rethrow non-P2025 errors", async () => {
      mockReviewSession.update.mockRejectedValue(new Error("DB error"));

      await expect(
        service.updateReviewSession("session-1", {
          status: ReviewStatus.approved,
        }),
      ).rejects.toThrow("DB error");
    });
  });

  describe("createFieldCorrection", () => {
    it("should create and return a field correction", async () => {
      const correction = makeFieldCorrection();
      mockFieldCorrection.create.mockResolvedValue(correction);

      const result = await service.createFieldCorrection("session-1", {
        field_key: "invoice_number",
        original_value: "INV-123",
        corrected_value: "INV-12345",
        original_conf: 0.85,
        action: CorrectionAction.corrected,
      });

      expect(result).toEqual(correction);
      expect(mockFieldCorrection.create).toHaveBeenCalledWith({
        data: {
          session_id: "session-1",
          field_key: "invoice_number",
          original_value: "INV-123",
          corrected_value: "INV-12345",
          original_conf: 0.85,
          action: CorrectionAction.corrected,
        },
      });
    });
  });

  describe("findSessionCorrections", () => {
    it("should return corrections for a session", async () => {
      const corrections = [makeFieldCorrection()];
      mockFieldCorrection.findMany.mockResolvedValue(corrections);

      const result = await service.findSessionCorrections("session-1");

      expect(result).toEqual(corrections);
      expect(mockFieldCorrection.findMany).toHaveBeenCalledWith({
        where: { session_id: "session-1" },
        orderBy: { created_at: "asc" },
      });
    });

    it("should return an empty array when none are found", async () => {
      mockFieldCorrection.findMany.mockResolvedValue([]);

      const result = await service.findSessionCorrections(
        "session-no-corrections",
      );

      expect(result).toEqual([]);
    });
  });

  describe("getReviewAnalytics", () => {
    it("should return analytics with correct calculations", async () => {
      const sessions = [
        { status: ReviewStatus.approved },
        { status: ReviewStatus.in_progress },
      ];
      const corrections = [
        { action: CorrectionAction.corrected, original_conf: 0.8 },
        { action: CorrectionAction.corrected, original_conf: 0.9 },
        { action: "confirmed", original_conf: null },
      ];
      mockReviewSession.findMany.mockResolvedValue(sessions);
      mockFieldCorrection.findMany.mockResolvedValue(corrections);

      const result = await service.getReviewAnalytics({});

      expect(result.totalSessions).toBe(2);
      expect(result.completedSessions).toBe(1);
      expect(result.totalCorrections).toBe(3);
      expect(result.correctionsByAction[CorrectionAction.corrected]).toBe(2);
      expect(result.correctionsByAction["confirmed"]).toBe(1);
      expect(result.averageConfidence).toBe(0.85);
    });

    it("should return 0 averageConfidence when no corrections have confidence", async () => {
      mockReviewSession.findMany.mockResolvedValue([]);
      mockFieldCorrection.findMany.mockResolvedValue([]);

      const result = await service.getReviewAnalytics({});

      expect(result.averageConfidence).toBe(0);
      expect(result.totalSessions).toBe(0);
      expect(result.totalCorrections).toBe(0);
    });

    it("should apply date range filters", async () => {
      mockReviewSession.findMany.mockResolvedValue([]);
      mockFieldCorrection.findMany.mockResolvedValue([]);

      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-12-31");
      await service.getReviewAnalytics({ startDate, endDate });

      expect(mockReviewSession.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          started_at: { gte: startDate, lte: endDate },
        }),
      });
    });

    it("should apply reviewerId filter", async () => {
      mockReviewSession.findMany.mockResolvedValue([]);
      mockFieldCorrection.findMany.mockResolvedValue([]);

      await service.getReviewAnalytics({ reviewerId: "reviewer-1" });

      expect(mockReviewSession.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ actor_id: "reviewer-1" }),
      });
    });

    it("should apply groupIds filter", async () => {
      mockReviewSession.findMany.mockResolvedValue([]);
      mockFieldCorrection.findMany.mockResolvedValue([]);

      await service.getReviewAnalytics({ groupIds: ["g-1"] });

      expect(mockReviewSession.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          document: { group_id: { in: ["g-1"] } },
        }),
      });
    });
  });

  describe("acquireDocumentLock", () => {
    it("should upsert and return a document lock, reclaiming stale rows", async () => {
      const lockData = {
        document_id: "doc-1",
        reviewer_id: "reviewer-1",
        session_id: "session-1",
        expires_at: new Date("2024-01-01T01:00:00Z"),
      };
      const upsertedLock = { id: "lock-1", ...lockData };
      mockDocumentLock.upsert.mockResolvedValue(upsertedLock);

      const result = await service.acquireDocumentLock(lockData);

      expect(result).toEqual(upsertedLock);
      expect(mockDocumentLock.upsert).toHaveBeenCalledWith({
        where: { document_id: "doc-1" },
        update: expect.objectContaining({
          reviewer_id: "reviewer-1",
          session_id: "session-1",
          expires_at: lockData.expires_at,
        }),
        create: lockData,
      });
    });

    it("should throw if prisma upsert fails", async () => {
      mockDocumentLock.upsert.mockRejectedValue(new Error("DB error"));

      await expect(
        service.acquireDocumentLock({
          document_id: "doc-1",
          reviewer_id: "reviewer-1",
          session_id: "session-1",
          expires_at: new Date(),
        }),
      ).rejects.toThrow("DB error");
    });
  });

  describe("releaseDocumentLock", () => {
    it("should delete locks by session ID", async () => {
      mockDocumentLock.deleteMany.mockResolvedValue({ count: 1 });

      await service.releaseDocumentLock("session-1");

      expect(mockDocumentLock.deleteMany).toHaveBeenCalledWith({
        where: { session_id: "session-1" },
      });
    });

    it("should not throw when no lock exists", async () => {
      mockDocumentLock.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.releaseDocumentLock("no-lock-session"),
      ).resolves.toBeUndefined();
    });
  });

  describe("refreshLockHeartbeat", () => {
    it("should return true when lock is updated", async () => {
      mockDocumentLock.updateMany.mockResolvedValue({ count: 1 });
      const expiresAt = new Date("2024-01-01T02:00:00Z");

      const result = await service.refreshLockHeartbeat("session-1", expiresAt);

      expect(result).toBe(true);
      expect(mockDocumentLock.updateMany).toHaveBeenCalledWith({
        where: { session_id: "session-1" },
        data: {
          last_heartbeat: expect.any(Date),
          expires_at: expiresAt,
        },
      });
    });

    it("should return false when no lock is found", async () => {
      mockDocumentLock.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.refreshLockHeartbeat(
        "missing-session",
        new Date(),
      );

      expect(result).toBe(false);
    });
  });

  describe("findActiveLock", () => {
    it("should return an active lock when found", async () => {
      const lock = {
        id: "lock-1",
        document_id: "doc-1",
        reviewer_id: "reviewer-1",
        session_id: "session-1",
        expires_at: new Date("2099-01-01"),
      };
      mockDocumentLock.findFirst.mockResolvedValue(lock);

      const result = await service.findActiveLock("doc-1");

      expect(result).toEqual(lock);
      expect(mockDocumentLock.findFirst).toHaveBeenCalledWith({
        where: {
          document_id: "doc-1",
          expires_at: { gt: expect.any(Date) },
        },
      });
    });

    it("should return null when no active lock exists", async () => {
      mockDocumentLock.findFirst.mockResolvedValue(null);

      const result = await service.findActiveLock("doc-no-lock");

      expect(result).toBeNull();
    });
  });

  describe("deleteCorrection", () => {
    it("should return true when correction is deleted", async () => {
      mockFieldCorrection.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteCorrection(
        "correction-1",
        "session-1",
      );

      expect(result).toBe(true);
      expect(mockFieldCorrection.deleteMany).toHaveBeenCalledWith({
        where: { id: "correction-1", session_id: "session-1" },
      });
    });

    it("should return false when correction is not found", async () => {
      mockFieldCorrection.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.deleteCorrection("missing", "session-1");

      expect(result).toBe(false);
    });
  });

  describe("transaction support", () => {
    it("should use provided tx client instead of this.prisma for createReviewSession", async () => {
      const session = makeReviewSession();
      const mockTxReviewSession = {
        create: jest.fn().mockResolvedValue(session),
      };
      const mockTx = { reviewSession: mockTxReviewSession } as any;

      const result = await service.createReviewSession(
        "doc-1",
        "reviewer-1",
        mockTx,
      );

      expect(result).toEqual(session);
      expect(mockTxReviewSession.create).toHaveBeenCalled();
      expect(mockReviewSession.create).not.toHaveBeenCalled();
    });

    it("should use provided tx client for findReviewSession", async () => {
      const session = makeReviewSession();
      const mockTxReviewSession = {
        findUnique: jest.fn().mockResolvedValue(session),
      };
      const mockTx = { reviewSession: mockTxReviewSession } as any;

      const result = await service.findReviewSession("session-1", mockTx);

      expect(result).toEqual(session);
      expect(mockTxReviewSession.findUnique).toHaveBeenCalled();
      expect(mockReviewSession.findUnique).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for updateReviewSession", async () => {
      const session = makeReviewSession({ status: ReviewStatus.approved });
      const mockTxReviewSession = {
        update: jest.fn().mockResolvedValue(session),
      };
      const mockTx = { reviewSession: mockTxReviewSession } as any;

      const result = await service.updateReviewSession(
        "session-1",
        { status: ReviewStatus.approved, completed_at: new Date() },
        mockTx,
      );

      expect(result).toEqual(session);
      expect(mockTxReviewSession.update).toHaveBeenCalled();
      expect(mockReviewSession.update).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for createFieldCorrection", async () => {
      const correction = makeFieldCorrection();
      const mockTxFieldCorrection = {
        create: jest.fn().mockResolvedValue(correction),
      };
      const mockTx = { fieldCorrection: mockTxFieldCorrection } as any;

      const result = await service.createFieldCorrection(
        "session-1",
        { field_key: "invoice_number", action: CorrectionAction.corrected },
        mockTx,
      );

      expect(result).toEqual(correction);
      expect(mockTxFieldCorrection.create).toHaveBeenCalled();
      expect(mockFieldCorrection.create).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for acquireDocumentLock", async () => {
      const lock = { id: "lock-1", document_id: "doc-1" };
      const mockTxDocumentLock = {
        upsert: jest.fn().mockResolvedValue(lock),
      };
      const mockTx = { documentLock: mockTxDocumentLock } as never;

      const result = await service.acquireDocumentLock(
        {
          document_id: "doc-1",
          reviewer_id: "reviewer-1",
          session_id: "session-1",
          expires_at: new Date(),
        },
        mockTx,
      );

      expect(result).toEqual(lock);
      expect(mockTxDocumentLock.upsert).toHaveBeenCalled();
      expect(mockDocumentLock.upsert).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for releaseDocumentLock", async () => {
      const mockTxDocumentLock = {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      const mockTx = { documentLock: mockTxDocumentLock } as never;

      await service.releaseDocumentLock("session-1", mockTx);

      expect(mockTxDocumentLock.deleteMany).toHaveBeenCalled();
      expect(mockDocumentLock.deleteMany).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for refreshLockHeartbeat", async () => {
      const mockTxDocumentLock = {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      const mockTx = { documentLock: mockTxDocumentLock } as never;

      const result = await service.refreshLockHeartbeat(
        "session-1",
        new Date(),
        mockTx,
      );

      expect(result).toBe(true);
      expect(mockTxDocumentLock.updateMany).toHaveBeenCalled();
      expect(mockDocumentLock.updateMany).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for findActiveLock", async () => {
      const mockTxDocumentLock = {
        findFirst: jest.fn().mockResolvedValue(null),
      };
      const mockTx = { documentLock: mockTxDocumentLock } as never;

      const result = await service.findActiveLock("doc-1", mockTx);

      expect(result).toBeNull();
      expect(mockTxDocumentLock.findFirst).toHaveBeenCalled();
      expect(mockDocumentLock.findFirst).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for deleteCorrection", async () => {
      const mockTxFieldCorrection = {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      const mockTx = { fieldCorrection: mockTxFieldCorrection } as never;

      const result = await service.deleteCorrection(
        "correction-1",
        "session-1",
        mockTx,
      );

      expect(result).toBe(true);
      expect(mockTxFieldCorrection.deleteMany).toHaveBeenCalled();
      expect(mockFieldCorrection.deleteMany).not.toHaveBeenCalled();
    });
  });
});
