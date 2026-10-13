/**
 * Unit tests for TemplateModelDbService child-write scoping.
 *
 * These tests pin the cross-group isolation guarantees for the mutating
 * child-row operations: field-definition update/delete and document-label
 * delete must constrain every write to the owning template model (and, for
 * labels, the owning labeling document) so that a row belonging to another
 * group's template cannot be mutated or deleted by guessing its id.
 */

import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { TemplateModelDbService } from "./template-model-db.service";

function makePrismaMock() {
  return {
    prisma: {
      fieldDefinition: {
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
      },
      documentLabel: {
        deleteMany: jest.fn(),
      },
      templateModel: {
        findMany: jest.fn(),
      },
      trainedModel: {
        findMany: jest.fn(),
      },
    },
  } as unknown as PrismaService;
}

function makeLoggerMock() {
  return {
    debug: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as AppLoggerService;
}

describe("TemplateModelDbService — child-write group scoping", () => {
  let service: TemplateModelDbService;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    service = new TemplateModelDbService(prismaMock, makeLoggerMock());
  });

  describe("updateFieldDefinition", () => {
    it("scopes the update to the owning template model and returns the row", async () => {
      (
        prismaMock.prisma.fieldDefinition.updateMany as jest.Mock
      ).mockResolvedValue({ count: 1 });
      (
        prismaMock.prisma.fieldDefinition.findUnique as jest.Mock
      ).mockResolvedValue({ id: "field-1" });

      const result = await service.updateFieldDefinition("field-1", "tm-1", {
        field_format: "currency",
      });

      expect(prismaMock.prisma.fieldDefinition.updateMany).toHaveBeenCalledWith(
        {
          where: { id: "field-1", template_model_id: "tm-1" },
          data: { field_format: "currency" },
        },
      );
      expect(result).toEqual({ id: "field-1" });
    });

    it("returns null when the field belongs to another template (cross-group isolation)", async () => {
      (
        prismaMock.prisma.fieldDefinition.updateMany as jest.Mock
      ).mockResolvedValue({ count: 0 });

      const result = await service.updateFieldDefinition("field-1", "tm-1", {
        field_format: "currency",
      });

      expect(result).toBeNull();
      expect(
        prismaMock.prisma.fieldDefinition.findUnique,
      ).not.toHaveBeenCalled();
    });
  });

  describe("deleteFieldDefinition", () => {
    it("scopes the delete to the owning template model", async () => {
      (
        prismaMock.prisma.fieldDefinition.deleteMany as jest.Mock
      ).mockResolvedValue({ count: 1 });

      const result = await service.deleteFieldDefinition("field-1", "tm-1");

      expect(prismaMock.prisma.fieldDefinition.deleteMany).toHaveBeenCalledWith(
        {
          where: { id: "field-1", template_model_id: "tm-1" },
        },
      );
      expect(result).toBe(true);
    });

    it("returns false when the field belongs to another template (cross-group isolation)", async () => {
      (
        prismaMock.prisma.fieldDefinition.deleteMany as jest.Mock
      ).mockResolvedValue({ count: 0 });

      const result = await service.deleteFieldDefinition("field-1", "tm-1");
      expect(result).toBe(false);
    });
  });

  describe("deleteDocumentLabel", () => {
    it("scopes the delete to the owning labeled document", async () => {
      (
        prismaMock.prisma.documentLabel.deleteMany as jest.Mock
      ).mockResolvedValue({ count: 1 });

      const result = await service.deleteDocumentLabel("label-1", {
        templateModelId: "tm-1",
        labelingDocumentId: "ld-1",
      });

      expect(prismaMock.prisma.documentLabel.deleteMany).toHaveBeenCalledWith({
        where: {
          id: "label-1",
          labeled_doc: {
            template_model_id: "tm-1",
            labeling_document_id: "ld-1",
          },
        },
      });
      expect(result).toBe(true);
    });

    it("returns false when the label belongs to another group's document (cross-group isolation)", async () => {
      (
        prismaMock.prisma.documentLabel.deleteMany as jest.Mock
      ).mockResolvedValue({ count: 0 });

      const result = await service.deleteDocumentLabel("label-1", {
        templateModelId: "tm-1",
        labelingDocumentId: "ld-1",
      });
      expect(result).toBe(false);
    });
  });
});

describe("TemplateModelDbService.isModelIdTaken", () => {
  let service: TemplateModelDbService;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  function given(templateIds: string[], trainedIds: string[]): void {
    (prismaMock.prisma.templateModel.findMany as jest.Mock).mockResolvedValue(
      templateIds.map((model_id) => ({ model_id })),
    );
    (prismaMock.prisma.trainedModel.findMany as jest.Mock).mockResolvedValue(
      trainedIds.map((model_id) => ({ model_id })),
    );
  }

  beforeEach(() => {
    prismaMock = makePrismaMock();
    service = new TemplateModelDbService(prismaMock, makeLoggerMock());
  });

  it("looks up the id, its version names and the template it would be a version of", async () => {
    given([], []);

    await service.isModelIdTaken("invoice-v2");

    expect(prismaMock.prisma.templateModel.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { model_id: "invoice-v2" },
          { model_id: { startsWith: "invoice-v2-v" } },
          { model_id: "invoice" },
        ],
      },
      select: { model_id: true },
    });
    expect(prismaMock.prisma.trainedModel.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { model_id: "invoice-v2" },
          { model_id: { startsWith: "invoice-v2-v" } },
        ],
      },
      select: { model_id: true },
    });
  });

  it.each<[string, string, string[], string[], boolean]>([
    ["is free when nothing uses it", "invoice", [], [], false],
    [
      "is taken when a template model uses it",
      "invoice",
      ["invoice"],
      [],
      true,
    ],
    [
      "is taken when a trained model uses it",
      "invoice-v2",
      [],
      ["invoice-v2"],
      true,
    ],
    [
      "is taken when it names a version of an existing template",
      "invoice-v2",
      ["invoice"],
      [],
      true,
    ],
    [
      "is taken when a template already uses one of its version names",
      "invoice",
      ["invoice-v2"],
      [],
      true,
    ],
    [
      "is taken when a trained model already uses one of its version names",
      "invoice",
      [],
      ["invoice-v3"],
      true,
    ],
    [
      "is free when another id only shares its prefix",
      "invoice",
      ["invoice-very-long"],
      [],
      false,
    ],
  ])("%s", async (_label, candidate, templateIds, trainedIds, expected) => {
    given(templateIds, trainedIds);

    await expect(service.isModelIdTaken(candidate)).resolves.toBe(expected);
  });
});
