import { DocumentStatus } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { OcrService } from "../ocr/ocr.service";
import { QueueMessage, QueueService } from "./queue.service";

describe("QueueService", () => {
  let service: QueueService;
  let ocrService: OcrService;

  beforeEach(async () => {
    ocrService = {
      requestOcr: jest.fn(),
    } as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [QueueService, { provide: OcrService, useValue: ocrService }],
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
    it("should start OCR workflow successfully", async () => {
      (ocrService.requestOcr as jest.Mock).mockResolvedValue({
        status: DocumentStatus.ongoing_ocr,
        workflowId: "workflow-123",
      });
      await expect(
        service.processOcrForDocument(message),
      ).resolves.toBeUndefined();
      expect(ocrService.requestOcr).toHaveBeenCalledWith("doc1");
    });

    it("should throw error if workflow fails to start", async () => {
      (ocrService.requestOcr as jest.Mock).mockResolvedValue({
        status: DocumentStatus.failed,
        error: "OCR workflow failed to start",
      });
      await expect(service.processOcrForDocument(message)).rejects.toThrow(
        "OCR workflow failed to start: OCR workflow failed to start",
      );
      expect(ocrService.requestOcr).toHaveBeenCalledWith("doc1");
    });

    it("should throw error if requestOcr throws", async () => {
      (ocrService.requestOcr as jest.Mock).mockRejectedValue(
        new Error("Network error"),
      );
      await expect(service.processOcrForDocument(message)).rejects.toThrow(
        "Network error",
      );
      expect(ocrService.requestOcr).toHaveBeenCalledWith("doc1");
    });
  });
});
