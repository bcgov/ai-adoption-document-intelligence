import { Test, TestingModule } from "@nestjs/testing";
import {
  ClassifierSource,
  ClassifierStatus,
} from "@/azure/dto/classifier-constants.dto";
import { PrismaService } from "../database/prisma.service";
import type { ClassifierEditableProperties } from "./classifier-db.service";
import {
  ClassifierDbService,
  configReferencesClassifier,
} from "./classifier-db.service";

describe("ClassifierDbService", () => {
  let service: ClassifierDbService;
  let mockPrisma: {
    classifierModel: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    workflowVersion: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      classifierModel: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      workflowVersion: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassifierDbService,
        {
          provide: PrismaService,
          useValue: { prisma: mockPrisma },
        },
      ],
    }).compile();

    service = module.get<ClassifierDbService>(ClassifierDbService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // createClassifierModel
  // ---------------------------------------------------------------------------

  describe("createClassifierModel", () => {
    const properties: ClassifierEditableProperties = {
      group_id: "g1",
      config: { labels: [] },
      description: "test classifier",
      status: ClassifierStatus.PRETRAINING,
      source: ClassifierSource.AZURE,
    };

    it("should create and return a classifier model", async () => {
      const expected = { id: "1", name: "clf1", ...properties };
      mockPrisma.classifierModel.create.mockResolvedValueOnce(expected);

      const result = await service.createClassifierModel(
        "clf1",
        properties,
        "user1",
      );

      expect(result).toEqual(expected);
      expect(mockPrisma.classifierModel.create).toHaveBeenCalledWith({
        data: {
          ...properties,
          created_by: "user1",
          updated_by: "user1",
          name: "clf1",
        },
      });
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.classifierModel.create.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(
        service.createClassifierModel("clf1", properties, "user1"),
      ).rejects.toThrow("Prisma error");
    });
  });

  // ---------------------------------------------------------------------------
  // updateClassifierModel
  // ---------------------------------------------------------------------------

  describe("updateClassifierModel", () => {
    it("should update and return a classifier model", async () => {
      const expected = {
        id: "1",
        name: "clf1",
        status: ClassifierStatus.TRAINING,
      };
      mockPrisma.classifierModel.update.mockResolvedValueOnce(expected);

      const result = await service.updateClassifierModel(
        "clf1",
        "g1",
        { status: ClassifierStatus.TRAINING },
        "user1",
      );

      expect(result).toEqual(expected);
      expect(mockPrisma.classifierModel.update).toHaveBeenCalledWith({
        where: {
          name_group_id: { name: "clf1", group_id: "g1" },
        },
        data: {
          status: ClassifierStatus.TRAINING,
          created_by: "user1",
          updated_by: "user1",
          name: "clf1",
        },
      });
    });

    it("should not set created_by or updated_by when userId is undefined", async () => {
      const expected = {
        id: "1",
        name: "clf1",
        status: ClassifierStatus.READY,
      };
      mockPrisma.classifierModel.update.mockResolvedValueOnce(expected);

      await service.updateClassifierModel(
        "clf1",
        "g1",
        {
          status: ClassifierStatus.READY,
        },
        undefined,
      );

      expect(mockPrisma.classifierModel.update).toHaveBeenCalledWith({
        where: {
          name_group_id: { name: "clf1", group_id: "g1" },
        },
        data: {
          status: ClassifierStatus.READY,
          name: "clf1",
        },
      });
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.classifierModel.update.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(
        service.updateClassifierModel("clf1", "g1", {}, "actor-1"),
      ).rejects.toThrow("Prisma error");
    });
  });

  // ---------------------------------------------------------------------------
  // findClassifierModel
  // ---------------------------------------------------------------------------

  describe("findClassifierModel", () => {
    it("should return a classifier model when found", async () => {
      const expected = { id: "1", name: "clf1", group_id: "g1" };
      mockPrisma.classifierModel.findUnique.mockResolvedValueOnce(expected);

      const result = await service.findClassifierModel("clf1", "g1");

      expect(result).toEqual(expected);
      expect(mockPrisma.classifierModel.findUnique).toHaveBeenCalledWith({
        where: {
          name_group_id: { name: "clf1", group_id: "g1" },
        },
      });
    });

    it("should return null when not found", async () => {
      mockPrisma.classifierModel.findUnique.mockResolvedValueOnce(null);

      const result = await service.findClassifierModel("missing", "g1");

      expect(result).toBeNull();
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.classifierModel.findUnique.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(service.findClassifierModel("clf1", "g1")).rejects.toThrow(
        "Prisma error",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findAllClassifierModelsForGroups
  // ---------------------------------------------------------------------------

  describe("findAllClassifierModelsForGroups", () => {
    it("should return classifier models with their groups", async () => {
      const expected = [
        {
          id: "1",
          name: "clf1",
          group_id: "g1",
          group: { id: "g1", name: "Group 1" },
        },
        {
          id: "2",
          name: "clf2",
          group_id: "g2",
          group: { id: "g2", name: "Group 2" },
        },
      ];
      mockPrisma.classifierModel.findMany.mockResolvedValueOnce(expected);

      const result = await service.findAllClassifierModelsForGroups([
        "g1",
        "g2",
      ]);

      expect(result).toEqual(expected);
      expect(mockPrisma.classifierModel.findMany).toHaveBeenCalledWith({
        where: { group_id: { in: ["g1", "g2"] } },
        include: { group: true },
      });
    });

    it("should return an empty array when no classifiers exist for groups", async () => {
      mockPrisma.classifierModel.findMany.mockResolvedValueOnce([]);

      const result = await service.findAllClassifierModelsForGroups(["g-none"]);

      expect(result).toEqual([]);
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.classifierModel.findMany.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(
        service.findAllClassifierModelsForGroups(["g1"]),
      ).rejects.toThrow("Prisma error");
    });
  });

  // ---------------------------------------------------------------------------
  // findAllTrainingClassifiers
  // ---------------------------------------------------------------------------

  describe("findAllTrainingClassifiers", () => {
    it("should return all classifiers that are currently training", async () => {
      const expected = [
        {
          id: "1",
          name: "clf1",
          group_id: "g1",
          status: ClassifierStatus.TRAINING,
          operation_location: "https://azure/op/1",
        },
      ];
      mockPrisma.classifierModel.findMany.mockResolvedValueOnce(expected);

      const result = await service.findAllTrainingClassifiers();

      expect(result).toEqual(expected);
      expect(mockPrisma.classifierModel.findMany).toHaveBeenCalledWith({
        where: {
          status: ClassifierStatus.TRAINING,
          operation_location: { not: null },
        },
      });
    });

    it("should return an empty array when no classifiers are training", async () => {
      mockPrisma.classifierModel.findMany.mockResolvedValueOnce([]);

      const result = await service.findAllTrainingClassifiers();

      expect(result).toEqual([]);
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.classifierModel.findMany.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(service.findAllTrainingClassifiers()).rejects.toThrow(
        "Prisma error",
      );
    });
  });

  describe("transaction support", () => {
    it("should use provided tx client instead of this.prisma for createClassifierModel", async () => {
      const expected = { id: "1", name: "clf1" };
      const mockTxClassifierModel = {
        create: jest.fn().mockResolvedValueOnce(expected),
      };
      const mockTx = { classifierModel: mockTxClassifierModel } as any;
      const properties: ClassifierEditableProperties = {
        group_id: "g1",
        config: { labels: [] },
        description: "test",
        status: ClassifierStatus.PRETRAINING,
        source: ClassifierSource.AZURE,
      };

      const result = await service.createClassifierModel(
        "clf1",
        properties,
        "user1",
        mockTx,
      );

      expect(result).toEqual(expected);
      expect(mockTxClassifierModel.create).toHaveBeenCalled();
      expect(mockPrisma.classifierModel.create).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for findClassifierModel", async () => {
      const expected = { id: "1", name: "clf1", group_id: "g1" };
      const mockTxClassifierModel = {
        findUnique: jest.fn().mockResolvedValueOnce(expected),
      };
      const mockTx = { classifierModel: mockTxClassifierModel } as any;

      const result = await service.findClassifierModel("clf1", "g1", mockTx);

      expect(result).toEqual(expected);
      expect(mockTxClassifierModel.findUnique).toHaveBeenCalled();
      expect(mockPrisma.classifierModel.findUnique).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for updateClassifierModel", async () => {
      const expected = { id: "1", name: "clf1", group_id: "g1" };
      const mockTxClassifierModel = {
        update: jest.fn().mockResolvedValueOnce(expected),
      };
      const mockTx = { classifierModel: mockTxClassifierModel } as any;

      const result = await service.updateClassifierModel(
        "clf1",
        "g1",
        { description: "updated" },
        "",
        mockTx,
      );

      expect(result).toEqual(expected);
      expect(mockTxClassifierModel.update).toHaveBeenCalled();
      expect(mockPrisma.classifierModel.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // deleteClassifierModel
  // ---------------------------------------------------------------------------

  describe("deleteClassifierModel", () => {
    it("should hard-delete a classifier model and return the deleted record", async () => {
      const expected = { id: "1", name: "clf1", group_id: "g1" };
      mockPrisma.classifierModel.delete.mockResolvedValueOnce(expected);

      const result = await service.deleteClassifierModel("clf1", "g1");

      expect(result).toEqual(expected);
      expect(mockPrisma.classifierModel.delete).toHaveBeenCalledWith({
        where: {
          name_group_id: { name: "clf1", group_id: "g1" },
        },
      });
    });

    it("should use provided tx client", async () => {
      const expected = { id: "1", name: "clf1", group_id: "g1" };
      const mockTxClassifierModel = {
        delete: jest.fn().mockResolvedValueOnce(expected),
      };
      const mockTx = { classifierModel: mockTxClassifierModel } as any;

      const result = await service.deleteClassifierModel("clf1", "g1", mockTx);

      expect(result).toEqual(expected);
      expect(mockTxClassifierModel.delete).toHaveBeenCalled();
      expect(mockPrisma.classifierModel.delete).not.toHaveBeenCalled();
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.classifierModel.delete.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(service.deleteClassifierModel("clf1", "g1")).rejects.toThrow(
        "Prisma error",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findWorkflowVersionsReferencingClassifier
  // ---------------------------------------------------------------------------

  describe("findWorkflowVersionsReferencingClassifier", () => {
    it("should return lineages whose versions reference the classifier name", async () => {
      mockPrisma.workflowVersion.findMany.mockResolvedValueOnce([
        {
          config: { steps: [{ classifierName: "my-classifier" }] },
          lineage: { id: "wl-1", name: "Workflow 1" },
        },
        {
          config: { steps: [{ classifierName: "other-classifier" }] },
          lineage: { id: "wl-2", name: "Workflow 2" },
        },
      ]);

      const result = await service.findWorkflowVersionsReferencingClassifier(
        "my-classifier",
        "g1",
      );

      expect(result).toEqual([{ id: "wl-1", name: "Workflow 1" }]);
      expect(mockPrisma.workflowVersion.findMany).toHaveBeenCalledWith({
        where: { lineage: { group_id: "g1" } },
        select: {
          config: true,
          lineage: { select: { id: true, name: true } },
        },
      });
    });

    it("should deduplicate lineages referenced by multiple versions", async () => {
      mockPrisma.workflowVersion.findMany.mockResolvedValueOnce([
        {
          config: { classifierName: "clf1" },
          lineage: { id: "wl-1", name: "Workflow 1" },
        },
        {
          config: { classifierName: "clf1" },
          lineage: { id: "wl-1", name: "Workflow 1" },
        },
      ]);

      const result = await service.findWorkflowVersionsReferencingClassifier(
        "clf1",
        "g1",
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("wl-1");
    });

    it("should return empty array when no versions reference the classifier", async () => {
      mockPrisma.workflowVersion.findMany.mockResolvedValueOnce([
        {
          config: { steps: [] },
          lineage: { id: "wl-1", name: "Workflow 1" },
        },
      ]);

      const result = await service.findWorkflowVersionsReferencingClassifier(
        "my-classifier",
        "g1",
      );

      expect(result).toEqual([]);
    });

    it("should return empty array when there are no workflow versions for the group", async () => {
      mockPrisma.workflowVersion.findMany.mockResolvedValueOnce([]);

      const result = await service.findWorkflowVersionsReferencingClassifier(
        "my-classifier",
        "g1",
      );

      expect(result).toEqual([]);
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.workflowVersion.findMany.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(
        service.findWorkflowVersionsReferencingClassifier("clf1", "g1"),
      ).rejects.toThrow("Prisma error");
    });

    it("should not match a workflow whose classifierName is a superstring of the target", async () => {
      mockPrisma.workflowVersion.findMany.mockResolvedValueOnce([
        {
          config: {
            nodes: {
              classifyNode: {
                type: "activity",
                parameters: { classifierName: "invoice-classifier" },
              },
            },
          },
          lineage: { id: "wl-1", name: "Workflow 1" },
        },
      ]);

      const result = await service.findWorkflowVersionsReferencingClassifier(
        "inv",
        "g1",
      );

      expect(result).toEqual([]);
    });

    it("should not match a workflow where the name appears only in a description field", async () => {
      mockPrisma.workflowVersion.findMany.mockResolvedValueOnce([
        {
          config: {
            metadata: {
              description: "Uses the clf1 classifier for routing",
            },
            nodes: {
              classifyNode: {
                type: "activity",
                parameters: { classifierName: "other-clf" },
              },
            },
          },
          lineage: { id: "wl-1", name: "Workflow 1" },
        },
      ]);

      const result = await service.findWorkflowVersionsReferencingClassifier(
        "clf1",
        "g1",
      );

      expect(result).toEqual([]);
    });

    it("should match when classifierName is nested inside a node parameters object", async () => {
      mockPrisma.workflowVersion.findMany.mockResolvedValueOnce([
        {
          config: {
            nodes: {
              classifyNode: {
                type: "activity",
                parameters: { classifierName: "clf1" },
              },
            },
          },
          lineage: { id: "wl-1", name: "Workflow 1" },
        },
      ]);

      const result = await service.findWorkflowVersionsReferencingClassifier(
        "clf1",
        "g1",
      );

      expect(result).toEqual([{ id: "wl-1", name: "Workflow 1" }]);
    });
  });

  // ---------------------------------------------------------------------------
  // configReferencesClassifier
  // ---------------------------------------------------------------------------

  describe("configReferencesClassifier", () => {
    it("returns true for a direct classifierName match", () => {
      expect(
        configReferencesClassifier({ classifierName: "clf1" }, "clf1"),
      ).toBe(true);
    });

    it("returns true for a classifierName match nested in an array", () => {
      expect(
        configReferencesClassifier(
          { steps: [{ classifierName: "clf1" }] },
          "clf1",
        ),
      ).toBe(true);
    });

    it("returns false when classifierName is a substring of another classifierName value", () => {
      expect(
        configReferencesClassifier({ classifierName: "invoice-clf1" }, "clf1"),
      ).toBe(false);
    });

    it("returns false when the name appears only in an unrelated string field", () => {
      expect(
        configReferencesClassifier(
          { metadata: { description: "uses clf1 for routing" } },
          "clf1",
        ),
      ).toBe(false);
    });

    it("returns false for null input", () => {
      expect(configReferencesClassifier(null, "clf1")).toBe(false);
    });

    it("returns false for a primitive input", () => {
      expect(configReferencesClassifier("clf1", "clf1")).toBe(false);
    });

    it("returns false for an empty object", () => {
      expect(configReferencesClassifier({}, "clf1")).toBe(false);
    });
  });
});
