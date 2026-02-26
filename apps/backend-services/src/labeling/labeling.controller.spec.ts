import { ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { LocalBlobStorageService } from "../blob-storage/local-blob-storage.service";
import { DatabaseService } from "../database/database.service";
import { CreateProjectDto, UpdateProjectDto } from "./dto/create-project.dto";
import { LabelingFileType, LabelingUploadDto } from "./dto/labeling-upload.dto";
import { LabelingController } from "./labeling.controller";
import { LabelingService } from "./labeling.service";

describe("LabelingController", () => {
  let controller: LabelingController;
  let labelingService: jest.Mocked<LabelingService>;
  let databaseService: jest.Mocked<DatabaseService>;

  const mockProject = {
    id: "project-1",
    name: "Test Project",
    description: "Test",
    created_by: "user-1",
    created_at: new Date(),
    updated_at: new Date(),
    field_schema: [],
    group_id: "group-1",
  };

  const mockLabelingDocResult = {
    labeledDocument: { id: "labeled-1" },
    labelingDocument: { id: "labeling-1" },
  };

  beforeEach(async () => {
    labelingService = {
      getProjects: jest.fn(),
      createProject: jest.fn(),
      uploadLabelingDocument: jest.fn(),
      getProject: jest.fn(),
      updateProject: jest.fn(),
      deleteProject: jest.fn(),
    } as unknown as jest.Mocked<LabelingService>;

    databaseService = {
      isUserInGroup: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<DatabaseService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LabelingController],
      providers: [
        {
          provide: LabelingService,
          useValue: labelingService,
        },
        {
          provide: LocalBlobStorageService,
          useValue: {},
        },
        {
          provide: DatabaseService,
          useValue: databaseService,
        },
      ],
    }).compile();

    controller = module.get<LabelingController>(LabelingController);
  });

  describe("createProject", () => {
    const dto: CreateProjectDto = {
      name: "New Project",
      group_id: "group-1",
    };

    it("creates project for a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.createProject.mockResolvedValue(mockProject as any);
      const result = await controller.createProject(dto, req);
      expect(result).toEqual(mockProject);
      expect(labelingService.createProject).toHaveBeenCalledWith(dto, "user-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(controller.createProject(dto, req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(labelingService.createProject).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: undefined,
      } as Request;
      await expect(controller.createProject(dto, req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(labelingService.createProject).not.toHaveBeenCalled();
    });
  });

  describe("getProject", () => {
    it("returns project for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      const result = await controller.getProject("project-1", req);
      expect(result).toEqual(mockProject);
      expect(labelingService.getProject).toHaveBeenCalledWith("project-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(controller.getProject("project-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(controller.getProject("project-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("updateProject", () => {
    const dto: UpdateProjectDto = { name: "Updated Project" };

    it("updates project for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      labelingService.updateProject.mockResolvedValue(mockProject as any);
      const result = await controller.updateProject("project-1", dto, req);
      expect(result).toEqual(mockProject);
      expect(labelingService.updateProject).toHaveBeenCalledWith(
        "project-1",
        dto,
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.updateProject("project-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.updateProject).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.updateProject("project-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.updateProject).not.toHaveBeenCalled();
    });
  });

  describe("deleteProject", () => {
    it("deletes project for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      labelingService.deleteProject.mockResolvedValue({
        success: true,
        id: "project-1",
      });
      const result = await controller.deleteProject("project-1", req);
      expect(result).toEqual({ success: true, id: "project-1" });
      expect(labelingService.deleteProject).toHaveBeenCalledWith("project-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.deleteProject("project-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.deleteProject).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.deleteProject("project-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.deleteProject).not.toHaveBeenCalled();
    });
  });

  describe("uploadLabelingDocument", () => {
    const dto: LabelingUploadDto = {
      title: "Invoice",
      file: "data:application/pdf;base64,dGVzdA==",
      file_type: LabelingFileType.PDF,
      original_filename: "invoice.pdf",
      group_id: "group-1",
    };

    it("uploads document for a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.uploadLabelingDocument.mockResolvedValue(
        mockLabelingDocResult as any,
      );
      const result = await controller.uploadLabelingDocument(
        "project-1",
        dto,
        req,
      );
      expect(result).toEqual(mockLabelingDocResult);
      expect(labelingService.uploadLabelingDocument).toHaveBeenCalledWith(
        "project-1",
        dto,
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.uploadLabelingDocument("project-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.uploadLabelingDocument).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: undefined,
      } as Request;
      await expect(
        controller.uploadLabelingDocument("project-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.uploadLabelingDocument).not.toHaveBeenCalled();
    });
  });
});
