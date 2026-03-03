import { Test, TestingModule } from "@nestjs/testing";
import { AzureService } from "../azure/azure.service";
import { BlobService } from "../azure/blob.service";
import { ClassifierStatus } from "../azure/dto/classifier-constants.dto";
import { DatabaseService } from "../database/database.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { StorageService } from "../storage/storage.service";
import { ClassifierService } from "./classifier.service";

const mockDatabaseService = {
  getClassifierModel: jest.fn(),
  updateClassifierModel: jest.fn(),
};
const mockAzureService = {
  getClient: jest.fn().mockReturnValue({
    path: () => ({ post: jest.fn(), get: jest.fn(), del: jest.fn() }),
  }),
  getEndpoint: jest.fn().mockReturnValue("https://mockendpoint"),
  pollOperationUntilResolved: jest.fn(),
};
const mockBlobService = {
  getContainerClient: jest
    .fn()
    .mockReturnValue({ listBlobsByHierarchy: jest.fn() }),
  getBlobSasUrl: jest.fn().mockReturnValue("https://mockbloburl"),
  ensureContainerExists: jest.fn(),
  uploadFile: jest.fn(),
  generateSasUrl: jest.fn().mockReturnValue("https://mockbloburl"),
};
const mockStorageService = {
  getStoragePath: jest.fn(),
  getAllFileNamesAndPaths: jest.fn(),
  readFile: jest.fn(),
  storagePath: "/mock/storage",
};

