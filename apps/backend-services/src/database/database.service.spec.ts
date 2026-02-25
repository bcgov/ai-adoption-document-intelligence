// Mock out the prisma client
jest.mock("@generated/client", () => {
  const DocumentStatus = {
    pre_ocr: "pre_ocr",
    ongoing_ocr: "ongoing_ocr",
    completed_ocr: "completed_ocr",
    failed: "failed",
  };
  const ProjectStatus = {
    active: "active",
    archived: "archived",
  };
  const LabelingStatus = {
    unlabeled: "unlabeled",
    in_progress: "in_progress",
    labeled: "labeled",
    verified: "verified",
  };
  const ReviewStatus = {
    in_progress: "in_progress",
    approved: "approved",
    escalated: "escalated",
    skipped: "skipped",
  };
  const FieldType = {
    string: "string",
    number: "number",
    date: "date",
    boolean: "boolean",
  };
  const TableType = {
    fixed: "fixed",
    dynamic: "dynamic",
  };
  const CorrectionAction = {
    corrected: "corrected",
    confirmed: "confirmed",
    deleted: "deleted",
  };
  return {
    DocumentStatus,
    ProjectStatus,
    LabelingStatus,
    ReviewStatus,
    FieldType,
    TableType,
    CorrectionAction,
    PrismaClient: jest.fn().mockImplementation(() => ({
      document: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      ocrResult: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
      labelingDocument: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      labelingProject: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      fieldDefinition: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
      labeledDocument: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      documentLabel: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        delete: jest.fn(),
      },
      reviewSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      fieldCorrection: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((arg) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        return Promise.resolve();
      }),
    })),
  };
});

import {
  CorrectionAction,
  DocumentStatus,
  FieldType,
  LabelingStatus,
  OcrResult,
  ProjectStatus,
  ReviewStatus,
} from "@generated/client";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { JsonValue } from "@prisma/client/runtime/client";
import { AnalysisResponse, AnalysisResult } from "../ocr/azure-types";
import { DatabaseService } from "./database.service";
import { DocumentDbService } from "./document-db.service";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import { LabelingProjectDbService } from "./labeling-project-db.service";
import { PrismaService } from "./prisma.service";
import { ReviewDbService } from "./review-db.service";

const defaultDocument = {
  title: "Test",
  original_filename: "file.pdf",
  file_path: "/tmp/file.pdf",
  file_type: "pdf",
  file_size: 123,
  metadata: {},
  source: "upload",
  status: DocumentStatus.pre_ocr,
};

const defaultOcrResult: OcrResult = {
  id: "123",
  processed_at: new Date(),
  keyValuePairs: {
    field1: { type: "string", content: "value1", confidence: 0.95 },
  },
  document_id: "456",
  enrichment_summary: null,
};

const analysisResult: AnalysisResult = {
  apiVersion: "v1",
  modelId: "layout",
  stringIndexType: "",
  content: "a bunch of content",
  pages: [],
  tables: [],
  paragraphs: [],
  styles: [],
  contentFormat: "json",
  sections: [],
  figures: [],
  keyValuePairs: [
    {
      key: {
        content: "field1",
        boundingRegions: [],
        spans: [],
      },
      value: {
        content: "value1",
        boundingRegions: [],
        spans: [],
      },
      confidence: 0.95,
    },
  ],
};
const analysisResponse: AnalysisResponse = {
  status: "200",
  analyzeResult: analysisResult,
  lastUpdatedDateTime: Date.now().toString(),
  createdDateTime: Date.now().toString(),
};

const defaultLabelingDocument = {
  id: "labeling-doc-1",
  title: "Test Labeling Doc",
  original_filename: "label-file.pdf",
  file_path: "/tmp/label-file.pdf",
  file_type: "pdf",
  file_size: 456,
  metadata: {},
  source: "upload",
  status: DocumentStatus.completed_ocr,
  created_at: new Date(),
  updated_at: new Date(),
  apim_request_id: "req-123",
  model_id: "model-1",
  ocr_result: {},
};

const defaultLabelingProject = {
  id: "project-1",
  name: "Test Project",
  description: "Test description",
  status: ProjectStatus.active,
  created_by: "user-1",
  created_at: new Date(),
  updated_at: new Date(),
  field_schema: [],
};

const defaultFieldDefinition = {
  id: "field-1",
  project_id: "project-1",
  field_key: "invoice_number",
  field_type: FieldType.string,
  field_format: null,
  display_order: 0,
  created_at: new Date(),
  updated_at: new Date(),
};

