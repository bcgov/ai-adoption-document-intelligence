import { DocumentStatus } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { DocumentService } from "./document.service";
import { DocumentDbService } from "./document-db.service";

describe("DocumentService", () => {
  let service: DocumentService;
  let documentDbService: DocumentDbService;
  let blobStorage: BlobStorageInterface;

  beforeEach(async () => {
    documentDbService = {
      createDocument: jest.fn(),
      findDocument: jest.fn(),
      updateDocument: jest.fn(),
      deleteDocument: jest.fn(),
      findAllDocuments: jest.fn(),
      findOcrResult: jest.fn(),
      upsertOcrResult: jest.fn(),
    } as any;
    blobStorage = {
      write: jest.fn(),
      read: jest.fn(),
      exists: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      deleteByPrefix: jest.fn(),
    } as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        { provide: AppLoggerService, useValue: mockAppLogger },
        { provide: DocumentDbService, useValue: documentDbService },
        { provide: BLOB_STORAGE, useValue: blobStorage },
      ],
    }).compile();
    service = module.get<DocumentService>(DocumentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("uploadDocument", () => {
    it("should upload a document and save to db", async () => {
      const base64 = Buffer.from("test").toString("base64");
      const mockDoc = {
        id: "1",
        title: "Test",
        original_filename: "file.pdf",
        file_path: "documents/1/original.pdf",
        file_type: "pdf",
        file_size: 123,
        metadata: {},
        source: "api",
        status: DocumentStatus.ongoing_ocr,
        created_at: new Date(),
        updated_at: new Date(),
        model_id: "test-model-id",
        group_id: "group-1",
      };
      (documentDbService.createDocument as jest.Mock).mockResolvedValue(
        mockDoc,
      );
      const result = await service.uploadDocument(
        "Test",
        base64,
        "pdf",
        "file.pdf",
        "test-model-id",
        "group-1",
        {},
      );
      expect(result.id).toBe("1");
      expect(result.original_filename).toBe("file.pdf");
      expect(result.title).toBe("Test");
      expect(documentDbService.createDocument).toHaveBeenCalled();
      expect(blobStorage.write).toHaveBeenCalledWith(
        expect.stringMatching(/^documents\/.+\/original\.pdf$/),
        expect.any(Buffer),
      );
    });

    it("should throw on invalid base64", async () => {
      await expect(
        service.uploadDocument(
          "Test",
          {} as any,
          "pdf",
          "file.pdf",
          "test-model-id",
          "group-1",
        ),
      ).rejects.toThrow("Invalid base64 file data");
    });
  });

  describe("findDocument", () => {
    it("should find a document by id", async () => {
      const mockDoc = {
        id: "1",
        title: "Test",
        original_filename: "file.pdf",
        file_path: "documents/1/original.pdf",
        file_type: "pdf",
        file_size: 123,
        metadata: {},
        source: "api",
        status: DocumentStatus.ongoing_ocr,
        created_at: new Date(),
        updated_at: new Date(),
        model_id: "test-model-id",
        group_id: "group-1",
      };
      (documentDbService.findDocument as jest.Mock).mockResolvedValue(mockDoc);
      const result = await service.findDocument("1");
      expect(result).toBeDefined();
      expect(result?.id).toBe("1");
      expect(documentDbService.findDocument).toHaveBeenCalledWith(
        "1",
        undefined,
      );
    });

    it("should return null if document not found", async () => {
      (documentDbService.findDocument as jest.Mock).mockResolvedValue(null);
      const result = await service.findDocument("notfound");
      expect(result).toBeNull();
    });
  });

  describe("updateDocument", () => {
    it("should update and return the document", async () => {
      const mockDoc = {
        id: "1",
        title: "Updated",
        original_filename: "file.pdf",
        file_path: "documents/1/original.pdf",
        file_type: "pdf",
        file_size: 123,
        metadata: {},
        source: "api",
        status: DocumentStatus.ongoing_ocr,
        created_at: new Date(),
        updated_at: new Date(),
        model_id: "test-model-id",
        group_id: "group-1",
      };
      (documentDbService.updateDocument as jest.Mock).mockResolvedValue(
        mockDoc,
      );
      const result = await service.updateDocument("1", { title: "Updated" });
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Updated");
      expect(documentDbService.updateDocument).toHaveBeenCalledWith(
        "1",
        {
          title: "Updated",
        },
        undefined,
      );
    });

    it("should return null if document not found", async () => {
      (documentDbService.updateDocument as jest.Mock).mockResolvedValue(null);
      const result = await service.updateDocument("notfound", {
        title: "New",
      });
      expect(result).toBeNull();
    });
  });

  describe("deleteDocument", () => {
    it("should delete the document and its blob", async () => {
      const mockDoc = {
        id: "1",
        file_path: "documents/1/original.pdf",
        group_id: "group-1",
      };
      (documentDbService.findDocument as jest.Mock).mockResolvedValue(mockDoc);
      (documentDbService.deleteDocument as jest.Mock).mockResolvedValue(true);
      (blobStorage.delete as jest.Mock).mockResolvedValue(undefined);
      const result = await service.deleteDocument("1");
      expect(result).toBe(true);
      expect(documentDbService.deleteDocument).toHaveBeenCalledWith("1");
      expect(blobStorage.delete).toHaveBeenCalledWith(mockDoc.file_path);
    });

    it("should return false if document not found", async () => {
      (documentDbService.findDocument as jest.Mock).mockResolvedValue(null);
      const result = await service.deleteDocument("notfound");
      expect(result).toBe(false);
      expect(documentDbService.deleteDocument).not.toHaveBeenCalled();
    });

    it("should still return true if blob deletion fails", async () => {
      const mockDoc = {
        id: "1",
        file_path: "documents/1/original.pdf",
        group_id: "group-1",
      };
      (documentDbService.findDocument as jest.Mock).mockResolvedValue(mockDoc);
      (documentDbService.deleteDocument as jest.Mock).mockResolvedValue(true);
      (blobStorage.delete as jest.Mock).mockRejectedValue(
        new Error("blob not found"),
      );
      const result = await service.deleteDocument("1");
      expect(result).toBe(true);
    });
  });
});
