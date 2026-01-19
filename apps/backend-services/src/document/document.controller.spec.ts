import { NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { DocumentController } from "./document.controller";

describe("DocumentController", () => {
  let controller: DocumentController;
  let databaseService: jest.Mocked<DatabaseService>;

  beforeEach(async () => {
    databaseService = {
      findAllDocuments: jest.fn(),
      findDocument: jest.fn(),
      findOcrResult: jest.fn(),
    } as any;
    controller = new DocumentController(databaseService);
  });

  describe("getProtectedData", () => {
    it("should return protected data and user info", () => {
      const req: any = {
        user: { idir_username: "u", display_name: "d", email: "e" },
      };
      const result = controller.getProtectedData(req);
      expect(result).toEqual({
        message: "Protected data",
        user: { idirUsername: "u", displayName: "d", email: "e" },
      });
    });

    it("should handle null user", () => {
      const req: any = {
        user: null,
      };
      const result = controller.getProtectedData(req);
      expect(result).toEqual({
        message: "Protected data",
        user: {
          idirUsername: undefined,
          displayName: undefined,
          email: undefined,
        },
      });
    });

    it("should handle user with missing fields", () => {
      const req: any = {
        user: {},
      };
      const result = controller.getProtectedData(req);
      expect(result).toEqual({
        message: "Protected data",
        user: {
          idirUsername: undefined,
          displayName: undefined,
          email: undefined,
        },
      });
    });
  });

  describe("getAdminData", () => {
    it("should return admin data and user info", () => {
      const req: any = {
        user: {
          idir_username: "u",
          display_name: "d",
          email: "e",
          roles: ["admin"],
        },
      };
      const result = controller.getAdminData(req);
      expect(result).toEqual({
        message: "Admin only data",
        user: {
          idirUsername: "u",
          displayName: "d",
          email: "e",
          roles: ["admin"],
        },
      });
    });
  });

  describe("getAllDocuments", () => {
    it("should return all documents", async () => {
      databaseService.findAllDocuments.mockResolvedValue([{ id: "1" } as any]);
      const result = await controller.getAllDocuments();
      expect(result).toEqual([{ id: "1" }]);
    });

    it("should throw NotFoundException on error", async () => {
      databaseService.findAllDocuments.mockRejectedValue(new Error("fail"));
      await expect(controller.getAllDocuments()).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getOcrResult", () => {
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
      };
      const mockOcrResult = {
        id: "ocr-1",
        document_id: "1",
        processed_at: new Date("2024-01-02"),
        keyValuePairs: { field1: "value1" },
      };
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      databaseService.findOcrResult.mockResolvedValue(mockOcrResult as any);
      const result = await controller.getOcrResult("1");
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
      await expect(controller.getOcrResult("1")).rejects.toThrow(
        NotFoundException,
      );
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
      };
      databaseService.findDocument.mockResolvedValue(mockDocument as any);
      databaseService.findOcrResult.mockResolvedValue(null);
      const result = await controller.getOcrResult("1");
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
      } as any);
      databaseService.findOcrResult.mockRejectedValue(
        new NotFoundException("Not found"),
      );
      await expect(controller.getOcrResult("1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should wrap other errors in NotFoundException", async () => {
      databaseService.findDocument.mockRejectedValue(new Error("fail"));
      await expect(controller.getOcrResult("1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("downloadDocument", () => {
    it("should send PDF file if document found", async () => {
      databaseService.findDocument.mockResolvedValue({
        id: "1",
        file_path: "file.pdf",
        original_filename: "file.pdf",
        file_type: "pdf",
      } as any);
      const readFile = await import("fs/promises");
      jest.spyOn(readFile, "readFile").mockResolvedValue(Buffer.from("data"));
      const path = await import("path");
      jest
        .spyOn(path, "join")
        .mockImplementation((_cwd: string, fp: string) => fp);
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.downloadDocument("1", res);
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
      } as any);
      const readFile = await import("fs/promises");
      jest.spyOn(readFile, "readFile").mockResolvedValue(Buffer.from("data"));
      const path = await import("path");
      jest
        .spyOn(path, "join")
        .mockImplementation((_cwd: string, fp: string) => fp);
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.downloadDocument("1", res);
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
      expect(res.send).toHaveBeenCalledWith(Buffer.from("data"));
    });

    it("should send file with default MIME type for unknown file type", async () => {
      databaseService.findDocument.mockResolvedValue({
        id: "1",
        file_path: "file.unknown",
        original_filename: "file.unknown",
        file_type: "unknown",
      } as any);
      const readFile = await import("fs/promises");
      jest.spyOn(readFile, "readFile").mockResolvedValue(Buffer.from("data"));
      const path = await import("path");
      jest
        .spyOn(path, "join")
        .mockImplementation((_cwd: string, fp: string) => fp);
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.downloadDocument("1", res);
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
      } as any);
      const readFile = await import("fs/promises");
      jest.spyOn(readFile, "readFile").mockResolvedValue(Buffer.from("data"));
      const path = await import("path");
      jest
        .spyOn(path, "join")
        .mockImplementation((_cwd: string, fp: string) => fp);
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.downloadDocument("1", res);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        'inline; filename="document-1"',
      );
    });

    it("should throw NotFoundException if document not found", async () => {
      databaseService.findDocument.mockResolvedValue(null);
      const res: any = {};
      await expect(controller.downloadDocument("1", res)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should re-throw NotFoundException without wrapping", async () => {
      databaseService.findDocument.mockRejectedValue(
        new NotFoundException("Not found"),
      );
      const res: any = {};
      await expect(controller.downloadDocument("1", res)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should wrap other errors in NotFoundException", async () => {
      databaseService.findDocument.mockRejectedValue(new Error("fail"));
      const res: any = {};
      await expect(controller.downloadDocument("1", res)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
