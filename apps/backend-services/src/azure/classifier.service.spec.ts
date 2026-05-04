import { Test, TestingModule } from "@nestjs/testing";
import { BLOB_STORAGE_CONTAINER_NAME } from "@/blob-storage/blob-storage.module";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { AzureService } from "../azure/azure.service";
import { ClassifierStatus } from "../azure/dto/classifier-constants.dto";
import { AzureStorageService } from "../blob-storage/azure-storage.service";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { ClassifierService } from "./classifier.service";
import { ClassifierDbService } from "./classifier-db.service";

const mockClassifierDbService = {
  findClassifierModel: jest.fn(),
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
  deleteFilesWithPrefix: jest.fn(),
  fileExists: jest.fn().mockReturnValue(false),
  listBlobs: jest
    .fn()
    .mockResolvedValue([{ name: "_shared/classification/other/sample.jpg" }]),
};
const mockBlobStorage = {
  write: jest.fn(),
  read: jest.fn(),
  exists: jest.fn(),
  delete: jest.fn(),
  list: jest.fn(),
  deleteByPrefix: jest.fn(),
};

describe("ClassifierService", () => {
  let service: ClassifierService;
  let module: TestingModule;
  let blobStorage: BlobStorageInterface;
  let classifierDbService: ClassifierDbService;
  let azureService: AzureService;
  let azureStorage: AzureStorageService;

  beforeEach(async () => {
    blobStorage = mockBlobStorage as any;
    classifierDbService = mockClassifierDbService as any;
    azureService = mockAzureService as any;
    azureStorage = mockBlobService as any;
    module = await Test.createTestingModule({
      providers: [
        ClassifierService,
        { provide: AppLoggerService, useValue: mockAppLogger },
        { provide: ClassifierDbService, useValue: classifierDbService },
        { provide: AzureService, useValue: azureService },
        { provide: AzureStorageService, useValue: azureStorage },
        { provide: BLOB_STORAGE, useValue: blobStorage },
        { provide: BLOB_STORAGE_CONTAINER_NAME, useValue: "document-blobs" },
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
      (classifierDbService.findClassifierModel as jest.Mock).mockResolvedValue(
        null,
      );
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
      (classifierDbService.findClassifierModel as jest.Mock).mockResolvedValue({
        description: "desc",
      });
      (azureStorage.getContainerClient as jest.Mock).mockReturnValue({
        listBlobsByHierarchy: jest.fn().mockReturnValue([]),
      });
      (azureStorage.listBlobs as jest.Mock).mockResolvedValue([
        { name: "_shared/classification/other/sample.jpg" },
      ]);
      (
        classifierDbService.updateClassifierModel as jest.Mock
      ).mockResolvedValue({
        status: ClassifierStatus.TRAINING,
      });

      const result = await service.requestClassifierTraining("c", "g", "u");
      expect(mockClassifierDbService.updateClassifierModel).toHaveBeenCalled();
      expect(result.status).toBe(ClassifierStatus.TRAINING);
    });

    it("should throw an error if response is missing headers", async () => {
      (service as any).client = {
        path: () => ({
          post: jest.fn().mockResolvedValue({ status: "202" }),
        }),
      };
      (classifierDbService.findClassifierModel as jest.Mock).mockResolvedValue({
        description: "desc",
      });
      (azureStorage.getContainerClient as jest.Mock).mockReturnValue({
        listBlobsByHierarchy: jest.fn().mockReturnValue([]),
      });
      (azureStorage.listBlobs as jest.Mock).mockResolvedValue([
        { name: "_shared/classification/other/sample.jpg" },
      ]);
      await expect(
        service.requestClassifierTraining("c", "g", "u"),
      ).rejects.toThrow();
    });
  });

  describe("createLayoutJson", () => {
    it("should skip non-image files", async () => {
      const mockGetBlobSasUrl = jest.fn();
      (azureStorage.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: jest.fn(),
      });
      azureStorage.getBlobSasUrl = mockGetBlobSasUrl;
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
      (azureStorage.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: mockGetBlockBlobClient,
      });
      azureStorage.getBlobSasUrl = mockGetBlobSasUrl;

      const pollCallback = jest.fn(async (_opLoc, onSuccess, _onError) => {
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
        "document-blobs",
        "file.jpg",
      );
      expect(pollCallback).toHaveBeenCalled();
      expect(mockBlobService.uploadFile).toHaveBeenCalledWith(
        "document-blobs",
        "file.jpg.ocr.json",
        expect.any(Buffer),
      );
    });

    it("should handle 404 and upload fallback layout JSON", async () => {
      const mockGetBlobSasUrl = jest
        .fn()
        .mockReturnValue("https://mockbloburl/file.jpg");
      const mockGetBlockBlobClient = jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue(undefined),
      });
      (azureStorage.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: mockGetBlockBlobClient,
      });
      azureStorage.getBlobSasUrl = mockGetBlobSasUrl;

      // Mock fetch for fallback
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from("imgdata"),
      }) as any;

      (service as any).client = {
        path: (_url: string) => ({
          post: jest.fn().mockImplementation(({ body }) => {
            if (body?.base64Source) {
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
      expect(mockBlobService.uploadFile).toHaveBeenCalledWith(
        "document-blobs",
        "file.jpg.ocr.json",
        expect.any(Buffer),
      );
    });

    it("should log error if fallback download fails", async () => {
      const mockGetBlobSasUrl = jest
        .fn()
        .mockReturnValue("https://mockbloburl/file.jpg");
      (azureStorage.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: jest.fn(),
      });
      azureStorage.getBlobSasUrl = mockGetBlobSasUrl;

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
      (azureStorage.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: jest.fn(),
      });
      azureStorage.getBlobSasUrl = mockGetBlobSasUrl;

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from("imgdata"),
      }) as any;

      (service as any).client = {
        path: (_url: string) => ({
          post: jest.fn().mockImplementation(({ body }) => {
            if (body?.base64Source) {
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
      (azureStorage.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: jest.fn(),
      });
      azureStorage.getBlobSasUrl = mockGetBlobSasUrl;

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
      (azureStorage.getContainerClient as jest.Mock).mockReturnValue({
        getBlockBlobClient: jest.fn(),
      });
      azureStorage.getBlobSasUrl = mockGetBlobSasUrl;

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
      (azureStorage.ensureContainerExists as jest.Mock).mockResolvedValue(
        undefined,
      );
      (blobStorage.list as jest.Mock).mockResolvedValue([
        "cuid/classification/cid/label/file1.pdf",
      ]);
      (blobStorage.read as jest.Mock).mockResolvedValue(Buffer.from("test"));
      (azureStorage.uploadFile as jest.Mock).mockResolvedValue(undefined);
      const result = await service.uploadDocumentsForTraining("cuid", "cid");
      expect(result[0].originalPath).toContain("file1.pdf");
      expect(result[0].blobPath).toContain("cuid");
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
      (azureStorage.getContainerClient as jest.Mock).mockReturnValue({
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
      // "other" label is always injected automatically
      expect(config.docTypes.other).toBeDefined();
      expect(config.docTypes.other.azureBlobSource.prefix).toBe(
        "_shared/classification/other",
      );
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
      (blobStorage.read as jest.Mock).mockResolvedValue(Buffer.from("test"));
      const result = await service.requestClassification(
        "cuid/classification/file",
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
      (blobStorage.read as jest.Mock).mockResolvedValue(Buffer.from("test"));
      const result = await service.requestClassification(
        "cuid/classification/file",
        "cid",
        "gid",
      );
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

  // ---------------------------------------------------------------------------
  // listAzureClassifiers
  // ---------------------------------------------------------------------------

  describe("listAzureClassifiers", () => {
    it("should return a list of classifier IDs on success", async () => {
      (service as any).client = {
        path: () => ({
          get: jest.fn().mockResolvedValue({
            status: "200",
            body: {
              value: [
                { classifierId: "g1__clf1" },
                { classifierId: "g1__clf2" },
              ],
            },
          }),
        }),
      };

      const result = await service.listAzureClassifiers();
      expect(result).toEqual(["g1__clf1", "g1__clf2"]);
    });

    it("should return empty array when value is absent", async () => {
      (service as any).client = {
        path: () => ({
          get: jest.fn().mockResolvedValue({
            status: "200",
            body: {},
          }),
        }),
      };

      const result = await service.listAzureClassifiers();
      expect(result).toEqual([]);
    });

    it("should throw when Azure DI returns non-200", async () => {
      (service as any).client = {
        path: () => ({
          get: jest.fn().mockResolvedValue({
            status: "500",
            body: "internal error",
          }),
        }),
      };
      Object.defineProperty(service, "logger", {
        value: {
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
          log: jest.fn(),
        },
      });

      await expect(service.listAzureClassifiers()).rejects.toThrow(
        "Failed to list Azure DI classifiers",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // deleteClassifier
  // ---------------------------------------------------------------------------

  describe("deleteClassifier", () => {
    const mockDeleteClient = (deleteStatus = "204") => {
      (service as any).client = {
        path: () => ({
          get: jest.fn().mockResolvedValue({
            status: "200",
            body: { value: [{ classifierId: "g1__clf1" }] },
          }),
          delete: jest.fn().mockResolvedValue({ status: deleteStatus }),
        }),
      };
    };

    beforeEach(() => {
      (
        mockClassifierDbService.findClassifierModel as jest.Mock
      ).mockResolvedValue({
        name: "clf1",
        group_id: "g1",
        status: "READY",
        operation_location: null,
      });
      (
        mockClassifierDbService as any
      ).findWorkflowVersionsReferencingClassifier = jest
        .fn()
        .mockResolvedValue([]);
      (mockClassifierDbService as any).deleteClassifierModel = jest
        .fn()
        .mockResolvedValue({ name: "clf1" });
      mockBlobService.deleteFilesWithPrefix.mockResolvedValue(undefined);
      mockBlobStorage.deleteByPrefix.mockResolvedValue(undefined);
    });

    it("should return conflict when workflow versions reference classifier", async () => {
      (
        mockClassifierDbService as any
      ).findWorkflowVersionsReferencingClassifier.mockResolvedValue([
        { id: "wl-1", name: "Workflow 1" },
      ]);

      const result = await service.deleteClassifier("clf1", "g1", "actor-1");
      expect(result).toEqual({
        conflictingWorkflows: [{ id: "wl-1", name: "Workflow 1" }],
      });
    });

    it("should return null on successful deletion (happy path)", async () => {
      mockDeleteClient();
      Object.defineProperty(service, "logger", {
        value: {
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
          log: jest.fn(),
        },
      });

      const result = await service.deleteClassifier("clf1", "g1", "actor-1");
      expect(result).toBeNull();
      expect(
        (mockClassifierDbService as any).deleteClassifierModel,
      ).toHaveBeenCalledWith("clf1", "g1");
    });

    it("should attempt cancellation when status is TRAINING", async () => {
      (
        mockClassifierDbService.findClassifierModel as jest.Mock
      ).mockResolvedValue({
        name: "clf1",
        group_id: "g1",
        status: "TRAINING",
        operation_location: "https://mock/op/1",
      });
      const deleteMock = jest.fn().mockResolvedValue({ status: "204" });
      (service as any).client = {
        path: () => ({
          get: jest.fn().mockResolvedValue({
            status: "200",
            body: { value: [] },
          }),
          delete: deleteMock,
        }),
      };
      Object.defineProperty(service, "logger", {
        value: {
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
          log: jest.fn(),
        },
      });

      await service.deleteClassifier("clf1", "g1", "actor-1");
      expect(deleteMock).toHaveBeenCalled();
    });

    it("should log warning if cancellation fails but continue deletion", async () => {
      (
        mockClassifierDbService.findClassifierModel as jest.Mock
      ).mockResolvedValue({
        name: "clf1",
        group_id: "g1",
        status: "TRAINING",
        operation_location: "https://mock/op/1",
      });
      const warnLogger = jest.fn();
      (service as any).client = {
        path: () => ({
          get: jest.fn().mockResolvedValue({
            status: "200",
            body: { value: [] },
          }),
          delete: jest.fn().mockRejectedValue(new Error("cancel failed")),
        }),
      };
      Object.defineProperty(service, "logger", {
        value: {
          error: jest.fn(),
          warn: warnLogger,
          debug: jest.fn(),
          log: jest.fn(),
        },
      });

      const result = await service.deleteClassifier("clf1", "g1", "actor-1");
      expect(result).toBeNull();
      expect(warnLogger).toHaveBeenCalledWith(
        expect.stringContaining("Failed to cancel training"),
        expect.any(Object),
      );
    });

    it("should skip Azure DI deletion if model not in list", async () => {
      (service as any).client = {
        path: () => ({
          get: jest.fn().mockResolvedValue({
            status: "200",
            body: { value: [] }, // no classifiers
          }),
          delete: jest.fn(),
        }),
      };
      const warnLogger = jest.fn();
      Object.defineProperty(service, "logger", {
        value: {
          error: jest.fn(),
          warn: warnLogger,
          debug: jest.fn(),
          log: jest.fn(),
        },
      });

      await service.deleteClassifier("clf1", "g1", "actor-1");
      expect(warnLogger).toHaveBeenCalledWith(
        expect.stringContaining("not found"),
        expect.any(Object),
      );
    });

    it("should skip Azure DI deletion entirely when status is PRETRAINING", async () => {
      (
        mockClassifierDbService.findClassifierModel as jest.Mock
      ).mockResolvedValue({
        name: "clf1",
        group_id: "g1",
        status: "PRETRAINING",
        operation_location: null,
      });
      const getAzureMock = jest.fn();
      (service as any).client = {
        path: () => ({
          get: getAzureMock,
          delete: jest.fn(),
        }),
      };
      const logLogger = jest.fn();
      Object.defineProperty(service, "logger", {
        value: {
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
          log: logLogger,
        },
      });

      const result = await service.deleteClassifier("clf1", "g1", "actor-1");
      expect(result).toBeNull();
      expect(getAzureMock).not.toHaveBeenCalled();
      expect(logLogger).toHaveBeenCalledWith(
        expect.stringContaining("skipping Azure DI model deletion"),
        expect.any(Object),
      );
    });

    it("should log warning if Azure blob delete fails but continue", async () => {
      mockDeleteClient();
      mockBlobService.deleteFilesWithPrefix.mockRejectedValueOnce(
        new Error("azure blob fail"),
      );
      const warnLogger = jest.fn();
      Object.defineProperty(service, "logger", {
        value: {
          error: jest.fn(),
          warn: warnLogger,
          debug: jest.fn(),
          log: jest.fn(),
        },
      });

      const result = await service.deleteClassifier("clf1", "g1", "actor-1");
      expect(result).toBeNull();
      expect(warnLogger).toHaveBeenCalledWith(
        expect.stringContaining("Failed to delete Azure blob storage files"),
        expect.any(Object),
      );
    });

    it("should log warning if primary blob delete fails but continue", async () => {
      mockDeleteClient();
      mockBlobStorage.deleteByPrefix.mockRejectedValueOnce(
        new Error("primary blob fail"),
      );
      const warnLogger = jest.fn();
      Object.defineProperty(service, "logger", {
        value: {
          error: jest.fn(),
          warn: warnLogger,
          debug: jest.fn(),
          log: jest.fn(),
        },
      });

      const result = await service.deleteClassifier("clf1", "g1", "actor-1");
      expect(result).toBeNull();
      expect(warnLogger).toHaveBeenCalledWith(
        expect.stringContaining("Failed to delete primary blob storage files"),
        expect.any(Object),
      );
    });
  });
});
