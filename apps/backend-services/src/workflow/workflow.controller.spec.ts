import { ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { DatabaseService } from "../database/database.service";
import type { GraphWorkflowConfig } from "./graph-workflow-types";
import { WorkflowController } from "./workflow.controller";
import {
  CreateWorkflowDto,
  WorkflowInfo,
  WorkflowService,
} from "./workflow.service";

const mockGraphConfig: GraphWorkflowConfig = {
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
};

const mockWorkflowInfo: WorkflowInfo = {
  id: "wf-1",
  name: "Test Workflow",
  description: "Description",
  userId: "user-1",
  config: mockGraphConfig,
  schemaVersion: "1.0",
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("WorkflowController", () => {
  let controller: WorkflowController;
  let workflowService: jest.Mocked<WorkflowService>;
  let databaseService: jest.Mocked<DatabaseService>;

  beforeEach(async () => {
    workflowService = {
      getUserWorkflows: jest.fn(),
      getWorkflow: jest.fn(),
      createWorkflow: jest.fn(),
      updateWorkflow: jest.fn(),
      deleteWorkflow: jest.fn(),
    } as unknown as jest.Mocked<WorkflowService>;

    databaseService = {
      isUserInGroup: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<DatabaseService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowController],
      providers: [
        {
          provide: WorkflowService,
          useValue: workflowService,
        },
        {
          provide: DatabaseService,
          useValue: databaseService,
        },
      ],
    }).compile();

    controller = module.get<WorkflowController>(WorkflowController);
  });

  describe("getWorkflows", () => {
    it("returns empty array when user is not set", async () => {
      const req = { user: undefined } as Request;
      const result = await controller.getWorkflows(req);
      expect(result).toEqual({ workflows: [] });
      expect(workflowService.getUserWorkflows).not.toHaveBeenCalled();
    });

    it("returns workflows when user has sub", async () => {
      const req = { user: { sub: "user-1" } } as Request;
      workflowService.getUserWorkflows.mockResolvedValue([mockWorkflowInfo]);
      const result = await controller.getWorkflows(req);
      expect(result).toEqual({ workflows: [mockWorkflowInfo] });
      expect(workflowService.getUserWorkflows).toHaveBeenCalledWith("user-1");
    });
  });

  describe("getWorkflow", () => {
    it("returns workflow by id", async () => {
      const req = { user: { sub: "user-1" } } as Request;
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      const result = await controller.getWorkflow("wf-1", req);
      expect(result).toEqual({ workflow: mockWorkflowInfo });
      expect(workflowService.getWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
      );
    });
  });

  describe("createWorkflow", () => {
    it("creates workflow and returns it", async () => {
      const identity = { userId: "user-1" };
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identity,
      } as Request;
      const dto: CreateWorkflowDto = {
        name: "New",
        groupId: "group-1",
        config: mockGraphConfig,
      };
      workflowService.createWorkflow.mockResolvedValue(mockWorkflowInfo);
      const result = await controller.createWorkflow(dto, req);
      expect(result).toEqual({ workflow: mockWorkflowInfo });
      expect(workflowService.createWorkflow).toHaveBeenCalledWith(
        "user-1",
        dto,
      );
    });

    it("propagates ForbiddenException when user is not a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: { userId: "user-1" },
      } as Request;
      const dto: CreateWorkflowDto = {
        name: "New",
        groupId: "group-1",
        config: mockGraphConfig,
      };
      (databaseService.isUserInGroup as jest.Mock).mockResolvedValueOnce(false);
      await expect(controller.createWorkflow(dto, req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(workflowService.createWorkflow).not.toHaveBeenCalled();
    });
  });

  describe("updateWorkflow", () => {
    it("updates workflow and returns it", async () => {
      const req = { user: { sub: "user-1" } } as Request;
      const dto = { name: "Updated" };
      workflowService.updateWorkflow.mockResolvedValue({
        ...mockWorkflowInfo,
        name: "Updated",
      });
      const result = await controller.updateWorkflow("wf-1", dto, req);
      expect(result.workflow.name).toBe("Updated");
      expect(workflowService.updateWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
        dto,
      );
    });
  });

  describe("deleteWorkflow", () => {
    it("deletes workflow", async () => {
      const req = { user: { sub: "user-1" } } as Request;
      workflowService.deleteWorkflow.mockResolvedValue(undefined);
      await controller.deleteWorkflow("wf-1", req);
      expect(workflowService.deleteWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
      );
    });
  });
});
