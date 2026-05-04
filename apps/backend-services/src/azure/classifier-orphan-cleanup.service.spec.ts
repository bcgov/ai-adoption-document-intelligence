import { Test, TestingModule } from "@nestjs/testing";
import { BLOB_STORAGE } from "@/blob-storage/blob-storage.interface";
import { BLOB_STORAGE_CONTAINER_NAME } from "@/blob-storage/blob-storage.module";
import { AppLoggerService } from "@/logging/app-logger.service";
import { AzureStorageService } from "../blob-storage/azure-storage.service";
import { AzureService } from "./azure.service";
import { ClassifierService } from "./classifier.service";
import { ClassifierDbService } from "./classifier-db.service";
import { ClassifierOrphanCleanupService } from "./classifier-orphan-cleanup.service";

const mockClassifierService = {
  listAzureClassifiers: jest.fn(),
};

const mockClassifierDb = {
  findAllClassifierNameGroupPairs: jest.fn(),
};

const mockAzureService = {
  getClient: jest.fn(),
};

const mockAzureStorage = {
  deleteFilesWithPrefix: jest.fn(),
};

const mockBlobStorage = {
  deleteByPrefix: jest.fn(),
};

const mockLogger = {
  debug: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
};

const mockDeleteFn = jest.fn();
const mockClient = {
  path: jest.fn().mockReturnValue({ delete: mockDeleteFn }),
};