describe("ClassifierService", () => {
  let service: ClassifierService;
  let module: TestingModule;
  let storageService: StorageService;
  let databaseService: DatabaseService;
  let azureService: AzureService;
  let blobService: BlobService;

  beforeEach(async () => {
    storageService = mockStorageService as any;
    databaseService = mockDatabaseService as any;
    azureService = mockAzureService as any;
    blobService = mockBlobService as any;
    module = await Test.createTestingModule({
      providers: [
        ClassifierService,
        { provide: AppLoggerService, useValue: mockAppLogger },
        { provide: DatabaseService, useValue: databaseService },
        { provide: AzureService, useValue: azureService },
        { provide: BlobService, useValue: blobService },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();
    service = module.get<ClassifierService>(ClassifierService);
  });

  describe("getConstructedClassifierName", () => {
    it("returns expected string", () => {
      expect(service.getConstructedClassifierName("g", "c")).toBe("g__c");
    });
  });

  describe("requestClassifierTraining", () => {
    it("should throw NotFoundException if classifier not found", async () => {
      (databaseService.getClassifierModel as jest.Mock).mockResolvedValue(null);
      await expect(
        service.requestClassifierTraining("c", "g", "u"),
      ).rejects.toThrow();
    });

    it("should call updateClassifierModel if training request accepted", async () => {
      // Patch the client property directly on the service instance
      (service as any).client = {
        path: () => ({
          post: jest.fn().mockResolvedValue({
            status: "202",
            headers: { "operation-location": "https://mock/loc" },
          }),
        }),
      };
      (databaseService.getClassifierModel as jest.Mock).mockResolvedValue({
        description: "desc",
      });
      (blobService.getContainerClient as jest.Mock).mockReturnValue({
        listBlobsByHierarchy: jest.fn().mockReturnValue([]),
      });
      (databaseService.updateClassifierModel as jest.Mock).mockResolvedValue({
        status: ClassifierStatus.TRAINING,
      });

      const result = await service.requestClassifierTraining("c", "g", "u");
      expect(mockDatabaseService.updateClassifierModel).toHaveBeenCalled();
      expect(result.status).toBe(ClassifierStatus.TRAINING);
    });

    it("should throw an error if response is missing headers", async () => {
      (service as any).client = {
        path: () => ({
          post: jest.fn().mockResolvedValue({ status: "202" }),
        }),
      };
      (databaseService.getClassifierModel as jest.Mock).mockResolvedValue({
        description: "desc",
      });
      (blobService.getContainerClient as jest.Mock).mockReturnValue({
        listBlobsByHierarchy: jest.fn().mockReturnValue([]),
      });
      await expect(
        service.requestClassifierTraining("c", "g", "u"),
      ).rejects.toThrow();
    });
  });

  describe("createLayoutJson", () => {
    it("should skip non-image files", async () => {
      const mockGetBlobSasUrl = jest.fn();
      (blobService.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: jest.fn(),
      });
      blobService.getBlobSasUrl = mockGetBlobSasUrl;
      (service as any).client = { path: jest.fn() };
      await expect(
        service.createLayoutJson(["file.txt"]),
      ).resolves.toBeUndefined();
      expect(mockGetBlobSasUrl).not.toHaveBeenCalled();
    });

    it("should process image files and upload layout JSON on 202", async () => {
      const mockGetBlobSasUrl = jest
        .fn()
        .mockReturnValue("https://mockbloburl/file.jpg");
      const mockGetBlockBlobClient = jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue(undefined),
      });
      (blobService.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: mockGetBlockBlobClient,
      });
      blobService.getBlobSasUrl = mockGetBlobSasUrl;

      const pollCallback = jest.fn(async (opLoc, onSuccess, onError) => {
        await onSuccess({ result: "layout" });
      });
      azureService.pollOperationUntilResolved = pollCallback;

      (service as any).client = {
        path: () => ({
          post: jest.fn().mockResolvedValue({
            status: "202",
            headers: {
              "operation-location": "https://mockendpoint/operation/123",
            },
          }),
        }),
      };

      await expect(
        service.createLayoutJson(["file.jpg"]),
      ).resolves.toBeUndefined();
      expect(mockGetBlobSasUrl).toHaveBeenCalledWith(
        "classification",
        "file.jpg",
      );
      expect(pollCallback).toHaveBeenCalled();
      expect(mockGetBlockBlobClient).toHaveBeenCalledWith("file.jpg.ocr.json");
    });

    it("should handle 404 and upload fallback layout JSON", async () => {
      const mockGetBlobSasUrl = jest
        .fn()
        .mockReturnValue("https://mockbloburl/file.jpg");
      const mockGetBlockBlobClient = jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue(undefined),
      });
      (blobService.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: mockGetBlockBlobClient,
      });
      blobService.getBlobSasUrl = mockGetBlobSasUrl;

      // Mock fetch for fallback
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from("imgdata"),
      }) as any;

      (service as any).client = {
        path: (url: string) => ({
          post: jest.fn().mockImplementation(({ body }) => {
            if (body && body.base64Source) {
              return Promise.resolve({
                status: "200",
                body: { fallback: true },
              });
            }
            return Promise.resolve({
              status: "404",
              body: "not found",
            });
          }),
        }),
      };

      Object.defineProperty(service, "logger", {
        value: { debug: jest.fn(), error: jest.fn(), warn: jest.fn() },
      });

      await expect(
        service.createLayoutJson(["file.jpg"]),
      ).resolves.toBeUndefined();
      expect(global.fetch).toHaveBeenCalled();
      expect(mockGetBlockBlobClient).toHaveBeenCalledWith("file.jpg.ocr.json");
    });

    it("should log error if fallback download fails", async () => {
      const mockGetBlobSasUrl = jest
        .fn()
        .mockReturnValue("https://mockbloburl/file.jpg");
      (blobService.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: jest.fn(),
      });
      blobService.getBlobSasUrl = mockGetBlobSasUrl;

      global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;
      (service as any).client = {
        path: () => ({
          post: jest.fn().mockResolvedValue({
            status: "404",
            body: "not found",
          }),
        }),
      };
      const errorLogger = jest.fn();
      Object.defineProperty(service, "logger", {
        value: { error: errorLogger, warn: jest.fn(), debug: jest.fn() },
      });

      await expect(
        service.createLayoutJson(["file.jpg"]),
      ).resolves.toBeUndefined();
      expect(errorLogger).toHaveBeenCalledWith(
        "Failed to download blob for fallback: file.jpg",
      );
    });

    it("should log error if fallback analyze fails", async () => {
      const mockGetBlobSasUrl = jest
        .fn()
        .mockReturnValue("https://mockbloburl/file.jpg");
      (blobService.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: jest.fn(),
      });
      blobService.getBlobSasUrl = mockGetBlobSasUrl;

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from("imgdata"),
      }) as any;

      (service as any).client = {
        path: (url: string) => ({
          post: jest.fn().mockImplementation(({ body }) => {
            if (body && body.base64Source) {
              return Promise.resolve({
                status: "500",
                body: "fail",
              });
            }
            return Promise.resolve({
              status: "404",
              body: "not found",
            });
          }),
        }),
      };
      const errorLogger = jest.fn();
      Object.defineProperty(service, "logger", {
        value: { error: errorLogger, warn: jest.fn(), debug: jest.fn() },
      });

      await expect(
        service.createLayoutJson(["file.jpg"]),
      ).resolves.toBeUndefined();
      expect(errorLogger).toHaveBeenCalledWith("Fallback analyze failed", {
        filePath: "file.jpg",
        status: "500",
        body: "fail",
      });
    });

    it("should log error for non-202/404 analyze response", async () => {
      const mockGetBlobSasUrl = jest
        .fn()
        .mockReturnValue("https://mockbloburl/file.jpg");
      (blobService.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: jest.fn(),
      });
      blobService.getBlobSasUrl = mockGetBlobSasUrl;

      (service as any).client = {
        path: () => ({
          post: jest.fn().mockResolvedValue({
            status: "500",
            body: "fail",
          }),
        }),
      };
      const errorLogger = jest.fn();
      Object.defineProperty(service, "logger", {
        value: { error: errorLogger, warn: jest.fn(), debug: jest.fn() },
      });

      await expect(
        service.createLayoutJson(["file.jpg"]),
      ).resolves.toBeUndefined();
      expect(errorLogger).toHaveBeenCalledWith("Failed to analyze blob", {
        filePath: "file.jpg",
        url: "https://mockbloburl/file.jpg",
        status: "500",
        body: "fail",
      });
    });

    it("should log error if operation-location header is missing", async () => {
      const mockGetBlobSasUrl = jest
        .fn()
        .mockReturnValue("https://mockbloburl/file.jpg");
      (blobService.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: jest.fn(),
      });
      blobService.getBlobSasUrl = mockGetBlobSasUrl;

      (service as any).client = {
        path: () => ({
          post: jest.fn().mockResolvedValue({
            status: "202",
            headers: {},
          }),
        }),
      };
      const errorLogger = jest.fn();
      Object.defineProperty(service, "logger", {
        value: { error: errorLogger, warn: jest.fn(), debug: jest.fn() },
      });

      await expect(
        service.createLayoutJson(["file.jpg"]),
      ).resolves.toBeUndefined();
      expect(errorLogger).toHaveBeenCalledWith(
        "No operation-location header returned for 202 response",
      );
    });
  });

  describe("uploadDocumentsForTraining", () => {
    it("should upload all files and return results", async () => {
      (blobService.ensureContainerExists as jest.Mock).mockResolvedValue(
        undefined,
      );
      (storageService.getStoragePath as jest.Mock).mockReturnValue(
        "/mock/path",
      );
      (storageService.getAllFileNamesAndPaths as jest.Mock).mockResolvedValue([
        { path: "/mock/path/file1.pdf", name: "file1.pdf" },
      ]);
      (storageService.readFile as jest.Mock).mockResolvedValue(
        Buffer.from("test"),
      );
      (blobService.uploadFile as jest.Mock).mockResolvedValue(undefined);
      const result = await service.uploadDocumentsForTraining("gid", "cid");
      expect(result[0].originalPath).toContain("file1.pdf");
      expect(result[0].blobPath).toContain("gid");
      expect(mockBlobService.uploadFile).toHaveBeenCalled();
    });
  });

  describe("generateTrainingConfig", () => {
    it("should generate config with docTypes", async () => {
      const mockList = [
        { kind: "prefix", name: "gid/cid/label1/" },
        { kind: "prefix", name: "gid/cid/label2/" },
      ];
      const asyncIterable = {
        async *[Symbol.asyncIterator]() {
          for (const item of mockList) yield item;
        },
      };
      (blobService.getContainerClient as jest.Mock).mockReturnValue({
        listBlobsByHierarchy: () => asyncIterable,
      });
      const config = await service.generateTrainingConfig(
        "gid",
        "cid",
        "desc",
        "url",
      );
      expect(config.classifierId).toBe("gid__cid");
      expect(config.docTypes.label1).toBeDefined();
      expect(config.docTypes.label2).toBeDefined();
    });
  });

  describe("requestClassification", () => {
    it("should return operation location on 202", async () => {
      (service as any).client = {
        path: () => ({
          post: jest.fn().mockResolvedValue({
            status: "202",
            headers: { "operation-location": "loc" },
          }),
        }),
      };
      (storageService.readFile as jest.Mock).mockResolvedValue(
        Buffer.from("test"),
      );
      const result = await service.requestClassification("file", "cid", "gid");
      expect(result.status).toBe("202");
      expect(result.content).toBe("loc");
    });
    it("should return error on non-202", async () => {
      (service as any).client = {
        path: () => ({
          post: jest.fn().mockResolvedValue({
            status: "400",
            body: "fail",
          }),
        }),
      };
      (storageService.readFile as jest.Mock).mockResolvedValue(
        Buffer.from("test"),
      );
      const result = await service.requestClassification("file", "cid", "gid");
      expect(result.status).toBe("400");
      expect(result.error).toBe("fail");
    });
  });

  describe("requestClassificationFromFile", () => {
    it("should return operation location on 202", async () => {
      (service as any).client = {
        path: () => ({
          post: jest.fn().mockResolvedValue({
            status: "202",
            headers: { "operation-location": "loc" },
          }),
        }),
      };
      const file = { buffer: Buffer.from("test") } as any;
      const result = await service.requestClassificationFromFile(
        file,
        "cid",
        "gid",
      );
      expect(result.status).toBe("202");
      expect(result.content).toBe("loc");
    });
    it("should return error on non-202", async () => {
      (service as any).client = {
        path: () => ({
          post: jest.fn().mockResolvedValue({
            status: "400",
            body: "fail",
          }),
        }),
      };
      const file = { buffer: Buffer.from("test") } as any;
      const result = await service.requestClassificationFromFile(
        file,
        "cid",
        "gid",
      );
      expect(result.status).toBe("400");
      expect(result.error).toBe("fail");
    });
  });
});
