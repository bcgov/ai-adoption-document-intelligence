/**
 * Unit tests for OcrImprovementPipelineService.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { ToolManifestService } from "@/hitl/tool-manifest.service";
import { WorkflowService } from "@/workflow/workflow.service";
import { AiRecommendationService } from "./ai-recommendation.service";
import { BenchmarkDefinitionDbService } from "./benchmark-definition-db.service";
import { BenchmarkRunDbService } from "./benchmark-run-db.service";
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

function makeBaselineRun(
  overrides: {
    status?: string;
    perSampleResults?: Array<{
      sampleId: string;
      evaluationDetails?: Array<{
        field: string;
        matched: boolean;
        expected?: unknown;
        predicted?: unknown;
      }>;
    }>;
  } = {},
) {
  return {
    id: "baseline-run-1",
    status: overrides.status ?? "completed",
    completedAt: new Date("2026-04-01"),
    metrics: {
      perSampleResults: overrides.perSampleResults ?? [
        {
          sampleId: "form_1",
          evaluationDetails: [
            {
              field: "date",
              matched: false,
              expected: "2009-06-16",
              predicted: "16-06-2009",
            },
            {
              field: "name",
              matched: true,
              expected: "John",
              predicted: "John",
            },
          ],
        },
        {
          sampleId: "form_2",
          evaluationDetails: [
            {
              field: "phone",
              matched: false,
              expected: "085-437-870",
              predicted: "085-437- 870",
            },
          ],
        },
      ],
    },
  };
}

describe("OcrImprovementPipelineService - generate()", () => {
  let service: OcrImprovementPipelineService;

  const mockBenchmarkRunDb = {
    findBaselineBenchmarkRun: jest.fn(),
  };

  const mockToolManifest = {
    getAiRecommendableTools: jest.fn().mockReturnValue([
      {
        toolId: "ocr.spellcheck",
        label: "Spellcheck",
        description: "Spellcheck",
        parameters: [],
      },
    ]),
  };

  const mockPrismaService = {
    prisma: {
      confusionProfile: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    },
  };

  const mockAiRecommendation = {
    getRecommendations: jest.fn(),
  };

  const mockWorkflowService = {
    getWorkflowVersionById: jest.fn(),
    createCandidateVersion: jest.fn(),
  };

  const mockDefinitionDbService = {
    updatePipelineDebugLog: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OcrImprovementPipelineService,
        { provide: BenchmarkRunDbService, useValue: mockBenchmarkRunDb },
        { provide: ToolManifestService, useValue: mockToolManifest },
        { provide: AiRecommendationService, useValue: mockAiRecommendation },
        { provide: WorkflowService, useValue: mockWorkflowService },
        {
          provide: BenchmarkDefinitionDbService,
          useValue: mockDefinitionDbService,
        },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<OcrImprovementPipelineService>(
      OcrImprovementPipelineService,
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should return error when no baseline run exists", async () => {
    mockBenchmarkRunDb.findBaselineBenchmarkRun.mockResolvedValue(null);

    const result = await service.generate({
      workflowVersionId: "wf-1",
      actorId: "user-1",
      definitionId: "def-1",
      groupId: "group-1",
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("No completed baseline run found");
  });

  it("should return error when baseline run is not completed", async () => {
    mockBenchmarkRunDb.findBaselineBenchmarkRun.mockResolvedValue(
      makeBaselineRun({ status: "running" }),
    );

    const result = await service.generate({
      workflowVersionId: "wf-1",
      actorId: "user-1",
      definitionId: "def-1",
      groupId: "group-1",
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("No completed baseline run found");
  });

  it("should return no_recommendations when baseline has no mismatches", async () => {
    mockBenchmarkRunDb.findBaselineBenchmarkRun.mockResolvedValue(
      makeBaselineRun({
        perSampleResults: [
          {
            sampleId: "form_1",
            evaluationDetails: [
              {
                field: "date",
                matched: true,
                expected: "2009-06-16",
                predicted: "2009-06-16",
              },
            ],
          },
        ],
      }),
    );

    const result = await service.generate({
      workflowVersionId: "wf-1",
      actorId: "user-1",
      definitionId: "def-1",
      groupId: "group-1",
    });

    expect(result.status).toBe("no_recommendations");
    expect(result.pipelineMessage).toContain("no field mismatches");
  });

  it("should extract mismatches and create candidate workflow", async () => {
    mockBenchmarkRunDb.findBaselineBenchmarkRun.mockResolvedValue(
      makeBaselineRun(),
    );

    mockWorkflowService.getWorkflowVersionById.mockResolvedValue({
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
      definitionId: "def-1",
      groupId: "group-1",
    });

    expect(result.status).toBe("candidate_created");
    expect(result.candidateWorkflowVersionId).toBe("version-xyz");
    expect(result.candidateLineageId).toBe("lineage-abc");
    expect(result.recommendationsSummary.applied).toBeGreaterThan(0);

    // Verify corrections passed to AI have the right shape
    const aiCall = mockAiRecommendation.getRecommendations.mock.calls[0][0];
    expect(aiCall.corrections).toEqual([
      {
        fieldKey: "date",
        originalValue: "16-06-2009",
        correctedValue: "2009-06-16",
        action: "mismatch",
      },
      {
        fieldKey: "phone",
        originalValue: "085-437- 870",
        correctedValue: "085-437-870",
        action: "mismatch",
      },
    ]);
    // normalizeFields should not be in AI tool input
    expect(
      aiCall.availableTools.some(
        (t: { toolId: string }) => t.toolId === "ocr.normalizeFields",
      ),
    ).toBe(false);
  });

  it("passes confusion profiles to AI recommendation when available", async () => {
    mockBenchmarkRunDb.findBaselineBenchmarkRun.mockResolvedValue(
      makeBaselineRun(),
    );
    mockWorkflowService.getWorkflowVersionById.mockResolvedValue({
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

    mockPrismaService.prisma.confusionProfile.findMany.mockResolvedValue([
      {
        id: "cp-1",
        name: "Invoice Profile",
        description: "Invoice confusions",
        matrix: { "0": { O: 5 }, A: { "4": 2 } },
      },
    ]);

    await service.generate({
      workflowVersionId: "wf-1",
      actorId: "user-1",
      definitionId: "def-1",
      groupId: "group-1",
    });

    const aiCall = mockAiRecommendation.getRecommendations.mock.calls[0][0];
    expect(aiCall.availableConfusionProfiles).toHaveLength(1);
    expect(aiCall.availableConfusionProfiles[0].id).toBe("cp-1");
    expect(aiCall.availableConfusionProfiles[0].name).toBe("Invoice Profile");
    expect(aiCall.availableConfusionProfiles[0].topConfusions).toBeDefined();
  });

  it("should return error when workflow not found", async () => {
    mockBenchmarkRunDb.findBaselineBenchmarkRun.mockResolvedValue(
      makeBaselineRun(),
    );
    mockWorkflowService.getWorkflowVersionById.mockResolvedValue(null);

    const result = await service.generate({
      workflowVersionId: "wf-missing",
      actorId: "user-1",
      definitionId: "def-1",
      groupId: "group-1",
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("not found");
  });

  it("applies normalizeFieldsEmptyValueCoercion to every ocr.normalizeFields node in the candidate", async () => {
    mockBenchmarkRunDb.findBaselineBenchmarkRun.mockResolvedValue(
      makeBaselineRun(),
    );

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
      workflowVersionId: "version-1",
    });

    await service.generate({
      workflowVersionId: "wf-1",
      actorId: "user-1",
      definitionId: "def-1",
      groupId: "group-1",
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

  it("should persist debug log entries with baseline_mismatch_extraction step", async () => {
    mockBenchmarkRunDb.findBaselineBenchmarkRun.mockResolvedValue(
      makeBaselineRun(),
    );
    mockWorkflowService.getWorkflowVersionById.mockResolvedValue({
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

    await service.generate({
      workflowVersionId: "wf-1",
      actorId: "user-1",
      definitionId: "def-1",
      groupId: "group-1",
    });

    expect(mockDefinitionDbService.updatePipelineDebugLog).toHaveBeenCalledWith(
      "def-1",
      expect.arrayContaining([
        expect.objectContaining({ step: "baseline_mismatch_extraction" }),
        expect.objectContaining({ step: "tool_manifest" }),
        expect.objectContaining({ step: "workflow_load" }),
        expect.objectContaining({ step: "recommendation_parse" }),
        expect.objectContaining({ step: "apply_recommendations" }),
        expect.objectContaining({ step: "candidate_creation" }),
      ]),
    );
  });

  it("should persist debug log with error entry on failure", async () => {
    mockBenchmarkRunDb.findBaselineBenchmarkRun.mockRejectedValue(
      new Error("DB connection failed"),
    );

    await service.generate({
      workflowVersionId: "wf-1",
      actorId: "user-1",
      definitionId: "def-1",
      groupId: "group-1",
    });

    expect(mockDefinitionDbService.updatePipelineDebugLog).toHaveBeenCalledWith(
      "def-1",
      expect.arrayContaining([
        expect.objectContaining({
          step: "error",
          data: expect.objectContaining({ message: "DB connection failed" }),
        }),
      ]),
    );
  });
});
