/**
 * Unit tests for OcrImprovementPipelineService.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { HitlAggregationService } from "@/hitl/hitl-aggregation.service";
import { ToolManifestService } from "@/hitl/tool-manifest.service";
import { WorkflowService } from "@/workflow/workflow.service";
import { AiRecommendationService } from "./ai-recommendation.service";
import { OcrImprovementPipelineService } from "./ocr-improvement-pipeline.service";

const baseWorkflowConfig = {
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
};

describe("OcrImprovementPipelineService - generate()", () => {
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
    getWorkflowById: jest.fn(),
    createCandidateVersion: jest.fn(),
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
      ],
    }).compile();

    service = module.get<OcrImprovementPipelineService>(
      OcrImprovementPipelineService,
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should create candidate workflow without starting a benchmark run", async () => {
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

    mockWorkflowService.getWorkflowById.mockResolvedValue({
      id: "wf-1",
      config: baseWorkflowConfig,
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
      id: "lineage-abc",
      workflowVersionId: "version-xyz",
    });

    const result = await service.generate({
      workflowVersionId: "wf-1",
      actorId: "user-1",
    });

    expect(result.status).toBe("candidate_created");
    expect(result.candidateWorkflowVersionId).toBe("version-xyz");
    expect(result.candidateLineageId).toBe("lineage-abc");
    expect(result.recommendationsSummary.applied).toBeGreaterThan(0);
  });

  it("should return no_recommendations when there are no corrections", async () => {
    mockHitlAggregation.getAggregatedCorrections.mockResolvedValue({
      corrections: [],
      total: 0,
      filters: {},
    });

    const result = await service.generate({
      workflowVersionId: "wf-1",
      actorId: "user-1",
    });

    expect(result.status).toBe("no_recommendations");
    expect(result.candidateWorkflowVersionId).toBe("");
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
    mockWorkflowService.getWorkflowById.mockResolvedValue(null);

    const result = await service.generate({
      workflowVersionId: "wf-missing",
      actorId: "user-1",
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("not found");
    expect(result.candidateWorkflowVersionId).toBe("");
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

    mockWorkflowService.getWorkflowById.mockResolvedValue({
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
      workflowVersionId: "version-1",
    });

    await service.generate({
      workflowVersionId: "wf-1",
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
