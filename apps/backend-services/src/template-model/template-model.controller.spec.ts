import { GroupRole } from "@generated/client";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { BLOB_STORAGE } from "../blob-storage/blob-storage.interface";
import { AddDocumentDto } from "./dto/add-document.dto";
import {
  CreateTemplateModelDto,
  UpdateTemplateModelDto,
} from "./dto/create-template-model.dto";
import { SaveLabelsDto } from "./dto/label.dto";
import { LabelingFileType, LabelingUploadDto } from "./dto/labeling-upload.dto";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { TemplateModelController } from "./template-model.controller";
import { TemplateModelService } from "./template-model.service";

describe("TemplateModelController", () => {
  let controller: TemplateModelController;
  let templateModelService: jest.Mocked<TemplateModelService>;
  let labelingDocumentDbService: jest.Mocked<LabelingDocumentDbService>;

  const mockTemplateModel = {
    id: "tm-1",
    name: "Test Template Model",
    model_id: "test-template-model",
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
    template_model_id: "tm-1",
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
    templateModelService = {
      getTemplateModels: jest.fn(),
      createTemplateModel: jest.fn(),
      uploadLabelingDocument: jest.fn(),
      getTemplateModel: jest.fn(),
      updateTemplateModel: jest.fn(),
      deleteTemplateModel: jest.fn(),
      getTemplateModelDocument: jest.fn(),
      removeDocumentFromTemplateModel: jest.fn(),
      getDocumentLabels: jest.fn(),
      saveDocumentLabels: jest.fn(),
      deleteLabel: jest.fn(),
      getDocumentOcr: jest.fn(),
      addDocumentToTemplateModel: jest.fn(),
      getFieldSchema: jest.fn(),
      addField: jest.fn(),
      updateField: jest.fn(),
      deleteField: jest.fn(),
      getTemplateModelDocuments: jest.fn(),
      exportTemplateModel: jest.fn(),
      generateDocumentSuggestions: jest.fn(),
    } as unknown as jest.Mocked<TemplateModelService>;

    labelingDocumentDbService = {
      findLabelingDocument: jest.fn().mockResolvedValue(mockLabelingDocument),
    } as unknown as jest.Mocked<LabelingDocumentDbService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplateModelController],
      providers: [
        {
          provide: TemplateModelService,
          useValue: templateModelService,
        },
        {
          provide: BLOB_STORAGE,
          useValue: {},
        },
        {
          provide: LabelingDocumentDbService,
          useValue: labelingDocumentDbService,
        },
      ],
    }).compile();

    controller = module.get<TemplateModelController>(TemplateModelController);
  });

  describe("getTemplateModels", () => {
    it("returns template models for the user's groups (JWT)", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModels.mockResolvedValue([
        mockTemplateModel as never,
      ]);
      const result = await controller.getTemplateModels(req, undefined);
      expect(result).toEqual([mockTemplateModel]);
      expect(templateModelService.getTemplateModels).toHaveBeenCalledWith([
        "group-1",
      ]);
    });

    it("returns template models for an API key's group", async () => {
      const req = {
        resolvedIdentity: { groupRoles: { "group-1": GroupRole.MEMBER } },
      } as unknown as Request;
      templateModelService.getTemplateModels.mockResolvedValue([
        mockTemplateModel as never,
      ]);
      const result = await controller.getTemplateModels(req, undefined);
      expect(result).toEqual([mockTemplateModel]);
      expect(templateModelService.getTemplateModels).toHaveBeenCalledWith([
        "group-1",
      ]);
    });

    it("returns empty template models when user has no identity", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as unknown as Request;
      templateModelService.getTemplateModels.mockResolvedValue([]);
      const result = await controller.getTemplateModels(req, undefined);
      expect(result).toEqual([]);
      expect(templateModelService.getTemplateModels).toHaveBeenCalledWith([]);
    });

    it("returns only group template models when group_id is provided and user is a member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModels.mockResolvedValue([
        mockTemplateModel as never,
      ]);
      const result = await controller.getTemplateModels(req, "group-1");
      expect(result).toEqual([mockTemplateModel]);
      expect(templateModelService.getTemplateModels).toHaveBeenCalledWith([
        "group-1",
      ]);
    });

    it("throws ForbiddenException when group_id is provided and user is not a member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
          actorId: "user-1",
        },
      } as unknown as Request;

      await expect(
        controller.getTemplateModels(req, "group-1"),
      ).rejects.toThrow(ForbiddenException);
      expect(templateModelService.getTemplateModels).not.toHaveBeenCalled();
    });
  });

  describe("createTemplateModel", () => {
    const dto: CreateTemplateModelDto = {
      name: "New Template Model",
      group_id: "group-1",
    };

    it("creates template model for a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: {
          userId: "user-1",
          actorId: "user-1",
          isSystemAdmin: false,
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.createTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      const result = await controller.createTemplateModel(dto, req);
      expect(result).toEqual(mockTemplateModel);
      expect(templateModelService.createTemplateModel).toHaveBeenCalledWith(
        dto,
        "user-1",
      );
    });
  });

  describe("getTemplateModel", () => {
    it("returns template model for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      const result = await controller.getTemplateModel("tm-1", req);
      expect(result).toEqual(mockTemplateModel);
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
          actorId: "user-1",
        },
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );

      await expect(controller.getTemplateModel("tm-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      await expect(controller.getTemplateModel("tm-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("updateTemplateModel", () => {
    const dto: UpdateTemplateModelDto = { name: "Updated Template Model" };

    it("updates template model for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      templateModelService.updateTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      const result = await controller.updateTemplateModel("tm-1", dto, req);
      expect(result).toEqual(mockTemplateModel);
      expect(templateModelService.updateTemplateModel).toHaveBeenCalledWith(
        "tm-1",
        dto,
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
          actorId: "user-1",
        },
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );

      await expect(
        controller.updateTemplateModel("tm-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(templateModelService.updateTemplateModel).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      await expect(
        controller.updateTemplateModel("tm-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(templateModelService.updateTemplateModel).not.toHaveBeenCalled();
    });
  });

  describe("deleteTemplateModel", () => {
    it("deletes template model for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      templateModelService.deleteTemplateModel.mockResolvedValue({
        success: true,
        id: "tm-1",
      });
      const result = await controller.deleteTemplateModel("tm-1", req);
      expect(result).toEqual({ success: true, id: "tm-1" });
      expect(templateModelService.deleteTemplateModel).toHaveBeenCalledWith(
        "tm-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
          actorId: "user-1",
        },
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );

      await expect(controller.deleteTemplateModel("tm-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(templateModelService.deleteTemplateModel).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      await expect(controller.deleteTemplateModel("tm-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(templateModelService.deleteTemplateModel).not.toHaveBeenCalled();
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
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.uploadLabelingDocument.mockResolvedValue(
        mockLabelingDocResult as never,
      );
      const result = await controller.uploadLabelingDocument("tm-1", dto, req);
      expect(result).toEqual(mockLabelingDocResult);
      expect(templateModelService.uploadLabelingDocument).toHaveBeenCalledWith(
        "tm-1",
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
          actorId: "user-1",
        },
      } as unknown as Request;

      await expect(
        controller.uploadLabelingDocument("tm-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(
        templateModelService.uploadLabelingDocument,
      ).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: undefined,
      } as unknown as Request;
      await expect(
        controller.uploadLabelingDocument("tm-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(
        templateModelService.uploadLabelingDocument,
      ).not.toHaveBeenCalled();
    });
  });

  describe("addDocumentToTemplateModel", () => {
    const dto: AddDocumentDto = { labelingDocumentId: "labeling-doc-1" };

    it("adds document to template model for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.addDocumentToTemplateModel.mockResolvedValue(
        mockLabeledDocument as never,
      );
      const result = await controller.addDocumentToTemplateModel(
        "tm-1",
        dto,
        req,
      );
      expect(result).toEqual(mockLabeledDocument);
      expect(
        templateModelService.addDocumentToTemplateModel,
      ).toHaveBeenCalledWith("tm-1", dto);
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
          actorId: "user-1",
        },
      } as unknown as Request;

      await expect(
        controller.addDocumentToTemplateModel("tm-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(
        templateModelService.addDocumentToTemplateModel,
      ).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when labeling document does not exist", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
          actorId: "user-1",
        },
      } as unknown as Request;
      labelingDocumentDbService.findLabelingDocument.mockResolvedValueOnce(
        null,
      );
      await expect(
        controller.addDocumentToTemplateModel("tm-1", dto, req),
      ).rejects.toThrow(NotFoundException);
      expect(
        templateModelService.addDocumentToTemplateModel,
      ).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as unknown as Request;
      await expect(
        controller.addDocumentToTemplateModel("tm-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(
        templateModelService.addDocumentToTemplateModel,
      ).not.toHaveBeenCalled();
    });
  });

  describe("getTemplateModelDocument", () => {
    it("returns labeled document for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );
      const result = await controller.getTemplateModelDocument(
        "tm-1",
        "labeled-doc-1",
        req,
      );
      expect(result).toEqual(mockLabeledDocument);
      expect(
        templateModelService.getTemplateModelDocument,
      ).toHaveBeenCalledWith("tm-1", "labeled-doc-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
          actorId: "user-1",
        },
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );

      await expect(
        controller.getTemplateModelDocument("tm-1", "labeled-doc-1", req),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );
      await expect(
        controller.getTemplateModelDocument("tm-1", "labeled-doc-1", req),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("removeDocumentFromTemplateModel", () => {
    it("removes document for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );
      templateModelService.removeDocumentFromTemplateModel.mockResolvedValue({
        success: true,
        documentId: "labeled-doc-1",
      });
      const result = await controller.removeDocumentFromTemplateModel(
        "tm-1",
        "labeled-doc-1",
        req,
      );
      expect(result).toEqual({ success: true, documentId: "labeled-doc-1" });
      expect(
        templateModelService.removeDocumentFromTemplateModel,
      ).toHaveBeenCalledWith("tm-1", "labeled-doc-1");
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
          actorId: "user-1",
        },
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );

      await expect(
        controller.removeDocumentFromTemplateModel(
          "tm-1",
          "labeled-doc-1",
          req,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(
        templateModelService.removeDocumentFromTemplateModel,
      ).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );
      await expect(
        controller.removeDocumentFromTemplateModel(
          "tm-1",
          "labeled-doc-1",
          req,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(
        templateModelService.removeDocumentFromTemplateModel,
      ).not.toHaveBeenCalled();
    });
  });

  describe("getDocumentLabels", () => {
    it("returns labels for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );
      templateModelService.getDocumentLabels.mockResolvedValue([]);
      const result = await controller.getDocumentLabels(
        "tm-1",
        "labeled-doc-1",
        req,
      );
      expect(result).toEqual([]);
      expect(templateModelService.getDocumentLabels).toHaveBeenCalledWith(
        "tm-1",
        "labeled-doc-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
          actorId: "user-1",
        },
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );

      await expect(
        controller.getDocumentLabels("tm-1", "labeled-doc-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(templateModelService.getDocumentLabels).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when no identity is provided", async () => {
      const req = {
        resolvedIdentity: undefined,
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );
      await expect(
        controller.getDocumentLabels("tm-1", "labeled-doc-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(templateModelService.getDocumentLabels).not.toHaveBeenCalled();
    });
  });

  describe("saveDocumentLabels", () => {
    const dto: SaveLabelsDto = {
      labels: [
        {
          field_key: "invoice_number",
          label_name: "invoice_number",
          value: "INV-001",
          page_number: 1,
          bounding_box: { polygon: [0, 0, 1, 0, 1, 1, 0, 1] },
        },
      ],
    };

    it("saves labels for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );
      templateModelService.saveDocumentLabels.mockResolvedValue(
        mockLabeledDocument as never,
      );
      const result = await controller.saveDocumentLabels(
        "tm-1",
        "labeled-doc-1",
        dto,
        req,
      );
      expect(result).toEqual(mockLabeledDocument);
      expect(templateModelService.saveDocumentLabels).toHaveBeenCalledWith(
        "tm-1",
        "labeled-doc-1",
        dto,
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
          actorId: "user-1",
        },
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );

      await expect(
        controller.saveDocumentLabels("tm-1", "labeled-doc-1", dto, req),
      ).rejects.toThrow(ForbiddenException);
      expect(templateModelService.saveDocumentLabels).not.toHaveBeenCalled();
    });
  });

  describe("deleteLabel", () => {
    it("deletes label for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );
      templateModelService.deleteLabel.mockResolvedValue({
        success: true,
        id: "label-1",
      });
      const result = await controller.deleteLabel(
        "tm-1",
        "labeled-doc-1",
        "label-1",
        req,
      );
      expect(result).toEqual({ success: true, id: "label-1" });
      expect(templateModelService.deleteLabel).toHaveBeenCalledWith(
        "tm-1",
        "labeled-doc-1",
        "label-1",
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
          actorId: "user-1",
        },
      } as unknown as Request;
      templateModelService.getTemplateModelDocument.mockResolvedValue(
        mockLabeledDocument as never,
      );

      await expect(
        controller.deleteLabel("tm-1", "labeled-doc-1", "label-1", req),
      ).rejects.toThrow(ForbiddenException);
      expect(templateModelService.deleteLabel).not.toHaveBeenCalled();
    });
  });

  describe("exportTemplateModel", () => {
    it("exports template model for a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          groupRoles: { "group-1": GroupRole.MEMBER },
        },
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );
      templateModelService.exportTemplateModel.mockResolvedValue({
        templateModel: mockTemplateModel,
        documents: [],
        exportedAt: new Date().toISOString(),
      } as never);
      const result = await controller.exportTemplateModel(
        "tm-1",
        { format: "json" as never },
        req,
      );
      expect(result).toBeDefined();
      expect(templateModelService.exportTemplateModel).toHaveBeenCalledWith(
        "tm-1",
        { format: "json" },
      );
    });

    it("throws ForbiddenException when user is not a group member", async () => {
      const req = {
        resolvedIdentity: {
          userId: "user-1",
          isSystemAdmin: false,
          groupRoles: {},
          actorId: "user-1",
        },
      } as unknown as Request;
      templateModelService.getTemplateModel.mockResolvedValue(
        mockTemplateModel as never,
      );

      await expect(
        controller.exportTemplateModel(
          "tm-1",
          { format: "json" as never },
          req,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(templateModelService.exportTemplateModel).not.toHaveBeenCalled();
    });
  });
});
