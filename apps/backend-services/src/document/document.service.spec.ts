import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import { DatabaseService } from "../database/database.service";
import { DocumentStatus } from "../generated/enums";
import { DocumentService } from "./document.service";

describe("DocumentService", () => {
  let service: DocumentService;
  let databaseService: DatabaseService;
  let configService: ConfigService;

  beforeEach(async () => {
    databaseService = {
      createDocument: jest.fn(),
      findDocument: jest.fn(),
    } as any;
    configService = {
      get: jest.fn((key: string) => {
        if (key === "STORAGE_PATH") return "/tmp/storage";
        return undefined;
      }),
    } as any;
    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    jest.spyOn(fsPromises, "mkdir").mockResolvedValue(undefined as any);
    jest.spyOn(fsPromises, "writeFile").mockResolvedValue(undefined as any);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        { provide: DatabaseService, useValue: databaseService },
        { provide: ConfigService, useValue: configService },
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
        file_path: "storage/documents/uuid_file.pdf",
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
      expect(fsPromises.writeFile).toHaveBeenCalled();
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
        file_path: "storage/documents/uuid_file.pdf",
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

  describe("ensureStorageDirectory", () => {
    it("should create storage directory if missing", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      await service["ensureStorageDirectory"]();
      expect(fsPromises.mkdir).toHaveBeenCalled();
    });

    it("should throw if storage directory creation fails", async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fsPromises.mkdir as jest.Mock).mockRejectedValue(
        new Error("fail mkdir"),
      );
      await expect(service["ensureStorageDirectory"]()).rejects.toThrow(
        "fail mkdir",
      );
    });
  });
});
