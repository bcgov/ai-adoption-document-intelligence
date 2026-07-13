import { Prisma } from "@generated/client";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditService } from "@/audit/audit.service";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import type { GraphWorkflowConfig } from "./graph-workflow-types";
import { WorkflowService } from "./workflow.service";

const makeGraphConfig = (): GraphWorkflowConfig => ({
  schemaVersion: "1.0",
  metadata: { description: "Test graph" },
  entryNodeId: "start",
  ctx: { documentId: { type: "string" } },
  nodes: {
    start: {
      id: "start",
      type: "activity",
      label: "Start",
      activityType: "document.updateStatus",
      inputs: [{ port: "documentId", ctxKey: "documentId" }],
    },
  },
  edges: [],
});

const headVersion = {
  id: "wv-1",
  lineage_id: "lin-1",
  version_number: 1,
  config: makeGraphConfig(),
  created_at: new Date(),
};

const lineageRow = {
  id: "lin-1",
  name: "Test",
  slug: "test",
  description: "Desc",
  actor_id: "actor-1",
  group_id: "group-1",
  head_version_id: "wv-1",
  created_at: new Date(),
  updated_at: new Date(),
  headVersion,
};

const mockLineage = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockVersion = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
};

const mockPrismaService = {
  prisma: {
    workflowLineage: mockLineage,
    workflowVersion: mockVersion,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        workflowLineage: mockLineage,
        workflowVersion: mockVersion,
      }),
    ),
  },
  transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      workflowLineage: mockLineage,
      workflowVersion: mockVersion,
    }),
  ),
};

