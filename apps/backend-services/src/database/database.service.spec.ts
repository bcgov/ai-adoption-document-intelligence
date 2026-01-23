// Mock out the prisma client
jest.mock("../generated/client", () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      document: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      ocrResult: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
    })),
  };
});

import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { JsonValue } from "@prisma/client/runtime/client";
import { OcrResult } from "../generated/client";
import { DocumentStatus } from "../generated/enums";
import { AnalysisResponse, AnalysisResult } from "../ocr/azure-types";
import { DatabaseService } from "./database.service";

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

describe("DatabaseService", () => {
  let service: DatabaseService;
  let mockPrisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
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
    mockPrisma = (service as any).prisma;
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
});
