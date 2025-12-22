import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { DocumentStatus } from "../generated/enums";
import { OcrService } from "../ocr/ocr.service";
import { QueueMessage, QueueService } from "./queue.service";

describe("QueueService", () => {
  let service: QueueService;
  let ocrService: OcrService;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    ocrService = {
      requestOcr: jest.fn(),
      retrieveOcrResults: jest.fn(),
    } as any;
    databaseService = {
      updateDocument: jest.fn(),
    } as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: OcrService, useValue: ocrService },
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();
    service = module.get<QueueService>(QueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const message: QueueMessage = {
    documentId: "doc1",
    filePath: "/tmp/file.pdf",
    fileType: "pdf",
    timestamp: new Date(),
  };

  describe("processOcrForDocument", () => {
    beforeEach(() => {
      jest
        .spyOn(service as any, "waitForOcrCompletion")
        .mockResolvedValue(undefined);
    });

    it("should request OCR then initiate fetch of results", async () => {
      (ocrService.requestOcr as jest.Mock).mockResolvedValue({
        status: DocumentStatus.ongoing_ocr,
        apimRequestId: "apim-123",
      });
      (databaseService.updateDocument as jest.Mock).mockResolvedValue({});
      await expect(
        service.processOcrForDocument(message),
      ).resolves.toBeUndefined();
      expect(ocrService.requestOcr).toHaveBeenCalledWith("doc1");
      expect(service["waitForOcrCompletion"]).toHaveBeenCalledWith("doc1");
      expect(databaseService.updateDocument).not.toHaveBeenCalledWith("doc1", {
        status: DocumentStatus.completed_ocr,
      });
    });

    it("should throw and update status if OCR request fails", async () => {
      (ocrService.requestOcr as jest.Mock).mockResolvedValue({
        status: DocumentStatus.failed,
        error: "OCR failed",
      });
      (databaseService.updateDocument as jest.Mock).mockResolvedValue({});
      await expect(service.processOcrForDocument(message)).rejects.toThrow(
        "OCR request failed: OCR failed",
      );
      expect(databaseService.updateDocument).toHaveBeenCalledWith("doc1", {
        status: DocumentStatus.failed,
      });
    });

    it("should throw and update status if waitForOcrCompletion throws error", async () => {
      (ocrService.requestOcr as jest.Mock).mockResolvedValue({
        status: DocumentStatus.ongoing_ocr,
        apimRequestId: "apim-123",
      });
      (service["waitForOcrCompletion"] as jest.Mock).mockRejectedValue(
        new Error("polling error"),
      );
      (databaseService.updateDocument as jest.Mock).mockResolvedValue({});
      await expect(service.processOcrForDocument(message)).rejects.toThrow(
        "polling error",
      );
      expect(databaseService.updateDocument).toHaveBeenCalledWith("doc1", {
        status: DocumentStatus.failed,
      });
    });
  });

  describe("waitForOcrCompletion", () => {
    it("should resolve when OCR results are ready", async () => {
      (ocrService.retrieveOcrResults as jest.Mock).mockResolvedValue({
        content: "some content",
      });
      (databaseService.updateDocument as jest.Mock).mockResolvedValue({});
      await expect(
        (service as any).waitForOcrCompletion("doc1", 1, 1),
      ).resolves.toBeUndefined();
      expect(databaseService.updateDocument).toHaveBeenCalledWith("doc1", {
        status: DocumentStatus.completed_ocr,
      });
    });

    it("should retry until timeout and then throw", async () => {
      (ocrService.retrieveOcrResults as jest.Mock).mockResolvedValue(null);
      await expect(
        (service as any).waitForOcrCompletion("doc1", 2, 1),
      ).rejects.toThrow("OCR processing timed out after 2 attempts");
    });

    it("should handle retriable errors and continue polling", async () => {
      (ocrService.retrieveOcrResults as jest.Mock)
        .mockRejectedValueOnce(new Error("not yet been sent for OCR"))
        .mockResolvedValueOnce({ content: "some content" });
      (databaseService.updateDocument as jest.Mock).mockResolvedValue({});
      await expect(
        (service as any).waitForOcrCompletion("doc1", 2, 1),
      ).resolves.toBeUndefined();
      expect(databaseService.updateDocument).toHaveBeenCalledWith("doc1", {
        status: DocumentStatus.completed_ocr,
      });
    });

    it("should throw immediately on non-retriable error", async () => {
      (ocrService.retrieveOcrResults as jest.Mock).mockRejectedValue(
        new Error("unexpected error"),
      );
      await expect(
        (service as any).waitForOcrCompletion("doc1", 1, 1),
      ).rejects.toThrow("unexpected error");
    });
  });
});
