import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DocumentStatus } from "@/generated/enums";
import { DocumentService } from "../document/document.service";
import { QueueService } from "../queue/queue.service";
import { UploadController } from "./upload.controller";

describe("UploadController", () => {
  let controller: UploadController;
  let documentService: DocumentService;
  let queueService: QueueService;

  const mockUploadedDocument = {
    id: "doc-123",
    title: "Test Document",
    original_filename: "test.pdf",
    file_path: "/tmp/storage/uuid_test.pdf",
    file_type: "pdf",
    file_size: 1024,
    metadata: {},
    source: "api",
    status: DocumentStatus.ongoing_ocr,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        {
          provide: DocumentService,
          useValue: {
            uploadDocument: jest.fn(),
          },
        },
        {
          provide: QueueService,
          useValue: {
            publishDocumentUploaded: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UploadController>(UploadController);
    documentService = module.get<DocumentService>(DocumentService);
    queueService = module.get<QueueService>(QueueService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getPublicData", () => {
    it("should return public message", () => {
      const result = controller.getPublicData();

      expect(result).toEqual({ message: "This endpoint is public" });
    });
  });

  describe("uploadDocument", () => {
    const validUploadDto = {
      title: "Test Document",
      file: Buffer.from("test content").toString("base64"),
      file_type: "pdf",
      original_filename: "test.pdf",
      metadata: { source: "test" },
    };

    it("should successfully upload a document", async () => {
      jest
        .spyOn(documentService, "uploadDocument")
        .mockResolvedValue(mockUploadedDocument);
      jest
        .spyOn(queueService, "publishDocumentUploaded")
        .mockResolvedValue(true);

      const result = await controller.uploadDocument(validUploadDto);

      expect(result.success).toBe(true);
      expect(result.document.id).toBe("doc-123");
      expect(result.document.title).toBe("Test Document");
      expect(documentService.uploadDocument).toHaveBeenCalledWith(
        "Test Document",
        validUploadDto.file,
        "pdf",
        "test.pdf",
        { source: "test" },
      );
      expect(queueService.publishDocumentUploaded).toHaveBeenCalled();
    });

    it("should use default filename if not provided", async () => {
      const dtoWithoutFilename = {
        title: "Test Document",
        file: Buffer.from("test content").toString("base64"),
        file_type: "pdf",
        metadata: {},
      };

      jest
        .spyOn(documentService, "uploadDocument")
        .mockResolvedValue(mockUploadedDocument);
      jest
        .spyOn(queueService, "publishDocumentUploaded")
        .mockResolvedValue(true);

      const result = await controller.uploadDocument(dtoWithoutFilename as any);

      expect(result.success).toBe(true);
      expect(documentService.uploadDocument).toHaveBeenCalledWith(
        "Test Document",
        dtoWithoutFilename.file,
        "pdf",
        "Test Document.pdf",
        {},
      );
    });

    it("should throw BadRequestException for empty file data", async () => {
      const invalidDto = {
        ...validUploadDto,
        file: "",
      };

      await expect(controller.uploadDocument(invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException for whitespace-only file data", async () => {
      const invalidDto = {
        ...validUploadDto,
        file: "   ",
      };

      await expect(controller.uploadDocument(invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should continue upload even if queue publish fails", async () => {
      jest
        .spyOn(documentService, "uploadDocument")
        .mockResolvedValue(mockUploadedDocument);
      jest
        .spyOn(queueService, "publishDocumentUploaded")
        .mockRejectedValue(new Error("Queue error"));

      const result = await controller.uploadDocument(validUploadDto);

      expect(result.success).toBe(true);
      expect(result.document.id).toBe("doc-123");
    });

    it("should throw BadRequestException for document service errors", async () => {
      jest
        .spyOn(documentService, "uploadDocument")
        .mockRejectedValue(new Error("Database error"));

      await expect(controller.uploadDocument(validUploadDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should preserve BadRequestException from service", async () => {
      jest
        .spyOn(documentService, "uploadDocument")
        .mockRejectedValue(new BadRequestException("Invalid file format"));

      await expect(controller.uploadDocument(validUploadDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should handle different file types", async () => {
      const imageDto = {
        title: "Image",
        file: Buffer.from("image content").toString("base64"),
        file_type: "image",
        original_filename: "test.jpg",
        metadata: {},
      };

      const imageDocument = { ...mockUploadedDocument, file_type: "image" };
      jest
        .spyOn(documentService, "uploadDocument")
        .mockResolvedValue(imageDocument);
      jest
        .spyOn(queueService, "publishDocumentUploaded")
        .mockResolvedValue(true);

      const result = await controller.uploadDocument(imageDto);

      expect(result.success).toBe(true);
      expect(result.document.file_type).toBe("image");
    });

    it("should handle metadata", async () => {
      const dtoWithMetadata = {
        ...validUploadDto,
        metadata: { department: "IT", priority: "high" },
      };

      jest
        .spyOn(documentService, "uploadDocument")
        .mockResolvedValue(mockUploadedDocument);
      jest
        .spyOn(queueService, "publishDocumentUploaded")
        .mockResolvedValue(true);

      const result = await controller.uploadDocument(dtoWithMetadata);

      expect(result.success).toBe(true);
      expect(documentService.uploadDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        { department: "IT", priority: "high" },
      );
    });
  });
});