describe("WorkflowService", () => {
  let service: WorkflowService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockLineage.findMany.mockResolvedValue([]);
    mockLineage.findUnique.mockResolvedValue(null);
    mockLineage.findFirst.mockResolvedValue(null);
    mockVersion.findUnique.mockResolvedValue(null);
    mockVersion.findFirst.mockResolvedValue(null);
    mockVersion.findMany.mockResolvedValue([]);
    mockLineage.create.mockImplementation(
      async (args: { data: { id?: string } }) => ({
        ...args.data,
        head_version_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      }),
    );
    mockVersion.create.mockResolvedValue(headVersion);
    mockLineage.update.mockResolvedValue({ ...lineageRow, headVersion });
    mockLineage.delete.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        { provide: AppLoggerService, useValue: mockAppLogger },
        {
          provide: AuditService,
          useValue: { recordEvent: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
  });

  describe("getUserWorkflows", () => {
    it("returns workflows for user", async () => {
      mockLineage.findMany.mockResolvedValue([lineageRow]);
      const result = await service.getUserWorkflows("actor-1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("lin-1");
      expect(result[0].workflowVersionId).toBe("wv-1");
      expect(mockLineage.findMany).toHaveBeenCalledWith({
        where: { actor_id: "actor-1", workflow_kind: "primary" },
        include: { headVersion: true },
        orderBy: { created_at: "desc" },
      });
    });

    it("includes benchmark candidates when flag is set", async () => {
      mockLineage.findMany.mockResolvedValue([lineageRow]);
      await service.getUserWorkflows("actor-1", true);
      expect(mockLineage.findMany).toHaveBeenCalledWith({
        where: { actor_id: "actor-1" },
        include: { headVersion: true },
        orderBy: { created_at: "desc" },
      });
    });
  });

  describe("getGroupWorkflows", () => {
    it("excludes benchmark candidates by default", async () => {
      mockLineage.findMany.mockResolvedValue([lineageRow]);
      await service.getGroupWorkflows(["group-1"]);
      expect(mockLineage.findMany).toHaveBeenCalledWith({
        where: {
          group_id: { in: ["group-1"] },
          workflow_kind: "primary",
        },
        include: { headVersion: true },
        orderBy: { created_at: "desc" },
      });
    });

    it("includes benchmark candidates when flag is set", async () => {
      mockLineage.findMany.mockResolvedValue([lineageRow]);
      await service.getGroupWorkflows(["group-1"], true);
      expect(mockLineage.findMany).toHaveBeenCalledWith({
        where: { group_id: { in: ["group-1"] } },
        include: { headVersion: true },
        orderBy: { created_at: "desc" },
      });
    });
  });

  describe("getWorkflow", () => {
    it("returns workflow when found", async () => {
      mockLineage.findUnique.mockResolvedValue(lineageRow);
      const result = await service.getWorkflow("lin-1", "actor-1");
      expect(result.id).toBe("lin-1");
      expect(result.workflowVersionId).toBe("wv-1");
      expect(mockLineage.findUnique).toHaveBeenCalledWith({
        where: { id: "lin-1" },
        include: { headVersion: true },
      });
    });

    it("throws NotFoundException when not found", async () => {
      mockLineage.findUnique.mockResolvedValue(null);
      await expect(service.getWorkflow("lin-1", "actor-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getWorkflowVersionById", () => {
    it("returns snapshot for version id", async () => {
      mockVersion.findUnique.mockResolvedValue({
        ...headVersion,
        lineage: lineageRow,
      });
      const result = await service.getWorkflowVersionById("wv-1");
      expect(result?.workflowVersionId).toBe("wv-1");
      expect(result?.id).toBe("lin-1");
    });

    it("returns null when version not found", async () => {
      mockVersion.findUnique.mockResolvedValue(null);
      const result = await service.getWorkflowVersionById("x");
      expect(result).toBeNull();
    });
  });

  describe("getWorkflowLineageHeadById", () => {
    it("returns head for lineage id", async () => {
      mockLineage.findUnique.mockResolvedValue(lineageRow);
      const result = await service.getWorkflowLineageHeadById("lin-1");
      expect(result?.id).toBe("lin-1");
    });

    it("returns null when lineage or head missing", async () => {
      mockLineage.findUnique.mockResolvedValue(null);
      const result = await service.getWorkflowLineageHeadById("x");
      expect(result).toBeNull();
    });
  });

  describe("resolveWorkflowVersionId — group scoping", () => {
    it("resolves a workflow_config_id that is a version in the caller's group", async () => {
      mockVersion.findFirst.mockResolvedValue({ id: "wv-1" });

      const result = await service.resolveWorkflowVersionId({
        groupId: "group-1",
        workflowConfigId: "wv-1",
      });

      expect(result).toBe("wv-1");
      expect(mockVersion.findFirst).toHaveBeenCalledWith({
        where: { id: "wv-1", lineage: { group_id: "group-1" } },
        select: { id: true },
      });
    });

    it("resolves a workflow_config_id that is a lineage in the caller's group to its head", async () => {
      mockVersion.findFirst.mockResolvedValue(null);
      mockLineage.findFirst.mockResolvedValue({ head_version_id: "wv-9" });

      const result = await service.resolveWorkflowVersionId({
        groupId: "group-1",
        workflowConfigId: "lin-9",
      });

      expect(result).toBe("wv-9");
      expect(mockLineage.findFirst).toHaveBeenCalledWith({
        where: { id: "lin-9", group_id: "group-1" },
        select: { head_version_id: true },
      });
    });

    it("throws NotFound when the workflow_config_id belongs to another group (cross-group IDOR blocked)", async () => {
      // A version/lineage owned by another group is excluded by the group-scoped
      // where clause, so both lookups return null and the id is treated as
      // not found — it can never be resolved, executed, or disclosed.
      mockVersion.findFirst.mockResolvedValue(null);
      mockLineage.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveWorkflowVersionId({
          groupId: "group-1",
          workflowConfigId: "wv-belongs-to-group-2",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getModelIdDefault — group scoping", () => {
    it("returns the default model id for a version in the caller's group", async () => {
      mockVersion.findFirst.mockResolvedValue({
        config: { ctx: { modelId: { defaultValue: "prebuilt-read" } } },
      });

      const result = await service.getModelIdDefault("wv-1", "group-1");

      expect(result).toBe("prebuilt-read");
      expect(mockVersion.findFirst).toHaveBeenCalledWith({
        where: { id: "wv-1", lineage: { group_id: "group-1" } },
        select: { config: true },
      });
    });

    it("returns null when the version belongs to another group (cross-group disclosure blocked)", async () => {
      mockVersion.findFirst.mockResolvedValue(null);

      const result = await service.getModelIdDefault(
        "wv-belongs-to-group-2",
        "group-1",
      );
      expect(result).toBeNull();
    });
  });

  describe("createWorkflow", () => {
    it("throws BadRequestException for invalid config", async () => {
      await expect(
        service.createWorkflow("actor-1", {
          name: "New",
          groupId: "group-1",
          config: { schemaVersion: "2.0" } as unknown as GraphWorkflowConfig,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws ConflictException when unique slug allocation is exhausted", async () => {
      mockLineage.findUnique.mockImplementation(
        async (args: { where: { group_id_slug?: unknown } }) => {
          if (args.where.group_id_slug) {
            return { id: "taken" };
          }
          return null;
        },
      );

      await expect(
        service.createWorkflow("actor-1", {
          name: "My Workflow",
          groupId: "group-1",
          config: makeGraphConfig(),
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockLineage.create).not.toHaveBeenCalled();
    });
  });

  describe("createCandidateVersion", () => {
    it("creates benchmark candidate lineage with kind and source linkage", async () => {
      const sourceVersionId = "wv-source-1";
      const baseLineageId = "base-lin-1";
      const candidateLineageId = "cand-lin-1";
      const candidateVersionId = "wv-cand-1";
      const candidateConfig = makeGraphConfig();

      mockVersion.findUnique.mockResolvedValue({
        id: sourceVersionId,
        version_number: 1,
        config: makeGraphConfig(),
        lineage: {
          id: baseLineageId,
          name: "Base Lineage",
          group_id: "group-1",
          headVersion: { version_number: 6 },
        },
      });

      const txLineageCreate = jest.fn().mockResolvedValue({
        id: candidateLineageId,
        head_version_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const txVersionCreate = jest.fn().mockResolvedValue({
        id: candidateVersionId,
        version_number: 1,
        config: candidateConfig,
      });

      const txLineageUpdate = jest.fn().mockResolvedValue({
        id: candidateLineageId,
        name: "Base Lineage (candidate v7)",
        description: "AI-generated candidate from workflow version wv-source-1",
        user_id: "user-1",
        group_id: "group-1",
        created_at: new Date(),
        updated_at: new Date(),
        user: { actor_id: "user-1" },
        headVersion: {
          id: candidateVersionId,
          version_number: 1,
          config: candidateConfig,
        },
      });

      const txLineageFindUnique = jest
        .fn()
        .mockImplementation(
          async (args: { where: { id?: string; group_id_slug?: unknown } }) => {
            // resolveUniqueSlug probes `(group_id, slug)` — always available.
            if (args.where.group_id_slug) {
              return null;
            }
            return {
              id: candidateLineageId,
              name: "Base Lineage (candidate v7)",
              slug: "base-lineage-candidate-v7",
              description:
                "AI-generated candidate from workflow version wv-source-1",
              actor_id: "actor-1",
              group_id: "group-1",
              created_at: new Date(),
              updated_at: new Date(),
              headVersion: {
                id: candidateVersionId,
                version_number: 1,
                config: candidateConfig,
              },
            };
          },
        );

      mockPrismaService.transaction.mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) =>
          fn({
            workflowLineage: {
              create: txLineageCreate,
              update: txLineageUpdate,
              findUnique: txLineageFindUnique,
            },
            workflowVersion: {
              create: txVersionCreate,
            },
          }),
      );

      const result = await service.createCandidateVersion(
        sourceVersionId,
        candidateConfig,
        "actor-1",
      );

      expect(result.workflowVersionId).toBe(candidateVersionId);
      expect(txLineageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Base Lineage (candidate v7)",
            workflow_kind: "benchmark_candidate",
            source_workflow_id: baseLineageId,
          }),
        }),
      );
    });

    it("throws NotFoundException when base lineage has no head version", async () => {
      mockVersion.findUnique.mockResolvedValue({
        id: "wv-1",
        version_number: 1,
        config: makeGraphConfig(),
        lineage: {
          id: "lin-1",
          name: "Base",
          group_id: "group-1",
          headVersion: null,
        },
      });

      await expect(
        service.createCandidateVersion("wv-1", makeGraphConfig(), "user-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("updateWorkflow", () => {
    it("throws NotFoundException when lineage not found", async () => {
      mockLineage.findUnique.mockResolvedValue(null);
      await expect(
        service.updateWorkflow("lin-1", "actor-1", { name: "Updated" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("updates metadata only without new version row", async () => {
      mockLineage.findUnique.mockResolvedValue(lineageRow);
      mockLineage.update.mockResolvedValue({
        ...lineageRow,
        name: "Updated",
        headVersion,
      });
      const result = await service.updateWorkflow("lin-1", "actor-1", {
        name: "Updated",
      });
      expect(result.name).toBe("Updated");
    });
  });

  describe("deleteWorkflow", () => {
    it("throws NotFoundException when lineage not found", async () => {
      mockLineage.findUnique.mockResolvedValue(null);
      await expect(service.deleteWorkflow("lin-1", "actor-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("deletes lineage when found", async () => {
      mockLineage.findUnique.mockResolvedValue(lineageRow);
      await service.deleteWorkflow("lin-1", "actor-1");
      expect(mockLineage.delete).toHaveBeenCalledWith({
        where: { id: "lin-1" },
      });
    });

    it("throws ConflictException when delete violates foreign key (P2003)", async () => {
      mockLineage.findUnique.mockResolvedValue(lineageRow);
      const fkError = new Prisma.PrismaClientKnownRequestError("FK", {
        code: "P2003",
        clientVersion: "test",
      });
      mockLineage.delete.mockRejectedValueOnce(fkError);
      await expect(service.deleteWorkflow("lin-1", "actor-1")).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
