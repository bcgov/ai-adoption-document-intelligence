import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import { AzureStorageService } from "../blob-storage/azure-storage.service";
import { AzureService } from "./azure.service";
import { ClassifierService } from "./classifier.service";
import { ClassifierDbService } from "./classifier-db.service";
import { ClassifierPollerService } from "./classifier-poller.service";
import { ClassifierStatus } from "./dto/classifier-constants.dto";

const mockClassifierDbService = {
  findAllTrainingClassifiers: jest.fn(),
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
        { provide: AppLoggerService, useValue: mockLogger },
        { provide: ClassifierDbService, useValue: mockClassifierDbService },
        { provide: AzureService, useValue: mockAzureService },
        { provide: AzureStorageService, useValue: mockBlobService },
        { provide: ClassifierService, useValue: mockClassifierService },
      ],
    }).compile();

    service = module.get<ClassifierPollerService>(ClassifierPollerService);
    jest.clearAllMocks();
  });

  describe("pollActiveClassifiers", () => {
    it("should not poll if no classifiers are training", async () => {
      mockClassifierDbService.findAllTrainingClassifiers.mockResolvedValue([]);
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
      mockClassifierDbService.findAllTrainingClassifiers.mockResolvedValue(
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
      mockClassifierDbService.findAllTrainingClassifiers.mockRejectedValue(
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
      expect(
        mockClassifierDbService.updateClassifierModel,
      ).toHaveBeenCalledWith("clf", "gid", { status: ClassifierStatus.READY }, undefined);
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
      expect(
        mockClassifierDbService.updateClassifierModel,
      ).toHaveBeenCalledWith("clf", "gid", { status: ClassifierStatus.FAILED }, undefined);
    });

    it("should not update if still training", async () => {
      mockAzureService.checkOperationStatus.mockResolvedValue({
        json: async () => ({ status: "running" }),
      });
      await (service as any).pollClassifierStatus("clf", "gid", "loc");
      expect(
        mockClassifierDbService.updateClassifierModel,
      ).not.toHaveBeenCalled();
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
