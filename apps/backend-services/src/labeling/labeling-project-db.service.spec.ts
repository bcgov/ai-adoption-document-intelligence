// Mock out the prisma client
jest.mock("@generated/client", () => {
  const ProjectStatus = {
    active: "active",
    archived: "archived",
  };
  const LabelingStatus = {
    unlabeled: "unlabeled",
    in_progress: "in_progress",
    labeled: "labeled",
  };
  const FieldType = {
    string: "string",
    date: "date",
    number: "number",
    selectionMark: "selectionMark",
  };
  return {
    ProjectStatus,
    LabelingStatus,
    FieldType,
    PrismaClient: jest.fn().mockImplementation(() => ({
      labelingProject: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      fieldDefinition: {
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
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
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((arg: unknown) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        return Promise.resolve();
      }),
    })),
  };
});

import { FieldType, LabelingStatus, ProjectStatus } from "@generated/client";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { LabelingProjectDbService } from "./labeling-project-db.service";

type MockPrisma = {
  labelingProject: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  fieldDefinition: {
    aggregate: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  labeledDocument: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  documentLabel: {
    create: jest.Mock;
    findMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe("LabelingProjectDbService", () => {
  let service: LabelingProjectDbService;
  let mockPrisma: MockPrisma;

  const defaultProject = {
    id: "project-1",
    name: "Test Project",
    description: "Test description",
    status: ProjectStatus.active,
    created_by: "user-1",
    group_id: "group-1",
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

  const defaultLabelingDocument = {
    id: "labeling-doc-1",
    title: "Test Doc",
    original_filename: "doc.pdf",
    file_path: "/tmp/doc.pdf",
    file_type: "pdf",
    file_size: 500,
    metadata: {},
    source: "upload",
    status: "completed_ocr",
    created_at: new Date(),
    updated_at: new Date(),
    apim_request_id: null,
    model_id: "model-1",
    ocr_result: {},
    group_id: "group-1",
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
    value: "INV-001",
    page_number: 1,
    bounding_box: { polygon: [0, 0, 1, 0, 1, 1, 0, 1] },
    created_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        LabelingProjectDbService,
        { provide: AppLoggerService, useValue: mockAppLogger },
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

    service = module.get<LabelingProjectDbService>(LabelingProjectDbService);
    const prismaService = module.get<PrismaService>(PrismaService);
    mockPrisma = prismaService.prisma as unknown as MockPrisma;
  });

  describe("createLabelingProject", () => {
    it("should create a labeling project", async () => {
      mockPrisma.labelingProject.create.mockResolvedValueOnce(defaultProject);

      const result = await service.createLabelingProject({
        name: "Test Project",
        description: "Test description",
        created_by: "user-1",
        group_id: "group-1",
      });

      expect(result).toEqual(defaultProject);
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
        ...defaultProject,
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
        defaultProject,
      ]);

      const result = await service.findAllLabelingProjects();

      expect(result).toEqual([defaultProject]);
      expect(mockPrisma.labelingProject.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { updated_at: "desc" },
        include: {
          field_schema: { orderBy: { display_order: "asc" } },
          _count: { select: { documents: true } },
        },
      });
    });

    it("should filter by group IDs when provided", async () => {
      mockPrisma.labelingProject.findMany.mockResolvedValueOnce([
        defaultProject,
      ]);

      const result = await service.findAllLabelingProjects(["group-1"]);

      expect(result).toEqual([defaultProject]);
      expect(mockPrisma.labelingProject.findMany).toHaveBeenCalledWith({
        where: { group_id: { in: ["group-1"] } },
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
      const updated = { ...defaultProject, name: "Updated" };
      mockPrisma.labelingProject.update.mockResolvedValueOnce(updated);

      const result = await service.updateLabelingProject("project-1", {
        name: "Updated",
      });

      expect(result).toEqual(updated);
      expect(mockPrisma.labelingProject.update).toHaveBeenCalledWith({
        where: { id: "project-1" },
        data: { name: "Updated" },
        include: {
          field_schema: { orderBy: { display_order: "asc" } },
        },
      });
    });

    it("should return null when project not found (P2025)", async () => {
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
      mockPrisma.labelingProject.delete.mockResolvedValueOnce(defaultProject);

      const result = await service.deleteLabelingProject("project-1");

      expect(result).toBe(true);
      expect(mockPrisma.labelingProject.delete).toHaveBeenCalledWith({
        where: { id: "project-1" },
      });
    });

    it("should return false when project not found (P2025)", async () => {
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

    it("should handle first field creation (no existing fields)", async () => {
      mockPrisma.fieldDefinition.aggregate.mockResolvedValueOnce({
        _max: { display_order: null },
      });
      mockPrisma.fieldDefinition.create.mockResolvedValueOnce(
        defaultFieldDefinition,
      );

      await service.createFieldDefinition("project-1", {
        field_key: "invoice_number",
        field_type: FieldType.string,
      });

      expect(mockPrisma.fieldDefinition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ display_order: 0 }),
      });
    });

    it("should use provided display_order without aggregating", async () => {
      mockPrisma.fieldDefinition.create.mockResolvedValueOnce(
        defaultFieldDefinition,
      );

      await service.createFieldDefinition("project-1", {
        field_key: "invoice_number",
        field_type: FieldType.string,
        display_order: 5,
      });

      expect(mockPrisma.fieldDefinition.aggregate).not.toHaveBeenCalled();
      expect(mockPrisma.fieldDefinition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ display_order: 5 }),
      });
    });
  });

  describe("updateFieldDefinition", () => {
    it("should update a field definition", async () => {
      const updated = { ...defaultFieldDefinition, field_format: "MM/DD/YYYY" };
      mockPrisma.fieldDefinition.update.mockResolvedValueOnce(updated);

      const result = await service.updateFieldDefinition("field-1", {
        field_format: "MM/DD/YYYY",
      });

      expect(result).toEqual(updated);
      expect(mockPrisma.fieldDefinition.update).toHaveBeenCalledWith({
        where: { id: "field-1" },
        data: { field_format: "MM/DD/YYYY" },
      });
    });

    it("should return null when field not found (P2025)", async () => {
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

    it("should return false when field not found (P2025)", async () => {
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

  describe("createLabeledDocument", () => {
    it("should add a document to a project", async () => {
      mockPrisma.labeledDocument.create.mockResolvedValueOnce(
        defaultLabeledDocument,
      );

      const result = await service.createLabeledDocument(
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
    it("should find a labeled document in a project", async () => {
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

  describe("findAllLabeledDocuments", () => {
    it("should return all labeled documents for a project", async () => {
      mockPrisma.labeledDocument.findMany.mockResolvedValueOnce([
        defaultLabeledDocument,
      ]);

      const result = await service.findAllLabeledDocuments("project-1");

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

  describe("deleteLabeledDocument", () => {
    it("should remove a document from a project and return true", async () => {
      mockPrisma.labeledDocument.delete.mockResolvedValueOnce(
        defaultLabeledDocument,
      );

      const result = await service.deleteLabeledDocument(
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

    it("should return false when document not found (P2025)", async () => {
      mockPrisma.labeledDocument.delete.mockImplementationOnce(() => {
        throw { code: "P2025" };
      });

      const result = await service.deleteLabeledDocument(
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
        service.deleteLabeledDocument("project-1", "labeling-doc-1"),
      ).rejects.toThrow("Database error");
    });
  });

  describe("updateLabeledDocument", () => {
    it("should update the status of a labeled document", async () => {
      mockPrisma.labeledDocument.update.mockResolvedValueOnce({
        ...defaultLabeledDocument,
        status: LabelingStatus.labeled,
      });

      await service.updateLabeledDocument(
        "labeled-doc-1",
        LabelingStatus.labeled,
      );

      expect(mockPrisma.labeledDocument.update).toHaveBeenCalledWith({
        where: { id: "labeled-doc-1" },
        data: { status: LabelingStatus.labeled },
      });
    });
  });

  describe("upsertDocumentLabels", () => {
    it("should delete existing labels and create new ones", async () => {
      const labels = [
        {
          field_key: "invoice_number",
          label_name: "Invoice Number",
          value: "INV-001",
          page_number: 1,
          bounding_box: { polygon: [0, 0, 1, 0, 1, 1, 0, 1] },
        },
      ];
      mockPrisma.documentLabel.findMany.mockResolvedValueOnce([
        defaultDocumentLabel,
      ]);

      const result = await service.upsertDocumentLabels(
        "labeled-doc-1",
        labels,
      );

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

    it("should return false when label not found (P2025)", async () => {
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

  describe("transaction support", () => {
    it("should use provided tx client instead of this.prisma for createLabelingProject", async () => {
      const expected = {
        id: "project-1",
        name: "Tx Project",
        field_schema: [],
      };
      const mockTxLabelingProject = {
        create: jest.fn().mockResolvedValueOnce(expected),
      };
      const mockTx = { labelingProject: mockTxLabelingProject } as any;

      const result = await service.createLabelingProject(
        { name: "Tx Project", created_by: "user-1", group_id: "g-1" },
        mockTx,
      );

      expect(result).toEqual(expected);
      expect(mockTxLabelingProject.create).toHaveBeenCalled();
      expect(mockPrisma.labelingProject.create).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for findLabelingProject", async () => {
      const expected = { id: "project-1", name: "Test", field_schema: [] };
      const mockTxLabelingProject = {
        findUnique: jest.fn().mockResolvedValueOnce(expected),
      };
      const mockTx = { labelingProject: mockTxLabelingProject } as any;

      const result = await service.findLabelingProject("project-1", mockTx);

      expect(result).toEqual(expected);
      expect(mockTxLabelingProject.findUnique).toHaveBeenCalled();
      expect(mockPrisma.labelingProject.findUnique).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for deleteLabelingProject", async () => {
      const mockTxLabelingProject = {
        delete: jest.fn().mockResolvedValueOnce({}),
      };
      const mockTx = { labelingProject: mockTxLabelingProject } as any;

      const result = await service.deleteLabelingProject("project-1", mockTx);

      expect(result).toBe(true);
      expect(mockTxLabelingProject.delete).toHaveBeenCalledWith({
        where: { id: "project-1" },
      });
      expect(mockPrisma.labelingProject.delete).not.toHaveBeenCalled();
    });

    it("should use provided tx client directly for upsertDocumentLabels when tx is provided", async () => {
      const savedLabels = [{ id: "label-1", field_key: "name" }];
      const mockTxDocumentLabel = {
        deleteMany: jest.fn().mockResolvedValueOnce({}),
        create: jest.fn().mockResolvedValueOnce({}),
        findMany: jest.fn().mockResolvedValueOnce(savedLabels),
      };
      const mockTx = { documentLabel: mockTxDocumentLabel } as any;

      const result = await service.upsertDocumentLabels(
        "labeled-doc-1",
        [
          {
            field_key: "name",
            label_name: "Name",
            page_number: 1,
            bounding_box: {},
          },
        ],
        mockTx,
      );

      expect(result).toEqual(savedLabels);
      expect(mockTxDocumentLabel.deleteMany).toHaveBeenCalled();
      expect(mockTxDocumentLabel.create).toHaveBeenCalled();
      expect(mockTxDocumentLabel.findMany).toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
