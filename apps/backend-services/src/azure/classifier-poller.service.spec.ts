import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { AzureService } from "./azure.service";
import { AzureTrainingStorageService } from "../blob-storage/azure-training-storage.service";
import { ClassifierService } from "./classifier.service";
import { ClassifierPollerService } from "./classifier-poller.service";
import { ClassifierStatus } from "./dto/classifier-constants.dto";

const mockDatabaseService = {
  prisma: {
    classifierModel: {
      findMany: jest.fn(),
    },
  },
  updateClassifierModel: jest.fn(),
};
const mockAzureService = {
  checkOperationStatus: jest.fn(),
};
const mockBlobService = {
  deleteFilesWithPrefix: jest.fn(),
};
const mockClassifierService = {
  classifierContainer: "classification",
};
const mockLogger = {
  debug: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
};

describe("ClassifierPollerService", () => {
  let service: ClassifierPollerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassifierPollerService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: AzureService, useValue: mockAzureService },
        { provide: AzureTrainingStorageService, useValue: mockBlobService },
        { provide: ClassifierService, useValue: mockClassifierService },
      ],
    }).compile();

    service = module.get<ClassifierPollerService>(ClassifierPollerService);
    // @ts-ignore
    service.logger = mockLogger;
    jest.clearAllMocks();
  });

  describe("pollActiveClassifiers", () => {
    it("should not poll if no classifiers are training", async () => {
      mockDatabaseService.prisma.classifierModel.findMany.mockResolvedValue([]);
      await service.pollActiveClassifiers();
      // No logger assertions
    });

    it("should poll and call pollClassifierStatus for each classifier", async () => {
      const classifiers = [
        {
          name: "clf1",
          group_id: "g1",
          operation_location: "loc1",
          status: ClassifierStatus.TRAINING,
        },
        {
          name: "clf2",
          group_id: "g2",
          operation_location: "loc2",
          status: ClassifierStatus.TRAINING,
        },
      ];
      mockDatabaseService.prisma.classifierModel.findMany.mockResolvedValue(
        classifiers,
      );
      const pollSpy = jest
        .spyOn(ClassifierPollerService.prototype as any, "pollClassifierStatus")
        .mockResolvedValue(undefined);
      await service.pollActiveClassifiers();
      expect(pollSpy).toHaveBeenCalledTimes(2);
      expect(pollSpy).toHaveBeenCalledWith("clf1", "g1", "loc1");
      expect(pollSpy).toHaveBeenCalledWith("clf2", "g2", "loc2");
      pollSpy.mockRestore();
    });

    it("should not throw if polling fails", async () => {
      mockDatabaseService.prisma.classifierModel.findMany.mockRejectedValue(
        new Error("fail"),
      );
      await expect(service.pollActiveClassifiers()).resolves.not.toThrow();
    });
  });

  describe("pollClassifierStatus", () => {
    it("should update status to READY if succeeded and delete files for classifier", async () => {
      mockAzureService.checkOperationStatus.mockResolvedValue({
        json: async () => ({ status: "succeeded" }),
      });
      await (service as any).pollClassifierStatus("clf", "gid", "loc");
      expect(mockDatabaseService.updateClassifierModel).toHaveBeenCalledWith(
        "clf",
        "gid",
        { status: ClassifierStatus.READY },
      );
      expect(mockBlobService.deleteFilesWithPrefix).toHaveBeenCalledWith(
        "gid/clf",
        "classification",
      );
    });

    it("should update status to FAILED if failed", async () => {
      mockAzureService.checkOperationStatus.mockResolvedValue({
        json: async () => ({ status: "failed" }),
      });
      await (service as any).pollClassifierStatus("clf", "gid", "loc");
      expect(mockDatabaseService.updateClassifierModel).toHaveBeenCalledWith(
        "clf",
        "gid",
        { status: ClassifierStatus.FAILED },
      );
    });

    it("should not update if still training", async () => {
      mockAzureService.checkOperationStatus.mockResolvedValue({
        json: async () => ({ status: "running" }),
      });
      await (service as any).pollClassifierStatus("clf", "gid", "loc");
      expect(mockDatabaseService.updateClassifierModel).not.toHaveBeenCalled();
    });

    it("should not throw if polling fails", async () => {
      mockAzureService.checkOperationStatus.mockRejectedValue(
        new Error("fail"),
      );
      await expect(
        (service as any).pollClassifierStatus("clf", "gid", "loc"),
      ).resolves.not.toThrow();
    });
  });
});
