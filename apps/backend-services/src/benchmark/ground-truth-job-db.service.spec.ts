import { GroundTruthJobStatus } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { GroundTruthJobDbService } from "./ground-truth-job-db.service";

const mockPrismaClient = {
  datasetGroundTruthJob: {
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  datasetVersion: {
    findFirst: jest.fn(),
  },
  workflow: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe("GroundTruthJobDbService", () => {
  let service: GroundTruthJobDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroundTruthJobDbService,
        { provide: PrismaService, useValue: { prisma: mockPrismaClient } },
      ],
    }).compile();

    service = module.get<GroundTruthJobDbService>(GroundTruthJobDbService);
    jest.clearAllMocks();
  });

  describe("findExistingJobs", () => {
    it("returns existing non-failed jobs", async () => {
      const mockJobs = [{ sampleId: "s-1" }, { sampleId: "s-2" }];
      mockPrismaClient.datasetGroundTruthJob.findMany.mockResolvedValue(
        mockJobs,
      );

      const result = await service.findExistingJobs("v-1");

      expect(result).toEqual(mockJobs);
      expect(
        mockPrismaClient.datasetGroundTruthJob.findMany,
      ).toHaveBeenCalledWith({
        where: {
          datasetVersionId: "v-1",
          status: { not: GroundTruthJobStatus.failed },
        },
        select: { sampleId: true },
      });
    });
  });

  describe("createManyJobs", () => {
    it("creates multiple jobs via $transaction", async () => {
      const mockJobs = [{ id: "j-1" }, { id: "j-2" }];
      mockPrismaClient.$transaction.mockResolvedValue(mockJobs);

      const result = await service.createManyJobs([
        {
          datasetVersionId: "v-1",
          sampleId: "s-1",
          workflowConfigId: "w-1",
          status: GroundTruthJobStatus.pending,
        },
        {
          datasetVersionId: "v-1",
          sampleId: "s-2",
          workflowConfigId: "w-1",
          status: GroundTruthJobStatus.pending,
        },
      ]);

      expect(result).toEqual(mockJobs);
      expect(mockPrismaClient.$transaction).toHaveBeenCalled();
    });
  });

  describe("findJob", () => {
    it("finds a job by id", async () => {
      const mockJob = { id: "j-1", status: GroundTruthJobStatus.pending };
      mockPrismaClient.datasetGroundTruthJob.findUnique.mockResolvedValue(
        mockJob,
      );

      const result = await service.findJob("j-1");

      expect(result).toEqual(mockJob);
      expect(
        mockPrismaClient.datasetGroundTruthJob.findUnique,
      ).toHaveBeenCalledWith({
        where: { id: "j-1" },
      });
    });

    it("returns null when not found", async () => {
      mockPrismaClient.datasetGroundTruthJob.findUnique.mockResolvedValue(null);

      const result = await service.findJob("missing");

      expect(result).toBeNull();
    });
  });

  describe("findJobByDocumentId", () => {
    it("finds a job by documentId", async () => {
      const mockJob = { id: "j-1", documentId: "doc-1" };
      mockPrismaClient.datasetGroundTruthJob.findUnique.mockResolvedValue(
        mockJob,
      );

      const result = await service.findJobByDocumentId("doc-1");

      expect(result).toEqual(mockJob);
      expect(
        mockPrismaClient.datasetGroundTruthJob.findUnique,
      ).toHaveBeenCalledWith({
        where: { documentId: "doc-1" },
      });
    });
  });

  describe("updateJob", () => {
    it("updates a job", async () => {
      const mockJob = { id: "j-1", status: GroundTruthJobStatus.processing };
      mockPrismaClient.datasetGroundTruthJob.update.mockResolvedValue(mockJob);

      const result = await service.updateJob("j-1", {
        status: GroundTruthJobStatus.processing,
      });

      expect(result).toEqual(mockJob);
      expect(
        mockPrismaClient.datasetGroundTruthJob.update,
      ).toHaveBeenCalledWith({
        where: { id: "j-1" },
        data: { status: GroundTruthJobStatus.processing },
      });
    });
  });

  describe("countJobs", () => {
    it("returns count matching filter", async () => {
      mockPrismaClient.datasetGroundTruthJob.count.mockResolvedValue(5);

      const result = await service.countJobs({ datasetVersionId: "v-1" });

      expect(result).toBe(5);
      expect(mockPrismaClient.datasetGroundTruthJob.count).toHaveBeenCalledWith(
        {
          where: { datasetVersionId: "v-1" },
        },
      );
    });
  });

  describe("syncProcessingJobStatuses", () => {
    it("transitions completed_ocr jobs to awaiting_review", async () => {
      mockPrismaClient.datasetGroundTruthJob.findMany.mockResolvedValue([
        { id: "j-1", document: { status: "completed_ocr" } },
        { id: "j-2", document: { status: "processing" } },
      ]);
      mockPrismaClient.datasetGroundTruthJob.updateMany.mockResolvedValue({
        count: 1,
      });

      await service.syncProcessingJobStatuses("v-1");

      expect(
        mockPrismaClient.datasetGroundTruthJob.updateMany,
      ).toHaveBeenCalledWith({
        where: { id: { in: ["j-1"] } },
        data: { status: GroundTruthJobStatus.awaiting_review },
      });
    });

    it("transitions failed document jobs to failed", async () => {
      mockPrismaClient.datasetGroundTruthJob.findMany.mockResolvedValue([
        { id: "j-1", document: { status: "failed" } },
      ]);
      mockPrismaClient.datasetGroundTruthJob.updateMany.mockResolvedValue({
        count: 1,
      });

      await service.syncProcessingJobStatuses("v-1");

      expect(
        mockPrismaClient.datasetGroundTruthJob.updateMany,
      ).toHaveBeenCalledWith({
        where: { id: { in: ["j-1"] } },
        data: {
          status: GroundTruthJobStatus.failed,
          error: "OCR processing failed",
        },
      });
    });

    it("makes no updates when no processing jobs are found", async () => {
      mockPrismaClient.datasetGroundTruthJob.findMany.mockResolvedValue([]);
      mockPrismaClient.datasetGroundTruthJob.updateMany.mockResolvedValue({
        count: 0,
      });

      await service.syncProcessingJobStatuses("v-1");

      expect(
        mockPrismaClient.datasetGroundTruthJob.updateMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("transaction support", () => {
    it("uses provided transaction client instead of this.prisma", async () => {
      const txClient = {
        datasetGroundTruthJob: {
          findUnique: jest.fn().mockResolvedValue({ id: "j-tx" }),
        },
      } as unknown as import("@generated/client").Prisma.TransactionClient;

      const result = await service.findJob("j-tx", txClient);

      expect(result).toEqual({ id: "j-tx" });
      expect(
        mockPrismaClient.datasetGroundTruthJob.findUnique,
      ).not.toHaveBeenCalled();
    });
  });
});
