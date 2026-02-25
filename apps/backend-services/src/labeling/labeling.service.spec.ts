import {
  DocumentStatus,
  LabelingStatus,
  FieldType as PrismaFieldType,
} from "@generated/client";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  LabeledDocumentData,
  LabelingProjectData,
} from "@/database/database.service";
import { DatabaseService } from "../database/database.service";
import { AddDocumentDto } from "./dto/add-document.dto";
import { CreateProjectDto, UpdateProjectDto } from "./dto/create-project.dto";
import { ExportDto, ExportFormat } from "./dto/export.dto";
import {
  CreateFieldDefinitionDto,
  FieldType,
  UpdateFieldDefinitionDto,
} from "./dto/field-definition.dto";
import { SaveLabelsDto } from "./dto/label.dto";
import { LabelingFileType, LabelingUploadDto } from "./dto/labeling-upload.dto";
import { LabelingService } from "./labeling.service";
import { LabelingOcrService } from "./labeling-ocr.service";

describe("LabelingService", () => {
  let service: LabelingService;
  let mockDbService: jest.Mocked<DatabaseService>;
  let mockOcrService: jest.Mocked<LabelingOcrService>;

  const mockProject: LabelingProjectData = {
    id: "project-1",
    name: "Test Project",
    description: "Test Description",
    created_by: "user-1",
    created_at: new Date(),
    updated_at: new Date(),
    field_schema: [
      {
        id: "field-1",
        field_key: "invoice_number",
        field_type: PrismaFieldType.string,
        field_format: null,
        display_order: 0,
        project_id: "project-1",
      },
    ],
  } as LabelingProjectData;

  const mockLabelingDocument = {
    id: "labeling-doc-1",
    title: "Test Invoice",
    original_filename: "invoice.pdf",
    file_path: "labeling-documents/labeling-doc-1/original.pdf",
    file_type: "pdf",
    file_size: 1024,
    metadata: {},
    source: "labeling",
    status: DocumentStatus.completed_ocr,
    created_at: new Date(),
    updated_at: new Date(),
    apim_request_id: null,
    model_id: "prebuilt-layout",
    ocr_result: {
      analyzeResult: {
        apiVersion: "2024-11-30",
        modelId: "prebuilt-layout",
        content: "test content",
        pages: [
          {
            pageNumber: 1,
            width: 8.5,
            height: 11,
            unit: "inch",
            spans: [{ offset: 0, length: 12 }],
          },
        ],
      },
    },
  };

  const mockLabeledDocument: LabeledDocumentData = {
    id: "labeled-doc-1",
    project_id: "project-1",
    labeling_document_id: "labeling-doc-1",
    status: LabelingStatus.in_progress,
    created_at: new Date(),
    updated_at: new Date(),
    labeling_document: mockLabelingDocument as any,
    labels: [
      {
        id: "label-1",
        labeled_doc_id: "labeled-doc-1",
        field_key: "invoice_number",
        label_name: "invoice_number",
        value: "INV-001",
        page_number: 1,
        bounding_box: {
          polygon: [0, 0, 1, 0, 1, 1, 0, 1],
          span: { offset: 0, length: 7 },
        },
        created_at: new Date(),
      },
    ],
  };

  beforeEach(async () => {
    const mockDb = {
      findAllLabelingProjects: jest.fn(),
      createLabelingProject: jest.fn(),
      findLabelingProject: jest.fn(),
      updateLabelingProject: jest.fn(),
      deleteLabelingProject: jest.fn(),
      createFieldDefinition: jest.fn(),
      updateFieldDefinition: jest.fn(),
      deleteFieldDefinition: jest.fn(),
      findLabeledDocuments: jest.fn(),
      addDocumentToProject: jest.fn(),
      findLabeledDocument: jest.fn(),
      removeDocumentFromProject: jest.fn(),
      saveDocumentLabels: jest.fn(),
      updateLabeledDocumentStatus: jest.fn(),
      deleteDocumentLabel: jest.fn(),
      findLabelingDocument: jest.fn(),
    };

    const mockOcr = {
      createLabelingDocument: jest.fn(),
      processOcrForLabelingDocument: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabelingService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
        {
          provide: LabelingOcrService,
          useValue: mockOcr,
        },
      ],
    }).compile();

    service = module.get<LabelingService>(LabelingService);
    mockDbService = module.get(DatabaseService);
    mockOcrService = module.get(LabelingOcrService);
  });

  // ========== PROJECT OPERATIONS ==========

  describe("getProjects", () => {
    it("should return all projects", async () => {
      const projects = [mockProject];
      mockDbService.findAllLabelingProjects.mockResolvedValueOnce(projects);

      const result = await service.getProjects();

      expect(mockDbService.findAllLabelingProjects).toHaveBeenCalledWith(
        undefined,
      );
      expect(result).toEqual(projects);
    });

    it("should return projects for specific user", async () => {
      const projects = [mockProject];
      mockDbService.findAllLabelingProjects.mockResolvedValueOnce(projects);

      const result = await service.getProjects("user-1");

      expect(mockDbService.findAllLabelingProjects).toHaveBeenCalledWith(
        "user-1",
      );
      expect(result).toEqual(projects);
    });
  });

  describe("createProject", () => {
    it("should create a new project", async () => {
      const dto: CreateProjectDto = {
        name: "New Project",
        description: "Test Description",
        group_id: "group-1",
      };

      mockDbService.createLabelingProject.mockResolvedValueOnce(mockProject);

      const result = await service.createProject(dto, "user-1");

      expect(mockDbService.createLabelingProject).toHaveBeenCalledWith({
        name: dto.name,
        description: dto.description,
        created_by: "user-1",
        group_id: "group-1",
      });
      expect(result).toEqual(mockProject);
    });
  });

  describe("getProject", () => {
    it("should return a project by id", async () => {
      mockDbService.findLabelingProject.mockResolvedValueOnce(mockProject);

      const result = await service.getProject("project-1");

      expect(mockDbService.findLabelingProject).toHaveBeenCalledWith(
        "project-1",
      );
      expect(result).toEqual(mockProject);
    });

    it("should throw NotFoundException when project not found", async () => {
      mockDbService.findLabelingProject.mockResolvedValueOnce(null);

      await expect(service.getProject("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("updateProject", () => {
    it("should update a project", async () => {
      const dto: UpdateProjectDto = {
        name: "Updated Project",
      };

      const updatedProject = { ...mockProject, name: "Updated Project" };
      mockDbService.updateLabelingProject.mockResolvedValueOnce(updatedProject);

      const result = await service.updateProject("project-1", dto);

      expect(mockDbService.updateLabelingProject).toHaveBeenCalledWith(
        "project-1",
        dto,
      );
      expect(result).toEqual(updatedProject);
    });

    it("should throw NotFoundException when project not found", async () => {
      mockDbService.updateLabelingProject.mockResolvedValueOnce(null);

      await expect(
        service.updateProject("non-existent", { name: "test" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deleteProject", () => {
    it("should delete a project", async () => {
      mockDbService.deleteLabelingProject.mockResolvedValueOnce(true);

      const result = await service.deleteProject("project-1");

      expect(mockDbService.deleteLabelingProject).toHaveBeenCalledWith(
        "project-1",
      );
      expect(result).toEqual({ success: true, id: "project-1" });
    });

    it("should throw NotFoundException when project not found", async () => {
      mockDbService.deleteLabelingProject.mockResolvedValueOnce(false);

      await expect(service.deleteProject("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ========== FIELD SCHEMA OPERATIONS ==========

  describe("getFieldSchema", () => {
    it("should return field schema for a project", async () => {
      mockDbService.findLabelingProject.mockResolvedValueOnce(mockProject);

      const result = await service.getFieldSchema("project-1");

      expect(mockDbService.findLabelingProject).toHaveBeenCalledWith(
        "project-1",
      );
      expect(result).toEqual(mockProject.field_schema);
    });

    it("should throw NotFoundException when project not found", async () => {
      mockDbService.findLabelingProject.mockResolvedValueOnce(null);

      await expect(service.getFieldSchema("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("addField", () => {
    it("should add a new field to project", async () => {
      const dto: CreateFieldDefinitionDto = {
        field_key: "total_amount",
        field_type: FieldType.NUMBER,
      };

      const newField = {
        id: "field-2",
        field_key: "total_amount",
        field_type: PrismaFieldType.number,
        field_format: null,
        display_order: 1,
        project_id: "project-1",
      };

      mockDbService.findLabelingProject.mockResolvedValueOnce(mockProject);
      mockDbService.createFieldDefinition.mockResolvedValueOnce(newField);

      const result = await service.addField("project-1", dto);

      expect(mockDbService.findLabelingProject).toHaveBeenCalledWith(
        "project-1",
      );
      expect(mockDbService.createFieldDefinition).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({
          field_key: "total_amount",
          field_type: FieldType.NUMBER,
        }),
      );
      expect(result).toEqual(newField);
    });

    it("should throw NotFoundException when project not found", async () => {
      mockDbService.findLabelingProject.mockResolvedValueOnce(null);

      await expect(
        service.addField("non-existent", {
          field_key: "test",
          field_type: FieldType.STRING,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException when field key already exists", async () => {
      const dto: CreateFieldDefinitionDto = {
        field_key: "invoice_number", // Already exists in mockProject
        field_type: FieldType.STRING,
      };

      mockDbService.findLabelingProject.mockResolvedValueOnce(mockProject);

      await expect(service.addField("project-1", dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("updateField", () => {
    it("should update a field", async () => {
      const dto: UpdateFieldDefinitionDto = {
        field_format: "currency",
      };

      const updatedField = {
        ...mockProject.field_schema[0],
        field_format: "currency",
      };

      mockDbService.updateFieldDefinition.mockResolvedValueOnce(updatedField);

      const result = await service.updateField("project-1", "field-1", dto);

      expect(mockDbService.updateFieldDefinition).toHaveBeenCalledWith(
        "field-1",
        dto,
      );
      expect(result).toEqual(updatedField);
    });

    it("should throw NotFoundException when field not found", async () => {
      mockDbService.updateFieldDefinition.mockResolvedValueOnce(null);

      await expect(
        service.updateField("project-1", "non-existent", {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deleteField", () => {
    it("should delete a field", async () => {
      mockDbService.deleteFieldDefinition.mockResolvedValueOnce(true);

      const result = await service.deleteField("project-1", "field-1");

      expect(mockDbService.deleteFieldDefinition).toHaveBeenCalledWith(
        "field-1",
      );
      expect(result).toEqual({ success: true, id: "field-1" });
    });

    it("should throw NotFoundException when field not found", async () => {
      mockDbService.deleteFieldDefinition.mockResolvedValueOnce(false);

      await expect(
        service.deleteField("project-1", "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ========== DOCUMENT OPERATIONS ==========

  describe("getProjectDocuments", () => {
    it("should return documents for a project", async () => {
      const documents = [mockLabeledDocument];
      mockDbService.findLabelingProject.mockResolvedValueOnce(mockProject);
      mockDbService.findLabeledDocuments.mockResolvedValueOnce(documents);

      const result = await service.getProjectDocuments("project-1");

      expect(mockDbService.findLabelingProject).toHaveBeenCalledWith(
        "project-1",
      );
      expect(mockDbService.findLabeledDocuments).toHaveBeenCalledWith(
        "project-1",
      );
      expect(result).toEqual(documents);
    });

    it("should throw NotFoundException when project not found", async () => {
      mockDbService.findLabelingProject.mockResolvedValueOnce(null);

      await expect(service.getProjectDocuments("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("addDocumentToProject", () => {
    it("should add a document to project", async () => {
      const dto: AddDocumentDto = {
        labelingDocumentId: "labeling-doc-1",
      };

      mockDbService.findLabelingProject.mockResolvedValueOnce(mockProject);
      mockDbService.findLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as any,
      );
      mockDbService.addDocumentToProject.mockResolvedValueOnce(
        mockLabeledDocument,
      );

      const result = await service.addDocumentToProject("project-1", dto);

      expect(mockDbService.findLabelingProject).toHaveBeenCalledWith(
        "project-1",
      );
      expect(mockDbService.findLabelingDocument).toHaveBeenCalledWith(
        "labeling-doc-1",
      );
      expect(mockDbService.addDocumentToProject).toHaveBeenCalledWith(
        "project-1",
        "labeling-doc-1",
      );
      expect(result).toEqual(mockLabeledDocument);
    });

    it("should throw NotFoundException when project not found", async () => {
      mockDbService.findLabelingProject.mockResolvedValueOnce(null);

      await expect(
        service.addDocumentToProject("non-existent", {
          labelingDocumentId: "doc-1",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when labeling document not found", async () => {
      mockDbService.findLabelingProject.mockResolvedValueOnce(mockProject);
      mockDbService.findLabelingDocument.mockResolvedValueOnce(null);

      await expect(
        service.addDocumentToProject("project-1", {
          labelingDocumentId: "non-existent",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getProjectDocument", () => {
    it("should return a specific document from project", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(
        mockLabeledDocument,
      );

      const result = await service.getProjectDocument(
        "project-1",
        "labeled-doc-1",
      );

      expect(mockDbService.findLabeledDocument).toHaveBeenCalledWith(
        "project-1",
        "labeled-doc-1",
      );
      expect(result).toEqual(mockLabeledDocument);
    });

    it("should throw NotFoundException when document not found", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(null);

      await expect(
        service.getProjectDocument("project-1", "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("removeDocumentFromProject", () => {
    it("should remove a document from project", async () => {
      mockDbService.removeDocumentFromProject.mockResolvedValueOnce(true);

      const result = await service.removeDocumentFromProject(
        "project-1",
        "labeled-doc-1",
      );

      expect(mockDbService.removeDocumentFromProject).toHaveBeenCalledWith(
        "project-1",
        "labeled-doc-1",
      );
      expect(result).toEqual({ success: true, documentId: "labeled-doc-1" });
    });

    it("should throw NotFoundException when document not found", async () => {
      mockDbService.removeDocumentFromProject.mockResolvedValueOnce(false);

      await expect(
        service.removeDocumentFromProject("project-1", "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ========== LABEL OPERATIONS ==========

  describe("getDocumentLabels", () => {
    it("should return labels for a document", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(
        mockLabeledDocument,
      );

      const result = await service.getDocumentLabels(
        "project-1",
        "labeled-doc-1",
      );

      expect(mockDbService.findLabeledDocument).toHaveBeenCalledWith(
        "project-1",
        "labeled-doc-1",
      );
      expect(result).toEqual(mockLabeledDocument.labels);
    });

    it("should throw NotFoundException when document not found", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(null);

      await expect(
        service.getDocumentLabels("project-1", "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("saveDocumentLabels", () => {
    it("should save labels and update status to labeled", async () => {
      const dto: SaveLabelsDto = {
        labels: [
          {
            field_key: "invoice_number",
            label_name: "invoice_number",
            value: "INV-002",
            page_number: 1,
            bounding_box: {
              polygon: [0, 0, 1, 0, 1, 1, 0, 1],
            },
          },
        ],
      };

      mockDbService.findLabeledDocument
        .mockResolvedValueOnce(mockLabeledDocument)
        .mockResolvedValueOnce(mockLabeledDocument);
      mockDbService.saveDocumentLabels.mockResolvedValueOnce(undefined);
      mockDbService.updateLabeledDocumentStatus.mockResolvedValueOnce(
        undefined,
      );

      const result = await service.saveDocumentLabels(
        "project-1",
        "labeled-doc-1",
        dto,
      );

      expect(mockDbService.saveDocumentLabels).toHaveBeenCalledWith(
        "labeled-doc-1",
        expect.arrayContaining([
          expect.objectContaining({
            field_key: "invoice_number",
            value: "INV-002",
          }),
        ]),
      );
      expect(mockDbService.updateLabeledDocumentStatus).toHaveBeenCalledWith(
        "labeled-doc-1",
        LabelingStatus.labeled,
      );
      expect(result).toEqual(mockLabeledDocument);
    });

    it("should update status to in_progress when no labels", async () => {
      const dto: SaveLabelsDto = {
        labels: [],
      };

      mockDbService.findLabeledDocument
        .mockResolvedValueOnce(mockLabeledDocument)
        .mockResolvedValueOnce(mockLabeledDocument);
      mockDbService.saveDocumentLabels.mockResolvedValueOnce(undefined);
      mockDbService.updateLabeledDocumentStatus.mockResolvedValueOnce(
        undefined,
      );

      await service.saveDocumentLabels("project-1", "labeled-doc-1", dto);

      expect(mockDbService.updateLabeledDocumentStatus).toHaveBeenCalledWith(
        "labeled-doc-1",
        LabelingStatus.in_progress,
      );
    });

    it("should throw NotFoundException when document not found", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(null);

      await expect(
        service.saveDocumentLabels("project-1", "non-existent", {
          labels: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deleteLabel", () => {
    it("should delete a label", async () => {
      mockDbService.deleteDocumentLabel.mockResolvedValueOnce(true);

      const result = await service.deleteLabel(
        "project-1",
        "labeled-doc-1",
        "label-1",
      );

      expect(mockDbService.deleteDocumentLabel).toHaveBeenCalledWith("label-1");
      expect(result).toEqual({ success: true, id: "label-1" });
    });

    it("should throw NotFoundException when label not found", async () => {
      mockDbService.deleteDocumentLabel.mockResolvedValueOnce(false);

      await expect(
        service.deleteLabel("project-1", "labeled-doc-1", "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ========== OCR DATA ==========

  describe("getDocumentOcr", () => {
    it("should return OCR result for a document", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(
        mockLabeledDocument,
      );

      const result = await service.getDocumentOcr("project-1", "labeled-doc-1");

      expect(mockDbService.findLabeledDocument).toHaveBeenCalledWith(
        "project-1",
        "labeled-doc-1",
      );
      expect(result).toEqual(mockLabelingDocument.ocr_result);
    });

    it("should throw NotFoundException when document not found", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(null);

      await expect(
        service.getDocumentOcr("project-1", "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when OCR result not available", async () => {
      const docWithoutOcr = {
        ...mockLabeledDocument,
        labeling_document: {
          ...mockLabelingDocument,
          ocr_result: null,
        },
      };

      mockDbService.findLabeledDocument.mockResolvedValueOnce(
        docWithoutOcr as any,
      );

      await expect(
        service.getDocumentOcr("project-1", "labeled-doc-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ========== EXPORT ==========

  describe("exportProject", () => {
    it("should export project in AZURE format", async () => {
      const dto: ExportDto = {
        format: ExportFormat.AZURE,
      };

      mockDbService.findLabelingProject.mockResolvedValueOnce(mockProject);
      mockDbService.findLabeledDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
      ]);

      const result = await service.exportProject("project-1", dto);

      expect(mockDbService.findLabelingProject).toHaveBeenCalledWith(
        "project-1",
      );
      expect(mockDbService.findLabeledDocuments).toHaveBeenCalledWith(
        "project-1",
      );
      expect(result).toHaveProperty("fieldsJson");
      expect(result).toHaveProperty("labelsFiles");
      expect(result).toHaveProperty("projectName", "Test Project");
    });

    it("should export project in JSON format", async () => {
      const dto: ExportDto = {
        format: ExportFormat.JSON,
      };

      mockDbService.findLabelingProject.mockResolvedValueOnce(mockProject);
      mockDbService.findLabeledDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
      ]);

      const result = await service.exportProject("project-1", dto);

      expect(result).toHaveProperty("project");
      expect(result).toHaveProperty("documents");
      expect(result).toHaveProperty("exportedAt");
      expect((result as any).project.name).toBe("Test Project");
    });

    it("should filter by document IDs when provided", async () => {
      const dto: ExportDto = {
        format: ExportFormat.JSON,
        documentIds: ["labeling-doc-1"],
      };

      mockDbService.findLabelingProject.mockResolvedValueOnce(mockProject);
      mockDbService.findLabeledDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
        {
          ...mockLabeledDocument,
          labeling_document: {
            ...mockLabelingDocument,
            id: "other-doc",
          },
        } as any,
      ]);

      const result = await service.exportProject("project-1", dto);

      expect((result as any).documents).toHaveLength(1);
      expect((result as any).documents[0].id).toBe("labeling-doc-1");
    });

    it("should filter by labeled status when labeledOnly is true", async () => {
      const dto: ExportDto = {
        format: ExportFormat.JSON,
        labeledOnly: true,
      };

      const labeledDoc = {
        ...mockLabeledDocument,
        status: LabelingStatus.labeled,
      };

      mockDbService.findLabelingProject.mockResolvedValueOnce(mockProject);
      mockDbService.findLabeledDocuments.mockResolvedValueOnce([
        labeledDoc,
        mockLabeledDocument,
      ]);

      const result = await service.exportProject("project-1", dto);

      expect((result as any).documents).toHaveLength(1);
      expect((result as any).documents[0].status).toBe(LabelingStatus.labeled);
    });

    it("should throw NotFoundException when project not found", async () => {
      mockDbService.findLabelingProject.mockResolvedValueOnce(null);

      await expect(
        service.exportProject("non-existent", {
          format: ExportFormat.JSON,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("exportAzureFormat", () => {
    it("should format fields correctly for Azure export", async () => {
      const projectWithDateField = {
        ...mockProject,
        field_schema: [
          ...mockProject.field_schema,
          {
            id: "field-2",
            field_key: "invoice_date",
            field_type: PrismaFieldType.date,
            field_format: "dmy",
            display_order: 1,
            project_id: "project-1",
          },
        ],
      };

      const dto: ExportDto = {
        format: ExportFormat.AZURE,
      };

      mockDbService.findLabelingProject.mockResolvedValueOnce(
        projectWithDateField,
      );
      mockDbService.findLabeledDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
      ]);

      const result = await service.exportProject("project-1", dto);

      expect((result as any).fieldsJson.fields).toHaveLength(2);
      expect((result as any).fieldsJson.fields[0]).toEqual({
        fieldKey: "invoice_number",
        fieldType: "string",
      });
      expect((result as any).fieldsJson.fields[1]).toEqual({
        fieldKey: "invoice_date",
        fieldType: "date",
        fieldFormat: "dmy",
      });
    });

    it("should handle selection mark fields correctly", async () => {
      const projectWithCheckbox = {
        ...mockProject,
        field_schema: [
          {
            id: "field-1",
            field_key: "terms_accepted",
            field_type: PrismaFieldType.selectionMark,
            field_format: null,
            display_order: 0,
            project_id: "project-1",
          },
        ],
      };

      const docWithCheckbox = {
        ...mockLabeledDocument,
        labels: [
          {
            id: "label-1",
            labeled_doc_id: "labeled-doc-1",
            field_key: "terms_accepted",
            label_name: "terms_accepted",
            value: "selected",
            page_number: 1,
            bounding_box: {
              polygon: [0, 0, 1, 0, 1, 1, 0, 1],
              span: { offset: 0, length: 1 },
            },
            created_at: new Date(),
          },
        ],
      };

      const dto: ExportDto = {
        format: ExportFormat.AZURE,
      };

      mockDbService.findLabelingProject.mockResolvedValueOnce(
        projectWithCheckbox,
      );
      mockDbService.findLabeledDocuments.mockResolvedValueOnce([
        docWithCheckbox,
      ]);

      const result = await service.exportProject("project-1", dto);

      expect(
        (result as any).labelsFiles[0].content.labels[0].value[0].text,
      ).toBe(":selected:");
    });
  });

  describe("uploadLabelingDocument", () => {
    it("should upload document and trigger OCR processing", async () => {
      const dto: LabelingUploadDto = {
        title: "New Invoice",
        file: "data:application/pdf;base64,dGVzdA==",
        file_type: LabelingFileType.PDF,
        original_filename: "invoice.pdf",
        group_id: "group-1",
      };

      mockDbService.findLabelingProject.mockResolvedValueOnce(mockProject);
      mockOcrService.createLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as any,
      );
      mockDbService.addDocumentToProject.mockResolvedValueOnce(
        mockLabeledDocument,
      );
      mockOcrService.processOcrForLabelingDocument.mockResolvedValueOnce(
        undefined,
      );

      const result = await service.uploadLabelingDocument("project-1", dto);

      expect(mockDbService.findLabelingProject).toHaveBeenCalledWith(
        "project-1",
      );
      expect(mockOcrService.createLabelingDocument).toHaveBeenCalledWith(dto);
      expect(mockDbService.addDocumentToProject).toHaveBeenCalledWith(
        "project-1",
        "labeling-doc-1",
      );
      expect(mockOcrService.processOcrForLabelingDocument).toHaveBeenCalledWith(
        "labeling-doc-1",
      );
      expect(result).toEqual({
        labeledDocument: mockLabeledDocument,
        labelingDocument: mockLabelingDocument,
      });
    });

    it("should throw NotFoundException when project not found", async () => {
      mockDbService.findLabelingProject.mockResolvedValueOnce(null);

      await expect(
        service.uploadLabelingDocument("non-existent", {
          title: "test",
          file: "base64",
          file_type: LabelingFileType.PDF,
          group_id: "group-1",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
