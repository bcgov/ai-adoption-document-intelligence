// Mock out the prisma client
jest.mock("@generated/client", () => {
  const DocumentStatus = {
    pre_ocr: "pre_ocr",
    ongoing_ocr: "ongoing_ocr",
    completed_ocr: "completed_ocr",
    failed: "failed",
  };
  const ReviewStatus = {
    in_progress: "in_progress",
    approved: "approved",
    escalated: "escalated",
    skipped: "skipped",
  };
  const CorrectionAction = {
    corrected: "corrected",
    confirmed: "confirmed",
    deleted: "deleted",
  };
  return {
    DocumentStatus,
    ReviewStatus,
    CorrectionAction,
    PrismaClient: jest.fn().mockImplementation(() => ({
      document: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      ocrResult: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
      reviewSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      fieldCorrection: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((arg) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        return Promise.resolve();
      }),
    })),
  };
});

import {
  CorrectionAction,
  DocumentStatus,
  OcrResult,
  ReviewStatus,
} from "@generated/client";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { AnalysisResponse, AnalysisResult } from "../ocr/azure-types";
import { DatabaseService } from "./database.service";
import { PrismaService } from "./prisma.service";
import { ReviewDbService } from "./review-db.service";

const defaultDocument = {
  title: "Test",
  original_filename: "file.pdf",
  file_path: "/tmp/file.pdf",
  file_type: "pdf",
  file_size: 123,
  metadata: {},
  source: "upload",
  status: DocumentStatus.pre_ocr,
};

const defaultOcrResult: OcrResult = {
  id: "123",
  processed_at: new Date(),
  keyValuePairs: {
    field1: { type: "string", content: "value1", confidence: 0.95 },
  },
  document_id: "456",
  enrichment_summary: null,
};

const analysisResult: AnalysisResult = {
  apiVersion: "v1",
  modelId: "layout",
  stringIndexType: "",
  content: "a bunch of content",
  pages: [],
  tables: [],
  paragraphs: [],
  styles: [],
  contentFormat: "json",
  sections: [],
  figures: [],
  keyValuePairs: [
    {
      key: {
        content: "field1",
        boundingRegions: [],
        spans: [],
      },
      value: {
        content: "value1",
        boundingRegions: [],
        spans: [],
      },
      confidence: 0.95,
    },
  ],
};
const analysisResponse: AnalysisResponse = {
  status: "200",
  analyzeResult: analysisResult,
  lastUpdatedDateTime: Date.now().toString(),
  createdDateTime: Date.now().toString(),
};

const defaultReviewSession = {
  id: "session-1",
  document_id: "doc-1",
  reviewer_id: "reviewer-1",
  status: ReviewStatus.in_progress,
  started_at: new Date(),
  completed_at: null,
  document: {
    ...defaultDocument,
    id: "doc-1",
    ocr_result: defaultOcrResult,
  },
  corrections: [],
};

const defaultFieldCorrection = {
  id: "correction-1",
  session_id: "session-1",
  field_key: "invoice_number",
  original_value: "INV-123",
  corrected_value: "INV-12345",
  original_conf: 0.8,
  action: CorrectionAction.corrected,
  created_at: new Date(),
};

