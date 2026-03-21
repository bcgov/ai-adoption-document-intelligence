import {
  DocumentStatus,
  LabelingStatus,
  FieldType as PrismaFieldType,
} from "@generated/client";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ResolvedIdentity } from "@/auth/types";
import {
  LabeledDocumentData,
  TemplateModelData,
} from "@/database/database.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { DatabaseService } from "../database/database.service";
import { AddDocumentDto } from "./dto/add-document.dto";
import {
  CreateTemplateModelDto,
  UpdateTemplateModelDto,
} from "./dto/create-template-model.dto";
import { ExportDto, ExportFormat } from "./dto/export.dto";
import {
  CreateFieldDefinitionDto,
  FieldType,
  UpdateFieldDefinitionDto,
} from "./dto/field-definition.dto";
import { SaveLabelsDto } from "./dto/label.dto";
import {
  LabelingFileType,
  LabelingUploadDto,
} from "./dto/labeling-upload.dto";
import { TemplateModelService } from "./template-model.service";
import { TemplateModelOcrService } from "./template-model-ocr.service";
import { SuggestionService } from "./suggestion.service";

describe("TemplateModelService", () => {
  let service: TemplateModelService;
  let mockDbService: jest.Mocked<DatabaseService>;
  let mockOcrService: jest.Mocked<TemplateModelOcrService>;
  let mockSuggestionService: jest.Mocked<SuggestionService>;

  const mockTemplateModel: TemplateModelData = {
    id: "tm-1",
    name: "Test Template Model",
    model_id: "test-template-model",
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
        template_model_id: "tm-1",
      },
    ],
  } as TemplateModelData;

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
    template_model_id: "tm-1",
    labeling_document_id: "labeling-doc-1",
    status: LabelingStatus.in_progress,
    created_at: new Date(),
    updated_at: new Date(),
    labeling_document: mockLabelingDocument as never,
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
      findAllTemplateModels: jest.fn(),
      createTemplateModel: jest.fn(),
      findTemplateModel: jest.fn(),
      findTemplateModelByModelId: jest.fn(),
      updateTemplateModel: jest.fn(),
      deleteTemplateModel: jest.fn(),
      createFieldDefinition: jest.fn(),
      updateFieldDefinition: jest.fn(),
      deleteFieldDefinition: jest.fn(),
      findLabeledDocuments: jest.fn(),
      addDocumentToTemplateModel: jest.fn(),
      findLabeledDocument: jest.fn(),
      removeDocumentFromTemplateModel: jest.fn(),
      saveDocumentLabels: jest.fn(),
      updateLabeledDocumentStatus: jest.fn(),
      deleteDocumentLabel: jest.fn(),
      findLabelingDocument: jest.fn(),
    };

    const mockOcr = {
      createLabelingDocument: jest.fn(),
      processOcrForLabelingDocument: jest.fn(),
    };

    const mockSuggestions = {
      generateSuggestions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateModelService,
        { provide: AppLoggerService, useValue: mockAppLogger },
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
        {
          provide: TemplateModelOcrService,
          useValue: mockOcr,
        },
        {
          provide: SuggestionService,
          useValue: mockSuggestions,
        },
      ],
    }).compile();

    service = module.get<TemplateModelService>(TemplateModelService);
    mockDbService = module.get(DatabaseService);
    mockOcrService = module.get(TemplateModelOcrService);
    mockSuggestionService = module.get(SuggestionService);
  });

  // ========== MODEL ID GENERATION ==========

  describe("generateModelIdBase", () => {
    it("should lowercase and replace spaces with hyphens", () => {
      expect(service.generateModelIdBase("My Template Model")).toBe(
        "my-template-model",
      );
    });

    it("should strip non-alphanumeric characters except allowed ones", () => {
      expect(service.generateModelIdBase("Model@#$%Name")).toBe("model-name");
    });

    it("should collapse consecutive hyphens", () => {
      expect(service.generateModelIdBase("Model---Name")).toBe("model-name");
    });

    it("should trim leading/trailing hyphens", () => {
      expect(service.generateModelIdBase("-Model Name-")).toBe("model-name");
    });

    it("should truncate to 64 chars", () => {
      const longName = "a".repeat(100);
      expect(service.generateModelIdBase(longName).length).toBeLessThanOrEqual(
        64,
      );
    });

    it("should ensure starts with letter/number", () => {
      expect(service.generateModelIdBase("---test")).toBe("test");
    });

    it("should return 'model' for empty input", () => {
      expect(service.generateModelIdBase("")).toBe("model");
    });

    it("should handle special characters", () => {
      expect(service.generateModelIdBase("Model (v2.1)")).toBe("model-v2.1");
    });
  });

  describe("generateUniqueModelId", () => {
    it("should return base model_id when no collision", async () => {
      mockDbService.findTemplateModelByModelId.mockResolvedValue(null);
      const result = await service.generateUniqueModelId("My Template");
      expect(result).toBe("my-template");
    });

    it("should append suffix on collision", async () => {
      mockDbService.findTemplateModelByModelId
        .mockResolvedValueOnce(mockTemplateModel) // base collides
        .mockResolvedValueOnce(null); // -2 is free
      const result = await service.generateUniqueModelId("My Template");
      expect(result).toBe("my-template-2");
    });

    it("should increment suffix until unique", async () => {
      mockDbService.findTemplateModelByModelId
        .mockResolvedValueOnce(mockTemplateModel) // base collides
        .mockResolvedValueOnce(mockTemplateModel) // -2 collides
        .mockResolvedValueOnce(mockTemplateModel) // -3 collides
        .mockResolvedValueOnce(null); // -4 is free
      const result = await service.generateUniqueModelId("My Template");
      expect(result).toBe("my-template-4");
    });
  });

  // ========== TEMPLATE MODEL OPERATIONS ==========

  describe("getTemplateModels", () => {
    it("should return all template models", async () => {
      const models = [mockTemplateModel];
      mockDbService.findAllTemplateModels.mockResolvedValueOnce(models);

      const result = await service.getTemplateModels();

      expect(mockDbService.findAllTemplateModels).toHaveBeenCalledWith(
        undefined,
      );
      expect(result).toEqual(models);
    });

    it("should return template models for specific groups", async () => {
      const models = [mockTemplateModel];
      mockDbService.findAllTemplateModels.mockResolvedValueOnce(models);

      const result = await service.getTemplateModels(["group-1"]);

      expect(mockDbService.findAllTemplateModels).toHaveBeenCalledWith([
        "group-1",
      ]);
      expect(result).toEqual(models);
    });
  });

  describe("createTemplateModel", () => {
    it("should create a new template model with generated model_id", async () => {
      const dto: CreateTemplateModelDto = {
        name: "New Template Model",
        description: "Test Description",
        group_id: "group-1",
      };

      mockDbService.findTemplateModelByModelId.mockResolvedValue(null);
      mockDbService.createTemplateModel.mockResolvedValueOnce(
        mockTemplateModel,
      );

      const result = await service.createTemplateModel(dto, "user-1");

      expect(mockDbService.createTemplateModel).toHaveBeenCalledWith({
        name: dto.name,
        model_id: "new-template-model",
        description: dto.description,
        created_by: "user-1",
        group_id: "group-1",
      });
      expect(result).toEqual(mockTemplateModel);
    });
  });

  describe("getTemplateModel", () => {
    it("should return a template model by id", async () => {
      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);

      const result = await service.getTemplateModel("tm-1");

      expect(mockDbService.findTemplateModel).toHaveBeenCalledWith("tm-1");
      expect(result).toEqual(mockTemplateModel);
    });

    it("should throw NotFoundException when template model not found", async () => {
      mockDbService.findTemplateModel.mockResolvedValueOnce(null);

      await expect(service.getTemplateModel("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("updateTemplateModel", () => {
    it("should update a template model", async () => {
      const dto: UpdateTemplateModelDto = {
        name: "Updated Template Model",
      };

      const updatedModel = {
        ...mockTemplateModel,
        name: "Updated Template Model",
      };
      mockDbService.updateTemplateModel.mockResolvedValueOnce(updatedModel);

      const result = await service.updateTemplateModel("tm-1", dto);

      expect(mockDbService.updateTemplateModel).toHaveBeenCalledWith(
        "tm-1",
        dto,
      );
      expect(result).toEqual(updatedModel);
    });

    it("should throw NotFoundException when template model not found", async () => {
      mockDbService.updateTemplateModel.mockResolvedValueOnce(null);

      await expect(
        service.updateTemplateModel("non-existent", { name: "test" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deleteTemplateModel", () => {
    it("should delete a template model", async () => {
      mockDbService.deleteTemplateModel.mockResolvedValueOnce(true);

      const result = await service.deleteTemplateModel("tm-1");

      expect(mockDbService.deleteTemplateModel).toHaveBeenCalledWith("tm-1");
      expect(result).toEqual({ success: true, id: "tm-1" });
    });

    it("should throw NotFoundException when template model not found", async () => {
      mockDbService.deleteTemplateModel.mockResolvedValueOnce(false);

      await expect(
        service.deleteTemplateModel("non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ========== FIELD SCHEMA OPERATIONS ==========

  describe("getFieldSchema", () => {
    it("should return field schema for a template model", async () => {
      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);

      const result = await service.getFieldSchema("tm-1");

      expect(mockDbService.findTemplateModel).toHaveBeenCalledWith("tm-1");
      expect(result).toEqual(mockTemplateModel.field_schema);
    });

    it("should throw NotFoundException when template model not found", async () => {
      mockDbService.findTemplateModel.mockResolvedValueOnce(null);

      await expect(service.getFieldSchema("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("addField", () => {
    it("should add a new field to template model", async () => {
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
        template_model_id: "tm-1",
      };

      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);
      mockDbService.createFieldDefinition.mockResolvedValueOnce(newField);

      const result = await service.addField("tm-1", dto);

      expect(mockDbService.findTemplateModel).toHaveBeenCalledWith("tm-1");
      expect(mockDbService.createFieldDefinition).toHaveBeenCalledWith(
        "tm-1",
        expect.objectContaining({
          field_key: "total_amount",
          field_type: FieldType.NUMBER,
        }),
      );
      expect(result).toEqual(newField);
    });

    it("should throw NotFoundException when template model not found", async () => {
      mockDbService.findTemplateModel.mockResolvedValueOnce(null);

      await expect(
        service.addField("non-existent", {
          field_key: "test",
          field_type: FieldType.STRING,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException when field key already exists", async () => {
      const dto: CreateFieldDefinitionDto = {
        field_key: "invoice_number",
        field_type: FieldType.STRING,
      };

      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);

      await expect(service.addField("tm-1", dto)).rejects.toThrow(
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
        ...mockTemplateModel.field_schema[0],
        field_format: "currency",
      };

      mockDbService.updateFieldDefinition.mockResolvedValueOnce(updatedField);

      const result = await service.updateField("tm-1", "field-1", dto);

      expect(mockDbService.updateFieldDefinition).toHaveBeenCalledWith(
        "field-1",
        dto,
      );
      expect(result).toEqual(updatedField);
    });

    it("should throw NotFoundException when field not found", async () => {
      mockDbService.updateFieldDefinition.mockResolvedValueOnce(null);

      await expect(
        service.updateField("tm-1", "non-existent", {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deleteField", () => {
    it("should delete a field", async () => {
      mockDbService.deleteFieldDefinition.mockResolvedValueOnce(true);

      const result = await service.deleteField("tm-1", "field-1");

      expect(mockDbService.deleteFieldDefinition).toHaveBeenCalledWith(
        "field-1",
      );
      expect(result).toEqual({ success: true, id: "field-1" });
    });

    it("should throw NotFoundException when field not found", async () => {
      mockDbService.deleteFieldDefinition.mockResolvedValueOnce(false);

      await expect(
        service.deleteField("tm-1", "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ========== DOCUMENT OPERATIONS ==========

  describe("getTemplateModelDocuments", () => {
    it("should return documents for a template model", async () => {
      const documents = [mockLabeledDocument];
      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);
      mockDbService.findLabeledDocuments.mockResolvedValueOnce(documents);

      const result = await service.getTemplateModelDocuments("tm-1");

      expect(mockDbService.findTemplateModel).toHaveBeenCalledWith("tm-1");
      expect(mockDbService.findLabeledDocuments).toHaveBeenCalledWith("tm-1");
      expect(result).toEqual(documents);
    });

    it("should throw NotFoundException when template model not found", async () => {
      mockDbService.findTemplateModel.mockResolvedValueOnce(null);

      await expect(
        service.getTemplateModelDocuments("non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("addDocumentToTemplateModel", () => {
    it("should add a document to template model", async () => {
      const dto: AddDocumentDto = {
        labelingDocumentId: "labeling-doc-1",
      };

      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);
      mockDbService.findLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as never,
      );
      mockDbService.addDocumentToTemplateModel.mockResolvedValueOnce(
        mockLabeledDocument,
      );

      const result = await service.addDocumentToTemplateModel("tm-1", dto);

      expect(mockDbService.findTemplateModel).toHaveBeenCalledWith("tm-1");
      expect(mockDbService.findLabelingDocument).toHaveBeenCalledWith(
        "labeling-doc-1",
      );
      expect(mockDbService.addDocumentToTemplateModel).toHaveBeenCalledWith(
        "tm-1",
        "labeling-doc-1",
      );
      expect(result).toEqual(mockLabeledDocument);
    });

    it("should throw NotFoundException when template model not found", async () => {
      mockDbService.findTemplateModel.mockResolvedValueOnce(null);

      await expect(
        service.addDocumentToTemplateModel("non-existent", {
          labelingDocumentId: "doc-1",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when labeling document not found", async () => {
      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);
      mockDbService.findLabelingDocument.mockResolvedValueOnce(null);

      await expect(
        service.addDocumentToTemplateModel("tm-1", {
          labelingDocumentId: "non-existent",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getTemplateModelDocument", () => {
    it("should return a specific document from template model", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(
        mockLabeledDocument,
      );

      const result = await service.getTemplateModelDocument(
        "tm-1",
        "labeled-doc-1",
      );

      expect(mockDbService.findLabeledDocument).toHaveBeenCalledWith(
        "tm-1",
        "labeled-doc-1",
      );
      expect(result).toEqual(mockLabeledDocument);
    });

    it("should throw NotFoundException when document not found", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(null);

      await expect(
        service.getTemplateModelDocument("tm-1", "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("removeDocumentFromTemplateModel", () => {
    it("should remove a document from template model", async () => {
      mockDbService.removeDocumentFromTemplateModel.mockResolvedValueOnce(true);

      const result = await service.removeDocumentFromTemplateModel(
        "tm-1",
        "labeled-doc-1",
      );

      expect(
        mockDbService.removeDocumentFromTemplateModel,
      ).toHaveBeenCalledWith("tm-1", "labeled-doc-1");
      expect(result).toEqual({ success: true, documentId: "labeled-doc-1" });
    });

    it("should throw NotFoundException when document not found", async () => {
      mockDbService.removeDocumentFromTemplateModel.mockResolvedValueOnce(
        false,
      );

      await expect(
        service.removeDocumentFromTemplateModel("tm-1", "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ========== LABEL OPERATIONS ==========

  describe("getDocumentLabels", () => {
    it("should return labels for a document", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(
        mockLabeledDocument,
      );

      const result = await service.getDocumentLabels("tm-1", "labeled-doc-1");

      expect(mockDbService.findLabeledDocument).toHaveBeenCalledWith(
        "tm-1",
        "labeled-doc-1",
      );
      expect(result).toEqual(mockLabeledDocument.labels);
    });

    it("should throw NotFoundException when document not found", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(null);

      await expect(
        service.getDocumentLabels("tm-1", "non-existent"),
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
        "tm-1",
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

      await service.saveDocumentLabels("tm-1", "labeled-doc-1", dto);

      expect(mockDbService.updateLabeledDocumentStatus).toHaveBeenCalledWith(
        "labeled-doc-1",
        LabelingStatus.in_progress,
      );
    });

    it("should throw NotFoundException when document not found", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(null);

      await expect(
        service.saveDocumentLabels("tm-1", "non-existent", {
          labels: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deleteLabel", () => {
    it("should delete a label", async () => {
      mockDbService.deleteDocumentLabel.mockResolvedValueOnce(true);

      const result = await service.deleteLabel(
        "tm-1",
        "labeled-doc-1",
        "label-1",
      );

      expect(mockDbService.deleteDocumentLabel).toHaveBeenCalledWith("label-1");
      expect(result).toEqual({ success: true, id: "label-1" });
    });

    it("should throw NotFoundException when label not found", async () => {
      mockDbService.deleteDocumentLabel.mockResolvedValueOnce(false);

      await expect(
        service.deleteLabel("tm-1", "labeled-doc-1", "non-existent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ========== OCR DATA ==========

  describe("getDocumentOcr", () => {
    it("should return OCR result for a document", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(
        mockLabeledDocument,
      );

      const result = await service.getDocumentOcr("tm-1", "labeled-doc-1");

      expect(mockDbService.findLabeledDocument).toHaveBeenCalledWith(
        "tm-1",
        "labeled-doc-1",
      );
      expect(result).toEqual(mockLabelingDocument.ocr_result);
    });

    it("should throw NotFoundException when document not found", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(null);

      await expect(
        service.getDocumentOcr("tm-1", "non-existent"),
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
        docWithoutOcr as never,
      );

      await expect(
        service.getDocumentOcr("tm-1", "labeled-doc-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("generateDocumentSuggestions", () => {
    it("should generate suggestions for a document", async () => {
      const suggestions = [
        {
          field_key: "name",
          label_name: "name",
          value: "John Smith",
          page_number: 1,
          element_ids: ["p1-w1", "p1-w2"],
          bounding_box: { polygon: [1, 1, 2, 1, 2, 2, 1, 2] },
          source_type: "keyValuePair",
          confidence: 0.99,
        },
      ];

      mockDbService.findLabeledDocument.mockResolvedValueOnce(
        mockLabeledDocument,
      );
      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);
      mockSuggestionService.generateSuggestions.mockReturnValueOnce(
        suggestions as never,
      );

      const mockIdentity: ResolvedIdentity = { isSystemAdmin: true };
      const result = await service.generateDocumentSuggestions(
        "tm-1",
        "labeled-doc-1",
        mockIdentity,
      );

      expect(mockSuggestionService.generateSuggestions).toHaveBeenCalled();
      expect(result).toEqual(suggestions);
    });

    it("should throw NotFoundException when document not found", async () => {
      mockDbService.findLabeledDocument.mockResolvedValueOnce(null);

      const mockIdentity: ResolvedIdentity = { isSystemAdmin: true };
      await expect(
        service.generateDocumentSuggestions(
          "tm-1",
          "missing-doc",
          mockIdentity,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when OCR result not found", async () => {
      const noOcrDoc = {
        ...mockLabeledDocument,
        labeling_document: {
          ...mockLabelingDocument,
          ocr_result: null,
        },
      } as unknown as LabeledDocumentData;
      mockDbService.findLabeledDocument.mockResolvedValueOnce(noOcrDoc);

      const mockIdentity: ResolvedIdentity = { isSystemAdmin: true };
      await expect(
        service.generateDocumentSuggestions(
          "tm-1",
          "labeled-doc-1",
          mockIdentity,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ========== EXPORT ==========

  describe("exportTemplateModel", () => {
    it("should export template model in AZURE format", async () => {
      const dto: ExportDto = {
        format: ExportFormat.AZURE,
      };

      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);
      mockDbService.findLabeledDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
      ]);

      const result = await service.exportTemplateModel("tm-1", dto);

      expect(mockDbService.findTemplateModel).toHaveBeenCalledWith("tm-1");
      expect(mockDbService.findLabeledDocuments).toHaveBeenCalledWith("tm-1");
      expect(result).toHaveProperty("fieldsJson");
      expect(result).toHaveProperty("labelsFiles");
      expect(result).toHaveProperty(
        "templateModelName",
        "Test Template Model",
      );
    });

    it("should export template model in JSON format", async () => {
      const dto: ExportDto = {
        format: ExportFormat.JSON,
      };

      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);
      mockDbService.findLabeledDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
      ]);

      const result = await service.exportTemplateModel("tm-1", dto);

      expect(result).toHaveProperty("templateModel");
      expect(result).toHaveProperty("documents");
      expect(result).toHaveProperty("exportedAt");
      expect(
        (result as { templateModel: { name: string } }).templateModel.name,
      ).toBe("Test Template Model");
    });

    it("should filter by document IDs when provided", async () => {
      const dto: ExportDto = {
        format: ExportFormat.JSON,
        documentIds: ["labeling-doc-1"],
      };

      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);
      mockDbService.findLabeledDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
        {
          ...mockLabeledDocument,
          labeling_document: {
            ...mockLabelingDocument,
            id: "other-doc",
          },
        } as never,
      ]);

      const result = await service.exportTemplateModel("tm-1", dto);

      expect(
        (result as { documents: { id: string }[] }).documents,
      ).toHaveLength(1);
      expect(
        (result as { documents: { id: string }[] }).documents[0].id,
      ).toBe("labeling-doc-1");
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

      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);
      mockDbService.findLabeledDocuments.mockResolvedValueOnce([
        labeledDoc,
        mockLabeledDocument,
      ]);

      const result = await service.exportTemplateModel("tm-1", dto);

      expect(
        (result as { documents: { status: string }[] }).documents,
      ).toHaveLength(1);
      expect(
        (result as { documents: { status: string }[] }).documents[0].status,
      ).toBe(LabelingStatus.labeled);
    });

    it("should throw NotFoundException when template model not found", async () => {
      mockDbService.findTemplateModel.mockResolvedValueOnce(null);

      await expect(
        service.exportTemplateModel("non-existent", {
          format: ExportFormat.JSON,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("exportAzureFormat", () => {
    it("should format fields correctly for Azure export", async () => {
      const modelWithDateField = {
        ...mockTemplateModel,
        field_schema: [
          ...mockTemplateModel.field_schema,
          {
            id: "field-2",
            field_key: "invoice_date",
            field_type: PrismaFieldType.date,
            field_format: "ymd",
            display_order: 1,
            template_model_id: "tm-1",
          },
        ],
      };

      const dto: ExportDto = {
        format: ExportFormat.AZURE,
      };

      mockDbService.findTemplateModel.mockResolvedValueOnce(modelWithDateField);
      mockDbService.findLabeledDocuments.mockResolvedValueOnce([
        mockLabeledDocument,
      ]);

      const result = await service.exportTemplateModel("tm-1", dto);

      expect(
        (result as { fieldsJson: { fields: unknown[] } }).fieldsJson.fields,
      ).toHaveLength(2);
      expect(
        (result as { fieldsJson: { fields: unknown[] } }).fieldsJson.fields[0],
      ).toEqual({
        fieldKey: "invoice_number",
        fieldType: "string",
      });
      expect(
        (result as { fieldsJson: { fields: unknown[] } }).fieldsJson.fields[1],
      ).toEqual({
        fieldKey: "invoice_date",
        fieldType: "date",
        fieldFormat: "ymd",
      });
    });

    it("should handle selection mark fields correctly", async () => {
      const modelWithCheckbox = {
        ...mockTemplateModel,
        field_schema: [
          {
            id: "field-1",
            field_key: "terms_accepted",
            field_type: PrismaFieldType.selectionMark,
            field_format: null,
            display_order: 0,
            template_model_id: "tm-1",
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

      mockDbService.findTemplateModel.mockResolvedValueOnce(modelWithCheckbox);
      mockDbService.findLabeledDocuments.mockResolvedValueOnce([
        docWithCheckbox,
      ]);

      const result = await service.exportTemplateModel("tm-1", dto);

      type AzureExportResult = {
        labelsFiles: Array<{
          content: {
            labels: Array<{
              value: Array<{ text: string }>;
            }>;
          };
        }>;
      };
      expect(
        (result as AzureExportResult).labelsFiles[0].content.labels[0].value[0]
          .text,
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

      mockDbService.findTemplateModel.mockResolvedValueOnce(mockTemplateModel);
      mockOcrService.createLabelingDocument.mockResolvedValueOnce(
        mockLabelingDocument as never,
      );
      mockDbService.addDocumentToTemplateModel.mockResolvedValueOnce(
        mockLabeledDocument,
      );
      mockOcrService.processOcrForLabelingDocument.mockResolvedValueOnce(
        undefined,
      );

      const result = await service.uploadLabelingDocument("tm-1", dto);

      expect(mockDbService.findTemplateModel).toHaveBeenCalledWith("tm-1");
      expect(mockOcrService.createLabelingDocument).toHaveBeenCalledWith(dto);
      expect(mockDbService.addDocumentToTemplateModel).toHaveBeenCalledWith(
        "tm-1",
        "labeling-doc-1",
      );
      expect(
        mockOcrService.processOcrForLabelingDocument,
      ).toHaveBeenCalledWith("labeling-doc-1");
      expect(result).toEqual({
        labeledDocument: mockLabeledDocument,
        labelingDocument: mockLabelingDocument,
      });
    });

    it("should throw NotFoundException when template model not found", async () => {
      mockDbService.findTemplateModel.mockResolvedValueOnce(null);

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
