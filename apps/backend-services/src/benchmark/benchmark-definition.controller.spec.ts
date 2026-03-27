/**
 * Benchmark Definition Controller Tests
 *
 * Tests for benchmark definition REST API endpoints.
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 */

jest.mock("@/auth/identity.helpers", () => ({
  identityCanAccessGroup: jest.fn().mockResolvedValue(undefined),
  getIdentityGroupIds: jest.fn().mockResolvedValue(["test-group"]),
}));

import { AuditAction } from "@generated/client";
import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { DatabaseService } from "@/database/database.service";
import { AuditLogService } from "./audit-log.service";
import { BenchmarkDefinitionController } from "./benchmark-definition.controller";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { BenchmarkProjectService } from "./benchmark-project.service";
import {
  CreateDefinitionDto,
  DefinitionDetailsDto,
  DefinitionSummaryDto,
  ScheduleConfigDto,
  UpdateDefinitionDto,
} from "./dto";

describe("BenchmarkDefinitionController", () => {
  let controller: BenchmarkDefinitionController;

  const mockDefinitionService = {
    createDefinition: jest.fn(),
    listDefinitions: jest.fn(),
    getDefinitionById: jest.fn(),
    updateDefinition: jest.fn(),
    deleteDefinition: jest.fn(),
    configureSchedule: jest.fn(),
    getScheduleInfo: jest.fn(),
  };

  const mockProjectService = {
    getProjectById: jest
      .fn()
      .mockResolvedValue({ id: "project-1", groupId: "test-group" }),
  };

  const mockAuditLogService = {
    queryAuditLogs: jest.fn(),
  };

  const mockDatabaseService = {
    isUserSystemAdmin: jest.fn().mockResolvedValue(false),
    getUsersGroups: jest.fn().mockResolvedValue([{ group_id: "test-group" }]),
    isUserInGroup: jest.fn().mockResolvedValue(true),
  };

  const mockReq = {
    user: { sub: "user-1" },
    resolvedIdentity: { userId: "user-1" },
  } as unknown as Request;

  const projectId = "project-1";

  const mockDatasetVersion = {
    id: "dsv-1",
    datasetName: "Test Dataset",
    version: "1.0",
  };

  const mockWorkflow = {
    id: "wf-1",
    workflowVersionId: "wv-workflow-1",
    name: "Test Workflow",
    description: null,
    userId: "user-1",
    groupId: "test-group",
    config: {} as never,
    schemaVersion: "1.0",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BenchmarkDefinitionController],
      providers: [
        {
          provide: BenchmarkDefinitionService,
          useValue: mockDefinitionService,
        },
        { provide: BenchmarkProjectService, useValue: mockProjectService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    controller = module.get<BenchmarkDefinitionController>(
      BenchmarkDefinitionController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /definitions", () => {
    it("creates a definition successfully", async () => {
      const createDto: CreateDefinitionDto = {
        name: "My Definition",
        datasetVersionId: "dsv-1",
        evaluatorType: "schema-aware",
        workflowVersionId: "wv-workflow-1",
        evaluatorConfig: {},
        runtimeSettings: {},
      };

      const expected: DefinitionDetailsDto = {
        id: "def-1",
        name: createDto.name,
        projectId,
        datasetVersion: mockDatasetVersion,
        workflow: mockWorkflow,
        evaluatorType: "schema-aware",
        evaluatorConfig: {},
        workflowConfigHash: "abc",
        runtimeSettings: {},
        immutable: false,
        revision: 1,
        scheduleEnabled: false,
        runHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDefinitionService.createDefinition.mockResolvedValue(expected);

      const result = await controller.createDefinition(
        projectId,
        createDto,
        mockReq,
      );

      expect(mockDefinitionService.createDefinition).toHaveBeenCalledWith(
        projectId,
        createDto,
      );
      expect(result).toEqual(expected);
    });

    it("propagates errors from the service", async () => {
      const createDto: CreateDefinitionDto = {
        name: "Def",
        datasetVersionId: "v1",
        evaluatorType: "schema-aware",
        workflowVersionId: "wv-workflow-1",
        evaluatorConfig: {},
        runtimeSettings: {},
      };

      mockDefinitionService.createDefinition.mockRejectedValue(
        new NotFoundException("Project not found"),
      );

      await expect(
        controller.createDefinition(projectId, createDto, mockReq),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("GET /definitions", () => {
    it("returns list of definitions", async () => {
      const mockDefs: DefinitionSummaryDto[] = [
        {
          id: "def-1",
          name: "Definition 1",
          datasetVersion: mockDatasetVersion,
          workflow: mockWorkflow,
          evaluatorType: "schema-aware",
          immutable: false,
          revision: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDefinitionService.listDefinitions.mockResolvedValue(mockDefs);

      const result = await controller.listDefinitions(projectId, mockReq);

      expect(mockDefinitionService.listDefinitions).toHaveBeenCalledWith(
        projectId,
      );
      expect(result).toEqual(mockDefs);
    });

    it("returns empty array when no definitions exist", async () => {
      mockDefinitionService.listDefinitions.mockResolvedValue([]);

      const result = await controller.listDefinitions(projectId, mockReq);
      expect(result).toEqual([]);
    });
  });

  describe("GET /definitions/:definitionId", () => {
    it("returns definition details", async () => {
      const expected: DefinitionDetailsDto = {
        id: "def-1",
        name: "Definition 1",
        projectId,
        datasetVersion: mockDatasetVersion,
        workflow: mockWorkflow,
        evaluatorType: "schema-aware",
        evaluatorConfig: {},
        workflowConfigHash: "abc",
        runtimeSettings: {},
        immutable: true,
        revision: 1,
        scheduleEnabled: false,
        runHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDefinitionService.getDefinitionById.mockResolvedValue(expected);

      const result = await controller.getDefinitionById(
        projectId,
        "def-1",
        mockReq,
      );

      expect(mockDefinitionService.getDefinitionById).toHaveBeenCalledWith(
        projectId,
        "def-1",
      );
      expect(result).toEqual(expected);
    });

    it("throws when definition not found", async () => {
      mockDefinitionService.getDefinitionById.mockRejectedValue(
        new NotFoundException("Definition not found"),
      );

      await expect(
        controller.getDefinitionById(projectId, "non-existent", mockReq),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("PUT /definitions/:definitionId", () => {
    it("updates a definition", async () => {
      const updateDto: UpdateDefinitionDto = {
        name: "Updated Name",
      };

      const expected: DefinitionDetailsDto = {
        id: "def-1",
        name: "Updated Name",
        projectId,
        datasetVersion: mockDatasetVersion,
        workflow: mockWorkflow,
        evaluatorType: "schema-aware",
        evaluatorConfig: {},
        workflowConfigHash: "abc",
        runtimeSettings: {},
        immutable: false,
        revision: 1,
        scheduleEnabled: false,
        runHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDefinitionService.updateDefinition.mockResolvedValue(expected);

      const result = await controller.updateDefinition(
        projectId,
        "def-1",
        updateDto,
        mockReq,
      );

      expect(mockDefinitionService.updateDefinition).toHaveBeenCalledWith(
        projectId,
        "def-1",
        updateDto,
      );
      expect(result).toEqual(expected);
    });
  });

  describe("POST /definitions/:definitionId/schedule", () => {
    it("configures a schedule", async () => {
      const scheduleDto: ScheduleConfigDto = {
        enabled: true,
        cron: "0 0 * * *",
      };

      const expected: DefinitionDetailsDto = {
        id: "def-1",
        name: "Definition 1",
        projectId,
        datasetVersion: mockDatasetVersion,
        workflow: mockWorkflow,
        evaluatorType: "schema-aware",
        evaluatorConfig: {},
        workflowConfigHash: "abc",
        runtimeSettings: {},
        immutable: true,
        revision: 1,
        scheduleEnabled: true,
        scheduleCron: "0 0 * * *",
        scheduleId: "benchmark-schedule-def-1",
        runHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDefinitionService.configureSchedule.mockResolvedValue(expected);

      const result = await controller.configureSchedule(
        projectId,
        "def-1",
        scheduleDto,
        mockReq,
      );

      expect(mockDefinitionService.configureSchedule).toHaveBeenCalledWith(
        projectId,
        "def-1",
        scheduleDto,
      );
      expect(result).toEqual(expected);
    });
  });

  describe("GET /definitions/:definitionId/schedule", () => {
    it("returns schedule info", async () => {
      const expected = {
        scheduleId: "schedule-1",
        cron: "0 0 * * *",
        nextRunTime: new Date(),
        lastRunTime: new Date(),
        paused: false,
      };

      mockDefinitionService.getScheduleInfo.mockResolvedValue(expected);

      const result = await controller.getScheduleInfo(
        projectId,
        "def-1",
        mockReq,
      );

      expect(mockDefinitionService.getScheduleInfo).toHaveBeenCalledWith(
        projectId,
        "def-1",
      );
      expect(result).toEqual(expected);
    });

    it("returns null when no schedule configured", async () => {
      mockDefinitionService.getScheduleInfo.mockResolvedValue(null);

      const result = await controller.getScheduleInfo(
        projectId,
        "def-1",
        mockReq,
      );

      expect(result).toBeNull();
    });
  });

  describe("GET /definitions/:definitionId/baseline-history", () => {
    it("returns baseline promotion history", async () => {
      const now = new Date();
      mockAuditLogService.queryAuditLogs.mockResolvedValue([
        {
          id: "log-1",
          timestamp: now,
          entityId: "run-1",
          userId: "user-1",
          action: AuditAction.baseline_promoted,
          metadata: { definitionId: "def-1", projectId },
        },
        {
          id: "log-2",
          timestamp: now,
          entityId: "run-2",
          userId: "user-2",
          action: AuditAction.baseline_promoted,
          metadata: { definitionId: "def-other", projectId },
        },
      ]);

      const result = await controller.getBaselineHistory(
        projectId,
        "def-1",
        mockReq,
      );

      expect(mockAuditLogService.queryAuditLogs).toHaveBeenCalledWith({
        action: AuditAction.baseline_promoted,
        entityType: "BenchmarkRun",
        limit: 100,
      });
      // Should filter to only def-1
      expect(result).toHaveLength(1);
      expect(result[0].runId).toBe("run-1");
      expect(result[0].definitionId).toBe("def-1");
    });

    it("returns empty array when no baseline promotions exist", async () => {
      mockAuditLogService.queryAuditLogs.mockResolvedValue([]);

      const result = await controller.getBaselineHistory(
        projectId,
        "def-1",
        mockReq,
      );

      expect(result).toEqual([]);
    });

    it("filters out logs with null metadata", async () => {
      mockAuditLogService.queryAuditLogs.mockResolvedValue([
        {
          id: "log-1",
          timestamp: new Date(),
          entityId: "run-1",
          userId: "user-1",
          action: AuditAction.baseline_promoted,
          metadata: null,
        },
      ]);

      const result = await controller.getBaselineHistory(
        projectId,
        "def-1",
        mockReq,
      );

      expect(result).toHaveLength(0);
    });
  });

  describe("DELETE /definitions/:definitionId", () => {
    it("deletes a definition successfully", async () => {
      mockDefinitionService.deleteDefinition.mockResolvedValue(undefined);

      await controller.deleteDefinition(projectId, "def-1", mockReq);

      expect(mockDefinitionService.deleteDefinition).toHaveBeenCalledWith(
        projectId,
        "def-1",
      );
    });

    it("throws when definition not found", async () => {
      mockDefinitionService.deleteDefinition.mockRejectedValue(
        new NotFoundException("Definition not found"),
      );

      await expect(
        controller.deleteDefinition(projectId, "non-existent", mockReq),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