describe("DatabaseService", () => {
  let service: DatabaseService;
  let mockPrisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        ReviewDbService,
        DatabaseService,
        { provide: AppLoggerService, useValue: mockAppLogger },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                DATABASE_URL: "http://my-db",
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    mockPrisma = service.prisma;
  });

  describe("createDocument", () => {
    it("should create a document", async () => {
      const createdDoc = { ...defaultDocument, id: "1" };
      mockPrisma.document.create.mockResolvedValueOnce(createdDoc);

      const result = await service.createDocument(defaultDocument as any);
      expect(result).toEqual(createdDoc);
      expect(mockPrisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining(defaultDocument),
      });
    });

    it("should re-throw an Error if that error is thrown within", async () => {
      // Throw error from prisma create for this test
      mockPrisma.document.create.mockImplementationOnce(() => {
        throw new Error("Prisma error");
      });
      await expect(
        service.createDocument(defaultDocument as any),
      ).rejects.toThrow("Prisma error");
    });
  });

  describe("findDocument", () => {
    it("should return the document requested by id", async () => {
      const testDocument = { ...defaultDocument, id: "1" };
      mockPrisma.document.findUnique.mockResolvedValueOnce(testDocument);
      const result = await service.findDocument("1");
      expect(result).toEqual(testDocument);
    });

    it("should return null if Prisma fails to find a document", async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce(null);
      const result = await service.findDocument("1");
      expect(result).toBeNull();
    });

    it("should re-throw an Error if that error is thrown within", async () => {
      // Throw error from prisma create for this test
      mockPrisma.document.findUnique.mockImplementationOnce(() => {
        throw new Error("Prisma error");
      });
      await expect(service.findDocument("1")).rejects.toThrow("Prisma error");
    });
  });

  describe("findAllDocuments", () => {
    it("should return a list of documents", async () => {
      const testDocument = { ...defaultDocument, id: "1" };
      mockPrisma.document.findMany.mockResolvedValueOnce([testDocument]);
      const result = await service.findAllDocuments();
      expect(result).toEqual([testDocument]);
    });

    it("should re-throw an Error if that error is thrown within", async () => {
      // Throw error from prisma create for this test
      mockPrisma.document.findMany.mockImplementationOnce(() => {
        throw new Error("Prisma error");
      });
      await expect(service.findAllDocuments()).rejects.toThrow("Prisma error");
    });
  });

  describe("updateDocument", () => {
    const testDocument = { ...defaultDocument, id: "1" };
    it("should return the updated document", async () => {
      mockPrisma.document.update.mockResolvedValueOnce(testDocument);
      const result = await service.updateDocument("1", testDocument);
      expect(result).toEqual(testDocument);
    });

    it("should return null when Prisma throws a NotFound error", async () => {
      mockPrisma.document.update.mockImplementationOnce(() => {
        throw {
          name: "PrismaClientKnownRequestError",
          code: "P2025",
          message: "No Document found", // mimic relevant message
          meta: {}, // can add more as needed
        };
      });
      const result = await service.updateDocument("1", testDocument);
      expect(result).toBeNull();
    });

    it("should re-throw an error caught in the try/catch block", async () => {
      mockPrisma.document.update.mockImplementationOnce(() => {
        throw new Error("oops");
      });
      await expect(service.updateDocument("1", testDocument)).rejects.toThrow(
        "oops",
      );
    });
  });

  describe("findOcrResult", () => {
    it("should return an OCR result", async () => {
      mockPrisma.ocrResult.findFirst.mockResolvedValueOnce(defaultOcrResult);
      const result = await service.findOcrResult("123");
      expect(result).toEqual(defaultOcrResult);
    });

    it("should return null if OCR results not found", async () => {
      mockPrisma.ocrResult.findFirst.mockResolvedValueOnce(null);
      const result = await service.findOcrResult("123");
      expect(result).toBeNull();
      expect(mockPrisma.ocrResult.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe("upsertOcrResult", () => {
    it("should attempt to upsert the results and return nothing", async () => {
      const result = await service.upsertOcrResult({
        documentId: "123",
        analysisResponse,
      });
      expect(result).toBeUndefined();
      expect(mockPrisma.ocrResult.upsert).toHaveBeenCalledTimes(1);

      // The service converts keyValuePairs to ExtractedFields format
      // Expected: { field1: { type: "string", content: "value1", confidence: 0.95, ... } }
      const expectedExtractedFields = {
        field1: expect.objectContaining({
          type: "string",
          content: "value1",
          confidence: 0.95,
        }),
      };

      expect(mockPrisma.ocrResult.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            document_id: "123",
          },
          update: expect.objectContaining({
            processed_at: analysisResponse.lastUpdatedDateTime,
            keyValuePairs: expectedExtractedFields,
          }),
          create: expect.objectContaining({
            document_id: "123",
            processed_at: analysisResponse.lastUpdatedDateTime,
            keyValuePairs: expectedExtractedFields,
          }),
        }),
      );
    });

    it("should re-throw an error caught within", async () => {
      mockPrisma.ocrResult.upsert.mockImplementationOnce(() => {
        throw new Error("oops");
      });
      expect(
        service.upsertOcrResult({ documentId: "123", analysisResponse }),
      ).rejects.toThrow("oops");
    });
  });

  describe("createReviewSession", () => {
    it("should create a review session", async () => {
      mockPrisma.reviewSession.create.mockResolvedValueOnce(
        defaultReviewSession,
      );
      const result = await service.createReviewSession("doc-1", "reviewer-1");
      expect(result).toEqual(defaultReviewSession);
      expect(mockPrisma.reviewSession.create).toHaveBeenCalledWith({
        data: {
          document_id: "doc-1",
          reviewer_id: "reviewer-1",
          status: ReviewStatus.in_progress,
        },
        include: {
          document: {
            include: {
              ocr_result: true,
            },
          },
          corrections: true,
        },
      });
    });
  });

  describe("findReviewSession", () => {
    it("should find a review session by id", async () => {
      mockPrisma.reviewSession.findUnique.mockResolvedValueOnce(
        defaultReviewSession,
      );
      const result = await service.findReviewSession("session-1");
      expect(result).toEqual(defaultReviewSession);
      expect(mockPrisma.reviewSession.findUnique).toHaveBeenCalledWith({
        where: { id: "session-1" },
        include: {
          document: {
            include: {
              ocr_result: true,
            },
          },
          corrections: true,
        },
      });
    });

    it("should return null if session not found", async () => {
      mockPrisma.reviewSession.findUnique.mockResolvedValueOnce(null);
      const result = await service.findReviewSession("not-found");
      expect(result).toBeNull();
    });
  });

  describe("findReviewQueue", () => {
    it("should find documents in the review queue with default filters", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([defaultDocument]);
      const result = await service.findReviewQueue({});
      expect(result).toEqual([defaultDocument]);
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith({
        where: {
          status: DocumentStatus.completed_ocr,
          groundTruthJob: { is: null },
        },
        orderBy: { created_at: "desc" },
        take: 50,
        skip: 0,
        include: {
          ocr_result: true,
          review_sessions: {
            where: {
              status: { in: ["approved", "escalated", "skipped"] },
            },
            orderBy: { completed_at: "desc" },
            take: 1,
            include: { corrections: true },
          },
        },
      });
    });

    it("should filter by modelId", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      await service.findReviewQueue({ modelId: "model-1" });
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            model_id: "model-1",
          }),
        }),
      );
    });

    it("should filter by reviewStatus=pending", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      await service.findReviewQueue({ reviewStatus: "pending" });
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        }),
      );
    });

    it("should filter by reviewStatus=reviewed", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      await service.findReviewQueue({ reviewStatus: "reviewed" });
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            review_sessions: expect.objectContaining({
              some: expect.any(Object),
            }),
          }),
        }),
      );
    });

    it("should apply limit and offset", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      await service.findReviewQueue({ limit: 10, offset: 20 });
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });
  });

  describe("updateReviewSession", () => {
    it("should update a review session", async () => {
      const updatedSession = {
        ...defaultReviewSession,
        status: ReviewStatus.approved,
      };
      mockPrisma.reviewSession.update.mockResolvedValueOnce(updatedSession);
      const result = await service.updateReviewSession("session-1", {
        status: ReviewStatus.approved,
      });
      expect(result).toEqual(updatedSession);
      expect(mockPrisma.reviewSession.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { status: ReviewStatus.approved },
        include: {
          document: true,
          corrections: true,
        },
      });
    });

    it("should return null when session not found (P2025 error)", async () => {
      mockPrisma.reviewSession.update.mockImplementationOnce(() => {
        throw { code: "P2025" };
      });
      const result = await service.updateReviewSession("not-found", {
        status: ReviewStatus.approved,
      });
      expect(result).toBeNull();
    });

    it("should re-throw non-P2025 errors", async () => {
      mockPrisma.reviewSession.update.mockImplementationOnce(() => {
        throw new Error("Database error");
      });
      await expect(
        service.updateReviewSession("session-1", {
          status: ReviewStatus.approved,
        }),
      ).rejects.toThrow("Database error");
    });
  });

  describe("createFieldCorrection", () => {
    it("should create a field correction", async () => {
      mockPrisma.fieldCorrection.create.mockResolvedValueOnce(
        defaultFieldCorrection,
      );
      const result = await service.createFieldCorrection("session-1", {
        field_key: "invoice_number",
        original_value: "INV-123",
        corrected_value: "INV-12345",
        original_conf: 0.8,
        action: CorrectionAction.corrected,
      });
      expect(result).toEqual(defaultFieldCorrection);
      expect(mockPrisma.fieldCorrection.create).toHaveBeenCalledWith({
        data: {
          session_id: "session-1",
          field_key: "invoice_number",
          original_value: "INV-123",
          corrected_value: "INV-12345",
          original_conf: 0.8,
          action: CorrectionAction.corrected,
        },
      });
    });
  });

  describe("findSessionCorrections", () => {
    it("should find all corrections for a session", async () => {
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce([
        defaultFieldCorrection,
      ]);
      const result = await service.findSessionCorrections("session-1");
      expect(result).toEqual([defaultFieldCorrection]);
      expect(mockPrisma.fieldCorrection.findMany).toHaveBeenCalledWith({
        where: { session_id: "session-1" },
        orderBy: { created_at: "asc" },
      });
    });
  });

  describe("getReviewAnalytics", () => {
    it("should return analytics for review sessions", async () => {
      const sessions = [
        { ...defaultReviewSession, status: ReviewStatus.approved },
        { ...defaultReviewSession, status: ReviewStatus.in_progress },
      ];
      const corrections = [
        {
          ...defaultFieldCorrection,
          action: CorrectionAction.corrected,
          original_conf: 0.85,
        },
        {
          ...defaultFieldCorrection,
          action: CorrectionAction.confirmed,
          original_conf: 0.95,
        },
      ];
      mockPrisma.reviewSession.findMany.mockResolvedValueOnce(sessions);
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce(corrections);

      const result = await service.getReviewAnalytics({});
      expect(result).toEqual({
        totalSessions: 2,
        completedSessions: 1,
        totalCorrections: 2,
        correctionsByAction: {
          [CorrectionAction.corrected]: 1,
          [CorrectionAction.confirmed]: 1,
        },
        averageConfidence: 0.9,
      });
    });

    it("should calculate average confidence correctly", async () => {
      const corrections = [
        { ...defaultFieldCorrection, original_conf: 0.8 },
        { ...defaultFieldCorrection, original_conf: 0.9 },
        { ...defaultFieldCorrection, original_conf: 0.7 },
      ];
      mockPrisma.reviewSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce(corrections);

      const result = await service.getReviewAnalytics({});
      expect(result.averageConfidence).toBeCloseTo(0.8, 4);
    });

    it("should handle corrections without confidence values", async () => {
      const corrections = [
        { ...defaultFieldCorrection, original_conf: 0.9 },
        { ...defaultFieldCorrection, original_conf: null },
        { ...defaultFieldCorrection, original_conf: undefined },
      ];
      mockPrisma.reviewSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce(corrections);

      const result = await service.getReviewAnalytics({});
      expect(result.averageConfidence).toBe(0.9);
    });

    it("should return 0 average confidence when no corrections have confidence", async () => {
      const corrections = [
        { ...defaultFieldCorrection, original_conf: null },
        { ...defaultFieldCorrection, original_conf: undefined },
      ];
      mockPrisma.reviewSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce(corrections);

      const result = await service.getReviewAnalytics({});
      expect(result.averageConfidence).toBe(0);
    });

    it("should filter by date range", async () => {
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-12-31");
      mockPrisma.reviewSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce([]);

      await service.getReviewAnalytics({ startDate, endDate });
      expect(mockPrisma.reviewSession.findMany).toHaveBeenCalledWith({
        where: {
          started_at: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
    });

    it("should filter by reviewerId", async () => {
      mockPrisma.reviewSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce([]);

      await service.getReviewAnalytics({ reviewerId: "reviewer-1" });
      expect(mockPrisma.reviewSession.findMany).toHaveBeenCalledWith({
        where: {
          reviewer_id: "reviewer-1",
        },
      });
    });
  });
});
