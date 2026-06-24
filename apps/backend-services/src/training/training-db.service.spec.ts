import { TrainingStatus } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../database/prisma.service";
import type {
  TrainedModelCreateData,
  TrainingJobCreateData,
  TrainingJobUpdateData,
} from "./training-db.service";
import { TrainingDbService } from "./training-db.service";

describe("TrainingDbService", () => {
  let service: TrainingDbService;
  let mockPrisma: {
    trainingJob: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    trainedModel: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      aggregate: jest.Mock;
    };
    labeledDocument: {
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const mockTrainingJob = {
    id: "job-1",
    template_model_id: "project-1",
    status: TrainingStatus.PENDING,
    container_name: "training-project-1",
    operation_id: null,
    sas_url: null,
    blob_count: null,
    error_message: null,
    started_at: new Date(),
    completed_at: null,
    build_mode: "template",
    dataset_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    target_model_id: null,
    target_version: null,
  };

  const mockTrainedModel = {
    id: "trained-1",
    template_model_id: "project-1",
    training_job_id: "job-1",
    model_id: "custom-model-1",
    description: "Test Model",
    doc_types: { custom: { fieldSchema: { field1: {} } } },
    field_count: 1,
    version: 1,
    is_active: true,
    deleted_at: null,
    dataset_snapshot: null,
    created_at: new Date(),
  };

  beforeEach(async () => {
    mockPrisma = {
      trainingJob: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      trainedModel: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
      labeledDocument: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingDbService,
        {
          provide: PrismaService,
          useValue: { prisma: mockPrisma },
        },
      ],
    }).compile();

    service = module.get<TrainingDbService>(TrainingDbService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // createTrainingJob
  // ---------------------------------------------------------------------------

  describe("createTrainingJob", () => {
    it("should create and return a training job", async () => {
      const data: TrainingJobCreateData = {
        template_model_id: "project-1",
        status: TrainingStatus.PENDING,
        container_name: "training-project-1",
      };

      mockPrisma.trainingJob.create.mockResolvedValueOnce(mockTrainingJob);

      const result = await service.createTrainingJob(data);

      expect(result).toEqual(mockTrainingJob);
      expect(mockPrisma.trainingJob.create).toHaveBeenCalledWith({ data });
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.trainingJob.create.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(
        service.createTrainingJob({
          template_model_id: "p1",
          status: TrainingStatus.PENDING,
          container_name: "c",
        }),
      ).rejects.toThrow("Prisma error");
    });
  });

  // ---------------------------------------------------------------------------
  // findTrainingJob
  // ---------------------------------------------------------------------------

  describe("findTrainingJob", () => {
    it("should return a training job when found", async () => {
      mockPrisma.trainingJob.findUnique.mockResolvedValueOnce(mockTrainingJob);

      const result = await service.findTrainingJob("job-1");

      expect(result).toEqual(mockTrainingJob);
      expect(mockPrisma.trainingJob.findUnique).toHaveBeenCalledWith({
        where: { id: "job-1" },
        include: { template_model: true },
      });
    });

    it("should return null when not found", async () => {
      mockPrisma.trainingJob.findUnique.mockResolvedValueOnce(null);

      const result = await service.findTrainingJob("non-existent");

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // findAllTrainingJobs
  // ---------------------------------------------------------------------------

  describe("findAllTrainingJobs", () => {
    it("should return all training jobs for a template model", async () => {
      const jobs = [mockTrainingJob, { ...mockTrainingJob, id: "job-2" }];
      mockPrisma.trainingJob.findMany.mockResolvedValueOnce(jobs);

      const result = await service.findAllTrainingJobs("tm-1");

      expect(result).toHaveLength(2);
      expect(mockPrisma.trainingJob.findMany).toHaveBeenCalledWith({
        where: { template_model_id: "tm-1" },
        orderBy: { started_at: "desc" },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // findInFlightJobForTemplate
  // ---------------------------------------------------------------------------

  describe("findInFlightJobForTemplate", () => {
    it("queries for any non-terminal status scoped to the template, newest first", async () => {
      const inFlight = { ...mockTrainingJob, status: TrainingStatus.TRAINING };
      mockPrisma.trainingJob.findFirst.mockResolvedValueOnce(inFlight);

      const result = await service.findInFlightJobForTemplate("tm-1");

      expect(result).toEqual(inFlight);
      expect(mockPrisma.trainingJob.findFirst).toHaveBeenCalledWith({
        where: {
          template_model_id: "tm-1",
          status: {
            in: [
              TrainingStatus.PENDING,
              TrainingStatus.UPLOADING,
              TrainingStatus.UPLOADED,
              TrainingStatus.TRAINING,
            ],
          },
        },
        orderBy: { started_at: "desc" },
      });
    });

    it("returns null when no in-flight job exists", async () => {
      mockPrisma.trainingJob.findFirst.mockResolvedValueOnce(null);
      const result = await service.findInFlightJobForTemplate("tm-1");
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // findAllActiveTrainingJobs
  // ---------------------------------------------------------------------------

  describe("findAllActiveTrainingJobs", () => {
    it("should return active training jobs", async () => {
      const activeJobs = [
        { ...mockTrainingJob, status: TrainingStatus.TRAINING },
        { ...mockTrainingJob, id: "job-2", status: TrainingStatus.UPLOADED },
      ];
      mockPrisma.trainingJob.findMany.mockResolvedValueOnce(activeJobs);

      const result = await service.findAllActiveTrainingJobs();

      expect(result).toHaveLength(2);
      expect(mockPrisma.trainingJob.findMany).toHaveBeenCalledWith({
        where: {
          status: {
            in: [TrainingStatus.TRAINING, TrainingStatus.UPLOADED],
          },
        },
        include: { template_model: true },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // updateTrainingJob
  // ---------------------------------------------------------------------------

  describe("updateTrainingJob", () => {
    it("should update and return a training job", async () => {
      const updateData: TrainingJobUpdateData = {
        status: TrainingStatus.UPLOADING,
      };
      const updated = { ...mockTrainingJob, status: TrainingStatus.UPLOADING };
      mockPrisma.trainingJob.update.mockResolvedValueOnce(updated);

      const result = await service.updateTrainingJob("job-1", updateData);

      expect(result).toEqual(updated);
      expect(mockPrisma.trainingJob.update).toHaveBeenCalledWith({
        where: { id: "job-1" },
        data: updateData,
      });
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.trainingJob.update.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(
        service.updateTrainingJob("job-1", { status: TrainingStatus.FAILED }),
      ).rejects.toThrow("Prisma error");
    });
  });

  // ---------------------------------------------------------------------------
  // createTrainedModel
  // ---------------------------------------------------------------------------

  describe("createTrainedModel", () => {
    it("should create and return a trained model", async () => {
      const data: TrainedModelCreateData = {
        template_model_id: "project-1",
        training_job_id: "job-1",
        model_id: "custom-model-1",
        version: 1,
        is_active: true,
        description: "Test Model",
        doc_types: { custom: {} },
        field_count: 1,
        dataset_snapshot: { documents: [] },
      };

      mockPrisma.trainedModel.create.mockResolvedValueOnce(mockTrainedModel);

      const result = await service.createTrainedModel(data);

      expect(result).toEqual(mockTrainedModel);
      expect(mockPrisma.trainedModel.create).toHaveBeenCalledWith({ data });
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.trainedModel.create.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(
        service.createTrainedModel({
          template_model_id: "p1",
          training_job_id: "j1",
          model_id: "m1",
          version: 1,
          doc_types: {},
          field_count: 0,
          dataset_snapshot: { documents: [] },
        }),
      ).rejects.toThrow("Prisma error");
    });
  });

  // ---------------------------------------------------------------------------
  // findTrainedModelByModelId
  // ---------------------------------------------------------------------------

  describe("findTrainedModelByModelId", () => {
    it("should return a trained model when found", async () => {
      mockPrisma.trainedModel.findUnique.mockResolvedValueOnce(
        mockTrainedModel,
      );

      const result = await service.findTrainedModelByModelId("custom-model-1");

      expect(result).toEqual(mockTrainedModel);
      expect(mockPrisma.trainedModel.findUnique).toHaveBeenCalledWith({
        where: { model_id: "custom-model-1" },
      });
    });

    it("should return null when not found", async () => {
      mockPrisma.trainedModel.findUnique.mockResolvedValueOnce(null);

      const result = await service.findTrainedModelByModelId("non-existent");

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // findAllTrainedModels
  // ---------------------------------------------------------------------------

  describe("findAllTrainedModels", () => {
    it("excludes tombstoned versions by default and orders by version desc", async () => {
      mockPrisma.trainedModel.findMany.mockResolvedValueOnce([
        mockTrainedModel,
      ]);

      const result = await service.findAllTrainedModels("tm-1");

      expect(result).toHaveLength(1);
      expect(mockPrisma.trainedModel.findMany).toHaveBeenCalledWith({
        where: { template_model_id: "tm-1", deleted_at: null },
        orderBy: { version: "desc" },
      });
    });

    it("includes tombstoned versions when requested", async () => {
      mockPrisma.trainedModel.findMany.mockResolvedValueOnce([
        mockTrainedModel,
      ]);

      await service.findAllTrainedModels("tm-1", { includeDeleted: true });

      expect(mockPrisma.trainedModel.findMany).toHaveBeenCalledWith({
        where: { template_model_id: "tm-1" },
        orderBy: { version: "desc" },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // findTrainedModelForTemplate
  // ---------------------------------------------------------------------------

  describe("findTrainedModelForTemplate", () => {
    it("scopes the lookup to the parent template and excludes tombstoned by default", async () => {
      mockPrisma.trainedModel.findFirst.mockResolvedValueOnce(mockTrainedModel);

      const result = await service.findTrainedModelForTemplate(
        "tm-1",
        "trained-1",
      );

      expect(result).toEqual(mockTrainedModel);
      expect(mockPrisma.trainedModel.findFirst).toHaveBeenCalledWith({
        where: {
          id: "trained-1",
          template_model_id: "tm-1",
          deleted_at: null,
        },
      });
    });

    it("includes tombstoned versions when requested", async () => {
      mockPrisma.trainedModel.findFirst.mockResolvedValueOnce(mockTrainedModel);

      await service.findTrainedModelForTemplate("tm-1", "trained-1", {
        includeDeleted: true,
      });

      expect(mockPrisma.trainedModel.findFirst).toHaveBeenCalledWith({
        where: { id: "trained-1", template_model_id: "tm-1" },
      });
    });

    it("returns null when the id belongs to a different template", async () => {
      mockPrisma.trainedModel.findFirst.mockResolvedValueOnce(null);

      const result = await service.findTrainedModelForTemplate(
        "tm-1",
        "trained-from-other-template",
      );

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getNextVersionNumber
  // ---------------------------------------------------------------------------

  describe("getNextVersionNumber", () => {
    it("returns max(version)+1 across all rows including tombstoned", async () => {
      mockPrisma.trainedModel.aggregate.mockResolvedValueOnce({
        _max: { version: 4 },
      });

      const result = await service.getNextVersionNumber("tm-1");

      expect(result).toBe(5);
      expect(mockPrisma.trainedModel.aggregate).toHaveBeenCalledWith({
        where: { template_model_id: "tm-1" },
        _max: { version: true },
      });
    });

    it("returns 1 for templates with no prior trained versions", async () => {
      mockPrisma.trainedModel.aggregate.mockResolvedValueOnce({
        _max: { version: null },
      });
      const result = await service.getNextVersionNumber("tm-1");
      expect(result).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // demoteActiveTrainedModels
  // ---------------------------------------------------------------------------

  describe("demoteActiveTrainedModels", () => {
    it("clears is_active on every active row for the template", async () => {
      mockPrisma.trainedModel.updateMany.mockResolvedValueOnce({ count: 1 });
      const result = await service.demoteActiveTrainedModels("tm-1");
      expect(result).toBe(1);
      expect(mockPrisma.trainedModel.updateMany).toHaveBeenCalledWith({
        where: { template_model_id: "tm-1", is_active: true },
        data: { is_active: false },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // replaceActiveTrainedModel
  // ---------------------------------------------------------------------------

  describe("replaceActiveTrainedModel", () => {
    const createData: TrainedModelCreateData = {
      template_model_id: "tm-1",
      training_job_id: "job-1",
      model_id: "custom-model-1-v2",
      version: 2,
      is_active: true,
      description: "v2",
      doc_types: {} as never,
      field_count: 1,
      dataset_snapshot: { documents: [] } as never,
    };

    it("demotes active rows and creates the new row inside a single transaction", async () => {
      const created = { ...mockTrainedModel, ...createData };
      const txClient = {
        trainedModel: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue(created),
        },
      };
      mockPrisma.$transaction.mockImplementationOnce(
        async (cb: (tx: typeof txClient) => Promise<unknown>) => cb(txClient),
      );

      const result = await service.replaceActiveTrainedModel(
        "tm-1",
        createData,
      );

      expect(result).toEqual(created);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(txClient.trainedModel.updateMany).toHaveBeenCalledWith({
        where: { template_model_id: "tm-1", is_active: true },
        data: { is_active: false },
      });
      expect(txClient.trainedModel.create).toHaveBeenCalledWith({
        data: createData,
      });
    });

    it("does not create when the demote step throws", async () => {
      const txClient = {
        trainedModel: {
          updateMany: jest.fn().mockRejectedValue(new Error("db down")),
          create: jest.fn(),
        },
      };
      mockPrisma.$transaction.mockImplementationOnce(
        async (cb: (tx: typeof txClient) => Promise<unknown>) => cb(txClient),
      );

      await expect(
        service.replaceActiveTrainedModel("tm-1", createData),
      ).rejects.toThrow("db down");
      expect(txClient.trainedModel.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // tombstoneTrainedModel
  // ---------------------------------------------------------------------------

  describe("tombstoneTrainedModel", () => {
    it("sets deleted_at and clears is_active", async () => {
      const tombstoned = {
        ...mockTrainedModel,
        is_active: false,
        deleted_at: new Date("2026-05-01"),
      };
      mockPrisma.trainedModel.update.mockResolvedValueOnce(tombstoned);

      const result = await service.tombstoneTrainedModel("trained-1");

      expect(result).toEqual(tombstoned);
      expect(mockPrisma.trainedModel.update).toHaveBeenCalledWith({
        where: { id: "trained-1" },
        data: { is_active: false, deleted_at: expect.any(Date) },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // setActiveTrainedModel
  // ---------------------------------------------------------------------------

  describe("setActiveTrainedModel", () => {
    it("demotes other versions and activates the target via $transaction", async () => {
      const target = { ...mockTrainedModel, is_active: false };
      const txClient = {
        trainedModel: {
          findUnique: jest.fn().mockResolvedValue(target),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({ ...target, is_active: true }),
        },
      };
      mockPrisma.$transaction.mockImplementationOnce(
        async (cb: (tx: typeof txClient) => Promise<unknown>) => cb(txClient),
      );

      const result = await service.setActiveTrainedModel("trained-1");

      expect(result.is_active).toBe(true);
      expect(txClient.trainedModel.updateMany).toHaveBeenCalledWith({
        where: { template_model_id: "project-1", NOT: { id: "trained-1" } },
        data: { is_active: false },
      });
    });

    it("refuses to activate a tombstoned version", async () => {
      const target = { ...mockTrainedModel, deleted_at: new Date() };
      const txClient = {
        trainedModel: {
          findUnique: jest.fn().mockResolvedValue(target),
          updateMany: jest.fn(),
          update: jest.fn(),
        },
      };
      mockPrisma.$transaction.mockImplementationOnce(
        async (cb: (tx: typeof txClient) => Promise<unknown>) => cb(txClient),
      );

      await expect(service.setActiveTrainedModel("trained-1")).rejects.toThrow(
        /deleted/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findAllTrainedModelIds
  // ---------------------------------------------------------------------------

  describe("findAllTrainedModelIds", () => {
    it("scopes the picker list to the caller's groups and excludes tombstoned versions", async () => {
      mockPrisma.trainedModel.findMany.mockResolvedValueOnce([
        { model_id: "km-invoice" },
        { model_id: "km-invoice-v2" },
      ]);

      const result = await service.findAllTrainedModelIds(["group-1"]);

      expect(result).toEqual(["km-invoice", "km-invoice-v2"]);
      expect(mockPrisma.trainedModel.findMany).toHaveBeenCalledWith({
        where: {
          deleted_at: null,
          template_model: { group_id: { in: ["group-1"] } },
        },
        select: { model_id: true },
        distinct: ["model_id"],
      });
    });

    it("applies no group filter for an unrestricted (system-admin) caller", async () => {
      mockPrisma.trainedModel.findMany.mockResolvedValueOnce([
        { model_id: "km-invoice" },
      ]);

      await service.findAllTrainedModelIds(undefined);

      expect(mockPrisma.trainedModel.findMany).toHaveBeenCalledWith({
        where: { deleted_at: null },
        select: { model_id: true },
        distinct: ["model_id"],
      });
    });

    it("fails closed for a caller with no groups (empty array matches nothing)", async () => {
      mockPrisma.trainedModel.findMany.mockResolvedValueOnce([]);

      const result = await service.findAllTrainedModelIds([]);

      expect(result).toEqual([]);
      expect(mockPrisma.trainedModel.findMany).toHaveBeenCalledWith({
        where: {
          deleted_at: null,
          template_model: { group_id: { in: [] } },
        },
        select: { model_id: true },
        distinct: ["model_id"],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // buildTrainedModelSnapshot
  // ---------------------------------------------------------------------------

  describe("buildTrainedModelSnapshot", () => {
    it("returns labeled documents with their labels in snapshot shape", async () => {
      mockPrisma.labeledDocument.findMany.mockResolvedValueOnce([
        {
          labeling_document: {
            id: "ldoc-1",
            original_filename: "invoice-1.pdf",
          },
          labels: [
            {
              field_key: "total",
              label_name: "total",
              value: "100.00",
              page_number: 1,
              bounding_box: { x: 0, y: 0, w: 1, h: 1 },
            },
          ],
        },
      ]);

      const result = await service.buildTrainedModelSnapshot("tm-1");

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].labelingDocumentId).toBe("ldoc-1");
      expect(result.documents[0].labels[0].fieldKey).toBe("total");
    });

    it("returns an empty snapshot when no labeled documents exist", async () => {
      mockPrisma.labeledDocument.findMany.mockResolvedValueOnce([]);
      const result = await service.buildTrainedModelSnapshot("tm-1");
      expect(result.documents).toEqual([]);
    });
  });
});
