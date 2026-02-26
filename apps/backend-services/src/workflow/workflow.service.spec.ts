import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
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

const mockWorkflowRecord = {
  id: "wf-1",
  name: "Test",
  description: "Desc",
  user_id: "user-1",
  config: makeGraphConfig(),
  version: 1,
  created_at: new Date(),
  updated_at: new Date(),
  group_id: "group-1",
};

const mockWorkflow = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockPrismaService = {
  prisma: {
    workflow: mockWorkflow,
  },
};

describe("WorkflowService", () => {
  let service: WorkflowService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWorkflow.findMany.mockResolvedValue([]);
    mockWorkflow.findFirst.mockResolvedValue(null);
    mockWorkflow.findUnique.mockResolvedValue(null);
    mockWorkflow.create.mockResolvedValue(mockWorkflowRecord);
    mockWorkflow.update.mockResolvedValue(mockWorkflowRecord);
    mockWorkflow.delete.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
  });

  describe("getUserWorkflows", () => {
    it("returns workflows for user", async () => {
      mockWorkflow.findMany.mockResolvedValue([mockWorkflowRecord]);
      const result = await service.getUserWorkflows("user-1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("wf-1");
      expect(result[0].userId).toBe("user-1");
      expect(mockWorkflow.findMany).toHaveBeenCalledWith({
        where: { user_id: "user-1" },
        orderBy: { created_at: "desc" },
      });
    });
  });

  describe("getWorkflow", () => {
    it("returns workflow when found", async () => {
      mockWorkflow.findFirst.mockResolvedValue(mockWorkflowRecord);
      const result = await service.getWorkflow("wf-1", "user-1");
      expect(result.id).toBe("wf-1");
      expect(mockWorkflow.findFirst).toHaveBeenCalledWith({
        where: { id: "wf-1", user_id: "user-1" },
      });
    });

    it("throws NotFoundException when not found", async () => {
      mockWorkflow.findFirst.mockResolvedValue(null);
      await expect(service.getWorkflow("wf-1", "user-1")).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getWorkflow("wf-1", "user-1")).rejects.toThrow(
        "Workflow not found: wf-1",
      );
    });
  });

  describe("getWorkflowById", () => {
    it("returns workflow when found", async () => {
      mockWorkflow.findUnique.mockResolvedValue(mockWorkflowRecord);
      const result = await service.getWorkflowById("wf-1");
      expect(result).not.toBeNull();
      expect(result?.id).toBe("wf-1");
    });

    it("returns null when not found", async () => {
      mockWorkflow.findUnique.mockResolvedValue(null);
      const result = await service.getWorkflowById("wf-1");
      expect(result).toBeNull();
    });
  });

  describe("createWorkflow", () => {
    it("creates workflow with valid config", async () => {
      const result = await service.createWorkflow(
        "user-1",
        { name: "New", groupId: "group-1", config: makeGraphConfig() },
      );
      expect(result.id).toBe("wf-1");
      expect(mockWorkflow.create).toHaveBeenCalled();
    });

    it("throws BadRequestException for invalid config", async () => {
      await expect(
        service.createWorkflow(
          "user-1",
          { name: "New", groupId: "group-1", config: { schemaVersion: "2.0" } as any },
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockWorkflow.create).not.toHaveBeenCalled();
    });
  });

  describe("updateWorkflow", () => {
    it("throws NotFoundException when workflow not found", async () => {
      mockWorkflow.findFirst.mockResolvedValue(null);
      await expect(
        service.updateWorkflow("wf-1", "user-1", { name: "Updated" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("updates name only without incrementing version", async () => {
      mockWorkflow.findFirst.mockResolvedValue(mockWorkflowRecord);
      mockWorkflow.update.mockResolvedValue({
        ...mockWorkflowRecord,
        name: "Updated",
      });
      const result = await service.updateWorkflow("wf-1", "user-1", {
        name: "Updated",
      });
      expect(result.name).toBe("Updated");
      expect(mockWorkflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ version: expect.anything() }),
        }),
      );
    });

    it("increments version when config changes", async () => {
      mockWorkflow.findFirst.mockResolvedValue(mockWorkflowRecord);
      mockWorkflow.update.mockResolvedValue({
        ...mockWorkflowRecord,
        version: 2,
        config: {
          ...makeGraphConfig(),
          metadata: { description: "Updated graph" },
        },
      });
      const result = await service.updateWorkflow("wf-1", "user-1", {
        config: {
          ...makeGraphConfig(),
          metadata: { description: "Updated graph" },
        },
      });
      expect(result.version).toBe(2);
      expect(mockWorkflow.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "wf-1" } }),
      );
    });

    it("does not increment version when config is semantically same but key order differs", async () => {
      const storedConfig = makeGraphConfig();
      mockWorkflow.findFirst.mockResolvedValue({
        ...mockWorkflowRecord,
        config: storedConfig,
      });
      mockWorkflow.update.mockResolvedValue({
        ...mockWorkflowRecord,
        version: 1,
        config: storedConfig,
      });
      await service.updateWorkflow("wf-1", "user-1", {
        config: {
          ...storedConfig,
          metadata: { description: "Test graph" },
        },
      });
      expect(mockWorkflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ version: expect.anything() }),
        }),
      );
    });

    it("throws BadRequestException for invalid config on update", async () => {
      mockWorkflow.findFirst.mockResolvedValue(mockWorkflowRecord);
      await expect(
        service.updateWorkflow("wf-1", "user-1", {
          config: { schemaVersion: "2.0" } as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("deleteWorkflow", () => {
    it("throws NotFoundException when workflow not found", async () => {
      mockWorkflow.findFirst.mockResolvedValue(null);
      await expect(service.deleteWorkflow("wf-1", "user-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("deletes workflow when found", async () => {
      mockWorkflow.findFirst.mockResolvedValue(mockWorkflowRecord);
      await service.deleteWorkflow("wf-1", "user-1");
      expect(mockWorkflow.delete).toHaveBeenCalledWith({
        where: { id: "wf-1" },
      });
    });
  });
});
