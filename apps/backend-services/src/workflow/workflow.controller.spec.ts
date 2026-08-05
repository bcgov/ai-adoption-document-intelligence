import { GroupRole } from "@generated/client";
import { ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
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
  workflowVersionId: "wv-wf-1",
  slug: "test-workflow",
  name: "Test Workflow",
  description: "Description",
  actorId: "user-1",
  groupId: "group-1",
  config: mockGraphConfig,
  schemaVersion: "1.0",
  version: 1,
  configHash: "abc123",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function identityWithGroups(
  groups: Record<string, GroupRole>,
): Request["resolvedIdentity"] {
  return {
    isSystemAdmin: false,
    groupRoles: groups,
    actorId: "user-1",
  };
}

describe("WorkflowController", () => {
  let controller: WorkflowController;
  let workflowService: jest.Mocked<WorkflowService>;

  beforeEach(async () => {
    workflowService = {
      getGroupWorkflows: jest.fn(),
      getAllWorkflowLineages: jest.fn(),
      getWorkflow: jest.fn(),
      listVersions: jest.fn(),
      createWorkflow: jest.fn(),
      updateWorkflow: jest.fn(),
      deleteWorkflow: jest.fn(),
      revertHeadToVersion: jest.fn(),
    } as unknown as jest.Mocked<WorkflowService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowController],
      providers: [
        {
          provide: WorkflowService,
          useValue: workflowService,
        },
      ],
    }).compile();

    controller = module.get<WorkflowController>(WorkflowController);
  });

  describe("getWorkflows", () => {
    it("returns workflows for a group", async () => {
      workflowService.getGroupWorkflows.mockResolvedValue([mockWorkflowInfo]);
      const result = await controller.getWorkflows("group-1", undefined);
      expect(result).toEqual({ workflows: [mockWorkflowInfo] });
      expect(workflowService.getGroupWorkflows).toHaveBeenCalledWith(
        ["group-1"],
        false,
      );
    });

    it("includes benchmark candidates when flag is true", async () => {
      workflowService.getGroupWorkflows.mockResolvedValue([mockWorkflowInfo]);
      const result = await controller.getWorkflows("group-1", "true");
      expect(result).toEqual({ workflows: [mockWorkflowInfo] });
      expect(workflowService.getGroupWorkflows).toHaveBeenCalledWith(
        ["group-1"],
        true,
      );
    });

    it("passes groupId to getGroupWorkflows", async () => {
      workflowService.getGroupWorkflows.mockResolvedValue([mockWorkflowInfo]);
      const result = await controller.getWorkflows("group-1", undefined);
      expect(result).toEqual({ workflows: [mockWorkflowInfo] });
      expect(workflowService.getGroupWorkflows).toHaveBeenCalledWith(
        ["group-1"],
        false,
      );
    });
  });

  describe("getWorkflow", () => {
    it("returns workflow by id for a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      const result = await controller.getWorkflow("wf-1", req);
      expect(result).toEqual({ workflow: mockWorkflowInfo });
      expect(workflowService.getWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
      );
    });

    it("throws ForbiddenException when user cannot access workflow group", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      await expect(controller.getWorkflow("wf-1", req)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("createWorkflow", () => {
    it("creates workflow and returns it", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
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

    it("propagates ForbiddenException when user cannot access target group", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as Request;
      const dto: CreateWorkflowDto = {
        name: "New",
        groupId: "group-1",
        config: mockGraphConfig,
      };
      await expect(controller.createWorkflow(dto, req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(workflowService.createWorkflow).not.toHaveBeenCalled();
    });
  });

  describe("updateWorkflow", () => {
    it("updates workflow and returns it for a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      const dto = { name: "Updated" };
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      workflowService.updateWorkflow.mockResolvedValue({
        ...mockWorkflowInfo,
        name: "Updated",
      });
      const result = await controller.updateWorkflow("wf-1", dto, req);
      expect(result.workflow.name).toBe("Updated");
      expect(workflowService.getWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
      );
      expect(workflowService.updateWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
        dto,
      );
    });

    it("throws ForbiddenException when user cannot access workflow group", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as Request;
      const dto = { name: "Updated" };
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      await expect(controller.updateWorkflow("wf-1", dto, req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(workflowService.updateWorkflow).not.toHaveBeenCalled();
    });
  });

  describe("deleteWorkflow", () => {
    it("deletes workflow for a group member", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "group-1": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      workflowService.deleteWorkflow.mockResolvedValue(undefined);
      await controller.deleteWorkflow("wf-1", req);
      expect(workflowService.getWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
      );
      expect(workflowService.deleteWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "user-1",
      );
    });

    it("throws ForbiddenException when user cannot access workflow group", async () => {
      const req = {
        user: { sub: "user-1" },
        resolvedIdentity: identityWithGroups({
          "other-group": GroupRole.MEMBER,
        }),
      } as Request;
      workflowService.getWorkflow.mockResolvedValue(mockWorkflowInfo);
      await expect(controller.deleteWorkflow("wf-1", req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(workflowService.deleteWorkflow).not.toHaveBeenCalled();
    });
  });
});
