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
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  datasetVersion: {
    findFirst: jest.fn(),
  },
  workflowVersion: {
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
          workflowVersionId: "w-1",
          status: GroundTruthJobStatus.pending,
        },
        {
          datasetVersionId: "v-1",
          sampleId: "s-2",
          workflowVersionId: "w-1",
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

  // ---- Additional method and tx tests ----------------------------------------

  describe("findExistingJobs tx support", () => {
    it("uses provided tx client", async () => {
      const txJob = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = {
        datasetGroundTruthJob: txJob,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findExistingJobs("v-1", tx);
      expect(txJob.findMany).toHaveBeenCalled();
      expect(
        mockPrismaClient.datasetGroundTruthJob.findMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findVersionForProcessing", () => {
    it("finds version for processing (no tx)", async () => {
      const version = { id: "v-1", dataset: { group_id: "g-1" } };
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(version);
      const result = await service.findVersionForProcessing("v-1", "d-1");
      expect(result).toEqual(version);
    });

    it("uses provided tx client", async () => {
      const txDV = { findFirst: jest.fn().mockResolvedValue(null) };
      const tx = {
        datasetVersion: txDV,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findVersionForProcessing("v-1", "d-1", tx);
      expect(txDV.findFirst).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("findPendingJobs", () => {
    it("returns pending jobs (no tx)", async () => {
      const jobs = [{ id: "j-1", status: GroundTruthJobStatus.pending }];
      mockPrismaClient.datasetGroundTruthJob.findMany.mockResolvedValue(jobs);
      const result = await service.findPendingJobs("v-1");
      expect(result).toEqual(jobs);
    });

    it("uses provided tx client", async () => {
      const txJob = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = {
        datasetGroundTruthJob: txJob,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findPendingJobs("v-1", tx);
      expect(txJob.findMany).toHaveBeenCalled();
      expect(
        mockPrismaClient.datasetGroundTruthJob.findMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findJobByDocumentId tx support", () => {
    it("uses provided tx client", async () => {
      const txJob = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = {
        datasetGroundTruthJob: txJob,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findJobByDocumentId("doc-1", tx);
      expect(txJob.findUnique).toHaveBeenCalled();
      expect(
        mockPrismaClient.datasetGroundTruthJob.findUnique,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findJobWithVersionAndDocument", () => {
    it("returns job with version and document (no tx)", async () => {
      const job = {
        id: "j-1",
        datasetVersion: {},
        document: { ocr_result: null },
      };
      mockPrismaClient.datasetGroundTruthJob.findUnique.mockResolvedValue(job);
      const result = await service.findJobWithVersionAndDocument("j-1");
      expect(result).toEqual(job);
    });

    it("uses provided tx client", async () => {
      const txJob = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = {
        datasetGroundTruthJob: txJob,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findJobWithVersionAndDocument("j-1", tx);
      expect(txJob.findUnique).toHaveBeenCalled();
      expect(
        mockPrismaClient.datasetGroundTruthJob.findUnique,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findWorkflowConfig", () => {
    it("returns the workflow config (no tx)", async () => {
      const wf = { config: { workflowId: "wf-1" } };
      mockPrismaClient.workflowVersion.findUnique.mockResolvedValue(wf);
      const result = await service.findWorkflowConfig("w-1");
      expect(result).toEqual(wf);
    });

    it("uses provided tx client", async () => {
      const txWf = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = {
        workflowVersion: txWf,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findWorkflowConfig("w-1", tx);
      expect(txWf.findUnique).toHaveBeenCalled();
      expect(
        mockPrismaClient.workflowVersion.findUnique,
      ).not.toHaveBeenCalled();
    });
  });

  describe("updateJob tx support", () => {
    it("uses provided tx client", async () => {
      const txJob = { update: jest.fn().mockResolvedValue({ id: "j-1" }) };
      const tx = {
        datasetGroundTruthJob: txJob,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.updateJob(
        "j-1",
        { status: GroundTruthJobStatus.processing },
        tx,
      );
      expect(txJob.update).toHaveBeenCalled();
      expect(
        mockPrismaClient.datasetGroundTruthJob.update,
      ).not.toHaveBeenCalled();
    });
  });

  describe("updateManyJobs", () => {
    it("updates many jobs (no tx)", async () => {
      mockPrismaClient.datasetGroundTruthJob.updateMany.mockResolvedValue({
        count: 2,
      });
      await service.updateManyJobs(
        { datasetVersionId: "v-1" },
        { status: GroundTruthJobStatus.failed },
      );
      expect(
        mockPrismaClient.datasetGroundTruthJob.updateMany,
      ).toHaveBeenCalledWith({
        where: { datasetVersionId: "v-1" },
        data: { status: GroundTruthJobStatus.failed },
      });
    });

    it("uses provided tx client", async () => {
      const txJob = { updateMany: jest.fn().mockResolvedValue({ count: 0 }) };
      const tx = {
        datasetGroundTruthJob: txJob,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.updateManyJobs({}, {}, tx);
      expect(txJob.updateMany).toHaveBeenCalled();
      expect(
        mockPrismaClient.datasetGroundTruthJob.updateMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findJobs", () => {
    it("returns paginated jobs (no tx)", async () => {
      const jobs = [{ id: "j-1" }];
      mockPrismaClient.datasetGroundTruthJob.findMany.mockResolvedValue(jobs);
      const result = await service.findJobs("v-1", "d-1", 0, 10);
      expect(result).toEqual(jobs);
    });

    it("uses provided tx client", async () => {
      const txJob = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = {
        datasetGroundTruthJob: txJob,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findJobs("v-1", "d-1", 0, 10, tx);
      expect(txJob.findMany).toHaveBeenCalled();
      expect(
        mockPrismaClient.datasetGroundTruthJob.findMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("countJobs tx support", () => {
    it("uses provided tx client", async () => {
      const txJob = { count: jest.fn().mockResolvedValue(0) };
      const tx = {
        datasetGroundTruthJob: txJob,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.countJobs({}, tx);
      expect(txJob.count).toHaveBeenCalled();
      expect(
        mockPrismaClient.datasetGroundTruthJob.count,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findJobsForReviewQueue", () => {
    it("returns jobs for review queue (no tx)", async () => {
      mockPrismaClient.datasetGroundTruthJob.findMany.mockResolvedValue([]);
      await service.findJobsForReviewQueue({ datasetVersionId: "v-1" }, 0, 10);
      expect(
        mockPrismaClient.datasetGroundTruthJob.findMany,
      ).toHaveBeenCalled();
    });

    it("uses provided tx client", async () => {
      const txJob = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = {
        datasetGroundTruthJob: txJob,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findJobsForReviewQueue({}, 0, 10, tx);
      expect(txJob.findMany).toHaveBeenCalled();
      expect(
        mockPrismaClient.datasetGroundTruthJob.findMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findVersionForValidation", () => {
    it("finds version for validation (no tx)", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue({
        id: "v-1",
      });
      const result = await service.findVersionForValidation("v-1", "d-1");
      expect(result).toEqual({ id: "v-1" });
    });

    it("uses provided tx client", async () => {
      const txDV = { findFirst: jest.fn().mockResolvedValue(null) };
      const tx = {
        datasetVersion: txDV,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findVersionForValidation("v-1", "d-1", tx);
      expect(txDV.findFirst).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("findWorkflow", () => {
    it("finds a workflow (no tx)", async () => {
      mockPrismaClient.workflowVersion.findUnique.mockResolvedValue({
        id: "w-1",
      });
      const result = await service.findWorkflow("w-1");
      expect(result).toEqual({ id: "w-1" });
    });

    it("uses provided tx client", async () => {
      const txWf = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = {
        workflowVersion: txWf,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findWorkflow("w-1", tx);
      expect(txWf.findUnique).toHaveBeenCalled();
      expect(
        mockPrismaClient.workflowVersion.findUnique,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findStaleJobs", () => {
    it("returns non-completed jobs with id and temporalWorkflowId", async () => {
      const stale = [{ id: "j-1", temporalWorkflowId: "tw-1" }];
      mockPrismaClient.datasetGroundTruthJob.findMany.mockResolvedValue(stale);

      const result = await service.findStaleJobs("v-1");

      expect(result).toEqual(stale);
      expect(
        mockPrismaClient.datasetGroundTruthJob.findMany,
      ).toHaveBeenCalledWith({
        where: {
          datasetVersionId: "v-1",
          status: { not: GroundTruthJobStatus.completed },
        },
        select: { id: true, temporalWorkflowId: true },
      });
    });

    it("uses provided tx client", async () => {
      const txJob = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = {
        datasetGroundTruthJob: txJob,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findStaleJobs("v-1", tx);
      expect(txJob.findMany).toHaveBeenCalled();
      expect(
        mockPrismaClient.datasetGroundTruthJob.findMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("deleteJobsByIds", () => {
    it("deletes jobs by IDs", async () => {
      mockPrismaClient.datasetGroundTruthJob.deleteMany.mockResolvedValue({
        count: 2,
      });

      await service.deleteJobsByIds(["j-1", "j-2"]);

      expect(
        mockPrismaClient.datasetGroundTruthJob.deleteMany,
      ).toHaveBeenCalledWith({
        where: { id: { in: ["j-1", "j-2"] } },
      });
    });

    it("uses provided tx client", async () => {
      const txJob = {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      };
      const tx = {
        datasetGroundTruthJob: txJob,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.deleteJobsByIds(["j-1"], tx);
      expect(txJob.deleteMany).toHaveBeenCalled();
      expect(
        mockPrismaClient.datasetGroundTruthJob.deleteMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findCompletedJobSampleIds", () => {
    it("returns completed job sample IDs", async () => {
      const completed = [{ sampleId: "s-1" }, { sampleId: "s-2" }];
      mockPrismaClient.datasetGroundTruthJob.findMany.mockResolvedValue(
        completed,
      );

      const result = await service.findCompletedJobSampleIds("v-1");

      expect(result).toEqual(completed);
      expect(
        mockPrismaClient.datasetGroundTruthJob.findMany,
      ).toHaveBeenCalledWith({
        where: {
          datasetVersionId: "v-1",
          status: GroundTruthJobStatus.completed,
        },
        select: { sampleId: true },
      });
    });

    it("uses provided tx client", async () => {
      const txJob = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = {
        datasetGroundTruthJob: txJob,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findCompletedJobSampleIds("v-1", tx);
      expect(txJob.findMany).toHaveBeenCalled();
      expect(
        mockPrismaClient.datasetGroundTruthJob.findMany,
      ).not.toHaveBeenCalled();
    });
  });
});
