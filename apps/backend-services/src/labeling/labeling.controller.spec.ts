import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { BLOB_STORAGE } from "../blob-storage/blob-storage.interface";
import { DatabaseService } from "../database/database.service";
import { AddDocumentDto } from "./dto/add-document.dto";
import { CreateProjectDto, UpdateProjectDto } from "./dto/create-project.dto";
import { SaveLabelsDto } from "./dto/label.dto";
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

  const mockLabelingDocument = {
    id: "labeling-doc-1",
    title: "Test Invoice",
    original_filename: "invoice.pdf",
    file_path: "labeling-documents/labeling-doc-1/original.pdf",
    file_type: "pdf",
    file_size: 1024,
    metadata: {},
    source: "labeling",
    status: "completed_ocr",
    created_at: new Date(),
    updated_at: new Date(),
    apim_request_id: null,
    model_id: "prebuilt-layout",
    ocr_result: null,
    group_id: "group-1",
  };

  const mockLabeledDocument = {
    id: "labeled-doc-1",
    project_id: "project-1",
    labeling_document_id: "labeling-doc-1",
    status: "in_progress",
    created_at: new Date(),
    updated_at: new Date(),
    labeling_document: mockLabelingDocument,
    labels: [],
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
      getProjectDocument: jest.fn(),
      removeDocumentFromProject: jest.fn(),
      getDocumentLabels: jest.fn(),
      saveDocumentLabels: jest.fn(),
      deleteLabel: jest.fn(),
      getDocumentOcr: jest.fn(),
      addDocumentToProject: jest.fn(),
      getFieldSchema: jest.fn(),
      addField: jest.fn(),
      updateField: jest.fn(),
      deleteField: jest.fn(),
      getProjectDocuments: jest.fn(),
      exportProject: jest.fn(),
    } as unknown as jest.Mocked<LabelingService>;

    databaseService = {
      isUserInGroup: jest.fn().mockResolvedValue(true),
      isUserSystemAdmin: jest.fn().mockResolvedValue(false),
      findLabelingDocument: jest.fn().mockResolvedValue(mockLabelingDocument),
      getUsersGroups: jest.fn().mockResolvedValue([{ group_id: "group-1" }]),
    } as unknown as jest.Mocked<DatabaseService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LabelingController],
      providers: [
        {
          provide: LabelingService,
          useValue: labelingService,
        },
        {
          provide: BLOB_STORAGE,
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

  describe("getProjects", () => {
    it("returns projects for the user's groups (JWT)", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjects.mockResolvedValue([mockProject as any]);
      const result = await controller.getProjects(req, undefined);
      expect(result).toEqual([mockProject]);
      expect(labelingService.getProjects).toHaveBeenCalledWith(["group-1"]);
    });

    it("returns projects for an API key's group", async () => {
      const req = {
        resolvedIdentity: { groupId: "group-1" },
      } as Request;
      labelingService.getProjects.mockResolvedValue([mockProject as any]);
      const result = await controller.getProjects(req, undefined);
      expect(result).toEqual([mockProject]);
      expect(labelingService.getProjects).toHaveBeenCalledWith(["group-1"]);
    });

    it("returns empty projects when user has no identity", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProjects.mockResolvedValue([]);
      const result = await controller.getProjects(req, undefined);
      expect(result).toEqual([]);
      expect(labelingService.getProjects).toHaveBeenCalledWith([]);
    });

    it("returns only group projects when group_id is provided and user is a member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjects.mockResolvedValue([mockProject as any]);
      const result = await controller.getProjects(req, "group-1");
      expect(result).toEqual([mockProject]);
      expect(labelingService.getProjects).toHaveBeenCalledWith(["group-1"]);
    });

    it("throws ForbiddenException when group_id is provided and user is not a member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(controller.getProjects(req, "group-1")).rejects.toThrow(
        ForbiddenException,
      );
      expect(labelingService.getProjects).not.toHaveBeenCalled();
    });
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
      await expect(controller.deleteProject("project-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(labelingService.deleteProject).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(controller.deleteProject("project-1", req)).rejects.toThrow(
        ForbiddenException,
      );
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

  describe("addDocumentToProject", () => {
    const dto: AddDocumentDto = { labelingDocumentId: "labeling-doc-1" };

    it("adds document to project for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.addDocumentToProject.mockResolvedValue(
        mockLabeledDocument as any,
      );
      const result = await controller.addDocumentToProject(
        "project-1",
        dto,
        req,
      );
      expect(result).toEqual(mockLabeledDocument);
      expect(labelingService.addDocumentToProject).toHaveBeenCalledWith(
        "project-1",
        dto,
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.addDocumentToProject("project-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.addDocumentToProject).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when labeling document does not exist", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      (databaseService.findLabelingDocument as jest.Mock).mockResolvedValueOnce(
        null,
      );
      await expect(
        controller.addDocumentToProject("project-1", dto, req),
      ).rejects.toThrow(NotFoundException);
      expect(labelingService.addDocumentToProject).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      await expect(
        controller.addDocumentToProject("project-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.addDocumentToProject).not.toHaveBeenCalled();
    });
  });

  describe("getProjectDocument", () => {
    it("returns labeled document for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      const result = await controller.getProjectDocument(
        "project-1",
        "labeled-doc-1",
        req,
      );
      expect(result).toEqual(mockLabeledDocument);
      expect(labelingService.getProjectDocument).toHaveBeenCalledWith(
        "project-1",
        "labeled-doc-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.getProjectDocument("project-1", "labeled-doc-1", req),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      await expect(
        controller.getProjectDocument("project-1", "labeled-doc-1", req),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("removeDocumentFromProject", () => {
    it("removes document for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      labelingService.removeDocumentFromProject.mockResolvedValue({
        success: true,
        documentId: "labeled-doc-1",
      });
      const result = await controller.removeDocumentFromProject(
        "project-1",
        "labeled-doc-1",
        req,
      );
      expect(result).toEqual({ success: true, documentId: "labeled-doc-1" });
      expect(labelingService.removeDocumentFromProject).toHaveBeenCalledWith(
        "project-1",
        "labeled-doc-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.removeDocumentFromProject("project-1", "labeled-doc-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.removeDocumentFromProject).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      await expect(
        controller.removeDocumentFromProject("project-1", "labeled-doc-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.removeDocumentFromProject).not.toHaveBeenCalled();
    });
  });

  describe("getDocumentLabels", () => {
    it("returns labels for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      labelingService.getDocumentLabels.mockResolvedValue([]);
      const result = await controller.getDocumentLabels(
        "project-1",
        "labeled-doc-1",
        req,
      );
      expect(result).toEqual([]);
      expect(labelingService.getDocumentLabels).toHaveBeenCalledWith(
        "project-1",
        "labeled-doc-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.getDocumentLabels("project-1", "labeled-doc-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.getDocumentLabels).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      await expect(
        controller.getDocumentLabels("project-1", "labeled-doc-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.getDocumentLabels).not.toHaveBeenCalled();
    });
  });

  describe("saveDocumentLabels", () => {
    const dto: SaveLabelsDto = { labels: [] };

    it("saves labels for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      labelingService.saveDocumentLabels.mockResolvedValue(
        mockLabeledDocument as any,
      );
      const result = await controller.saveDocumentLabels(
        "project-1",
        "labeled-doc-1",
        dto,
        req,
      );
      expect(result).toEqual(mockLabeledDocument);
      expect(labelingService.saveDocumentLabels).toHaveBeenCalledWith(
        "project-1",
        "labeled-doc-1",
        dto,
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.saveDocumentLabels("project-1", "labeled-doc-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.saveDocumentLabels).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      await expect(
        controller.saveDocumentLabels("project-1", "labeled-doc-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.saveDocumentLabels).not.toHaveBeenCalled();
    });
  });

  describe("deleteLabel", () => {
    it("deletes label for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      labelingService.deleteLabel.mockResolvedValue({
        success: true,
        id: "label-1",
      });
      const result = await controller.deleteLabel(
        "project-1",
        "labeled-doc-1",
        "label-1",
        req,
      );
      expect(result).toEqual({ success: true, id: "label-1" });
      expect(labelingService.deleteLabel).toHaveBeenCalledWith(
        "project-1",
        "labeled-doc-1",
        "label-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.deleteLabel("project-1", "labeled-doc-1", "label-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.deleteLabel).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      await expect(
        controller.deleteLabel("project-1", "labeled-doc-1", "label-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.deleteLabel).not.toHaveBeenCalled();
    });
  });

  describe("getDocumentOcr", () => {
    it("returns OCR data for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      const mockOcrResult = { analyzeResult: { content: "test" } };
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      labelingService.getDocumentOcr.mockResolvedValue(mockOcrResult as any);
      const result = await controller.getDocumentOcr(
        "project-1",
        "labeled-doc-1",
        req,
      );
      expect(result).toEqual(mockOcrResult);
      expect(labelingService.getDocumentOcr).toHaveBeenCalledWith(
        "project-1",
        "labeled-doc-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.getDocumentOcr("project-1", "labeled-doc-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.getDocumentOcr).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProjectDocument.mockResolvedValue(
        mockLabeledDocument as any,
      );
      await expect(
        controller.getDocumentOcr("project-1", "labeled-doc-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.getDocumentOcr).not.toHaveBeenCalled();
    });
  });

  describe("getProjectDocuments", () => {
    it("returns documents for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      labelingService.getProjectDocuments.mockResolvedValue([]);
      const result = await controller.getProjectDocuments("project-1", req);
      expect(result).toEqual([]);
      expect(labelingService.getProjectDocuments).toHaveBeenCalledWith(
        "project-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.getProjectDocuments("project-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.getProjectDocuments).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.getProjectDocuments("project-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.getProjectDocuments).not.toHaveBeenCalled();
    });
  });

  describe("getFieldSchema", () => {
    it("returns field schema for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      labelingService.getFieldSchema.mockResolvedValue([]);
      const result = await controller.getFieldSchema("project-1", req);
      expect(result).toEqual([]);
      expect(labelingService.getFieldSchema).toHaveBeenCalledWith("project-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(controller.getFieldSchema("project-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(labelingService.getFieldSchema).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(controller.getFieldSchema("project-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(labelingService.getFieldSchema).not.toHaveBeenCalled();
    });
  });

  describe("addField", () => {
    const dto = {
      name: "invoice_number",
      field_type: "string" as any,
      display_order: 1,
    };

    it("adds field for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      const mockField = { id: "field-1", ...dto };
      labelingService.getProject.mockResolvedValue(mockProject as any);
      labelingService.addField.mockResolvedValue(mockField as any);
      const result = await controller.addField("project-1", dto as any, req);
      expect(result).toEqual(mockField);
      expect(labelingService.addField).toHaveBeenCalledWith("project-1", dto);
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.addField("project-1", dto as any, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.addField).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.addField("project-1", dto as any, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.addField).not.toHaveBeenCalled();
    });
  });

  describe("updateField", () => {
    const dto = { name: "updated_field" };

    it("updates field for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      const mockField = { id: "field-1", name: "updated_field" };
      labelingService.getProject.mockResolvedValue(mockProject as any);
      labelingService.updateField.mockResolvedValue(mockField as any);
      const result = await controller.updateField(
        "project-1",
        "field-1",
        dto as any,
        req,
      );
      expect(result).toEqual(mockField);
      expect(labelingService.updateField).toHaveBeenCalledWith(
        "project-1",
        "field-1",
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
        controller.updateField("project-1", "field-1", dto as any, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.updateField).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.updateField("project-1", "field-1", dto as any, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.updateField).not.toHaveBeenCalled();
    });
  });

  describe("deleteField", () => {
    it("deletes field for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      labelingService.deleteField.mockResolvedValue({
        success: true,
        id: "field-1",
      });
      const result = await controller.deleteField("project-1", "field-1", req);
      expect(result).toEqual({ success: true, id: "field-1" });
      expect(labelingService.deleteField).toHaveBeenCalledWith(
        "project-1",
        "field-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        controller.deleteField("project-1", "field-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.deleteField).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.deleteField("project-1", "field-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.deleteField).not.toHaveBeenCalled();
    });
  });

  describe("exportProject", () => {
    const dto = { format: "json" as any };

    it("exports project for a group member", async () => {
      const req = {
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      const mockExport = { project: {}, documents: [] };
      labelingService.getProject.mockResolvedValue(mockProject as any);
      labelingService.exportProject.mockResolvedValue(mockExport as any);
      const result = await controller.exportProject(
        "project-1",
        dto as any,
        req,
      );
      expect(result).toEqual(mockExport);
      expect(labelingService.exportProject).toHaveBeenCalledWith(
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
        controller.exportProject("project-1", dto as any, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.exportProject).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as Request;
      labelingService.getProject.mockResolvedValue(mockProject as any);
      await expect(
        controller.exportProject("project-1", dto as any, req),
      ).rejects.toThrow(ForbiddenException);
      expect(labelingService.exportProject).not.toHaveBeenCalled();
    });
  });
});
