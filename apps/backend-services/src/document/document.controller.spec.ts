import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DocumentStatus } from "@/generated/enums";
import { DatabaseService } from "../database/database.service";
import { DocumentController } from "./document.controller";

describe("DocumentController", () => {
  let controller: DocumentController;
  let databaseService: DatabaseService;

  const mockUser = {
    idir_username: "testuser",
    display_name: "Test User",
    email: "test@example.com",
    roles: ["user", "admin"],
  };

  const mockDocument = {
    id: "doc-123",
    title: "Test Document",
    original_filename: "test.pdf",
    file_path: "/tmp/test.pdf",
    file_type: "pdf",
    file_size: 1024,
    metadata: {},
    source: "api",
    status: DocumentStatus.pre_ocr,
    apim_request_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentController],
      providers: [
        {
          provide: DatabaseService,
          useValue: {
            findDocument: jest.fn(),
            findAllDocuments: jest.fn(),
            findOcrResultByDocumentId: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<DocumentController>(DocumentController);
    databaseService = module.get<DatabaseService>(DatabaseService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getProtectedData", () => {
    it("should return protected data with user info", () => {
      const req = { user: mockUser } as any;

      const result = controller.getProtectedData(req);

      expect(result.message).toBe("Protected data");
      expect(result.user.idirUsername).toBe("testuser");
      expect(result.user.displayName).toBe("Test User");
      expect(result.user.email).toBe("test@example.com");
    });

    it("should handle request without user", () => {
      const req = {} as any;

      const result = controller.getProtectedData(req);

      expect(result.message).toBe("Protected data");
      expect(result.user.idirUsername).toBeUndefined();
    });
  });

  describe("getAdminData", () => {
    it("should return admin data with user info and roles", () => {
      const req = { user: mockUser } as any;

      const result = controller.getAdminData(req);

      expect(result.message).toBe("Admin only data");
      expect(result.user.idirUsername).toBe("testuser");
      expect(result.user.roles).toEqual(["user", "admin"]);
    });

    it("should handle user without roles", () => {
      const req = { user: { ...mockUser, roles: undefined } } as any;

      const result = controller.getAdminData(req);

      expect(result.user.roles).toEqual([]);
    });
  });

  describe("getDocumentById", () => {
    it("should return document by id", async () => {
      jest
        .spyOn(databaseService, "findDocument")
        .mockResolvedValue(mockDocument as any);

      const result = await controller.getDocumentById("doc-123");

      expect(result).toEqual(mockDocument);
      expect(databaseService.findDocument).toHaveBeenCalledWith("doc-123");
    });

    it("should throw NotFoundException when document not found", async () => {
      jest.spyOn(databaseService, "findDocument").mockResolvedValue(null);

      await expect(controller.getDocumentById("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getDocuments", () => {
    it("should return all documents", async () => {
      const mockDocuments = [mockDocument, { ...mockDocument, id: "doc-456" }];
      jest
        .spyOn(databaseService, "findAllDocuments")
        .mockResolvedValue(mockDocuments as any);

      const result = await controller.getDocuments();

      expect(result).toEqual(mockDocuments);
      expect(databaseService.findAllDocuments).toHaveBeenCalled();
    });

    it("should return empty array when no documents exist", async () => {
      jest.spyOn(databaseService, "findAllDocuments").mockResolvedValue([]);

      const result = await controller.getDocuments();

      expect(result).toEqual([]);
    });
  });

  describe("getOcrResult", () => {
    it("should return OCR result for document", async () => {
      const mockOcrResult = {
        id: "ocr-123",
        document_id: "doc-123",
        analysis_response: { content: "Test content" },
        created_at: new Date(),
        updated_at: new Date(),
      };

      jest
        .spyOn(databaseService, "findOcrResultByDocumentId")
        .mockResolvedValue(mockOcrResult as any);

      const result = await controller.getOcrResult("doc-123");

      expect(result).toEqual(mockOcrResult);
      expect(databaseService.findOcrResultByDocumentId).toHaveBeenCalledWith(
        "doc-123",
      );
    });

    it("should throw NotFoundException when OCR result not found", async () => {
      jest
        .spyOn(databaseService, "findOcrResultByDocumentId")
        .mockResolvedValue(null);

      await expect(controller.getOcrResult("doc-123")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