const defaultLabeledDocument = {
  id: "labeled-doc-1",
  project_id: "project-1",
  labeling_document_id: "labeling-doc-1",
  status: LabelingStatus.unlabeled,
  created_at: new Date(),
  updated_at: new Date(),
  labeling_document: defaultLabelingDocument,
  labels: [],
};

const defaultDocumentLabel = {
  id: "label-1",
  labeled_doc_id: "labeled-doc-1",
  field_key: "invoice_number",
  label_name: "Invoice Number",
  value: "INV-12345",
  page_number: 1,
  bounding_box: { x: 0, y: 0, width: 100, height: 20 },
  created_at: new Date(),
};

const defaultReviewSession = {
  id: "session-1",
  document_id: "doc-1",
  reviewer_id: "reviewer-1",
  status: ReviewStatus.in_progress,
  started_at: new Date(),
  completed_at: null,
  document: {
    ...defaultDocument,
    id: "doc-1",
    ocr_result: defaultOcrResult,
  },
  corrections: [],
};

const defaultFieldCorrection = {
  id: "correction-1",
  session_id: "session-1",
  field_key: "invoice_number",
  original_value: "INV-123",
  corrected_value: "INV-12345",
  original_conf: 0.8,
  action: CorrectionAction.corrected,
  created_at: new Date(),
};

