/**
 * Unit tests for OcrImprovementPipelineService.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { HitlAggregationService } from "@/hitl/hitl-aggregation.service";
import { ToolManifestService } from "@/hitl/tool-manifest.service";
import { WorkflowService } from "@/workflow/workflow.service";
import { AiRecommendationService } from "./ai-recommendation.service";
import { BenchmarkRunService } from "./benchmark-run.service";
import { OcrImprovementPipelineService } from "./ocr-improvement-pipeline.service";

describe("OcrImprovementPipelineService", () => {
  let service: OcrImprovementPipelineService;

  const mockHitlAggregation = {
    getAggregatedCorrections: jest.fn(),
  };

  const mockToolManifest = {
    getManifest: jest.fn().mockReturnValue([
      {
        toolId: "ocr.spellcheck",
        label: "Spellcheck",
        description: "Spellcheck",
        parameters: [],
      },
    ]),
  };

  const mockAiRecommendation = {
    getRecommendations: jest.fn(),
  };

  const mockWorkflowService = {
    getWorkflowVersionById: jest.fn(),
    createCandidateVersion: jest.fn(),
  };

  const mockBenchmarkRunService = {
    startRun: jest.fn(),
    getRunById: jest.fn(),
    getLatestCompletedBaselineRunId: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OcrImprovementPipelineService,
        { provide: HitlAggregationService, useValue: mockHitlAggregation },
        { provide: ToolManifestService, useValue: mockToolManifest },
        { provide: AiRecommendationService, useValue: mockAiRecommendation },
        { provide: WorkflowService, useValue: mockWorkflowService },
        { provide: BenchmarkRunService, useValue: mockBenchmarkRunService },
      ],
    }).compile();

    service = module.get<OcrImprovementPipelineService>(
      OcrImprovementPipelineService,
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should return no_recommendations when there are no corrections", async () => {
    mockHitlAggregation.getAggregatedCorrections.mockResolvedValue({
      corrections: [],
      total: 0,
      filters: {},
    });

    const result = await service.run({
      workflowVersionId: "wf-1",
      benchmarkDefinitionId: "def-1",
      benchmarkProjectId: "project-1",
      actorId: "user-1",
    });

    expect(result.status).toBe("no_recommendations");
    expect(result.pipelineMessage).toContain("No HITL corrections");
    expect(result.candidateWorkflowVersionId).toBe("");
    expect(result.benchmarkRunId).toBe("");
    expect(mockWorkflowService.getWorkflowVersionById).not.toHaveBeenCalled();
  });

  it("should return error when workflow not found", async () => {
    mockHitlAggregation.getAggregatedCorrections.mockResolvedValue({
      corrections: [
        {
          fieldKey: "f1",
          originalValue: "a",
          correctedValue: "b",
          action: "corrected",
        },
      ],
      total: 1,
      filters: {},
    });
    mockWorkflowService.getWorkflowVersionById.mockResolvedValue(null);

    const result = await service.run({
      workflowVersionId: "wf-missing",
      benchmarkDefinitionId: "def-1",
      benchmarkProjectId: "project-1",
      actorId: "user-1",
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("not found");
    expect(result.candidateWorkflowVersionId).toBe("");
  });

  it("should wait for terminal run and return baseline comparison when waitForPipelineRunCompletion is true", async () => {
    mockHitlAggregation.getAggregatedCorrections.mockResolvedValue({
      corrections: [
        {
          fieldKey: "f1",
          originalValue: "O",
          correctedValue: "0",
          action: "corrected",
        },
      ],
      total: 1,
      filters: {},
    });

    mockWorkflowService.getWorkflowVersionById.mockResolvedValue({
      id: "wf-1",
      config: {
        schemaVersion: "1.0",
        metadata: {},
        nodes: {
          extract: {
            id: "extract",
            type: "activity",
            label: "Extract",
            activityType: "azureOcr.extract",
          },
          cleanup: {
            id: "cleanup",
            type: "activity",
            label: "Cleanup",
            activityType: "ocr.cleanup",
          },
          enrich: {
            id: "enrich",
            type: "activity",
            label: "Enrich",
            activityType: "ocr.enrich",
          },
          store: {
            id: "store",
            type: "activity",
            label: "Store",
            activityType: "document.upsertOcrResult",
          },
        },
        edges: [
          { id: "e0", source: "extract", target: "cleanup", type: "normal" },
          { id: "e1", source: "cleanup", target: "enrich", type: "normal" },
          { id: "e2", source: "enrich", target: "store", type: "normal" },
        ],
        entryNodeId: "extract",
        ctx: {},
      },
    });

    mockAiRecommendation.getRecommendations.mockResolvedValue({
      recommendations: [
        {
          toolId: "ocr.spellcheck",
          parameters: { language: "en" },
          rationale: "test",
          priority: 1,
        },
      ],
      analysis: "ok",
    });

    mockWorkflowService.createCandidateVersion.mockResolvedValue({
      id: "candidate-1",
    });

    mockBenchmarkRunService.startRun.mockResolvedValue({
      id: "run-1",
      status: "running",
    });

    const comparison = {
      baselineRunId: "baseline-1",
      overallPassed: true,
      metricComparisons: [],
      regressedMetrics: [],
    };

    mockBenchmarkRunService.getRunById.mockResolvedValue({
      id: "run-1",
      status: "completed",
      baselineComparison: comparison,
    });

    const result = await service.run({
      workflowVersionId: "wf-1",
      benchmarkDefinitionId: "def-1",
      benchmarkProjectId: "project-1",
      actorId: "user-1",
      waitForPipelineRunCompletion: true,
      pipelineRunPollIntervalMs: 1,
      pipelineRunWaitTimeoutMs: 10_000,
    });

    expect(result.status).toBe("benchmark_completed");
    expect(result.benchmarkRunId).toBe("run-1");
    expect(result.baselineComparison).toEqual(comparison);
    expect(mockBenchmarkRunService.getRunById).toHaveBeenCalledWith(
      "project-1",
      "run-1",
    );
  });

  it("applies normalizeFieldsEmptyValueCoercion to every ocr.normalizeFields node in the candidate", async () => {
    mockHitlAggregation.getAggregatedCorrections.mockResolvedValue({
      corrections: [
        {
          fieldKey: "f1",
          originalValue: "a",
          correctedValue: "b",
          action: "corrected",
        },
      ],
      total: 1,
      filters: {},
    });

    mockWorkflowService.getWorkflowVersionById.mockResolvedValue({
      id: "wf-1",
      config: {
        schemaVersion: "1.0",
        metadata: {},
        nodes: {
          extract: {
            id: "extract",
            type: "activity",
            label: "Extract",
            activityType: "azureOcr.extract",
          },
          cleanup: {
            id: "cleanup",
            type: "activity",
            label: "Cleanup",
            activityType: "ocr.cleanup",
          },
          normalizeFieldsBaseline: {
            id: "normalizeFieldsBaseline",
            type: "activity",
            label: "Normalize",
            activityType: "ocr.normalizeFields",
            parameters: { emptyValueCoercion: "blank", documentType: "p1" },
          },
          enrich: {
            id: "enrich",
            type: "activity",
            label: "Enrich",
            activityType: "ocr.enrich",
          },
          store: {
            id: "store",
            type: "activity",
            label: "Store",
            activityType: "document.upsertOcrResult",
          },
        },
        edges: [
          {
            id: "e0",
            source: "extract",
            target: "cleanup",
            type: "normal",
          },
          {
            id: "e1",
            source: "cleanup",
            target: "normalizeFieldsBaseline",
            type: "normal",
          },
          {
            id: "e2",
            source: "normalizeFieldsBaseline",
            target: "enrich",
            type: "normal",
          },
          { id: "e3", source: "enrich", target: "store", type: "normal" },
        ],
        entryNodeId: "extract",
        ctx: {},
      },
    });

    mockAiRecommendation.getRecommendations.mockResolvedValue({
      recommendations: [
        {
          toolId: "ocr.spellcheck",
          parameters: { language: "en" },
          rationale: "test",
          priority: 1,
        },
      ],
      analysis: "ok",
    });

    mockWorkflowService.createCandidateVersion.mockResolvedValue({
      id: "candidate-1",
    });

    mockBenchmarkRunService.startRun.mockResolvedValue({
      id: "run-1",
      status: "running",
    });

    await service.run({
      workflowVersionId: "wf-1",
      benchmarkDefinitionId: "def-1",
      benchmarkProjectId: "project-1",
      actorId: "user-1",
      normalizeFieldsEmptyValueCoercion: "null",
    });

    const passedConfig = mockWorkflowService.createCandidateVersion.mock
      .calls[0][1] as {
      nodes: Record<
        string,
        { activityType?: string; parameters?: { emptyValueCoercion?: string } }
      >;
    };
    const normalizeNodes = Object.values(passedConfig.nodes).filter(
      (n) => n.activityType === "ocr.normalizeFields",
    );
    expect(normalizeNodes.length).toBeGreaterThan(0);
    for (const n of normalizeNodes) {
      expect(n.parameters?.emptyValueCoercion).toBe("null");
    }
  });
});
