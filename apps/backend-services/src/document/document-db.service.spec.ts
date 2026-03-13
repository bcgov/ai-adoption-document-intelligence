import { DocumentStatus, OcrResult } from "@generated/client";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { PrismaService } from "../database/prisma.service";
import { DocumentDbService } from "./document-db.service";
import type { DocumentData } from "./document-db.types";

const mockPrismaDocument = {
  create: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockPrismaOcrResult = {
  findFirst: jest.fn(),
  upsert: jest.fn(),
};

const mockPrismaClient = {
  document: mockPrismaDocument,
  ocrResult: mockPrismaOcrResult,
};

const mockPrismaService = {
  get prisma() {
    return mockPrismaClient;
  },
};

const makeDocument = (overrides: Partial<DocumentData> = {}): DocumentData => ({
  id: "doc-1",
  title: "Test Document",
  original_filename: "test.pdf",
  file_path: "documents/doc-1/original.pdf",
  file_type: "pdf",
  file_size: 1024,
  metadata: {},
  source: "api",
  status: DocumentStatus.ongoing_ocr,
  apim_request_id: null,
  model_id: "model-1",
  workflow_id: null,
  workflow_config_id: null,
  workflow_execution_id: null,
  group_id: "group-1",
  created_at: new Date("2024-01-01"),
  updated_at: new Date("2024-01-01"),
  ...overrides,
});

describe("DocumentDbService", () => {
  let service: DocumentDbService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Directly instantiate to avoid DI token issues with AppLoggerService
    service = new DocumentDbService(
      mockPrismaService as unknown as PrismaService,
      mockAppLogger,
    );
  });

  describe("createDocument", () => {
    it("should create and return a document", async () => {
      const doc = makeDocument();
      mockPrismaDocument.create.mockResolvedValue(doc);

      const result = await service.createDocument({
        id: doc.id,
        title: doc.title,
        original_filename: doc.original_filename,
        file_path: doc.file_path,
        file_type: doc.file_type,
        file_size: doc.file_size,
        metadata: doc.metadata,
        source: doc.source,
        status: doc.status,
        apim_request_id: null,
        model_id: doc.model_id,
        workflow_id: null,
        workflow_config_id: null,
        workflow_execution_id: null,
        group_id: doc.group_id,
      });

      expect(result).toEqual(doc);
      expect(mockPrismaDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: doc.title }),
        }),
      );
    });

    it("should throw if prisma create fails", async () => {
      mockPrismaDocument.create.mockRejectedValue(new Error("DB error"));
      await expect(service.createDocument(makeDocument())).rejects.toThrow(
        "DB error",
      );
    });
  });

  describe("findDocument", () => {
    it("should return a document when found", async () => {
      const doc = makeDocument();
      mockPrismaDocument.findUnique.mockResolvedValue(doc);

      const result = await service.findDocument("doc-1");

      expect(result).toEqual(doc);
      expect(mockPrismaDocument.findUnique).toHaveBeenCalledWith({
        where: { id: "doc-1" },
      });
    });

    it("should return null when document is not found", async () => {
      mockPrismaDocument.findUnique.mockResolvedValue(null);

      const result = await service.findDocument("not-found");

      expect(result).toBeNull();
    });

    it("should throw if prisma throws", async () => {
      mockPrismaDocument.findUnique.mockRejectedValue(new Error("DB error"));
      await expect(service.findDocument("doc-1")).rejects.toThrow("DB error");
    });
  });

  describe("findAllDocuments", () => {
    it("should return all documents when no groupIds provided", async () => {
      const docs = [
        makeDocument({ id: "doc-1" }),
        makeDocument({ id: "doc-2" }),
      ];
      mockPrismaDocument.findMany.mockResolvedValue(docs);

      const result = await service.findAllDocuments();

      expect(result).toEqual(docs);
      expect(mockPrismaDocument.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { created_at: "desc" },
      });
    });

    it("should filter by groupIds when provided", async () => {
      const docs = [makeDocument()];
      mockPrismaDocument.findMany.mockResolvedValue(docs);

      const result = await service.findAllDocuments(["group-1"]);

      expect(result).toEqual(docs);
      expect(mockPrismaDocument.findMany).toHaveBeenCalledWith({
        where: { group_id: { in: ["group-1"] } },
        orderBy: { created_at: "desc" },
      });
    });

    it("should throw if prisma throws", async () => {
      mockPrismaDocument.findMany.mockRejectedValue(new Error("DB error"));
      await expect(service.findAllDocuments()).rejects.toThrow("DB error");
    });
  });

  describe("updateDocument", () => {
    it("should update and return the document", async () => {
      const doc = makeDocument({ title: "Updated" });
      mockPrismaDocument.update.mockResolvedValue(doc);

      const result = await service.updateDocument("doc-1", {
        title: "Updated",
      });

      expect(result).toEqual(doc);
      expect(mockPrismaDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "doc-1" },
          data: expect.objectContaining({ title: "Updated" }),
        }),
      );
    });

    it("should return null when document is not found (P2025)", async () => {
      const notFoundError = Object.assign(new Error("Not found"), {
        code: "P2025",
      });
      mockPrismaDocument.update.mockRejectedValue(notFoundError);

      const result = await service.updateDocument("not-found", { title: "X" });

      expect(result).toBeNull();
    });

    it("should throw on other prisma errors", async () => {
      mockPrismaDocument.update.mockRejectedValue(new Error("DB error"));
      await expect(
        service.updateDocument("doc-1", { title: "X" }),
      ).rejects.toThrow("DB error");
    });
  });

  describe("deleteDocument", () => {
    it("should delete and return true when found", async () => {
      mockPrismaDocument.delete.mockResolvedValue({});

      const result = await service.deleteDocument("doc-1");

      expect(result).toBe(true);
      expect(mockPrismaDocument.delete).toHaveBeenCalledWith({
        where: { id: "doc-1" },
      });
    });

    it("should return false when document is not found (P2025)", async () => {
      const notFoundError = Object.assign(new Error("Not found"), {
        code: "P2025",
      });
      mockPrismaDocument.delete.mockRejectedValue(notFoundError);

      const result = await service.deleteDocument("not-found");

      expect(result).toBe(false);
    });

    it("should throw on other prisma errors", async () => {
      mockPrismaDocument.delete.mockRejectedValue(new Error("DB error"));
      await expect(service.deleteDocument("doc-1")).rejects.toThrow("DB error");
    });
  });

  describe("findOcrResult", () => {
    it("should return the OCR result when found", async () => {
      const ocrResult: Partial<OcrResult> = {
        id: "ocr-1",
        document_id: "doc-1",
        processed_at: new Date(),
        keyValuePairs: {},
      };
      mockPrismaOcrResult.findFirst.mockResolvedValue(ocrResult);

      const result = await service.findOcrResult("doc-1");

      expect(result).toEqual(ocrResult);
      expect(mockPrismaOcrResult.findFirst).toHaveBeenCalledWith({
        where: { document_id: "doc-1" },
        orderBy: { processed_at: "desc" },
      });
    });

    it("should return null when no OCR result exists", async () => {
      mockPrismaOcrResult.findFirst.mockResolvedValue(null);

      const result = await service.findOcrResult("doc-1");

      expect(result).toBeNull();
    });

    it("should throw if prisma throws", async () => {
      mockPrismaOcrResult.findFirst.mockRejectedValue(new Error("DB error"));
      await expect(service.findOcrResult("doc-1")).rejects.toThrow("DB error");
    });
  });

  describe("upsertOcrResult", () => {
    const makeAnalysisResponse = () => ({
      lastUpdatedDateTime: new Date().toISOString(),
      analyzeResult: {
        documents: [],
        keyValuePairs: [],
        pages: [],
        tables: [],
        styles: [],
        stringIndexType: "textElement",
        content: "",
      },
    });

    it("should upsert OCR result using keyValuePairs when documents array is empty", async () => {
      mockPrismaOcrResult.upsert.mockResolvedValue({});

      await service.upsertOcrResult({
        documentId: "doc-1",
        analysisResponse: makeAnalysisResponse() as any,
      });

      expect(mockPrismaOcrResult.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { document_id: "doc-1" },
          update: expect.objectContaining({ keyValuePairs: null }),
          create: expect.objectContaining({ document_id: "doc-1" }),
        }),
      );
    });

    it("should use documents fields when available", async () => {
      mockPrismaOcrResult.upsert.mockResolvedValue({});
      const response = makeAnalysisResponse();
      (response.analyzeResult as any).documents = [
        {
          fields: {
            name: { type: "string", content: "test", confidence: 0.9 },
          },
        },
      ];

      await service.upsertOcrResult({
        documentId: "doc-1",
        analysisResponse: response as any,
      });

      expect(mockPrismaOcrResult.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            keyValuePairs: {
              name: { type: "string", content: "test", confidence: 0.9 },
            },
          }),
        }),
      );
    });

    it("should throw if prisma throws", async () => {
      mockPrismaOcrResult.upsert.mockRejectedValue(new Error("DB error"));
      await expect(
        service.upsertOcrResult({
          documentId: "doc-1",
          analysisResponse: makeAnalysisResponse() as any,
        }),
      ).rejects.toThrow("DB error");
    });
  });
});
