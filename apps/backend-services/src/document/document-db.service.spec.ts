import { DocumentStatus, OcrResult, Prisma } from "@generated/client";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { PrismaService } from "../database/prisma.service";
import { DocumentDbService } from "./document-db.service";
import type { DocumentData } from "./document-db.types";

const mockPrismaDocument = {
  create: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
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
  normalized_file_path: "documents/doc-1/normalized.pdf",
  file_type: "pdf",
  file_size: 1024,
  content_hash:
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
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
  purged_at: null,
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
        normalized_file_path: doc.normalized_file_path,
        file_type: doc.file_type,
        file_size: doc.file_size,
        content_hash: doc.content_hash,
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
    it("should return all documents with total when no groupIds provided", async () => {
      const docs = [
        { ...makeDocument({ id: "doc-1" }), workflowVersion: null },
        { ...makeDocument({ id: "doc-2" }), workflowVersion: null },
      ];
      mockPrismaDocument.findMany.mockResolvedValue(docs);
      mockPrismaDocument.count.mockResolvedValue(2);

      const result = await service.findAllDocuments();

      expect(result).toEqual({
        documents: [
          { ...docs[0], workflow_name: null, workflowVersion: undefined },
          { ...docs[1], workflow_name: null, workflowVersion: undefined },
        ],
        total: 2,
      });
      expect(mockPrismaDocument.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { created_at: "desc" },
        take: 50,
        skip: 0,
        include: {
          workflowVersion: {
            select: {
              lineage: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });
      expect(mockPrismaDocument.count).toHaveBeenCalledWith({
        where: {},
      });
    });

    it("should filter by groupIds when provided", async () => {
      const docs = [{ ...makeDocument(), workflowVersion: null }];
      mockPrismaDocument.findMany.mockResolvedValue(docs);
      mockPrismaDocument.count.mockResolvedValue(1);

      const result = await service.findAllDocuments(["group-1"]);

      expect(result).toEqual({
        documents: [
          { ...docs[0], workflow_name: null, workflowVersion: undefined },
        ],
        total: 1,
      });
      expect(mockPrismaDocument.findMany).toHaveBeenCalledWith({
        where: { group_id: { in: ["group-1"] } },
        orderBy: { created_at: "desc" },
        take: 50,
        skip: 0,
        include: {
          workflowVersion: {
            select: {
              lineage: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });
    });

    it("should apply limit and offset from options", async () => {
      const docs = [{ ...makeDocument(), workflowVersion: null }];
      mockPrismaDocument.findMany.mockResolvedValue(docs);
      mockPrismaDocument.count.mockResolvedValue(100);

      const result = await service.findAllDocuments(undefined, {
        limit: 10,
        offset: 20,
      });

      expect(result).toEqual({
        documents: [
          { ...docs[0], workflow_name: null, workflowVersion: undefined },
        ],
        total: 100,
      });
      expect(mockPrismaDocument.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { created_at: "desc" },
        take: 10,
        skip: 20,
        include: {
          workflowVersion: {
            select: {
              lineage: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });
    });

    it("should expand the 'failed' status filter to include conversion_failed", async () => {
      const docs = [{ ...makeDocument(), workflowVersion: null }];
      mockPrismaDocument.findMany.mockResolvedValue(docs);
      mockPrismaDocument.count.mockResolvedValue(1);

      await service.findAllDocuments(undefined, { status: "failed" });

      const expectedWhere = {
        status: { in: ["failed", "conversion_failed"] },
      };
      expect(mockPrismaDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(mockPrismaDocument.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it("should match a non-failed status filter exactly", async () => {
      const docs = [{ ...makeDocument(), workflowVersion: null }];
      mockPrismaDocument.findMany.mockResolvedValue(docs);
      mockPrismaDocument.count.mockResolvedValue(1);

      await service.findAllDocuments(undefined, {
        status: DocumentStatus.complete,
      });

      expect(mockPrismaDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: DocumentStatus.complete },
        }),
      );
    });

    it("should filter by content_hash when provided", async () => {
      const docs = [{ ...makeDocument(), workflowVersion: null }];
      mockPrismaDocument.findMany.mockResolvedValue(docs);
      mockPrismaDocument.count.mockResolvedValue(1);
      const hash =
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

      await service.findAllDocuments(undefined, { contentHash: hash });

      expect(mockPrismaDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { content_hash: hash },
        }),
      );
    });

    it("should throw if prisma throws", async () => {
      mockPrismaDocument.findMany.mockRejectedValue(new Error("DB error"));
      mockPrismaDocument.count.mockResolvedValue(0);
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

  describe("findPurgeableEphemeralDocuments", () => {
    it("matches any ephemeral target, filters status/unpurged, selects config", async () => {
      mockPrismaDocument.findMany.mockResolvedValue([]);

      await service.findPurgeableEphemeralDocuments(
        [DocumentStatus.complete, DocumentStatus.failed],
        50,
      );

      expect(mockPrismaDocument.findMany).toHaveBeenCalledWith({
        where: {
          status: { in: [DocumentStatus.complete, DocumentStatus.failed] },
          purged_at: null,
          workflowVersion: {
            is: {
              OR: [
                { config: { path: ["metadata", "ephemeral"], equals: true } },
                {
                  config: {
                    path: ["metadata", "ephemeral", "files"],
                    equals: true,
                  },
                },
                {
                  config: {
                    path: ["metadata", "ephemeral", "temporalRecord"],
                    equals: true,
                  },
                },
              ],
            },
          },
        },
        select: {
          id: true,
          group_id: true,
          workflow_execution_id: true,
          workflowVersion: { select: { config: true } },
        },
        orderBy: { updated_at: "asc" },
        take: 50,
      });
    });

    it("extracts the ephemeral policy from each workflow config", async () => {
      mockPrismaDocument.findMany.mockResolvedValue([
        {
          id: "d1",
          group_id: "g1",
          workflow_execution_id: "wf-1",
          workflowVersion: { config: { metadata: { ephemeral: true } } },
        },
        {
          id: "d2",
          group_id: "g1",
          workflow_execution_id: "wf-2",
          workflowVersion: {
            config: { metadata: { ephemeral: { files: true } } },
          },
        },
        {
          id: "d3",
          group_id: "g1",
          workflow_execution_id: null,
          workflowVersion: { config: { metadata: {} } },
        },
      ]);

      const result = await service.findPurgeableEphemeralDocuments(
        [DocumentStatus.complete],
        50,
      );

      expect(result).toEqual([
        {
          id: "d1",
          group_id: "g1",
          workflow_execution_id: "wf-1",
          ephemeral: true,
        },
        {
          id: "d2",
          group_id: "g1",
          workflow_execution_id: "wf-2",
          ephemeral: { files: true, temporalRecord: false },
        },
        {
          id: "d3",
          group_id: "g1",
          workflow_execution_id: null,
          ephemeral: false,
        },
      ]);
    });
  });

  describe("markDocumentPurged", () => {
    it("stamps purged_at on the document", async () => {
      mockPrismaDocument.update.mockResolvedValue({});

      await service.markDocumentPurged("d1");

      expect(mockPrismaDocument.update).toHaveBeenCalledWith({
        where: { id: "d1" },
        data: { purged_at: expect.any(Date) },
      });
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
          update: expect.objectContaining({ keyValuePairs: Prisma.DbNull }),
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

  describe("transaction support", () => {
    it("should use provided tx client instead of this.prisma for findDocument", async () => {
      const doc = makeDocument();
      const mockTxDocument = { findUnique: jest.fn().mockResolvedValue(doc) };
      const mockTx = { document: mockTxDocument } as any;

      const result = await service.findDocument("doc-1", mockTx);

      expect(result).toEqual(doc);
      expect(mockTxDocument.findUnique).toHaveBeenCalledWith({
        where: { id: "doc-1" },
      });
      expect(mockPrismaDocument.findUnique).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for updateDocument", async () => {
      const updatedDoc = makeDocument({ title: "Tx Updated" });
      const mockTxDocument = {
        update: jest.fn().mockResolvedValue(updatedDoc),
      };
      const mockTx = { document: mockTxDocument } as any;

      const result = await service.updateDocument(
        "doc-1",
        { title: "Tx Updated" },
        mockTx,
      );

      expect(result).toEqual(updatedDoc);
      expect(mockTxDocument.update).toHaveBeenCalled();
      expect(mockPrismaDocument.update).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for createDocument", async () => {
      const doc = makeDocument();
      const mockTxDocument = { create: jest.fn().mockResolvedValue(doc) };
      const mockTx = { document: mockTxDocument } as any;

      const result = await service.createDocument(doc, mockTx);

      expect(result).toEqual(doc);
      expect(mockTxDocument.create).toHaveBeenCalled();
      expect(mockPrismaDocument.create).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for deleteDocument", async () => {
      const mockTxDocument = { delete: jest.fn().mockResolvedValue({}) };
      const mockTx = { document: mockTxDocument } as any;

      const result = await service.deleteDocument("doc-1", mockTx);

      expect(result).toBe(true);
      expect(mockTxDocument.delete).toHaveBeenCalledWith({
        where: { id: "doc-1" },
      });
      expect(mockPrismaDocument.delete).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for findOcrResult", async () => {
      const ocrResult = { id: "ocr-1", document_id: "doc-1" };
      const mockTxOcr = { findFirst: jest.fn().mockResolvedValue(ocrResult) };
      const mockTx = { ocrResult: mockTxOcr } as any;

      const result = await service.findOcrResult("doc-1", mockTx);

      expect(result).toEqual(ocrResult);
      expect(mockTxOcr.findFirst).toHaveBeenCalled();
      expect(mockPrismaOcrResult.findFirst).not.toHaveBeenCalled();
    });
  });
});
