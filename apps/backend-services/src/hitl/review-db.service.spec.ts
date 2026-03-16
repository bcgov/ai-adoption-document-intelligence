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
};

const mockDocument = {
  findMany: jest.fn(),
};

const mockPrismaClient = {
  reviewSession: mockReviewSession,
  fieldCorrection: mockFieldCorrection,
  document: mockDocument,
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
          reviewer_id: "reviewer-1",
          status: ReviewStatus.in_progress,
        },
        include: {
          document: { include: { ocr_result: true } },
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
          document: { include: { ocr_result: true } },
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
        where: expect.objectContaining({ reviewer_id: "reviewer-1" }),
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

    it("should use provided tx client instead of this.prisma for findReviewSession", async () => {
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
  });
});
