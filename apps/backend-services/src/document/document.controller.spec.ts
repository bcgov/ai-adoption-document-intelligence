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

    it("should wrap other errors in NotFoundException", async () => {
      databaseService.findDocument.mockRejectedValue(new Error("fail"));
      await expect(controller.getOcrResult("1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("downloadDocument", () => {
    it("should send file if document found", async () => {
      databaseService.findDocument.mockResolvedValue({
        id: "1",
        file_path: "file.txt",
        original_filename: "file.txt",
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
      expect(res.send).toHaveBeenCalledWith(Buffer.from("data"));
    });

    it("should throw NotFoundException if document not found", async () => {
      databaseService.findDocument.mockResolvedValue(null);
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
