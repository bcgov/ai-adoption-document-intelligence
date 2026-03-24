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
      findMany: jest.Mock;
      update: jest.Mock;
    };
    trainedModel: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
  };

  const mockTrainingJob = {
    id: "job-1",
    project_id: "project-1",
    status: TrainingStatus.PENDING,
    container_name: "training-project-1",
    model_id: "custom-model-1",
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
  };

  const mockTrainedModel = {
    id: "trained-1",
    project_id: "project-1",
    training_job_id: "job-1",
    model_id: "custom-model-1",
    description: "Test Model",
    doc_types: { custom: { fieldSchema: { field1: {} } } },
    field_count: 1,
    created_at: new Date(),
  };

  beforeEach(async () => {
    mockPrisma = {
      trainingJob: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      trainedModel: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
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
        project_id: "project-1",
        status: TrainingStatus.PENDING,
        container_name: "training-project-1",
        model_id: "custom-model-1",
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
          project_id: "p1",
          status: TrainingStatus.PENDING,
          container_name: "c",
          model_id: "m",
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
    it("should return all training jobs for a project", async () => {
      const jobs = [mockTrainingJob, { ...mockTrainingJob, id: "job-2" }];
      mockPrisma.trainingJob.findMany.mockResolvedValueOnce(jobs);

      const result = await service.findAllTrainingJobs("project-1");

      expect(result).toHaveLength(2);
      expect(mockPrisma.trainingJob.findMany).toHaveBeenCalledWith({
        where: { project_id: "project-1" },
        orderBy: { started_at: "desc" },
      });
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
        project_id: "project-1",
        training_job_id: "job-1",
        model_id: "custom-model-1",
        description: "Test Model",
        doc_types: { custom: {} },
        field_count: 1,
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
          project_id: "p1",
          training_job_id: "j1",
          model_id: "m1",
          doc_types: {},
          field_count: 0,
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
    it("should return all trained models for a project", async () => {
      const models = [
        mockTrainedModel,
        { ...mockTrainedModel, id: "trained-2" },
      ];
      mockPrisma.trainedModel.findMany.mockResolvedValueOnce(models);

      const result = await service.findAllTrainedModels("project-1");

      expect(result).toHaveLength(2);
      expect(mockPrisma.trainedModel.findMany).toHaveBeenCalledWith({
        where: { project_id: "project-1" },
        orderBy: { created_at: "desc" },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // deleteTrainedModel
  // ---------------------------------------------------------------------------

  describe("deleteTrainedModel", () => {
    it("should delete and return the trained model", async () => {
      mockPrisma.trainedModel.delete.mockResolvedValueOnce(mockTrainedModel);

      const result = await service.deleteTrainedModel("custom-model-1");

      expect(result).toEqual(mockTrainedModel);
      expect(mockPrisma.trainedModel.delete).toHaveBeenCalledWith({
        where: { model_id: "custom-model-1" },
      });
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.trainedModel.delete.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(service.deleteTrainedModel("non-existent")).rejects.toThrow(
        "Prisma error",
      );
    });
  });
});
