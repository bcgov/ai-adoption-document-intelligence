import { DocumentStatus } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { LocalBlobStorageService } from "../blob-storage/local-blob-storage.service";
import { DatabaseService } from "../database/database.service";
import { DocumentService } from "./document.service";

describe("DocumentService", () => {
  let service: DocumentService;
  let databaseService: DatabaseService;
  let blobStorage: LocalBlobStorageService;

  beforeEach(async () => {
    databaseService = {
      createDocument: jest.fn(),
      findDocument: jest.fn(),
    } as any;
    blobStorage = {
      write: jest.fn(),
      read: jest.fn(),
      exists: jest.fn(),
      delete: jest.fn(),
    } as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        { provide: DatabaseService, useValue: databaseService },
        { provide: LocalBlobStorageService, useValue: blobStorage },
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
      };
      (databaseService.createDocument as jest.Mock).mockResolvedValue(mockDoc);
      const result = await service.uploadDocument(
        "Test",
        base64,
        "pdf",
        "file.pdf",
        "test-model-id",
        {},
      );
      expect(result.id).toBe("1");
      expect(result.original_filename).toBe("file.pdf");
      expect(result.title).toBe("Test");
      expect(databaseService.createDocument).toHaveBeenCalled();
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
        ),
      ).rejects.toThrow("Invalid base64 file data");
    });
  });

  describe("getDocument", () => {
    it("should get a document by id", async () => {
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
      };
      (databaseService.findDocument as jest.Mock).mockResolvedValue(mockDoc);
      const result = await service.getDocument("1");
      expect(result).toBeDefined();
      expect(result?.id).toBe("1");
      expect(databaseService.findDocument).toHaveBeenCalledWith("1");
    });

    it("should return null if document not found", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue(null);
      const result = await service.getDocument("notfound");
      expect(result).toBeNull();
    });
  });
});
