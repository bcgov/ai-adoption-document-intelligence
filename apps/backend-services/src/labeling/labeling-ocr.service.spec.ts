import { DocumentStatus } from "@generated/client";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { of } from "rxjs";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { DatabaseService } from "../database/database.service";
import { LabelingFileType, LabelingUploadDto } from "./dto/labeling-upload.dto";
import { LabelingOcrService } from "./labeling-ocr.service";

describe("LabelingOcrService", () => {
  let service: LabelingOcrService;
  let mockDbService: jest.Mocked<DatabaseService>;
  let mockHttpService: jest.Mocked<HttpService>;
  let mockBlobStorage: jest.Mocked<BlobStorageInterface>;
  let _mockConfigService: jest.Mocked<ConfigService>;

  const mockLabelingDocument = {
    id: "doc-1",
    title: "Test Document",
    original_filename: "test.pdf",
    file_path: "labeling-documents/doc-1/original.pdf",
    file_type: "pdf",
    file_size: 1024,
    metadata: {},
    source: "labeling",
    status: DocumentStatus.ongoing_ocr,
    created_at: new Date(),
    updated_at: new Date(),
    apim_request_id: null,
    model_id: "prebuilt-layout",
    ocr_result: null,
    group_id: "group-1",
  };

  beforeEach(async () => {
    const mockDb = {
      createLabelingDocument: jest.fn(),
      findLabelingDocument: jest.fn(),
      updateLabelingDocument: jest.fn(),
    };

    const mockHttp = {
      post: jest.fn(),
      get: jest.fn(),
    };

    const mockBlob = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(Buffer.from("test")),
      exists: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([]),
      deleteByPrefix: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfig = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://test.api.com",
          AZURE_DOCUMENT_INTELLIGENCE_API_KEY: "test-api-key",
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabelingOcrService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
        {
          provide: HttpService,
          useValue: mockHttp,
        },
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
        {
          provide: BLOB_STORAGE,
          useValue: mockBlob,
        },
      ],
    }).compile();

    service = module.get<LabelingOcrService>(LabelingOcrService);
    mockDbService = module.get(DatabaseService);
    mockHttpService = module.get(HttpService);
    mockBlobStorage = module.get(BLOB_STORAGE);
    _mockConfigService = module.get(ConfigService);
  });

  describe("createLabelingDocument", () => {
    it("should create a labeling document with base64 file", async () => {
      const dto: LabelingUploadDto = {
        title: "Test Doc",
        file: "data:application/pdf;base64,dGVzdA==",
        file_type: LabelingFileType.PDF,
        original_filename: "test.pdf",
        metadata: {},
        group_id: "group-1",
      };

      mockDbService.createLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as any,
      );

      const result = await service.createLabelingDocument(dto);

      expect(mockBlobStorage.write).toHaveBeenCalledWith(
        expect.stringMatching(/^labeling-documents\/[^/]+\/original\.pdf$/),
        expect.any(Buffer),
      );
      expect(mockDbService.createLabelingDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Test Doc",
          file_type: "pdf",
          source: "labeling",
          status: DocumentStatus.ongoing_ocr,
          model_id: "prebuilt-layout",
          file_path: expect.stringMatching(
            /^labeling-documents\/[^/]+\/original\.pdf$/,
          ),
        }),
      );
      expect(result).toEqual(mockLabelingDocument);
    });

    it("should handle base64 without data prefix", async () => {
      const dto: LabelingUploadDto = {
        title: "Test Doc",
        file: "dGVzdA==",
        file_type: LabelingFileType.PDF,
        group_id: "group-1",
      };

      mockDbService.createLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as any,
      );

      await service.createLabelingDocument(dto);

      expect(mockBlobStorage.write).toHaveBeenCalled();
      expect(mockDbService.createLabelingDocument).toHaveBeenCalled();
    });

    it("should generate filename when original_filename not provided", async () => {
      const dto: LabelingUploadDto = {
        title: "Test Doc",
        file: "dGVzdA==",
        file_type: LabelingFileType.PDF,
        group_id: "group-1",
      };

      mockDbService.createLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as any,
      );

      await service.createLabelingDocument(dto);

      const createCall = mockDbService.createLabelingDocument.mock.calls[0][0];
      expect(createCall.original_filename).toBe("Test Doc.pdf");
    });

    it("should handle different file types", async () => {
      const dto: LabelingUploadDto = {
        title: "Test Image",
        file: "dGVzdA==",
        file_type: LabelingFileType.IMAGE,
        original_filename: "test.jpg",
        group_id: "group-1",
      };

      mockDbService.createLabelingDocument.mockResolvedValueOnce({
        ...mockLabelingDocument,
        file_type: "image",
      } as any);

      await service.createLabelingDocument(dto);

      const createCall = mockDbService.createLabelingDocument.mock.calls[0][0];
      expect(createCall.file_type).toBe("image");
    });
  });

  describe("processOcrForLabelingDocument", () => {
    it("should process OCR successfully", async () => {
      const analysisResponse = {
        status: "succeeded",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          content: "test",
          pages: [],
          tables: [],
        },
      };

      mockDbService.findLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as any,
      );

      mockHttpService.post.mockReturnValueOnce(
        of({
          status: 202,
          headers: { "apim-request-id": "test-request-id" },
          data: null,
          statusText: "Accepted",
          config: {} as any,
        }),
      );

      mockHttpService.get.mockReturnValueOnce(
        of({
          status: 200,
          data: analysisResponse,
          statusText: "OK",
          headers: {},
          config: {} as any,
        }),
      );

      await service.processOcrForLabelingDocument("doc-1");

      expect(mockDbService.findLabelingDocument).toHaveBeenCalledWith("doc-1");
      expect(mockDbService.updateLabelingDocument).toHaveBeenCalledWith(
        "doc-1",
        {
          apim_request_id: "test-request-id",
          status: DocumentStatus.ongoing_ocr,
        },
      );
      expect(mockDbService.updateLabelingDocument).toHaveBeenCalledWith(
        "doc-1",
        {
          status: DocumentStatus.completed_ocr,
          ocr_result: analysisResponse,
        },
      );
    });

    it("should return early if document not found", async () => {
      mockDbService.findLabelingDocument.mockResolvedValueOnce(null);

      await service.processOcrForLabelingDocument("non-existent");

      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it("should handle OCR failure", async () => {
      mockDbService.findLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as any,
      );

      mockHttpService.post.mockReturnValueOnce(
        of({
          status: 500,
          headers: {},
          data: null,
          statusText: "Error",
          config: {} as any,
        }),
      );

      await service.processOcrForLabelingDocument("doc-1");

      expect(mockDbService.updateLabelingDocument).toHaveBeenCalledWith(
        "doc-1",
        {
          status: DocumentStatus.failed,
        },
      );
    });

    it("should mark as failed on exception", async () => {
      mockDbService.findLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as any,
      );

      mockHttpService.post.mockImplementationOnce(() => {
        throw new Error("Network error");
      });

      await service.processOcrForLabelingDocument("doc-1");

      expect(mockDbService.updateLabelingDocument).toHaveBeenCalledWith(
        "doc-1",
        {
          status: DocumentStatus.failed,
        },
      );
    });
  });

  describe("private methods (tested via public methods)", () => {
    it("should use correct URL with keyValuePairs feature", async () => {
      mockDbService.findLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as any,
      );

      mockHttpService.post.mockReturnValueOnce(
        of({
          status: 202,
          headers: { "apim-request-id": "test-id" },
          data: null,
          statusText: "Accepted",
          config: {} as any,
        }),
      );

      mockHttpService.get.mockReturnValueOnce(
        of({
          status: 200,
          data: {
            status: "succeeded",
            analyzeResult: { content: "test" },
          },
          statusText: "OK",
          headers: {},
          config: {} as any,
        }),
      );

      await service.processOcrForLabelingDocument("doc-1");

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.stringContaining("prebuilt-layout"),
        expect.any(Object),
        expect.any(Object),
      );
      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.stringContaining("features=keyValuePairs"),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("should wait for OCR completion with retries", async () => {
      mockDbService.findLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as any,
      );

      mockHttpService.post.mockReturnValueOnce(
        of({
          status: 202,
          headers: { "apim-request-id": "test-id" },
          data: null,
          statusText: "Accepted",
          config: {} as any,
        }),
      );

      // First call returns running, second returns succeeded
      mockHttpService.get
        .mockReturnValueOnce(
          of({
            status: 200,
            data: { status: "running" },
            statusText: "OK",
            headers: {},
            config: {} as any,
          }),
        )
        .mockReturnValueOnce(
          of({
            status: 200,
            data: {
              status: "succeeded",
              analyzeResult: { content: "test" },
            },
            statusText: "OK",
            headers: {},
            config: {} as any,
          }),
        );

      await service.processOcrForLabelingDocument("doc-1");

      expect(mockHttpService.get).toHaveBeenCalledTimes(2);
    });

    it("should timeout after max attempts", async () => {
      jest.useFakeTimers();

      mockDbService.findLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as any,
      );

      mockHttpService.post.mockReturnValueOnce(
        of({
          status: 202,
          headers: { "apim-request-id": "test-id" },
          data: null,
          statusText: "Accepted",
          config: {} as any,
        }),
      );

      // Always return running
      mockHttpService.get.mockReturnValue(
        of({
          status: 200,
          data: { status: "running" },
          statusText: "OK",
          headers: {},
          config: {} as any,
        }),
      );

      const processPromise = service.processOcrForLabelingDocument("doc-1");

      // Fast-forward through all the delay timers (30 attempts × 2000ms)
      for (let i = 0; i < 30; i++) {
        await jest.advanceTimersByTimeAsync(2000);
      }

      await processPromise;

      expect(mockDbService.updateLabelingDocument).toHaveBeenCalledWith(
        "doc-1",
        {
          status: DocumentStatus.failed,
        },
      );

      jest.useRealTimers();
    });

    it("should handle missing analyzeResult", async () => {
      mockDbService.findLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as any,
      );

      mockHttpService.post.mockReturnValueOnce(
        of({
          status: 202,
          headers: { "apim-request-id": "test-id" },
          data: null,
          statusText: "Accepted",
          config: {} as any,
        }),
      );

      mockHttpService.get.mockReturnValueOnce(
        of({
          status: 200,
          data: { status: "succeeded" }, // Missing analyzeResult
          statusText: "OK",
          headers: {},
          config: {} as any,
        }),
      );

      await service.processOcrForLabelingDocument("doc-1");

      expect(mockDbService.updateLabelingDocument).toHaveBeenCalledWith(
        "doc-1",
        {
          status: DocumentStatus.failed,
        },
      );
    });
  });
});
