// Mock out the prisma client
jest.mock("@generated/client", () => {
  const DocumentStatus = {
    pre_ocr: "pre_ocr",
    ongoing_ocr: "ongoing_ocr",
    completed_ocr: "completed_ocr",
    failed: "failed",
  };
  return {
    DocumentStatus,
    PrismaClient: jest.fn().mockImplementation(() => ({
      labelingDocument: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    })),
  };
});

import { DocumentStatus } from "@generated/client";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { LabelingDocumentDbService } from "./labeling-document-db.service";

describe("LabelingDocumentDbService", () => {
  let service: LabelingDocumentDbService;
  let mockPrisma: {
    labelingDocument: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  const defaultLabelingDocument = {
    id: "labeling-doc-1",
    title: "Test Labeling Doc",
    original_filename: "label-file.pdf",
    file_path: "/tmp/label-file.pdf",
    normalized_file_path: "/tmp/normalized.pdf",
    file_type: "pdf",
    file_size: 456,
    metadata: {},
    source: "upload",
    status: DocumentStatus.completed_ocr,
    created_at: new Date(),
    updated_at: new Date(),
    apim_request_id: "req-123",
    model_id: "model-1",
    ocr_result: {},
    group_id: "group-1",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        LabelingDocumentDbService,
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

    service = module.get<LabelingDocumentDbService>(LabelingDocumentDbService);
    const prismaService = module.get<PrismaService>(PrismaService);
    mockPrisma = prismaService.prisma as unknown as typeof mockPrisma;
  });

  describe("createLabelingDocument", () => {
    it("should create a labeling document", async () => {
      mockPrisma.labelingDocument.create.mockResolvedValueOnce(
        defaultLabelingDocument,
      );
      const result = await service.createLabelingDocument({
        title: defaultLabelingDocument.title,
        original_filename: defaultLabelingDocument.original_filename,
        file_path: defaultLabelingDocument.file_path,
        normalized_file_path: defaultLabelingDocument.normalized_file_path,
        file_type: defaultLabelingDocument.file_type,
        file_size: defaultLabelingDocument.file_size,
        metadata: defaultLabelingDocument.metadata,
        source: defaultLabelingDocument.source,
        status: defaultLabelingDocument.status,
        apim_request_id: defaultLabelingDocument.apim_request_id,
        model_id: defaultLabelingDocument.model_id,
        ocr_result: defaultLabelingDocument.ocr_result,
        group_id: defaultLabelingDocument.group_id,
      });
      expect(result).toEqual(defaultLabelingDocument);
      expect(mockPrisma.labelingDocument.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("findLabelingDocument", () => {
    it("should return a labeling document by id", async () => {
      mockPrisma.labelingDocument.findUnique.mockResolvedValueOnce(
        defaultLabelingDocument,
      );
      const result = await service.findLabelingDocument("labeling-doc-1");
      expect(result).toEqual(defaultLabelingDocument);
      expect(mockPrisma.labelingDocument.findUnique).toHaveBeenCalledWith({
        where: { id: "labeling-doc-1" },
      });
    });

    it("should return null if labeling document not found", async () => {
      mockPrisma.labelingDocument.findUnique.mockResolvedValueOnce(null);
      const result = await service.findLabelingDocument("not-found");
      expect(result).toBeNull();
    });
  });

  describe("updateLabelingDocument", () => {
    it("should update a labeling document", async () => {
      const updatedDoc = { ...defaultLabelingDocument, title: "Updated Title" };
      mockPrisma.labelingDocument.update.mockResolvedValueOnce(updatedDoc);
      const result = await service.updateLabelingDocument("labeling-doc-1", {
        title: "Updated Title",
      });
      expect(result).toEqual(updatedDoc);
      expect(mockPrisma.labelingDocument.update).toHaveBeenCalledWith({
        where: { id: "labeling-doc-1" },
        data: expect.objectContaining({
          title: "Updated Title",
          updated_at: expect.any(Date),
        }),
      });
    });

    it("should return null when document not found (P2025 error)", async () => {
      mockPrisma.labelingDocument.update.mockImplementationOnce(() => {
        throw { code: "P2025" };
      });
      const result = await service.updateLabelingDocument("not-found", {
        title: "Updated",
      });
      expect(result).toBeNull();
    });

    it("should re-throw non-P2025 errors", async () => {
      mockPrisma.labelingDocument.update.mockImplementationOnce(() => {
        throw new Error("Database error");
      });
      await expect(
        service.updateLabelingDocument("labeling-doc-1", { title: "Updated" }),
      ).rejects.toThrow("Database error");
    });
  });

  describe("transaction support", () => {
    it("should use provided tx client instead of this.prisma for createLabelingDocument", async () => {
      const expected = { ...defaultLabelingDocument };
      const mockTxLabelingDocument = {
        create: jest.fn().mockResolvedValueOnce(expected),
      };
      const mockTx = { labelingDocument: mockTxLabelingDocument } as any;

      const result = await service.createLabelingDocument(
        {
          title: defaultLabelingDocument.title,
          original_filename: defaultLabelingDocument.original_filename,
          file_path: defaultLabelingDocument.file_path,
          normalized_file_path: defaultLabelingDocument.normalized_file_path,
          file_type: defaultLabelingDocument.file_type,
          file_size: defaultLabelingDocument.file_size,
          metadata: defaultLabelingDocument.metadata,
          source: defaultLabelingDocument.source,
          status: defaultLabelingDocument.status,
          apim_request_id: defaultLabelingDocument.apim_request_id,
          model_id: defaultLabelingDocument.model_id,
          ocr_result: defaultLabelingDocument.ocr_result,
          group_id: defaultLabelingDocument.group_id,
        },
        mockTx,
      );

      expect(result).toEqual(expected);
      expect(mockTxLabelingDocument.create).toHaveBeenCalled();
      expect(mockPrisma.labelingDocument.create).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for findLabelingDocument", async () => {
      const expected = { ...defaultLabelingDocument };
      const mockTxLabelingDocument = {
        findUnique: jest.fn().mockResolvedValueOnce(expected),
      };
      const mockTx = { labelingDocument: mockTxLabelingDocument } as any;

      const result = await service.findLabelingDocument(
        "labeling-doc-1",
        mockTx,
      );

      expect(result).toEqual(expected);
      expect(mockTxLabelingDocument.findUnique).toHaveBeenCalled();
      expect(mockPrisma.labelingDocument.findUnique).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for updateLabelingDocument", async () => {
      const expected = { ...defaultLabelingDocument, title: "Updated" };
      const mockTxLabelingDocument = {
        update: jest.fn().mockResolvedValueOnce(expected),
      };
      const mockTx = { labelingDocument: mockTxLabelingDocument } as any;

      const result = await service.updateLabelingDocument(
        "labeling-doc-1",
        { title: "Updated" },
        mockTx,
      );

      expect(result).toEqual(expected);
      expect(mockTxLabelingDocument.update).toHaveBeenCalled();
      expect(mockPrisma.labelingDocument.update).not.toHaveBeenCalled();
    });
  });
});