describe("ClassifierOrphanCleanupService", () => {
  let service: ClassifierOrphanCleanupService;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    mockAzureService.getClient.mockReturnValue(mockClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassifierOrphanCleanupService,
        { provide: ClassifierService, useValue: mockClassifierService },
        { provide: ClassifierDbService, useValue: mockClassifierDb },
        { provide: AzureService, useValue: mockAzureService },
        { provide: AzureStorageService, useValue: mockAzureStorage },
        { provide: BLOB_STORAGE, useValue: mockBlobStorage },
        { provide: AppLoggerService, useValue: mockLogger },
        { provide: BLOB_STORAGE_CONTAINER_NAME, useValue: "test-container" },
      ],
    }).compile();

    service = module.get<ClassifierOrphanCleanupService>(
      ClassifierOrphanCleanupService,
    );
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ---------------------------------------------------------------------------
  // onModuleInit
  // ---------------------------------------------------------------------------

  describe("onModuleInit", () => {
    it("should log debug message when ENABLE_CLASSIFIER_ORPHAN_CLEANUP is not set", () => {
      delete process.env.ENABLE_CLASSIFIER_ORPHAN_CLEANUP;
      service.onModuleInit();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("ENABLE_CLASSIFIER_ORPHAN_CLEANUP"),
      );
    });

    it("should not log debug message when ENABLE_CLASSIFIER_ORPHAN_CLEANUP is true", () => {
      process.env.ENABLE_CLASSIFIER_ORPHAN_CLEANUP = "true";
      service.onModuleInit();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // cleanupOrphanClassifiers
  // ---------------------------------------------------------------------------
  // Note: the `disabled` option on @Cron is evaluated at NestJS module startup
  // by the scheduler. It cannot be tested by calling the method directly.

  describe("cleanupOrphanClassifiers", () => {
    it("should log summary after run with no classifiers", async () => {
      mockClassifierService.listAzureClassifiers.mockResolvedValue([]);
      mockClassifierDb.findAllClassifierNameGroupPairs.mockResolvedValue([]);
      await service.cleanupOrphanClassifiers();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("complete"),
        expect.objectContaining({ totalFound: 0, totalOrphaned: 0 }),
      );
    });

    it("should abort and log error when listAzureClassifiers throws", async () => {
      mockClassifierService.listAzureClassifiers.mockRejectedValue(
        new Error("Azure error"),
      );
      await service.cleanupOrphanClassifiers();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("aborting"),
        expect.any(Object),
      );
      expect(
        mockClassifierDb.findAllClassifierNameGroupPairs,
      ).not.toHaveBeenCalled();
    });

    it("should abort and log error when DB fetch throws", async () => {
      mockClassifierService.listAzureClassifiers.mockResolvedValue([
        "g1__clf1",
      ]);
      mockClassifierDb.findAllClassifierNameGroupPairs.mockRejectedValue(
        new Error("DB error"),
      );
      await service.cleanupOrphanClassifiers();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("aborting"),
        expect.any(Object),
      );
      expect(mockClient.path).not.toHaveBeenCalled();
    });

    it("should skip non-orphan classifiers (DB record exists)", async () => {
      mockClassifierService.listAzureClassifiers.mockResolvedValue([
        "g1__clf1",
      ]);
      mockClassifierDb.findAllClassifierNameGroupPairs.mockResolvedValue([
        { name: "clf1", group_id: "g1" },
      ]);
      mockDeleteFn.mockResolvedValue({ status: "204" });

      await service.cleanupOrphanClassifiers();

      expect(mockClient.path).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("complete"),
        expect.objectContaining({ totalOrphaned: 0, totalDeleted: 0 }),
      );
    });

    it("should delete orphan classifier resources (Azure DI + both blob stores)", async () => {
      mockClassifierService.listAzureClassifiers.mockResolvedValue([
        "g1__clf1",
      ]);
      mockClassifierDb.findAllClassifierNameGroupPairs.mockResolvedValue([]);
      mockDeleteFn.mockResolvedValue({ status: "204" });
      mockAzureStorage.deleteFilesWithPrefix.mockResolvedValue(undefined);
      mockBlobStorage.deleteByPrefix.mockResolvedValue(undefined);

      await service.cleanupOrphanClassifiers();

      expect(mockClient.path).toHaveBeenCalledWith(
        "/documentClassifiers/g1__clf1",
      );
      expect(mockAzureStorage.deleteFilesWithPrefix).toHaveBeenCalled();
      expect(mockBlobStorage.deleteByPrefix).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("complete"),
        expect.objectContaining({
          totalOrphaned: 1,
          totalDeleted: 1,
          totalErrors: 0,
        }),
      );
    });

    it("should skip classifier with malformed ID (no __ separator)", async () => {
      mockClassifierService.listAzureClassifiers.mockResolvedValue([
        "malformed-classifier-id",
      ]);
      mockClassifierDb.findAllClassifierNameGroupPairs.mockResolvedValue([]);

      await service.cleanupOrphanClassifiers();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("malformed"),
      );
      expect(mockClient.path).not.toHaveBeenCalled();
    });

    it("should skip classifier with malformed ID (empty groupId or classifierName)", async () => {
      mockClassifierService.listAzureClassifiers.mockResolvedValue([
        "__missingGroupId",
        "missingClassifierName__",
      ]);
      mockClassifierDb.findAllClassifierNameGroupPairs.mockResolvedValue([]);

      await service.cleanupOrphanClassifiers();

      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      expect(mockClient.path).not.toHaveBeenCalled();
    });

    it("should continue processing remaining classifiers after one Azure DI delete fails", async () => {
      mockClassifierService.listAzureClassifiers.mockResolvedValue([
        "g1__clf1",
        "g2__clf2",
      ]);
      mockClassifierDb.findAllClassifierNameGroupPairs.mockResolvedValue([]);
      // First delete fails, second succeeds
      mockDeleteFn
        .mockRejectedValueOnce(new Error("Azure DI delete failed"))
        .mockResolvedValueOnce({ status: "204" });
      mockAzureStorage.deleteFilesWithPrefix.mockResolvedValue(undefined);
      mockBlobStorage.deleteByPrefix.mockResolvedValue(undefined);

      await service.cleanupOrphanClassifiers();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to delete orphan Azure DI"),
        expect.any(Object),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fully delete orphan classifier"),
        expect.any(Object),
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("complete"),
        expect.objectContaining({
          totalOrphaned: 2,
          totalDeleted: 1,
          totalErrors: 1,
        }),
      );
    });

    it("should continue processing blob deletes after Azure DI delete fails", async () => {
      mockClassifierService.listAzureClassifiers.mockResolvedValue([
        "g1__clf1",
      ]);
      mockClassifierDb.findAllClassifierNameGroupPairs.mockResolvedValue([]);
      mockDeleteFn.mockRejectedValue(new Error("Azure DI failed"));
      mockAzureStorage.deleteFilesWithPrefix.mockResolvedValue(undefined);
      mockBlobStorage.deleteByPrefix.mockResolvedValue(undefined);

      await service.cleanupOrphanClassifiers();

      // Azure blob and primary blob should still be called even after Azure DI fails
      expect(mockAzureStorage.deleteFilesWithPrefix).toHaveBeenCalled();
      expect(mockBlobStorage.deleteByPrefix).toHaveBeenCalled();
    });

    it("should count error when blob delete fails", async () => {
      mockClassifierService.listAzureClassifiers.mockResolvedValue([
        "g1__clf1",
      ]);
      mockClassifierDb.findAllClassifierNameGroupPairs.mockResolvedValue([]);
      mockDeleteFn.mockResolvedValue({ status: "204" });
      mockAzureStorage.deleteFilesWithPrefix.mockRejectedValue(
        new Error("blob fail"),
      );
      mockBlobStorage.deleteByPrefix.mockResolvedValue(undefined);

      await service.cleanupOrphanClassifiers();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining("complete"),
        expect.objectContaining({ totalErrors: 1 }),
      );
    });
  });
});
