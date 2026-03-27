import { GroupRole } from "@generated/client";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { BlobStorageInterface } from "../blob-storage/blob-storage.interface";
import { TemporalClientService } from "../temporal/temporal-client.service";
import { DocumentController } from "./document.controller";
import { DocumentService } from "./document.service";

const mockAuditService = {
  recordEvent: jest.fn().mockResolvedValue(undefined),
};

describe("DocumentController", () => {
  let controller: DocumentController;
  let documentService: jest.Mocked<DocumentService>;
  let temporalClientService: jest.Mocked<TemporalClientService>;
  let blobStorage: jest.Mocked<BlobStorageInterface>;

  const mockGroupId = "group-1";
  const createMockReq = (userId = "user-1") => ({
    resolvedIdentity: {
      userId,
      isSystemAdmin: false,
      groupRoles: { [mockGroupId]: GroupRole.MEMBER },
      actorId: "actor-1",
    },
  });
  const createMockApiKeyReq = (groupId = mockGroupId) => ({
    resolvedIdentity: { groupRoles: { [groupId]: GroupRole.MEMBER } },
  });

  beforeEach(async () => {
    mockAuditService.recordEvent.mockClear();
    documentService = {
      findAllDocuments: jest.fn(),
      findDocument: jest.fn(),
      findOcrResult: jest.fn(),
      updateDocument: jest.fn(),
      deleteDocument: jest.fn(),
      uploadDocument: jest.fn(),
      updateDocumentStatus: jest.fn(),
    } as any;
    temporalClientService = {} as jest.Mocked<TemporalClientService>;
    blobStorage = {
      read: jest.fn(),
      write: jest.fn(),
      exists: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      deleteByPrefix: jest.fn(),
    } as any;
    controller = new DocumentController(
      documentService,
      temporalClientService,
      blobStorage,
      mockAppLogger,
      mockAuditService as any,
    );
  });

  describe("getAllDocuments", () => {
    const mockReqWithIdentity = createMockReq();

    it("should return documents for the user's groups", async () => {
      documentService.findAllDocuments.mockResolvedValue([{ id: "1" } as any]);
      const result = await controller.getAllDocuments(
        mockReqWithIdentity as any,
      );
      expect(result).toEqual([{ id: "1" }]);
      expect(documentService.findAllDocuments).toHaveBeenCalledWith([
        mockGroupId,
      ]);
    });

    it("should return documents for an API key's group", async () => {
      const apiKeyReq = createMockApiKeyReq();
      documentService.findAllDocuments.mockResolvedValue([{ id: "1" } as any]);
      const result = await controller.getAllDocuments(apiKeyReq as any);
      expect(result).toEqual([{ id: "1" }]);
      expect(documentService.findAllDocuments).toHaveBeenCalledWith([
        mockGroupId,
      ]);
    });

    it("should return empty array when there is no identity", async () => {
      const noIdentityReq = { resolvedIdentity: undefined };
      documentService.findAllDocuments.mockResolvedValue([]);
      const result = await controller.getAllDocuments(noIdentityReq as any);
      expect(result).toEqual([]);
      expect(documentService.findAllDocuments).toHaveBeenCalledWith([]);
    });

    it("should throw NotFoundException on error", async () => {
      documentService.findAllDocuments.mockRejectedValue(new Error("fail"));
      await expect(
        controller.getAllDocuments(mockReqWithIdentity as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should update document status to failed when workflow has failed", async () => {
      const mockDocument = {
        id: "1",
        status: "ongoing_ocr",
        workflow_execution_id: "workflow-123",
      };
      documentService.findAllDocuments.mockResolvedValue([mockDocument as any]);
      documentService.updateDocument = jest.fn().mockResolvedValue({
        ...mockDocument,
        status: "failed",
      });
      temporalClientService.getWorkflowStatus = jest.fn().mockResolvedValue({
        status: "FAILED",
      });

      const result = await controller.getAllDocuments(
        mockReqWithIdentity as any,
      );

      expect(temporalClientService.getWorkflowStatus).toHaveBeenCalledWith(
        "workflow-123",
      );
      expect(documentService.updateDocument).toHaveBeenCalledWith("1", {
        status: "failed",
      });
      expect(result).toEqual([{ ...mockDocument, status: "failed" }]);
    });

    it("should check for awaiting review when workflow is running", async () => {
      const mockDocument = {
        id: "1",
        status: "ongoing_ocr",
        workflow_execution_id: "workflow-123",
      };
      documentService.findAllDocuments.mockResolvedValue([mockDocument as any]);
      temporalClientService.getWorkflowStatus = jest.fn().mockResolvedValue({
        status: "RUNNING",
      });
      temporalClientService.queryWorkflowStatus = jest.fn().mockResolvedValue({
        status: "awaiting_review",
      });

      const result = await controller.getAllDocuments(
        mockReqWithIdentity as any,
      );

      expect(temporalClientService.getWorkflowStatus).toHaveBeenCalledWith(
        "workflow-123",
      );
      expect(temporalClientService.queryWorkflowStatus).toHaveBeenCalledWith(
        "workflow-123",
      );
      expect(result).toEqual([
        { ...mockDocument, status: "needs_validation", needsReview: true },
      ]);
    });

    it("should filter documents by group_id when provided", async () => {
      documentService.findAllDocuments.mockResolvedValue([{ id: "1" } as any]);
      const result = await controller.getAllDocuments(
        mockReqWithIdentity as any,
        mockGroupId,
      );
      expect(result).toEqual([{ id: "1" }]);
      expect(documentService.findAllDocuments).toHaveBeenCalledWith([
        mockGroupId,
      ]);
    });

    it("should throw ForbiddenException when group_id is provided and user is not a member", async () => {
      const notMemberReq = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      };
      await expect(
        controller.getAllDocuments(notMemberReq as any, mockGroupId),
      ).rejects.toThrow(ForbiddenException);
      expect(documentService.findAllDocuments).not.toHaveBeenCalled();
    });

    it("should return all group documents when group_id is omitted", async () => {
      documentService.findAllDocuments.mockResolvedValue([
        { id: "1" } as any,
        { id: "2" } as any,
      ]);
      const result = await controller.getAllDocuments(
        mockReqWithIdentity as any,
        undefined,
      );
      expect(result).toEqual([{ id: "1" }, { id: "2" }]);
      expect(documentService.findAllDocuments).toHaveBeenCalledWith([
        mockGroupId,
      ]);
    });
  });

  describe("getOcrResult", () => {
    const mockReq = createMockReq();

    it("should return consistent structure with OCR result if found", async () => {
      const mockDocument = {
        id: "1",
        status: "completed_ocr",
        title: "Test Document",
        original_filename: "test.pdf",
        file_type: "pdf",
        file_size: 1024,
        created_at: new Date("2024-01-01"),
        updated_at: new Date("2024-01-02"),
        apim_request_id: "123",
        model_id: "prebuilt-layout",
        group_id: mockGroupId,
      };
      const mockOcrResult = {
        id: "ocr-1",
        document_id: "1",
        processed_at: new Date("2024-01-02"),
        keyValuePairs: { field1: "value1" },
      };
      documentService.findDocument.mockResolvedValue(mockDocument as any);
      documentService.findOcrResult.mockResolvedValue(mockOcrResult as any);
      const result = await controller.getOcrResult("1", mockReq as any);
      expect(mockAuditService.recordEvent).toHaveBeenCalledWith({
        event_type: "document_accessed",
        resource_type: "document",
        resource_id: "1",
        actor_id: "actor-1",
        document_id: "1",
        group_id: mockGroupId,
        request_id: undefined,
        payload: { action: "ocr" },
      });
      expect(result).toEqual({
        document_id: "1",
        status: "completed_ocr",
        title: "Test Document",
        original_filename: "test.pdf",
        file_type: "pdf",
        file_size: 1024,
        created_at: mockDocument.created_at,
        updated_at: mockDocument.updated_at,
        apim_request_id: "123",
        model_id: "prebuilt-layout",
        ocr_result: mockOcrResult,
      });
    });

    it("should throw NotFoundException if document not found", async () => {
      documentService.findDocument.mockResolvedValue(null);
      await expect(
        controller.getOcrResult("1", mockReq as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockAuditService.recordEvent).not.toHaveBeenCalled();
    });

    it("should throw ForbiddenException if user is not a group member", async () => {
      const notMemberReq = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      };
      documentService.findDocument.mockResolvedValue({
        id: "1",
        group_id: mockGroupId,
      } as any);
      await expect(
        controller.getOcrResult("1", notMemberReq as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should return consistent structure with ocr_result null if OCR result not found", async () => {
      const mockDocument = {
        id: "1",
        status: "ongoing_ocr",
        title: "Test Document",
        original_filename: "test.pdf",
        file_type: "pdf",
        file_size: 1024,
        created_at: new Date("2024-01-01"),
        updated_at: new Date("2024-01-02"),
        apim_request_id: null,
        model_id: "prebuilt-layout",
        group_id: mockGroupId,
      };
      documentService.findDocument.mockResolvedValue(mockDocument as any);
      documentService.findOcrResult.mockResolvedValue(null);
      const result = await controller.getOcrResult("1", mockReq as any);
      expect(result).toEqual({
        document_id: "1",
        status: "ongoing_ocr",
        title: "Test Document",
        original_filename: "test.pdf",
        file_type: "pdf",
        file_size: 1024,
        created_at: mockDocument.created_at,
        updated_at: mockDocument.updated_at,
        apim_request_id: null,
        model_id: "prebuilt-layout",
        ocr_result: null,
      });
    });

    it("should re-throw NotFoundException without wrapping", async () => {
      documentService.findDocument.mockResolvedValue({
        id: "1",
        status: "done",
        created_at: new Date(),
        group_id: mockGroupId,
      } as any);
      documentService.findOcrResult.mockRejectedValue(
        new NotFoundException("Not found"),
      );
      await expect(
        controller.getOcrResult("1", mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should wrap other errors in NotFoundException", async () => {
      documentService.findDocument.mockRejectedValue(new Error("fail"));
      await expect(
        controller.getOcrResult("1", mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("downloadDocument", () => {
    const mockReq = createMockReq();

    it("should send PDF file if document found", async () => {
      documentService.findDocument.mockResolvedValue({
        id: "1",
        file_path: "file.pdf",
        original_filename: "file.pdf",
        file_type: "pdf",
        group_id: mockGroupId,
      } as any);
      blobStorage.read.mockResolvedValue(Buffer.from("data"));
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.downloadDocument("1", res, mockReq as any);
      expect(mockAuditService.recordEvent).toHaveBeenCalledWith({
        event_type: "document_accessed",
        resource_type: "document",
        resource_id: "1",
        actor_id: "actor-1",
        document_id: "1",
        group_id: mockGroupId,
        request_id: undefined,
        payload: { action: "download" },
      });
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/pdf",
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        'inline; filename="file.pdf"',
      );
      expect(res.setHeader).toHaveBeenCalledWith("Content-Length", 4);
      expect(res.send).toHaveBeenCalledWith(Buffer.from("data"));
    });

    it("should send image file with correct MIME type", async () => {
      documentService.findDocument.mockResolvedValue({
        id: "1",
        file_path: "file.jpg",
        original_filename: "file.jpg",
        file_type: "image",
        group_id: mockGroupId,
      } as any);
      blobStorage.read.mockResolvedValue(Buffer.from("data"));
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.downloadDocument("1", res, mockReq as any);
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
      expect(res.send).toHaveBeenCalledWith(Buffer.from("data"));
    });

    it("should send file with default MIME type for unknown file type", async () => {
      documentService.findDocument.mockResolvedValue({
        id: "1",
        file_path: "file.unknown",
        original_filename: "file.unknown",
        file_type: "unknown",
        group_id: mockGroupId,
      } as any);
      blobStorage.read.mockResolvedValue(Buffer.from("data"));
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.downloadDocument("1", res, mockReq as any);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/octet-stream",
      );
      expect(res.send).toHaveBeenCalledWith(Buffer.from("data"));
    });

    it("should use document ID as filename if original_filename is missing", async () => {
      documentService.findDocument.mockResolvedValue({
        id: "1",
        file_path: "file.pdf",
        original_filename: null,
        file_type: "pdf",
        group_id: mockGroupId,
      } as any);
      blobStorage.read.mockResolvedValue(Buffer.from("data"));
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.downloadDocument("1", res, mockReq as any);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        'inline; filename="document-1"',
      );
    });

    it("should throw ForbiddenException if user is not a group member", async () => {
      const notMemberReq = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      };
      documentService.findDocument.mockResolvedValue({
        id: "1",
        file_path: "file.pdf",
        group_id: mockGroupId,
      } as any);
      const res: any = {};
      await expect(
        controller.downloadDocument("1", res, notMemberReq as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException if document not found", async () => {
      documentService.findDocument.mockResolvedValue(null);
      const res: any = {};
      await expect(
        controller.downloadDocument("1", res, mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should re-throw NotFoundException without wrapping", async () => {
      documentService.findDocument.mockRejectedValue(
        new NotFoundException("Not found"),
      );
      const res: any = {};
      await expect(
        controller.downloadDocument("1", res, mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should wrap other errors in NotFoundException", async () => {
      documentService.findDocument.mockRejectedValue(new Error("fail"));
      const res: any = {};
      await expect(
        controller.downloadDocument("1", res, mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getDocument", () => {
    const mockReq = createMockReq();
    const mockDocument = {
      id: "1",
      title: "Test",
      group_id: mockGroupId,
    };

    it("should return the document when the user is a group member", async () => {
      documentService.findDocument.mockResolvedValue(mockDocument as any);
      const result = await controller.getDocument("1", mockReq as any);
      expect(result).toEqual(mockDocument);
      expect(documentService.findDocument).toHaveBeenCalledWith("1");
      expect(mockAuditService.recordEvent).toHaveBeenCalledWith({
        event_type: "document_accessed",
        resource_type: "document",
        resource_id: "1",
        actor_id: "actor-1",
        document_id: "1",
        group_id: mockGroupId,
        request_id: undefined,
        payload: { action: "metadata" },
      });
    });

    it("should throw NotFoundException if document not found", async () => {
      documentService.findDocument.mockResolvedValue(null);
      await expect(controller.getDocument("1", mockReq as any)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockAuditService.recordEvent).not.toHaveBeenCalled();
    });

    it("should throw ForbiddenException if user is not a group member", async () => {
      const notMemberReq = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      };
      documentService.findDocument.mockResolvedValue(mockDocument as any);
      await expect(
        controller.getDocument("1", notMemberReq as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should allow API key access when group IDs match", async () => {
      const apiKeyReq = createMockApiKeyReq(mockGroupId);
      documentService.findDocument.mockResolvedValue(mockDocument as any);
      const result = await controller.getDocument("1", apiKeyReq as any);
      expect(result).toEqual(mockDocument);
    });

    it("should throw ForbiddenException for API key with mismatched group", async () => {
      const apiKeyReq = createMockApiKeyReq("other-group");
      documentService.findDocument.mockResolvedValue(mockDocument as any);
      await expect(
        controller.getDocument("1", apiKeyReq as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("updateDocument", () => {
    const mockReq = createMockReq();
    const mockDocument = {
      id: "1",
      title: "Old Title",
      group_id: mockGroupId,
    };
    const updatedDocument = { ...mockDocument, title: "New Title" };

    it("should update the document when the user is a group member", async () => {
      documentService.findDocument.mockResolvedValue(mockDocument as any);
      documentService.updateDocument.mockResolvedValue(updatedDocument as any);
      const result = await controller.updateDocument(
        "1",
        { title: "New Title" },
        mockReq as any,
      );
      expect(result).toEqual(updatedDocument);
      expect(documentService.updateDocument).toHaveBeenCalledWith("1", {
        title: "New Title",
      });
    });

    it("should throw NotFoundException if document not found on fetch", async () => {
      documentService.findDocument.mockResolvedValue(null);
      await expect(
        controller.updateDocument("1", { title: "New Title" }, mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException if user is not a group member", async () => {
      const notMemberReq = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      };
      documentService.findDocument.mockResolvedValue(mockDocument as any);
      await expect(
        controller.updateDocument(
          "1",
          { title: "New Title" },
          notMemberReq as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException if update returns null", async () => {
      documentService.findDocument.mockResolvedValue(mockDocument as any);
      documentService.updateDocument.mockResolvedValue(null);
      await expect(
        controller.updateDocument("1", { title: "New Title" }, mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deleteDocument", () => {
    const mockReq = createMockReq();
    const mockDocument = {
      id: "1",
      file_path: "documents/1/original.pdf",
      group_id: mockGroupId,
    };

    it("should delete the document when the user is a group member", async () => {
      documentService.findDocument.mockResolvedValue(mockDocument as any);
      documentService.deleteDocument.mockResolvedValue(true);
      await controller.deleteDocument("1", mockReq as any);
      expect(documentService.deleteDocument).toHaveBeenCalledWith("1");
    });

    it("should throw NotFoundException if document not found", async () => {
      documentService.findDocument.mockResolvedValue(null);
      await expect(
        controller.deleteDocument("1", mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException if user is not a group member", async () => {
      const notMemberReq = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      };
      documentService.findDocument.mockResolvedValue(mockDocument as any);
      await expect(
        controller.deleteDocument("1", notMemberReq as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
