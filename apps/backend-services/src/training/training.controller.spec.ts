import { GroupRole } from "@generated/client";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { LabelingService } from "../labeling/labeling.service";
import { StartTrainingDto } from "./dto/start-training.dto";
import { TrainingController } from "./training.controller";
import { TrainingService } from "./training.service";

describe("TrainingController", () => {
  let controller: TrainingController;
  let trainingService: jest.Mocked<TrainingService>;
  let labelingService: jest.Mocked<LabelingService>;

  const mockProject = {
    id: "project-1",
    name: "Test Project",
    group_id: "group-1",
    created_by: "user-1",
    created_at: new Date(),
    updated_at: new Date(),
    field_schema: [],
  };

  const mockTrainingJob = {
    id: "job-1",
    projectId: "project-1",
    status: "PENDING" as any,
    containerName: "training-project-1",
    blobCount: 0,
    startedAt: new Date(),
  };

  const mockTrainedModel = {
    id: "model-1",
    projectId: "project-1",
    modelId: "my-model",
    status: "COMPLETED" as any,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    trainingService = {
      validateTrainingData: jest.fn(),
      startTraining: jest.fn(),
      getTrainingJobs: jest.fn(),
      getTrainingJob: jest.fn(),
      getTrainedModels: jest.fn(),
      cancelTrainingJob: jest.fn(),
    } as unknown as jest.Mocked<TrainingService>;

    labelingService = {
      getProject: jest.fn(),
    } as unknown as jest.Mocked<LabelingService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainingController],
      providers: [
        {
          provide: TrainingService,
          useValue: trainingService,
        },
        {
          provide: LabelingService,
          useValue: labelingService,
        },
      ],
    }).compile();

    controller = module.get<TrainingController>(TrainingController);
  });

  describe("validateProject", () => {
    it("returns validation result for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      const mockValidation = {
        valid: true,
        labeledDocumentsCount: 5,
        minimumRequired: 5,
        issues: [],
      };
      labelingService.getProject.mockResolvedValue(mockProject as any);
      trainingService.validateTrainingData.mockResolvedValue(mockValidation);
      const result = await controller.validateProject("project-1", req);
      expect(result).toEqual(mockValidation);
      expect(trainingService.validateTrainingData).toHaveBeenCalledWith(
        "project-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.validateProject("project-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(trainingService.validateTrainingData).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.validateProject("project-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(trainingService.validateTrainingData).not.toHaveBeenCalled();
    });

    it("propagates NotFoundException when project does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      labelingService.getProject.mockRejectedValue(
        new NotFoundException("Project not found"),
      );
      await expect(
        controller.validateProject("project-1", req),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("startTraining", () => {
    const dto: StartTrainingDto = { modelId: "my-model" };

    it("derives userId from req.user.id when sub is absent", async () => {
      const req = {
        user: { id: "user-from-id" },
        resolvedIdentity: {
          userId: "user-from-id",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      trainingService.startTraining.mockResolvedValue(mockTrainingJob as any);
      await controller.startTraining("project-1", dto, req);
      expect(trainingService.startTraining).toHaveBeenCalledWith(
        "project-1",
        dto,
      );
    });

    it("falls back to 'unknown' when req.user has neither sub nor id", async () => {
      const req = {
        user: {},
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      trainingService.startTraining.mockResolvedValue(mockTrainingJob as any);
      await controller.startTraining("project-1", dto, req);
      expect(trainingService.startTraining).toHaveBeenCalledWith(
        "project-1",
        dto,
      );
    });

    it("starts training for a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
          adminId: "admin-1",
        },
      } as unknown as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      trainingService.startTraining.mockResolvedValue(mockTrainingJob as any);
      const result = await controller.startTraining("project-1", dto, req);
      expect(result).toEqual(mockTrainingJob);
      expect(trainingService.startTraining).toHaveBeenCalledWith(
        "project-1",
        dto,
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.startTraining("project-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(trainingService.startTraining).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.startTraining("project-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(trainingService.startTraining).not.toHaveBeenCalled();
    });
  });

  describe("getTrainingJobs", () => {
    it("returns training jobs for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      trainingService.getTrainingJobs.mockResolvedValue([
        mockTrainingJob as any,
      ]);
      const result = await controller.getTrainingJobs("project-1", req);
      expect(result).toEqual([mockTrainingJob]);
      expect(trainingService.getTrainingJobs).toHaveBeenCalledWith("project-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.getTrainingJobs("project-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(trainingService.getTrainingJobs).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.getTrainingJobs("project-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(trainingService.getTrainingJobs).not.toHaveBeenCalled();
    });
  });

  describe("getJobStatus", () => {
    it("returns job status for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      trainingService.getTrainingJob.mockResolvedValue(mockTrainingJob as any);
      labelingService.getProject.mockResolvedValue(mockProject as any);
      const result = await controller.getJobStatus("job-1", req);
      expect(result).toEqual(mockTrainingJob);
      expect(trainingService.getTrainingJob).toHaveBeenCalledWith("job-1");
      expect(labelingService.getProject).toHaveBeenCalledWith("project-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      trainingService.getTrainingJob.mockResolvedValue(mockTrainingJob as any);
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(controller.getJobStatus("job-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      trainingService.getTrainingJob.mockResolvedValue(mockTrainingJob as any);
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(controller.getJobStatus("job-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("propagates NotFoundException when job does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      trainingService.getTrainingJob.mockRejectedValue(
        new NotFoundException("Training job not found"),
      );
      await expect(controller.getJobStatus("job-1", req)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getTrainedModels", () => {
    it("returns trained models for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      trainingService.getTrainedModels.mockResolvedValue([
        mockTrainedModel as any,
      ]);
      const result = await controller.getTrainedModels("project-1", req);
      expect(result).toEqual([mockTrainedModel]);
      expect(trainingService.getTrainedModels).toHaveBeenCalledWith(
        "project-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.getTrainedModels("project-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(trainingService.getTrainedModels).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.getTrainedModels("project-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(trainingService.getTrainedModels).not.toHaveBeenCalled();
    });
  });

  describe("cancelJob", () => {
    it("cancels job for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      trainingService.getTrainingJob.mockResolvedValue(mockTrainingJob as any);
      labelingService.getProject.mockResolvedValue(mockProject as any);
      trainingService.cancelTrainingJob.mockResolvedValue(undefined);
      const result = await controller.cancelJob("job-1", req);
      expect(result).toEqual({
        success: true,
        message: "Training job cancelled",
      });
      expect(trainingService.cancelTrainingJob).toHaveBeenCalledWith("job-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      trainingService.getTrainingJob.mockResolvedValue(mockTrainingJob as any);
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(controller.cancelJob("job-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(trainingService.cancelTrainingJob).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      trainingService.getTrainingJob.mockResolvedValue(mockTrainingJob as any);
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(controller.cancelJob("job-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(trainingService.cancelTrainingJob).not.toHaveBeenCalled();
    });

    it("propagates NotFoundException when job does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      trainingService.getTrainingJob.mockRejectedValue(
        new NotFoundException("Training job not found"),
      );
      await expect(controller.cancelJob("job-1", req)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
