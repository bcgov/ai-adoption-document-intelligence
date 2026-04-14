/**
 * Benchmark Run Controller Tests
 *
 * Tests for benchmark run REST API endpoints.
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 */

jest.mock("@/auth/identity.helpers", () => ({
  identityCanAccessGroup: jest.fn().mockReturnValue(undefined),
  getIdentityGroupIds: jest.fn().mockReturnValue(["test-group"]),
}));

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import type { WorkflowInfo } from "@/workflow/workflow.service";
import { WorkflowService } from "@/workflow/workflow.service";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { BenchmarkErrorDetectionService } from "./benchmark-error-detection.service";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { BenchmarkRunController } from "./benchmark-run.controller";
import { BenchmarkRunService } from "./benchmark-run.service";
import {
  ApplyCandidateToBaseDto,
  CreateRunDto,
  PromoteBaselineDto,
} from "./dto";
import { OcrImprovementPipelineService } from "./ocr-improvement-pipeline.service";

describe("BenchmarkRunController", () => {
  let controller: BenchmarkRunController;

  const mockRunService = {
    startRun: jest.fn(),
    listRuns: jest.fn(),
    getRunById: jest.fn(),
    cancelRun: jest.fn(),
    getDrillDown: jest.fn(),
    getPerSampleResults: jest.fn(),
    promoteToBaseline: jest.fn(),
    deleteRun: jest.fn(),
  };

  const mockProjectService = {
    getProjectById: jest
      .fn()
      .mockResolvedValue({ id: "project-1", groupId: "test-group" }),
  };

  const mockDefinitionService = {
    getDefinitionById: jest.fn().mockResolvedValue({
      workflow: { id: "workflow-1", workflowVersionId: "wv-workflow-1" },
    }),
    applyToBaseWorkflow: jest.fn(),
    getPipelineDebugLog: jest.fn().mockResolvedValue({
      entries: [
        {
          step: "baseline_mismatch_extraction",
          timestamp: "2026-04-03T00:00:00Z",
          durationMs: 50,
          data: { totalMismatches: 3 },
        },
        {
          step: "llm_request",
          timestamp: "2026-04-03T00:00:01Z",
          durationMs: 2000,
          data: { deployment: "gpt-4o" },
        },
      ],
    }),
  };

  const mockOcrImprovementPipeline = {
    generate: jest.fn().mockResolvedValue({
      candidateWorkflowVersionId: "wv-candidate-1",
      candidateLineageId: "lineage-1",
      recommendationsSummary: {
        applied: 1,
        rejected: 0,
        toolIds: ["ocr.spellcheck"],
      },
      status: "candidate_created",
    }),
  };

  const mockWorkflowService = {
    getWorkflowVersionById: jest.fn(),
  };

  const mockErrorDetectionService = {
    getAnalysis: jest.fn(),
  };

  const mockReq = {
    user: { sub: "user-1" },
    resolvedIdentity: {
      userId: "user-1",
      actorId: "actor-for-user-1",
      isSystemAdmin: false,
      groupRoles: {},
    },
  } as unknown as Request;

  const projectId = "project-1";

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BenchmarkRunController],
      providers: [
        { provide: BenchmarkRunService, useValue: mockRunService },
        { provide: BenchmarkProjectService, useValue: mockProjectService },
        {
          provide: BenchmarkDefinitionService,
          useValue: mockDefinitionService,
        },
        {
          provide: OcrImprovementPipelineService,
          useValue: mockOcrImprovementPipeline,
        },
        { provide: WorkflowService, useValue: mockWorkflowService },
        {
          provide: BenchmarkErrorDetectionService,
          useValue: mockErrorDetectionService,
        },
      ],
    }).compile();

    controller = module.get<BenchmarkRunController>(BenchmarkRunController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /definitions/:definitionId/runs", () => {
    it("starts a run successfully", async () => {
      const createRunDto: CreateRunDto = {
        runtimeSettingsOverride: { concurrency: 4 },
      };
      const expected = {
        id: "run-1",
        definitionId: "def-1",
        status: "RUNNING",
        temporalWorkflowId: "benchmark-run-run-1",
        startedAt: new Date(),
      };

      mockRunService.startRun.mockResolvedValue(expected);

      const result = await controller.startRun(
        projectId,
        "def-1",
        createRunDto,
        mockReq,
      );

      expect(mockRunService.startRun).toHaveBeenCalledWith(
        projectId,
        "def-1",
        createRunDto,
        "actor-for-user-1",
      );
      expect(result).toEqual(expected);
    });

    it("starts a run with empty dto", async () => {
      const createRunDto: CreateRunDto = {};
      const expected = {
        id: "run-2",
        definitionId: "def-1",
        status: "RUNNING",
      };

      mockRunService.startRun.mockResolvedValue(expected);

      const result = await controller.startRun(
        projectId,
        "def-1",
        createRunDto,
        mockReq,
      );

      expect(result).toEqual(expected);
    });

    it("throws when definition not found", async () => {
      mockRunService.startRun.mockRejectedValue(
        new NotFoundException("Definition not found"),
      );

      const dto: CreateRunDto = {};
      await expect(
        controller.startRun(projectId, "def-bad", dto, mockReq),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("POST /definitions/:definitionId/ocr-improvement/generate", () => {
    it("generates candidate workflow and returns result", async () => {
      const dto = {};
      const result = await controller.generateCandidate(
        projectId,
        "def-1",
        dto,
        mockReq,
      );

      expect(mockDefinitionService.getDefinitionById).toHaveBeenCalledWith(
        projectId,
        "def-1",
      );
      expect(mockWorkflowService.getWorkflowVersionById).not.toHaveBeenCalled();
      expect(mockOcrImprovementPipeline.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowVersionId: "wv-workflow-1",
          actorId: "actor-for-user-1",
          definitionId: "def-1",
        }),
      );
      expect(result).toMatchObject({
        candidateWorkflowVersionId: "wv-candidate-1",
        candidateLineageId: "lineage-1",
        recommendationsSummary: {
          applied: 1,
          rejected: 0,
          toolIds: ["ocr.spellcheck"],
        },
        status: "candidate_created",
      });
    });

    it("passes normalizeFieldsEmptyValueCoercion to the pipeline when set", async () => {
      await controller.generateCandidate(
        projectId,
        "def-1",
        { normalizeFieldsEmptyValueCoercion: "null" },
        mockReq,
      );

      expect(mockOcrImprovementPipeline.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          normalizeFieldsEmptyValueCoercion: "null",
        }),
      );
    });

    it("uses source workflow owner as actorId when resolvedIdentity.actorId is absent", async () => {
      const sourceWorkflow: WorkflowInfo = {
        id: "workflow-1",
        workflowVersionId: "wv-workflow-1",
        name: "wf",
        description: null,
        actorId: "owner-from-source-workflow",
        groupId: "test-group",
        config: {
          schemaVersion: "1.0",
          metadata: {},
          nodes: {},
          edges: [],
          entryNodeId: "n1",
          ctx: {},
        },
        schemaVersion: "1.0",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockWorkflowService.getWorkflowVersionById.mockResolvedValue(
        sourceWorkflow,
      );

      const apiKeyOnlyReq = {} as Request;

      await controller.generateCandidate(projectId, "def-1", {}, apiKeyOnlyReq);

      expect(mockWorkflowService.getWorkflowVersionById).toHaveBeenCalledWith(
        "wv-workflow-1",
      );
      expect(mockOcrImprovementPipeline.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "owner-from-source-workflow",
        }),
      );
    });
  });

  describe("GET /definitions/:definitionId/ocr-improvement/debug-log", () => {
    it("returns the pipeline debug log entries", async () => {
      const result = await controller.getPipelineDebugLog(
        projectId,
        "def-1",
        mockReq,
      );

      expect(mockDefinitionService.getPipelineDebugLog).toHaveBeenCalledWith(
        projectId,
        "def-1",
      );
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].step).toBe("baseline_mismatch_extraction");
    });

    it("returns empty entries when no log exists", async () => {
      mockDefinitionService.getPipelineDebugLog.mockResolvedValueOnce({
        entries: [],
      });

      const result = await controller.getPipelineDebugLog(
        projectId,
        "def-1",
        mockReq,
      );

      expect(result.entries).toEqual([]);
    });
  });

  describe("GET /runs", () => {
    it("returns list of runs", async () => {
      const mockRuns = [
        {
          id: "run-1",
          definitionName: "Def 1",
          status: "COMPLETED",
          temporalWorkflowId: "wf-1",
          startedAt: new Date(),
          completedAt: new Date(),
        },
      ];

      mockRunService.listRuns.mockResolvedValue(mockRuns);

      const result = await controller.listRuns(projectId, mockReq);

      expect(mockRunService.listRuns).toHaveBeenCalledWith(projectId);
      expect(result).toEqual(mockRuns);
    });

    it("returns empty array when no runs", async () => {
      mockRunService.listRuns.mockResolvedValue([]);

      const result = await controller.listRuns(projectId, mockReq);
      expect(result).toEqual([]);
    });
  });

  describe("GET /runs/:runId", () => {
    it("returns run details", async () => {
      const expected = {
        id: "run-1",
        definitionId: "def-1",
        status: "COMPLETED",
        metrics: { accuracy: 0.95 },
      };

      mockRunService.getRunById.mockResolvedValue(expected);

      const result = await controller.getRunById(projectId, "run-1", mockReq);

      expect(mockRunService.getRunById).toHaveBeenCalledWith(
        projectId,
        "run-1",
      );
      expect(result).toEqual(expected);
    });

    it("throws when run not found", async () => {
      mockRunService.getRunById.mockRejectedValue(
        new NotFoundException("Run not found"),
      );

      await expect(
        controller.getRunById(projectId, "bad-run", mockReq),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("POST /runs/:runId/cancel", () => {
    it("cancels a run successfully", async () => {
      const expected = { id: "run-1", status: "CANCELLED" };
      mockRunService.cancelRun.mockResolvedValue(expected);

      const result = await controller.cancelRun(projectId, "run-1", mockReq);

      expect(mockRunService.cancelRun).toHaveBeenCalledWith(projectId, "run-1");
      expect(result).toEqual(expected);
    });

    it("throws when run is not cancellable", async () => {
      mockRunService.cancelRun.mockRejectedValue(
        new BadRequestException("Run is not in a cancellable state"),
      );

      await expect(
        controller.cancelRun(projectId, "run-done", mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("GET /runs/:runId/drill-down", () => {
    it("returns drill-down analysis", async () => {
      const expected = {
        aggregateMetrics: { accuracy: 0.95 },
        worstSamples: [],
        perFieldErrors: [],
      };

      mockRunService.getDrillDown.mockResolvedValue(expected);

      const result = await controller.getDrillDown(projectId, "run-1", mockReq);

      expect(mockRunService.getDrillDown).toHaveBeenCalledWith(
        projectId,
        "run-1",
      );
      expect(result).toEqual(expected);
    });

    it("throws when run is not completed", async () => {
      mockRunService.getDrillDown.mockRejectedValue(
        new BadRequestException("Run is not completed"),
      );

      await expect(
        controller.getDrillDown(projectId, "run-running", mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("GET /runs/:runId/samples", () => {
    it("returns paginated per-sample results with defaults", async () => {
      const expected = {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      };

      mockRunService.getPerSampleResults.mockResolvedValue(expected);

      const result = await controller.getPerSampleResults(
        projectId,
        "run-1",
        {},
        mockReq,
      );

      expect(mockRunService.getPerSampleResults).toHaveBeenCalledWith(
        projectId,
        "run-1",
        {},
        1,
        20,
      );
      expect(result).toEqual(expected);
    });

    it("parses pagination and filter params from query", async () => {
      const expected = { items: [], total: 5, page: 2, limit: 10 };
      mockRunService.getPerSampleResults.mockResolvedValue(expected);

      const query = {
        page: "2",
        limit: "10",
        docType: "invoice",
        pass: "1",
      };

      const result = await controller.getPerSampleResults(
        projectId,
        "run-1",
        query,
        mockReq,
      );

      expect(mockRunService.getPerSampleResults).toHaveBeenCalledWith(
        projectId,
        "run-1",
        { docType: "invoice", pass: 1 },
        2,
        10,
      );
      expect(result).toEqual(expected);
    });

    it("keeps non-numeric filter values as strings", async () => {
      mockRunService.getPerSampleResults.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.getPerSampleResults(
        projectId,
        "run-1",
        { status: "failed" },
        mockReq,
      );

      expect(mockRunService.getPerSampleResults).toHaveBeenCalledWith(
        projectId,
        "run-1",
        { status: "failed" },
        1,
        20,
      );
    });
  });

  describe("POST /runs/:runId/baseline", () => {
    it("promotes a run to baseline", async () => {
      const promoteDto: PromoteBaselineDto = {
        thresholds: [{ metricName: "accuracy", type: "absolute", value: 0.9 }],
      };
      const expected = {
        runId: "run-1",
        isBaseline: true,
        previousBaselineId: null,
        thresholds: promoteDto.thresholds,
      };

      mockRunService.promoteToBaseline.mockResolvedValue(expected);

      const result = await controller.promoteToBaseline(
        projectId,
        "run-1",
        promoteDto,
        mockReq,
      );

      expect(mockRunService.promoteToBaseline).toHaveBeenCalledWith(
        projectId,
        "run-1",
        promoteDto,
        "actor-for-user-1",
      );
      expect(result).toEqual(expected);
    });

    it("promotes with empty dto", async () => {
      const promoteDto: PromoteBaselineDto = {};
      const expected = {
        runId: "run-1",
        isBaseline: true,
        previousBaselineId: null,
        thresholds: null,
      };

      mockRunService.promoteToBaseline.mockResolvedValue(expected);

      const result = await controller.promoteToBaseline(
        projectId,
        "run-1",
        promoteDto,
        mockReq,
      );

      expect(result).toEqual(expected);
    });

    it("throws when run is not completed", async () => {
      const promoteDto: PromoteBaselineDto = {};
      mockRunService.promoteToBaseline.mockRejectedValue(
        new BadRequestException("Run is not completed"),
      );

      await expect(
        controller.promoteToBaseline(projectId, "run-x", promoteDto, mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("POST /apply-candidate-to-base", () => {
    it("delegates to applyToBaseWorkflow with correct args", async () => {
      const expected = {
        newBaseWorkflowVersionId: "wv-new-base",
        baseLineageId: "base-lineage",
        newVersionNumber: 3,
        cleanedUp: true,
      };
      mockDefinitionService.applyToBaseWorkflow.mockResolvedValue(expected);

      const dto: ApplyCandidateToBaseDto = {
        candidateWorkflowVersionId: "candidate-v1",
        cleanupCandidateArtifacts: true,
      };

      const result = await controller.applyCandidateToBase(
        projectId,
        dto,
        mockReq,
      );

      expect(mockDefinitionService.applyToBaseWorkflow).toHaveBeenCalledWith(
        projectId,
        "candidate-v1",
        true,
      );
      expect(result).toEqual(expected);
    });

    it("defaults cleanupCandidateArtifacts to true when omitted", async () => {
      const expected = {
        newBaseWorkflowVersionId: "wv-new-base",
        baseLineageId: "base-lineage",
        newVersionNumber: 3,
        cleanedUp: true,
      };
      mockDefinitionService.applyToBaseWorkflow.mockResolvedValue(expected);

      const dto: ApplyCandidateToBaseDto = {
        candidateWorkflowVersionId: "candidate-v1",
      };

      await controller.applyCandidateToBase(projectId, dto, mockReq);

      expect(mockDefinitionService.applyToBaseWorkflow).toHaveBeenCalledWith(
        projectId,
        "candidate-v1",
        true,
      );
    });
  });

  describe("GET /runs/:runId/error-detection-analysis", () => {
    it("returns error detection analysis for a run", async () => {
      const expected = {
        runId: "r1",
        notReady: false,
        fields: [],
        excludedFields: [],
      };
      mockErrorDetectionService.getAnalysis.mockResolvedValue(expected);

      const result = await controller.getErrorDetectionAnalysis(
        "p1",
        "r1",
        mockReq,
      );

      expect(result).toEqual(expected);
      expect(mockErrorDetectionService.getAnalysis).toHaveBeenCalledWith(
        "p1",
        "r1",
      );
    });
  });

  describe("DELETE /runs/:runId", () => {
    it("deletes a run successfully", async () => {
      mockRunService.deleteRun.mockResolvedValue(undefined);

      await controller.deleteRun(projectId, "run-1", mockReq);

      expect(mockRunService.deleteRun).toHaveBeenCalledWith(projectId, "run-1");
    });

    it("throws when run is still active", async () => {
      mockRunService.deleteRun.mockRejectedValue(
        new BadRequestException("Run is still active"),
      );

      await expect(
        controller.deleteRun(projectId, "run-active", mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