describe("DatabaseService", () => {
  let service: DatabaseService;
  let mockPrisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        DocumentDbService,
        LabelingDocumentDbService,
        LabelingProjectDbService,
        ReviewDbService,
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                DATABASE_URL: "http://my-db",
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    mockPrisma = service.prisma;
  });

  describe("createDocument", () => {
    it("should create a document", async () => {
      const createdDoc = { ...defaultDocument, id: "1" };
      mockPrisma.document.create.mockResolvedValueOnce(createdDoc);

      const result = await service.createDocument(defaultDocument as any);
      expect(result).toEqual(createdDoc);
      expect(mockPrisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining(defaultDocument),
      });
    });

    it("should re-throw an Error if that error is thrown within", async () => {
      // Throw error from prisma create for this test
      mockPrisma.document.create.mockImplementationOnce(() => {
        throw new Error("Prisma error");
      });
      await expect(
        service.createDocument(defaultDocument as any),
      ).rejects.toThrow("Prisma error");
    });
  });

  describe("findDocument", () => {
    it("should return the document requested by id", async () => {
      const testDocument = { ...defaultDocument, id: "1" };
      mockPrisma.document.findUnique.mockResolvedValueOnce(testDocument);
      const result = await service.findDocument("1");
      expect(result).toEqual(testDocument);
    });

    it("should return null if Prisma fails to find a document", async () => {
      mockPrisma.document.findUnique.mockResolvedValueOnce(null);
      const result = await service.findDocument("1");
      expect(result).toBeNull();
    });

    it("should re-throw an Error if that error is thrown within", async () => {
      // Throw error from prisma create for this test
      mockPrisma.document.findUnique.mockImplementationOnce(() => {
        throw new Error("Prisma error");
      });
      await expect(service.findDocument("1")).rejects.toThrow("Prisma error");
    });
  });

  describe("findAllDocuments", () => {
    it("should return a list of documents", async () => {
      const testDocument = { ...defaultDocument, id: "1" };
      mockPrisma.document.findMany.mockResolvedValueOnce([testDocument]);
      const result = await service.findAllDocuments();
      expect(result).toEqual([testDocument]);
    });

    it("should re-throw an Error if that error is thrown within", async () => {
      // Throw error from prisma create for this test
      mockPrisma.document.findMany.mockImplementationOnce(() => {
        throw new Error("Prisma error");
      });
      await expect(service.findAllDocuments()).rejects.toThrow("Prisma error");
    });
  });

  describe("updateDocument", () => {
    const testDocument = { ...defaultDocument, id: "1" };
    it("should return the updated document", async () => {
      mockPrisma.document.update.mockResolvedValueOnce(testDocument);
      const result = await service.updateDocument("1", testDocument);
      expect(result).toEqual(testDocument);
    });

    it("should return null when Prisma throws a NotFound error", async () => {
      mockPrisma.document.update.mockImplementationOnce(() => {
        throw {
          name: "PrismaClientKnownRequestError",
          code: "P2025",
          message: "No Document found", // mimic relevant message
          meta: {}, // can add more as needed
        };
      });
      const result = await service.updateDocument("1", testDocument);
      expect(result).toBeNull();
    });

    it("should re-throw an error caught in the try/catch block", async () => {
      mockPrisma.document.update.mockImplementationOnce(() => {
        throw new Error("oops");
      });
      await expect(service.updateDocument("1", testDocument)).rejects.toThrow(
        "oops",
      );
    });
  });

  describe("findOcrResult", () => {
    it("should return an OCR result", async () => {
      mockPrisma.ocrResult.findFirst.mockResolvedValueOnce(defaultOcrResult);
      const result = await service.findOcrResult("123");
      expect(result).toEqual(defaultOcrResult);
    });

    it("should return null if OCR results not found", async () => {
      mockPrisma.ocrResult.findFirst.mockResolvedValueOnce(null);
      const result = await service.findOcrResult("123");
      expect(result).toBeNull();
      expect(mockPrisma.ocrResult.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe("upsertOcrResult", () => {
    it("should attempt to upsert the results and return nothing", async () => {
      const result = await service.upsertOcrResult({
        documentId: "123",
        analysisResponse,
      });
      expect(result).toBeUndefined();
      expect(mockPrisma.ocrResult.upsert).toHaveBeenCalledTimes(1);

      // The service converts keyValuePairs to ExtractedFields format
      // Expected: { field1: { type: "string", content: "value1", confidence: 0.95, ... } }
      const expectedExtractedFields = {
        field1: expect.objectContaining({
          type: "string",
          content: "value1",
          confidence: 0.95,
        }),
      };

      expect(mockPrisma.ocrResult.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            document_id: "123",
          },
          update: expect.objectContaining({
            processed_at: analysisResponse.lastUpdatedDateTime,
            keyValuePairs: expectedExtractedFields,
          }),
          create: expect.objectContaining({
            document_id: "123",
            processed_at: analysisResponse.lastUpdatedDateTime,
            keyValuePairs: expectedExtractedFields,
          }),
        }),
      );
    });

    it("should re-throw an error caught within", async () => {
      mockPrisma.ocrResult.upsert.mockImplementationOnce(() => {
        throw new Error("oops");
      });
      expect(
        service.upsertOcrResult({ documentId: "123", analysisResponse }),
      ).rejects.toThrow("oops");
    });
  });

  describe("createLabelingDocument", () => {
    it("should create a labeling document", async () => {
      mockPrisma.labelingDocument.create.mockResolvedValueOnce(
        defaultLabelingDocument,
      );
      const result = await service.createLabelingDocument({
        title: defaultLabelingDocument.title,
        original_filename: defaultLabelingDocument.original_filename,
        file_path: defaultLabelingDocument.file_path,
        file_type: defaultLabelingDocument.file_type,
        file_size: defaultLabelingDocument.file_size,
        metadata: defaultLabelingDocument.metadata,
        source: defaultLabelingDocument.source,
        status: defaultLabelingDocument.status,
        apim_request_id: defaultLabelingDocument.apim_request_id,
        model_id: defaultLabelingDocument.model_id,
        ocr_result: defaultLabelingDocument.ocr_result,
        group_id: "group-1",
      });
      expect(result).toEqual(defaultLabelingDocument);
      expect(mockPrisma.labelingDocument.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("findLabelingDocument", () => {
    it("should return a labeling document by id", async () => {
      mockPrisma.labelingDocument.findUnique.mockResolvedValueOnce(
        defaultLabelingDocument,
      );
      const result = await service.findLabelingDocument("labeling-doc-1");
      expect(result).toEqual(defaultLabelingDocument);
      expect(mockPrisma.labelingDocument.findUnique).toHaveBeenCalledWith({
        where: { id: "labeling-doc-1" },
      });
    });

    it("should return null if labeling document not found", async () => {
      mockPrisma.labelingDocument.findUnique.mockResolvedValueOnce(null);
      const result = await service.findLabelingDocument("not-found");
      expect(result).toBeNull();
    });
  });

  describe("updateLabelingDocument", () => {
    it("should update a labeling document", async () => {
      const updatedDoc = {
        ...defaultLabelingDocument,
        title: "Updated Title",
      };
      mockPrisma.labelingDocument.update.mockResolvedValueOnce(updatedDoc);
      const result = await service.updateLabelingDocument("labeling-doc-1", {
        title: "Updated Title",
      });
      expect(result).toEqual(updatedDoc);
      expect(mockPrisma.labelingDocument.update).toHaveBeenCalledWith({
        where: { id: "labeling-doc-1" },
        data: expect.objectContaining({
          title: "Updated Title",
          updated_at: expect.any(Date),
        }),
      });
    });

    it("should return null when document not found (P2025 error)", async () => {
      mockPrisma.labelingDocument.update.mockImplementationOnce(() => {
        throw { code: "P2025" };
      });
      const result = await service.updateLabelingDocument("not-found", {
        title: "Updated",
      });
      expect(result).toBeNull();
    });

    it("should re-throw non-P2025 errors", async () => {
      mockPrisma.labelingDocument.update.mockImplementationOnce(() => {
        throw new Error("Database error");
      });
      await expect(
        service.updateLabelingDocument("labeling-doc-1", { title: "Updated" }),
      ).rejects.toThrow("Database error");
    });
  });

  describe("createLabelingProject", () => {
    it("should create a labeling project", async () => {
      mockPrisma.labelingProject.create.mockResolvedValueOnce(
        defaultLabelingProject,
      );
      const result = await service.createLabelingProject({
        name: "Test Project",
        description: "Test description",
        created_by: "user-1",
        group_id: "group-1",
      });
      expect(result).toEqual(defaultLabelingProject);
      expect(mockPrisma.labelingProject.create).toHaveBeenCalledWith({
        data: {
          name: "Test Project",
          description: "Test description",
          created_by: "user-1",
          group_id: "group-1",
          status: ProjectStatus.active,
        },
        include: {
          field_schema: { orderBy: { display_order: "asc" } },
        },
      });
    });
  });

  describe("findLabelingProject", () => {
    it("should return a labeling project by id", async () => {
      const projectWithDocs = {
        ...defaultLabelingProject,
        documents: [defaultLabeledDocument],
      };
      mockPrisma.labelingProject.findUnique.mockResolvedValueOnce(
        projectWithDocs,
      );
      const result = await service.findLabelingProject("project-1");
      expect(result).toEqual(projectWithDocs);
      expect(mockPrisma.labelingProject.findUnique).toHaveBeenCalledWith({
        where: { id: "project-1" },
        include: {
          field_schema: { orderBy: { display_order: "asc" } },
          documents: {
            include: {
              labeling_document: true,
              labels: true,
            },
          },
        },
      });
    });

    it("should return null if project not found", async () => {
      mockPrisma.labelingProject.findUnique.mockResolvedValueOnce(null);
      const result = await service.findLabelingProject("not-found");
      expect(result).toBeNull();
    });
  });

  describe("findAllLabelingProjects", () => {
    it("should return all labeling projects", async () => {
      mockPrisma.labelingProject.findMany.mockResolvedValueOnce([
        defaultLabelingProject,
      ]);
      const result = await service.findAllLabelingProjects();
      expect(result).toEqual([defaultLabelingProject]);
      expect(mockPrisma.labelingProject.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { updated_at: "desc" },
        include: {
          field_schema: { orderBy: { display_order: "asc" } },
          _count: { select: { documents: true } },
        },
      });
    });

    it("should filter by userId when provided", async () => {
      mockPrisma.labelingProject.findMany.mockResolvedValueOnce([
        defaultLabelingProject,
      ]);
      const result = await service.findAllLabelingProjects("user-1");
      expect(result).toEqual([defaultLabelingProject]);
      expect(mockPrisma.labelingProject.findMany).toHaveBeenCalledWith({
        where: { created_by: "user-1" },
        orderBy: { updated_at: "desc" },
        include: {
          field_schema: { orderBy: { display_order: "asc" } },
          _count: { select: { documents: true } },
        },
      });
    });
  });

  describe("updateLabelingProject", () => {
    it("should update a labeling project", async () => {
      const updatedProject = {
        ...defaultLabelingProject,
        name: "Updated Project",
      };
      mockPrisma.labelingProject.update.mockResolvedValueOnce(updatedProject);
      const result = await service.updateLabelingProject("project-1", {
        name: "Updated Project",
      });
      expect(result).toEqual(updatedProject);
      expect(mockPrisma.labelingProject.update).toHaveBeenCalledWith({
        where: { id: "project-1" },
        data: { name: "Updated Project" },
        include: {
          field_schema: { orderBy: { display_order: "asc" } },
        },
      });
    });

    it("should return null when project not found (P2025 error)", async () => {
      mockPrisma.labelingProject.update.mockImplementationOnce(() => {
        throw { code: "P2025" };
      });
      const result = await service.updateLabelingProject("not-found", {
        name: "Updated",
      });
      expect(result).toBeNull();
    });

    it("should re-throw non-P2025 errors", async () => {
      mockPrisma.labelingProject.update.mockImplementationOnce(() => {
        throw new Error("Database error");
      });
      await expect(
        service.updateLabelingProject("project-1", { name: "Updated" }),
      ).rejects.toThrow("Database error");
    });
  });

  describe("deleteLabelingProject", () => {
    it("should delete a labeling project and return true", async () => {
      mockPrisma.labelingProject.delete.mockResolvedValueOnce(
        defaultLabelingProject,
      );
      const result = await service.deleteLabelingProject("project-1");
      expect(result).toBe(true);
      expect(mockPrisma.labelingProject.delete).toHaveBeenCalledWith({
        where: { id: "project-1" },
      });
    });

    it("should return false when project not found (P2025 error)", async () => {
      mockPrisma.labelingProject.delete.mockImplementationOnce(() => {
        throw { code: "P2025" };
      });
      const result = await service.deleteLabelingProject("not-found");
      expect(result).toBe(false);
    });

    it("should re-throw non-P2025 errors", async () => {
      mockPrisma.labelingProject.delete.mockImplementationOnce(() => {
        throw new Error("Database error");
      });
      await expect(service.deleteLabelingProject("project-1")).rejects.toThrow(
        "Database error",
      );
    });
  });

  describe("createFieldDefinition", () => {
    it("should create a field definition with auto-incremented display_order", async () => {
      mockPrisma.fieldDefinition.aggregate.mockResolvedValueOnce({
        _max: { display_order: 2 },
      });
      mockPrisma.fieldDefinition.create.mockResolvedValueOnce(
        defaultFieldDefinition,
      );
      const result = await service.createFieldDefinition("project-1", {
        field_key: "invoice_number",
        field_type: FieldType.string,
      });
      expect(result).toEqual(defaultFieldDefinition);
      expect(mockPrisma.fieldDefinition.aggregate).toHaveBeenCalledWith({
        where: { project_id: "project-1" },
        _max: { display_order: true },
      });
      expect(mockPrisma.fieldDefinition.create).toHaveBeenCalledWith({
        data: {
          project_id: "project-1",
          field_key: "invoice_number",
          field_type: FieldType.string,
          field_format: undefined,
          display_order: 3,
        },
      });
    });

    it("should create a field definition with provided display_order", async () => {
      mockPrisma.fieldDefinition.create.mockResolvedValueOnce(
        defaultFieldDefinition,
      );
      const result = await service.createFieldDefinition("project-1", {
        field_key: "invoice_number",
        field_type: FieldType.string,
        display_order: 5,
      });
      expect(result).toEqual(defaultFieldDefinition);
      expect(mockPrisma.fieldDefinition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          display_order: 5,
        }),
      });
    });

    it("should handle first field creation (no existing fields)", async () => {
      mockPrisma.fieldDefinition.aggregate.mockResolvedValueOnce({
        _max: { display_order: null },
      });
      mockPrisma.fieldDefinition.create.mockResolvedValueOnce(
        defaultFieldDefinition,
      );
      const result = await service.createFieldDefinition("project-1", {
        field_key: "invoice_number",
        field_type: FieldType.string,
      });
      expect(result).toEqual(defaultFieldDefinition);
      expect(mockPrisma.fieldDefinition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          display_order: 0,
        }),
      });
    });
  });

  describe("updateFieldDefinition", () => {
    it("should update a field definition", async () => {
      const updatedField = {
        ...defaultFieldDefinition,
        field_format: "MM/DD/YYYY",
      };
      mockPrisma.fieldDefinition.update.mockResolvedValueOnce(updatedField);
      const result = await service.updateFieldDefinition("field-1", {
        field_format: "MM/DD/YYYY",
      });
      expect(result).toEqual(updatedField);
      expect(mockPrisma.fieldDefinition.update).toHaveBeenCalledWith({
        where: { id: "field-1" },
        data: {
          field_format: "MM/DD/YYYY",
        },
      });
    });

    it("should return null when field not found (P2025 error)", async () => {
      mockPrisma.fieldDefinition.update.mockImplementationOnce(() => {
        throw { code: "P2025" };
      });
      const result = await service.updateFieldDefinition("not-found", {
        field_format: "MM/DD/YYYY",
      });
      expect(result).toBeNull();
    });

    it("should re-throw non-P2025 errors", async () => {
      mockPrisma.fieldDefinition.update.mockImplementationOnce(() => {
        throw new Error("Database error");
      });
      await expect(
        service.updateFieldDefinition("field-1", {
          field_format: "MM/DD/YYYY",
        }),
      ).rejects.toThrow("Database error");
    });
  });

  describe("deleteFieldDefinition", () => {
    it("should delete a field definition and return true", async () => {
      mockPrisma.fieldDefinition.delete.mockResolvedValueOnce(
        defaultFieldDefinition,
      );
      const result = await service.deleteFieldDefinition("field-1");
      expect(result).toBe(true);
      expect(mockPrisma.fieldDefinition.delete).toHaveBeenCalledWith({
        where: { id: "field-1" },
      });
    });

    it("should return false when field not found (P2025 error)", async () => {
      mockPrisma.fieldDefinition.delete.mockImplementationOnce(() => {
        throw { code: "P2025" };
      });
      const result = await service.deleteFieldDefinition("not-found");
      expect(result).toBe(false);
    });

    it("should re-throw non-P2025 errors", async () => {
      mockPrisma.fieldDefinition.delete.mockImplementationOnce(() => {
        throw new Error("Database error");
      });
      await expect(service.deleteFieldDefinition("field-1")).rejects.toThrow(
        "Database error",
      );
    });
  });

  describe("addDocumentToProject", () => {
    it("should add a document to a project", async () => {
      mockPrisma.labeledDocument.create.mockResolvedValueOnce(
        defaultLabeledDocument,
      );
      const result = await service.addDocumentToProject(
        "project-1",
        "labeling-doc-1",
      );
      expect(result).toEqual(defaultLabeledDocument);
      expect(mockPrisma.labeledDocument.create).toHaveBeenCalledWith({
        data: {
          project_id: "project-1",
          labeling_document_id: "labeling-doc-1",
          status: LabelingStatus.unlabeled,
        },
        include: {
          labeling_document: true,
          labels: true,
        },
      });
    });
  });

  describe("findLabeledDocument", () => {
    it("should find a labeled document", async () => {
      mockPrisma.labeledDocument.findUnique.mockResolvedValueOnce(
        defaultLabeledDocument,
      );
      const result = await service.findLabeledDocument(
        "project-1",
        "labeling-doc-1",
      );
      expect(result).toEqual(defaultLabeledDocument);
      expect(mockPrisma.labeledDocument.findUnique).toHaveBeenCalledWith({
        where: {
          project_id_labeling_document_id: {
            project_id: "project-1",
            labeling_document_id: "labeling-doc-1",
          },
        },
        include: {
          labeling_document: true,
          labels: true,
        },
      });
    });

    it("should return null if labeled document not found", async () => {
      mockPrisma.labeledDocument.findUnique.mockResolvedValueOnce(null);
      const result = await service.findLabeledDocument(
        "project-1",
        "not-found",
      );
      expect(result).toBeNull();
    });
  });

  describe("findLabeledDocuments", () => {
    it("should find all labeled documents for a project", async () => {
      mockPrisma.labeledDocument.findMany.mockResolvedValueOnce([
        defaultLabeledDocument,
      ]);
      const result = await service.findLabeledDocuments("project-1");
      expect(result).toEqual([defaultLabeledDocument]);
      expect(mockPrisma.labeledDocument.findMany).toHaveBeenCalledWith({
        where: { project_id: "project-1" },
        orderBy: { created_at: "desc" },
        include: {
          labeling_document: true,
          labels: true,
        },
      });
    });
  });

  describe("removeDocumentFromProject", () => {
    it("should remove a document from a project and return true", async () => {
      mockPrisma.labeledDocument.delete.mockResolvedValueOnce(
        defaultLabeledDocument,
      );
      const result = await service.removeDocumentFromProject(
        "project-1",
        "labeling-doc-1",
      );
      expect(result).toBe(true);
      expect(mockPrisma.labeledDocument.delete).toHaveBeenCalledWith({
        where: {
          project_id_labeling_document_id: {
            project_id: "project-1",
            labeling_document_id: "labeling-doc-1",
          },
        },
      });
    });

    it("should return false when document not found (P2025 error)", async () => {
      mockPrisma.labeledDocument.delete.mockImplementationOnce(() => {
        throw { code: "P2025" };
      });
      const result = await service.removeDocumentFromProject(
        "project-1",
        "not-found",
      );
      expect(result).toBe(false);
    });

    it("should re-throw non-P2025 errors", async () => {
      mockPrisma.labeledDocument.delete.mockImplementationOnce(() => {
        throw new Error("Database error");
      });
      await expect(
        service.removeDocumentFromProject("project-1", "labeling-doc-1"),
      ).rejects.toThrow("Database error");
    });
  });

  describe("updateLabeledDocumentStatus", () => {
    it("should update the status of a labeled document", async () => {
      mockPrisma.labeledDocument.update.mockResolvedValueOnce({
        ...defaultLabeledDocument,
        status: LabelingStatus.labeled,
      });
      await service.updateLabeledDocumentStatus(
        "labeled-doc-1",
        LabelingStatus.labeled,
      );
      expect(mockPrisma.labeledDocument.update).toHaveBeenCalledWith({
        where: { id: "labeled-doc-1" },
        data: { status: LabelingStatus.labeled },
      });
    });
  });

  describe("saveDocumentLabels", () => {
    it("should delete existing labels and create new ones", async () => {
      const labels = [
        {
          field_key: "invoice_number",
          label_name: "Invoice Number",
          value: "INV-12345",
          page_number: 1,
          bounding_box: { x: 0, y: 0, width: 100, height: 20 },
        },
      ];
      mockPrisma.documentLabel.findMany.mockResolvedValueOnce([
        defaultDocumentLabel,
      ]);
      const result = await service.saveDocumentLabels("labeled-doc-1", labels);
      expect(result).toEqual([defaultDocumentLabel]);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.documentLabel.findMany).toHaveBeenCalledWith({
        where: { labeled_doc_id: "labeled-doc-1" },
      });
    });
  });

  describe("deleteDocumentLabel", () => {
    it("should delete a document label and return true", async () => {
      mockPrisma.documentLabel.delete.mockResolvedValueOnce(
        defaultDocumentLabel,
      );
      const result = await service.deleteDocumentLabel("label-1");
      expect(result).toBe(true);
      expect(mockPrisma.documentLabel.delete).toHaveBeenCalledWith({
        where: { id: "label-1" },
      });
    });

    it("should return false when label not found (P2025 error)", async () => {
      mockPrisma.documentLabel.delete.mockImplementationOnce(() => {
        throw { code: "P2025" };
      });
      const result = await service.deleteDocumentLabel("not-found");
      expect(result).toBe(false);
    });

    it("should re-throw non-P2025 errors", async () => {
      mockPrisma.documentLabel.delete.mockImplementationOnce(() => {
        throw new Error("Database error");
      });
      await expect(service.deleteDocumentLabel("label-1")).rejects.toThrow(
        "Database error",
      );
    });
  });

  describe("createReviewSession", () => {
    it("should create a review session", async () => {
      mockPrisma.reviewSession.create.mockResolvedValueOnce(
        defaultReviewSession,
      );
      const result = await service.createReviewSession("doc-1", "reviewer-1");
      expect(result).toEqual(defaultReviewSession);
      expect(mockPrisma.reviewSession.create).toHaveBeenCalledWith({
        data: {
          document_id: "doc-1",
          reviewer_id: "reviewer-1",
          status: ReviewStatus.in_progress,
        },
        include: {
          document: {
            include: {
              ocr_result: true,
            },
          },
          corrections: true,
        },
      });
    });
  });

  describe("findReviewSession", () => {
    it("should find a review session by id", async () => {
      mockPrisma.reviewSession.findUnique.mockResolvedValueOnce(
        defaultReviewSession,
      );
      const result = await service.findReviewSession("session-1");
      expect(result).toEqual(defaultReviewSession);
      expect(mockPrisma.reviewSession.findUnique).toHaveBeenCalledWith({
        where: { id: "session-1" },
        include: {
          document: {
            include: {
              ocr_result: true,
            },
          },
          corrections: true,
        },
      });
    });

    it("should return null if session not found", async () => {
      mockPrisma.reviewSession.findUnique.mockResolvedValueOnce(null);
      const result = await service.findReviewSession("not-found");
      expect(result).toBeNull();
    });
  });

  describe("findReviewQueue", () => {
    it("should find documents in the review queue with default filters", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([defaultDocument]);
      const result = await service.findReviewQueue({});
      expect(result).toEqual([defaultDocument]);
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith({
        where: {
          status: DocumentStatus.completed_ocr,
        },
        orderBy: { created_at: "desc" },
        take: 50,
        skip: 0,
        include: {
          ocr_result: true,
          review_sessions: expect.any(Object),
        },
      });
    });

    it("should filter by modelId", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      await service.findReviewQueue({ modelId: "model-1" });
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            model_id: "model-1",
          }),
        }),
      );
    });

    it("should filter by reviewStatus=pending", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      await service.findReviewQueue({ reviewStatus: "pending" });
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        }),
      );
    });

    it("should filter by reviewStatus=reviewed", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      await service.findReviewQueue({ reviewStatus: "reviewed" });
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            review_sessions: expect.objectContaining({
              some: expect.any(Object),
            }),
          }),
        }),
      );
    });

    it("should apply limit and offset", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([]);
      await service.findReviewQueue({ limit: 10, offset: 20 });
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });
  });

  describe("updateReviewSession", () => {
    it("should update a review session", async () => {
      const updatedSession = {
        ...defaultReviewSession,
        status: ReviewStatus.approved,
      };
      mockPrisma.reviewSession.update.mockResolvedValueOnce(updatedSession);
      const result = await service.updateReviewSession("session-1", {
        status: ReviewStatus.approved,
      });
      expect(result).toEqual(updatedSession);
      expect(mockPrisma.reviewSession.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { status: ReviewStatus.approved },
        include: {
          document: true,
          corrections: true,
        },
      });
    });

    it("should return null when session not found (P2025 error)", async () => {
      mockPrisma.reviewSession.update.mockImplementationOnce(() => {
        throw { code: "P2025" };
      });
      const result = await service.updateReviewSession("not-found", {
        status: ReviewStatus.approved,
      });
      expect(result).toBeNull();
    });

    it("should re-throw non-P2025 errors", async () => {
      mockPrisma.reviewSession.update.mockImplementationOnce(() => {
        throw new Error("Database error");
      });
      await expect(
        service.updateReviewSession("session-1", {
          status: ReviewStatus.approved,
        }),
      ).rejects.toThrow("Database error");
    });
  });

  describe("createFieldCorrection", () => {
    it("should create a field correction", async () => {
      mockPrisma.fieldCorrection.create.mockResolvedValueOnce(
        defaultFieldCorrection,
      );
      const result = await service.createFieldCorrection("session-1", {
        field_key: "invoice_number",
        original_value: "INV-123",
        corrected_value: "INV-12345",
        original_conf: 0.8,
        action: CorrectionAction.corrected,
      });
      expect(result).toEqual(defaultFieldCorrection);
      expect(mockPrisma.fieldCorrection.create).toHaveBeenCalledWith({
        data: {
          session_id: "session-1",
          field_key: "invoice_number",
          original_value: "INV-123",
          corrected_value: "INV-12345",
          original_conf: 0.8,
          action: CorrectionAction.corrected,
        },
      });
    });
  });

  describe("findSessionCorrections", () => {
    it("should find all corrections for a session", async () => {
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce([
        defaultFieldCorrection,
      ]);
      const result = await service.findSessionCorrections("session-1");
      expect(result).toEqual([defaultFieldCorrection]);
      expect(mockPrisma.fieldCorrection.findMany).toHaveBeenCalledWith({
        where: { session_id: "session-1" },
        orderBy: { created_at: "asc" },
      });
    });
  });

  describe("getReviewAnalytics", () => {
    it("should return analytics for review sessions", async () => {
      const sessions = [
        { ...defaultReviewSession, status: ReviewStatus.approved },
        { ...defaultReviewSession, status: ReviewStatus.in_progress },
      ];
      const corrections = [
        {
          ...defaultFieldCorrection,
          action: CorrectionAction.corrected,
          original_conf: 0.85,
        },
        {
          ...defaultFieldCorrection,
          action: CorrectionAction.confirmed,
          original_conf: 0.95,
        },
      ];
      mockPrisma.reviewSession.findMany.mockResolvedValueOnce(sessions);
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce(corrections);

      const result = await service.getReviewAnalytics({});
      expect(result).toEqual({
        totalSessions: 2,
        completedSessions: 1,
        totalCorrections: 2,
        correctionsByAction: {
          [CorrectionAction.corrected]: 1,
          [CorrectionAction.confirmed]: 1,
        },
        averageConfidence: 0.9,
      });
    });

    it("should calculate average confidence correctly", async () => {
      const corrections = [
        { ...defaultFieldCorrection, original_conf: 0.8 },
        { ...defaultFieldCorrection, original_conf: 0.9 },
        { ...defaultFieldCorrection, original_conf: 0.7 },
      ];
      mockPrisma.reviewSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce(corrections);

      const result = await service.getReviewAnalytics({});
      expect(result.averageConfidence).toBeCloseTo(0.8, 4);
    });

    it("should handle corrections without confidence values", async () => {
      const corrections = [
        { ...defaultFieldCorrection, original_conf: 0.9 },
        { ...defaultFieldCorrection, original_conf: null },
        { ...defaultFieldCorrection, original_conf: undefined },
      ];
      mockPrisma.reviewSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce(corrections);

      const result = await service.getReviewAnalytics({});
      expect(result.averageConfidence).toBe(0.9);
    });

    it("should return 0 average confidence when no corrections have confidence", async () => {
      const corrections = [
        { ...defaultFieldCorrection, original_conf: null },
        { ...defaultFieldCorrection, original_conf: undefined },
      ];
      mockPrisma.reviewSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce(corrections);

      const result = await service.getReviewAnalytics({});
      expect(result.averageConfidence).toBe(0);
    });

    it("should filter by date range", async () => {
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-12-31");
      mockPrisma.reviewSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce([]);

      await service.getReviewAnalytics({ startDate, endDate });
      expect(mockPrisma.reviewSession.findMany).toHaveBeenCalledWith({
        where: {
          started_at: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
    });

    it("should filter by reviewerId", async () => {
      mockPrisma.reviewSession.findMany.mockResolvedValueOnce([]);
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce([]);

      await service.getReviewAnalytics({ reviewerId: "reviewer-1" });
      expect(mockPrisma.reviewSession.findMany).toHaveBeenCalledWith({
        where: {
          reviewer_id: "reviewer-1",
        },
      });
    });
  });
});
