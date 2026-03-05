import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { GroupRole } from "@generated/client";
import { LocalBlobStorageService } from "../blob-storage/local-blob-storage.service";
import { DatabaseService } from "../database/database.service";
import { TemporalClientService } from "../temporal/temporal-client.service";
import { DocumentController } from "./document.controller";

describe("DocumentController", () => {
  let controller: DocumentController;
  let databaseService: jest.Mocked<DatabaseService>;
  let temporalClientService: jest.Mocked<TemporalClientService>;
  let blobStorage: jest.Mocked<LocalBlobStorageService>;

  const mockGroupId = "group-1";
  const createMockReq = (userId = "user-1") => ({
    resolvedIdentity: { userId },
  });
  const createMockApiKeyReq = (groupId = mockGroupId) => ({
    resolvedIdentity: { groupRoles: { [groupId]: GroupRole.MEMBER } },
  });

  beforeEach(async () => {
    databaseService = {
      findAllDocuments: jest.fn(),
      findDocument: jest.fn(),
      findOcrResult: jest.fn(),
      updateDocument: jest.fn(),
      deleteDocument: jest.fn(),
      isUserInGroup: jest.fn().mockResolvedValue(true),
      isUserSystemAdmin: jest.fn().mockResolvedValue(false),
      getUsersGroups: jest.fn().mockResolvedValue([{ group_id: mockGroupId }]),
    } as any;
    temporalClientService = {} as jest.Mocked<TemporalClientService>;
    blobStorage = {
      read: jest.fn(),
      write: jest.fn(),
      exists: jest.fn(),
      delete: jest.fn(),
    } as any;
    controller = new DocumentController(
      databaseService,
      temporalClientService,
      blobStorage,
    );
  });

  describe("getAllDocuments", () => {
    const mockReqWithIdentity = createMockReq();

    it("should return documents for the user's groups", async () => {
      databaseService.findAllDocuments.mockResolvedValue([{ id: "1" } as any]);
      const result = await controller.getAllDocuments(
        mockReqWithIdentity as any,
      );
      expect(result).toEqual([{ id: "1" }]);
      expect(databaseService.findAllDocuments).toHaveBeenCalledWith([
        mockGroupId,
      ]);
    });

    it("should return documents for an API key's group", async () => {
      const apiKeyReq = createMockApiKeyReq();
      databaseService.findAllDocuments.mockResolvedValue([{ id: "1" } as any]);
      const result = await controller.getAllDocuments(apiKeyReq as any);
      expect(result).toEqual([{ id: "1" }]);
      expect(databaseService.findAllDocuments).toHaveBeenCalledWith([
        mockGroupId,
      ]);
    });

    it("should return empty array when there is no identity", async () => {
      const noIdentityReq = { resolvedIdentity: undefined };
      databaseService.findAllDocuments.mockResolvedValue([]);
      const result = await controller.getAllDocuments(noIdentityReq as any);
      expect(result).toEqual([]);
      expect(databaseService.findAllDocuments).toHaveBeenCalledWith([]);
    });

    it("should throw NotFoundException on error", async () => {
      databaseService.findAllDocuments.mockRejectedValue(new Error("fail"));
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
      databaseService.findAllDocuments.mockResolvedValue([mockDocument as any]);
      databaseService.updateDocument = jest.fn().mockResolvedValue({
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
      expect(databaseService.updateDocument).toHaveBeenCalledWith("1", {
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
      databaseService.findAllDocuments.mockResolvedValue([mockDocument as any]);
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
      databaseService.findAllDocuments.mockResolvedValue([{ id: "1" } as any]);
      const result = await controller.getAllDocuments(
        mockReqWithIdentity as any,
        mockGroupId,
      );
      expect(result).toEqual([{ id: "1" }]);
      expect(databaseService.isUserInGroup).toHaveBeenCalledWith(
        "user-1",
        mockGroupId,
      );
      expect(databaseService.findAllDocuments).toHaveBeenCalledWith([
        mockGroupId,
      ]);
    });

    it("should throw ForbiddenException when group_id is provided and user is not a member", async () => {
      databaseService.isUserInGroup.mockResolvedValue(false);
      await expect(
        controller.getAllDocuments(mockReqWithIdentity as any, mockGroupId),
      ).rejects.toThrow(ForbiddenException);
      expect(databaseService.findAllDocuments).not.toHaveBeenCalled();
    });

    it("should return all group documents when group_id is omitted", async () => {
      databaseService.findAllDocuments.mockResolvedValue([
        { id: "1" } as any,
        { id: "2" } as any,
      ]);
      const result = await controller.getAllDocuments(
        mockReqWithIdentity as any,
        undefined,
      );
      expect(result).toEqual([{ id: "1" }, { id: "2" }]);
      expect(databaseService.getUsersGroups).toHaveBeenCalledWith("user-1");
      expect(databaseService.findAllDocuments).toHaveBeenCalledWith([
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
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      databaseService.findOcrResult.mockResolvedValue(mockOcrResult as any);
      const result = await controller.getOcrResult("1", mockReq as any);
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
      databaseService.findDocument.mockResolvedValue(null);
      await expect(
        controller.getOcrResult("1", mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException if user is not a group member", async () => {
      databaseService.findDocument.mockResolvedValue({
        id: "1",
        group_id: mockGroupId,
      } as any);
      databaseService.isUserInGroup.mockResolvedValue(false);
      await expect(
        controller.getOcrResult("1", mockReq as any),
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
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      databaseService.findOcrResult.mockResolvedValue(null);
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
      databaseService.findDocument.mockResolvedValue({
        id: "1",
        status: "done",
        created_at: new Date(),
        group_id: mockGroupId,
      } as any);
      databaseService.findOcrResult.mockRejectedValue(
        new NotFoundException("Not found"),
      );
      await expect(
        controller.getOcrResult("1", mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should wrap other errors in NotFoundException", async () => {
      databaseService.findDocument.mockRejectedValue(new Error("fail"));
      await expect(
        controller.getOcrResult("1", mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("downloadDocument", () => {
    const mockReq = createMockReq();

    it("should send PDF file if document found", async () => {
      databaseService.findDocument.mockResolvedValue({
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
      databaseService.findDocument.mockResolvedValue({
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
      databaseService.findDocument.mockResolvedValue({
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
      databaseService.findDocument.mockResolvedValue({
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
      databaseService.findDocument.mockResolvedValue({
        id: "1",
        file_path: "file.pdf",
        group_id: mockGroupId,
      } as any);
      databaseService.isUserInGroup.mockResolvedValue(false);
      const res: any = {};
      await expect(
        controller.downloadDocument("1", res, mockReq as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException if document not found", async () => {
      databaseService.findDocument.mockResolvedValue(null);
      const res: any = {};
      await expect(
        controller.downloadDocument("1", res, mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should re-throw NotFoundException without wrapping", async () => {
      databaseService.findDocument.mockRejectedValue(
        new NotFoundException("Not found"),
      );
      const res: any = {};
      await expect(
        controller.downloadDocument("1", res, mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should wrap other errors in NotFoundException", async () => {
      databaseService.findDocument.mockRejectedValue(new Error("fail"));
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
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      const result = await controller.getDocument("1", mockReq as any);
      expect(result).toEqual(mockDocument);
      expect(databaseService.findDocument).toHaveBeenCalledWith("1");
    });

    it("should throw NotFoundException if document not found", async () => {
      databaseService.findDocument.mockResolvedValue(null);
      await expect(controller.getDocument("1", mockReq as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw ForbiddenException if user is not a group member", async () => {
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      databaseService.isUserInGroup.mockResolvedValue(false);
      await expect(controller.getDocument("1", mockReq as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should allow API key access when group IDs match", async () => {
      const apiKeyReq = createMockApiKeyReq(mockGroupId);
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      const result = await controller.getDocument("1", apiKeyReq as any);
      expect(result).toEqual(mockDocument);
    });

    it("should throw ForbiddenException for API key with mismatched group", async () => {
      const apiKeyReq = createMockApiKeyReq("other-group");
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
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
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      databaseService.updateDocument.mockResolvedValue(updatedDocument as any);
      const result = await controller.updateDocument(
        "1",
        { title: "New Title" },
        mockReq as any,
      );
      expect(result).toEqual(updatedDocument);
      expect(databaseService.updateDocument).toHaveBeenCalledWith("1", {
        title: "New Title",
      });
    });

    it("should throw NotFoundException if document not found on fetch", async () => {
      databaseService.findDocument.mockResolvedValue(null);
      await expect(
        controller.updateDocument("1", { title: "New Title" }, mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException if user is not a group member", async () => {
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      databaseService.isUserInGroup.mockResolvedValue(false);
      await expect(
        controller.updateDocument("1", { title: "New Title" }, mockReq as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException if update returns null", async () => {
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      databaseService.updateDocument.mockResolvedValue(null);
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

    it("should delete the document and its blob when the user is a group member", async () => {
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      databaseService.deleteDocument.mockResolvedValue(true);
      blobStorage.delete.mockResolvedValue(undefined);
      await controller.deleteDocument("1", mockReq as any);
      expect(databaseService.deleteDocument).toHaveBeenCalledWith("1");
      expect(blobStorage.delete).toHaveBeenCalledWith(mockDocument.file_path);
    });

    it("should throw NotFoundException if document not found", async () => {
      databaseService.findDocument.mockResolvedValue(null);
      await expect(
        controller.deleteDocument("1", mockReq as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException if user is not a group member", async () => {
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      databaseService.isUserInGroup.mockResolvedValue(false);
      await expect(
        controller.deleteDocument("1", mockReq as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should still succeed if blob deletion fails", async () => {
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      databaseService.deleteDocument.mockResolvedValue(true);
      blobStorage.delete.mockRejectedValue(new Error("blob not found"));
      await expect(
        controller.deleteDocument("1", mockReq as any),
      ).resolves.toBeUndefined();
      expect(databaseService.deleteDocument).toHaveBeenCalledWith("1");
    });
  });
});
