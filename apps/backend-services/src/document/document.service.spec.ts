import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DocumentStatus } from "@/generated/enums";
import { DatabaseService } from "../database/database.service";
import { DocumentService } from "./document.service";

// Mock fs modules
jest.mock("fs");
jest.mock("fs/promises");

import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";

describe("DocumentService", () => {
  let service: DocumentService;
  let databaseService: DatabaseService;

  const mockDocument = {
    id: "doc-123",
    title: "Test Document",
    original_filename: "test.pdf",
    file_path: "/tmp/storage/uuid_test.pdf.pdf",
    file_type: "pdf",
    file_size: 1024,
    metadata: {},
    source: "api",
    status: DocumentStatus.ongoing_ocr,
    apim_request_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(existsSync).mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                STORAGE_PATH: "/tmp/storage",
              };
              return config[key];
            }),
          },
        },
        {
          provide: DatabaseService,
          useValue: {
            createDocument: jest.fn(),
            findDocument: jest.fn(),
            findAllDocuments: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DocumentService>(DocumentService);
    databaseService = module.get<DatabaseService>(DatabaseService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("constructor", () => {
    it("should create storage directory if it does not exist", async () => {
      jest.mocked(existsSync).mockReturnValue(false);
      jest.mocked(mkdir).mockResolvedValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DocumentService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => "/tmp/new-storage"),
            },
          },
          {
            provide: DatabaseService,
            useValue: {},
          },
        ],
      }).compile();

      const newService = module.get<DocumentService>(DocumentService);
      expect(newService).toBeDefined();
    });

    it("should use default storage path when not configured", async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DocumentService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => undefined),
            },
          },
          {
            provide: DatabaseService,
            useValue: {},
          },
        ],
      }).compile();

      const newService = module.get<DocumentService>(DocumentService);
      expect(newService).toBeDefined();
    });
  });

  describe("uploadDocument", () => {
    it("should successfully upload a document", async () => {
      const fileBase64 = Buffer.from("test content").toString("base64");
      jest.mocked(writeFile).mockResolvedValue(undefined);
      jest
        .spyOn(databaseService, "createDocument")
        .mockResolvedValue(mockDocument as any);

      const result = await service.uploadDocument(
        "Test Document",
        fileBase64,
        "pdf",
        "test.pdf",
        { source: "test" },
      );

      expect(result.id).toBe("doc-123");
      expect(result.title).toBe("Test Document");
      expect(databaseService.createDocument).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
    });

    it("should handle base64 data with data URL prefix", async () => {
      const fileBase64 = `data:application/pdf;base64,${Buffer.from("test content").toString("base64")}`;
      jest.mocked(writeFile).mockResolvedValue(undefined);
      jest
        .spyOn(databaseService, "createDocument")
        .mockResolvedValue(mockDocument as any);

      const result = await service.uploadDocument(
        "Test Document",
        fileBase64,
        "pdf",
        "test.pdf",
      );

      expect(result.id).toBe("doc-123");
      expect(writeFile).toHaveBeenCalled();
    });

    it("should handle document without metadata", async () => {
      const fileBase64 = Buffer.from("test content").toString("base64");
      jest.mocked(writeFile).mockResolvedValue(undefined);
      jest
        .spyOn(databaseService, "createDocument")
        .mockResolvedValue(mockDocument as any);

      const result = await service.uploadDocument(
        "Test Document",
        fileBase64,
        "pdf",
        "test.pdf",
      );

      expect(result.id).toBe("doc-123");
    });

    it("should throw error for invalid base64 data", async () => {
      const invalidBase64 = "not-valid-base64!@#$%";

      await expect(
        service.uploadDocument("Test", invalidBase64, "pdf", "test.pdf"),
      ).rejects.toThrow();
    });

    it("should handle file write error", async () => {
      const fileBase64 = Buffer.from("test content").toString("base64");
      jest.mocked(writeFile).mockRejectedValue(new Error("Disk full"));

      await expect(
        service.uploadDocument("Test", fileBase64, "pdf", "test.pdf"),
      ).rejects.toThrow("Disk full");
    });

    it("should handle database error", async () => {
      const fileBase64 = Buffer.from("test content").toString("base64");
      jest.mocked(writeFile).mockResolvedValue(undefined);
      jest
        .spyOn(databaseService, "createDocument")
        .mockRejectedValue(new Error("Database error"));

      await expect(
        service.uploadDocument("Test", fileBase64, "pdf", "test.pdf"),
      ).rejects.toThrow("Database error");
    });

    it("should handle different file types", async () => {
      const fileBase64 = Buffer.from("test content").toString("base64");
      jest.mocked(writeFile).mockResolvedValue(undefined);
      jest
        .spyOn(databaseService, "createDocument")
        .mockResolvedValue(mockDocument as any);

      // Test image type
      const imageDoc = { ...mockDocument, file_type: "image" };
      jest
        .spyOn(databaseService, "createDocument")
        .mockResolvedValue(imageDoc as any);
      const imageResult = await service.uploadDocument(
        "Image",
        fileBase64,
        "image",
        "test.jpg",
      );
      expect(imageResult).toBeDefined();

      // Test scan type
      const scanDoc = { ...mockDocument, file_type: "scan" };
      jest
        .spyOn(databaseService, "createDocument")
        .mockResolvedValue(scanDoc as any);
      const scanResult = await service.uploadDocument(
        "Scan",
        fileBase64,
        "scan",
        "test.pdf",
      );
      expect(scanResult).toBeDefined();
    });

    it("should sanitize filenames with special characters", async () => {
      const fileBase64 = Buffer.from("test content").toString("base64");
      jest.mocked(writeFile).mockResolvedValue(undefined);
      jest
        .spyOn(databaseService, "createDocument")
        .mockResolvedValue(mockDocument as any);

      const result = await service.uploadDocument(
        "Test",
        fileBase64,
        "pdf",
        "test file @#$%.pdf",
      );

      expect(result).toBeDefined();
    });
  });

  describe("getDocument", () => {
    it("should retrieve a document by id", async () => {
      jest
        .spyOn(databaseService, "findDocument")
        .mockResolvedValue(mockDocument as any);

      const result = await service.getDocument("doc-123");

      expect(result).toBeDefined();
      expect(result?.id).toBe("doc-123");
      expect(databaseService.findDocument).toHaveBeenCalledWith("doc-123");
    });

    it("should return null for non-existent document", async () => {
      jest.spyOn(databaseService, "findDocument").mockResolvedValue(null);

      const result = await service.getDocument("non-existent");

      expect(result).toBeNull();
    });
  });
});
