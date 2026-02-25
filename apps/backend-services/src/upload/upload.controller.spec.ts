import { DocumentStatus } from "@generated/client";
import { BadRequestException } from "@nestjs/common";
import { DocumentService } from "../document/document.service";
import { QueueService } from "../queue/queue.service";
import { FileType, UploadDocumentDto } from "./dto/upload-document.dto";
import { UploadController } from "./upload.controller";

describe("UploadController", () => {
  let controller: UploadController;
  let documentService: jest.Mocked<DocumentService>;
  let queueService: jest.Mocked<QueueService>;

  beforeEach(() => {
    documentService = {
      uploadDocument: jest.fn(),
    } as any;
    queueService = {
      processOcrForDocument: jest.fn().mockResolvedValue(undefined),
    } as any;
    controller = new UploadController(documentService, queueService);
  });

  describe("uploadDocument", () => {
    const baseDto: UploadDocumentDto = {
      title: "Test",
      file: "ZmFrZUJhc2U2NA==",
      file_type: FileType.PDF,
      original_filename: "test.pdf",
      metadata: { foo: "bar" },
      model_id: "test-model-id",
      group_id: "group-1",
    };
    const uploadedDoc = {
      id: "1",
      title: "Test",
      original_filename: "test.pdf",
      file_type: FileType.PDF,
      file_size: 123,
      status: DocumentStatus.completed_ocr,
      created_at: new Date(),
      updated_at: new Date(),
      file_path: "path",
      metadata: { foo: "bar" },
      source: "api",
      model_id: "test-model-id",
    };

    it("should upload document and queue OCR", async () => {
      documentService.uploadDocument.mockResolvedValue(uploadedDoc);
      const result = await controller.uploadDocument(baseDto);
      expect(result.success).toBe(true);
      expect(result.document.id).toBe("1");
      expect(documentService.uploadDocument).toHaveBeenCalledWith(
        baseDto.title,
        baseDto.file,
        baseDto.file_type,
        baseDto.original_filename,
        baseDto.model_id,
        baseDto.group_id,
        baseDto.metadata,
        undefined, // workflow_config_id or workflow_id
      );
      expect(queueService.processOcrForDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: "1",
          filePath: "path",
          fileType: "pdf",
        }),
      );
    });

    it("should throw BadRequestException if file is missing", async () => {
      await expect(
        controller.uploadDocument({ ...baseDto, file: "" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should rethrow BadRequestException if documentService throws", async () => {
      documentService.uploadDocument.mockRejectedValue(new Error("fail"));
      await expect(controller.uploadDocument(baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should rethrow BadRequestException from documentService", async () => {
      documentService.uploadDocument.mockRejectedValue(
        new BadRequestException("bad"),
      );
      await expect(controller.uploadDocument(baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
