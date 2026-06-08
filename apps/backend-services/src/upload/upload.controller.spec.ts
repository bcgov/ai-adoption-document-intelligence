jest.mock("@/auth/identity.helpers", () => ({
  identityCanAccessGroup: jest.fn(),
}));

import { DocumentStatus, GroupRole } from "@generated/client";
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import * as identityHelpers from "@/auth/identity.helpers";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { DocumentService } from "../document/document.service";
import { QueueService } from "../queue/queue.service";
import { WorkflowService } from "../workflow/workflow.service";
import { FileType, UploadDocumentDto } from "./dto/upload-document.dto";
import { UploadController } from "./upload.controller";

describe("UploadController", () => {
  let controller: UploadController;
  let documentService: jest.Mocked<DocumentService>;
  let queueService: jest.Mocked<QueueService>;
  let workflowService: jest.Mocked<WorkflowService>;

  beforeEach(() => {
    jest
      .mocked(identityHelpers.identityCanAccessGroup)
      .mockImplementation(() => undefined);
    documentService = {
      uploadDocument: jest.fn(),
    } as any;
    queueService = {
      processOcrForDocument: jest.fn().mockResolvedValue(undefined),
    } as any;
    workflowService = {
      resolveWorkflowVersionId: jest.fn().mockResolvedValue(null),
      getModelIdDefault: jest.fn().mockResolvedValue(null),
    } as any;
    controller = new UploadController(
      documentService,
      queueService,
      workflowService,
      mockAppLogger,
    );
  });

  describe("uploadDocument", () => {
    const mockIdentity = {
      userId: "user-1",
      isSystemAdmin: false,
      groupRoles: { "group-1": GroupRole.MEMBER },
    };
    const mockReq = { resolvedIdentity: mockIdentity } as any;
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
      status: DocumentStatus.extracted,
      created_at: new Date(),
      updated_at: new Date(),
      file_path: "path",
      normalized_file_path: "documents/1/normalized.pdf",
      metadata: { foo: "bar" },
      source: "api",
      model_id: "test-model-id",
      group_id: "group-1",
    };

    it("should upload document and queue OCR", async () => {
      documentService.uploadDocument.mockResolvedValue({
        kind: "success",
        document: uploadedDoc,
      });
      const result = await controller.uploadDocument(baseDto, mockReq);
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
          filePath: "documents/1/normalized.pdf",
          fileType: "pdf",
        }),
      );
    });

    it("should throw BadRequestException if file is missing", async () => {
      await expect(
        controller.uploadDocument({ ...baseDto, file: "" }, mockReq),
      ).rejects.toThrow(BadRequestException);
      expect(identityHelpers.identityCanAccessGroup).toHaveBeenCalledWith(
        mockIdentity,
        "group-1",
        GroupRole.MEMBER,
      );
    });

    it("checks group access before validating file", async () => {
      jest
        .mocked(identityHelpers.identityCanAccessGroup)
        .mockImplementation(() => {
          throw new ForbiddenException();
        });

      await expect(
        controller.uploadDocument(
          { ...baseDto, file: "", group_id: "other-group" },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(identityHelpers.identityCanAccessGroup).toHaveBeenCalledWith(
        mockIdentity,
        "other-group",
        GroupRole.MEMBER,
      );
      expect(documentService.uploadDocument).not.toHaveBeenCalled();
    });

    it("should rethrow BadRequestException if documentService throws", async () => {
      documentService.uploadDocument.mockRejectedValue(new Error("fail"));
      await expect(controller.uploadDocument(baseDto, mockReq)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should rethrow BadRequestException from documentService", async () => {
      documentService.uploadDocument.mockRejectedValue(
        new BadRequestException("bad"),
      );
      await expect(controller.uploadDocument(baseDto, mockReq)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("resolves workflow_slug to a version id and persists it on the document", async () => {
      workflowService.resolveWorkflowVersionId.mockResolvedValue("wv-resolved");
      documentService.uploadDocument.mockResolvedValue({
        kind: "success",
        document: uploadedDoc,
      });
      const dto: UploadDocumentDto = {
        title: "Test",
        file: "ZmFrZUJhc2U2NA==",
        file_type: FileType.PDF,
        original_filename: "test.pdf",
        model_id: "test-model-id",
        group_id: "group-1",
        workflow_slug: "ocr-only-minimal",
      };
      await controller.uploadDocument(dto, mockReq);
      expect(workflowService.resolveWorkflowVersionId).toHaveBeenCalledWith({
        groupId: "group-1",
        workflowSlug: "ocr-only-minimal",
        workflowVersion: undefined,
        workflowConfigId: undefined,
      });
      expect(documentService.uploadDocument).toHaveBeenLastCalledWith(
        dto.title,
        dto.file,
        dto.file_type,
        dto.original_filename,
        dto.model_id,
        dto.group_id,
        undefined,
        "wv-resolved",
      );
    });

    it("forwards ctx_overrides through to the queue message", async () => {
      workflowService.resolveWorkflowVersionId.mockResolvedValue("wv-x");
      documentService.uploadDocument.mockResolvedValue({
        kind: "success",
        document: uploadedDoc,
      });
      const dto: UploadDocumentDto = {
        title: "Test",
        file: "ZmFrZUJhc2U2NA==",
        file_type: FileType.PDF,
        original_filename: "test.pdf",
        model_id: "test-model-id",
        group_id: "group-1",
        workflow_slug: "ocr-only-minimal",
        ctx_overrides: { outputFormat: "markdown" },
      };
      await controller.uploadDocument(dto, mockReq);
      expect(queueService.processOcrForDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: "1",
          ctxOverrides: { outputFormat: "markdown" },
        }),
      );
    });

    it("infers group_id from the API key when not in the body", async () => {
      workflowService.getModelIdDefault.mockResolvedValue("prebuilt-read");
      workflowService.resolveWorkflowVersionId.mockResolvedValue("wv-2");
      documentService.uploadDocument.mockResolvedValue({
        kind: "success",
        document: uploadedDoc,
      });
      const reqWithKey = {
        resolvedIdentity: {
          isSystemAdmin: false,
          groupRoles: { "group-from-key": GroupRole.MEMBER },
          actorId: "actor-key",
        },
        apiKey: {
          groupId: "group-from-key",
          keyPrefix: "abc",
          actorId: "actor-key",
        },
      } as any;
      const dto: UploadDocumentDto = {
        title: "Test",
        file: "ZmFrZUJhc2U2NA==",
        file_type: FileType.PDF,
        original_filename: "test.pdf",
        workflow_slug: "ocr-only-minimal",
      };
      await controller.uploadDocument(dto, reqWithKey);
      expect(documentService.uploadDocument).toHaveBeenLastCalledWith(
        dto.title,
        dto.file,
        dto.file_type,
        dto.original_filename,
        "prebuilt-read",
        "group-from-key",
        undefined,
        "wv-2",
      );
    });

    it("should throw HttpException 422 when PDF normalization failed", async () => {
      const failedDoc = {
        ...uploadedDoc,
        normalized_file_path: null,
        status: DocumentStatus.conversion_failed,
      };
      documentService.uploadDocument.mockResolvedValue({
        kind: "conversion_failed",
        document: failedDoc,
      });

      let caught: unknown;
      try {
        await controller.uploadDocument(baseDto, mockReq);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeDefined();
      expect(caught).toBeInstanceOf(HttpException);
      expect((caught as HttpException).getStatus()).toBe(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      const body = (caught as HttpException).getResponse() as {
        code?: string;
        document?: { id: string };
      };
      expect(body.code).toBe("conversion_failed");
      expect(body.document?.id).toBe("1");

      expect(queueService.processOcrForDocument).not.toHaveBeenCalled();
    });
  });
});
