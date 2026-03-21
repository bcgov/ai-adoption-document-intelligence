import { GroupRole } from "@generated/client";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { TemplateModelService } from "../template-model/template-model.service";
import { StartTrainingDto } from "./dto/start-training.dto";
import { TrainingController } from "./training.controller";
import { TrainingService } from "./training.service";

describe("TrainingController", () => {
  let controller: TrainingController;
  let trainingService: jest.Mocked<TrainingService>;
  let templateModelService: jest.Mocked<TemplateModelService>;

  const mockTemplateModel = {
    id: "tm-1",
    name: "Test Template Model",
    model_id: "custom-model-1",
    group_id: "group-1",
    created_by: "user-1",
    created_at: new Date(),
    updated_at: new Date(),
    status: "draft" as const,
    description: null,
  };

  const mockTrainingJob = {
    id: "job-1",
    templateModelId: "tm-1",
    status: "PENDING" as const,
    containerName: "training-tm-1",
    blobCount: 0,
    startedAt: new Date(),
  };

  beforeEach(async () => {
    trainingService = {
      validateTrainingData: jest.fn(),
      startTraining: jest.fn(),
      getTrainingJobs: jest.fn(),
      getTrainingJob: jest.fn(),
      cancelTrainingJob: jest.fn(),
    } as unknown as jest.Mocked<TrainingService>;

    templateModelService = {
      getTemplateModel: jest.fn(),
    } as unknown as jest.Mocked<TemplateModelService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainingController],
      providers: [
        {
          provide: TrainingService,
          useValue: trainingService,
        },
        {
          provide: TemplateModelService,
          useValue: templateModelService,
        },
      ],
    }).compile();

    controller = module.get<TrainingController>(TrainingController);
  });

  describe("validateTrainingData", () => {
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
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      trainingService.validateTrainingData.mockResolvedValue(mockValidation);
      const result = await controller.validateTrainingData("tm-1", req);
      expect(result).toEqual(mockValidation);
      expect(trainingService.validateTrainingData).toHaveBeenCalledWith("tm-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      await expect(
        controller.validateTrainingData("tm-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(trainingService.validateTrainingData).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      await expect(
        controller.validateTrainingData("tm-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(trainingService.validateTrainingData).not.toHaveBeenCalled();
    });

    it("propagates NotFoundException when template model does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModel.mockRejectedValue(
        new NotFoundException("Template model not found"),
      );
      await expect(
        controller.validateTrainingData("tm-1", req),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("startTraining", () => {
    const dto: StartTrainingDto = { description: "Test training" };

    it("starts training for a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      trainingService.startTraining.mockResolvedValue(
        mockTrainingJob as never,
      );
      const result = await controller.startTraining("tm-1", dto, req);
      expect(result).toEqual(mockTrainingJob);
      expect(trainingService.startTraining).toHaveBeenCalledWith(
        "tm-1",
        dto,
        "user-1",
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
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      await expect(
        controller.startTraining("tm-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(trainingService.startTraining).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      await expect(
        controller.startTraining("tm-1", dto, req),
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
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      trainingService.getTrainingJobs.mockResolvedValue([
        mockTrainingJob as never,
      ]);
      const result = await controller.getTrainingJobs("tm-1", req);
      expect(result).toEqual([mockTrainingJob]);
      expect(trainingService.getTrainingJobs).toHaveBeenCalledWith("tm-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
        },
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      await expect(controller.getTrainingJobs("tm-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(trainingService.getTrainingJobs).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      await expect(controller.getTrainingJobs("tm-1", req)).rejects.toThrow(
        ForbiddenException,
      );
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
      trainingService.getTrainingJob.mockResolvedValue(
        mockTrainingJob as never,
      );
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      const result = await controller.getJobStatus("job-1", req);
      expect(result).toEqual(mockTrainingJob);
      expect(trainingService.getTrainingJob).toHaveBeenCalledWith("job-1");
      expect(templateModelService.getTemplateModel).toHaveBeenCalledWith(
        "tm-1",
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
      trainingService.getTrainingJob.mockResolvedValue(
        mockTrainingJob as never,
      );
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      await expect(controller.getJobStatus("job-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      trainingService.getTrainingJob.mockResolvedValue(
        mockTrainingJob as never,
      );
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
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

  describe("cancelJob", () => {
    it("cancels job for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      trainingService.getTrainingJob.mockResolvedValue(
        mockTrainingJob as never,
      );
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
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
      trainingService.getTrainingJob.mockResolvedValue(
        mockTrainingJob as never,
      );
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      await expect(controller.cancelJob("job-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(trainingService.cancelTrainingJob).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      trainingService.getTrainingJob.mockResolvedValue(
        mockTrainingJob as never,
      );
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
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
