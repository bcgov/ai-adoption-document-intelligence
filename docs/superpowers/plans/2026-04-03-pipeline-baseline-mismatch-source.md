# Pipeline Baseline Mismatch Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pipeline's HITL correction aggregation (step 1) with baseline run mismatch extraction so the OCR improvement pipeline uses actual benchmark evaluation errors.

**Architecture:** The pipeline service swaps its `HitlAggregationService` dependency for `BenchmarkRunDbService`, looks up the baseline run for the definition, and extracts mismatched fields from `perSampleResults[].evaluationDetails`. The AI recommendation service input format is unchanged.

**Tech Stack:** NestJS, Prisma, Jest

---

### Task 1: Remove `hitlFilters` from DTO

**Files:**
- Modify: `apps/backend-services/src/benchmark/dto/ocr-improvement-run.dto.ts:8-16`

- [ ] **Step 1: Remove hitlFilters from OcrImprovementGenerateDto**

Replace the entire `OcrImprovementGenerateDto` class with:

```typescript
export class OcrImprovementGenerateDto {
  @ApiProperty({
    description:
      'Force emptyValueCoercion on every ocr.normalizeFields node ("none" | "blank" | "null")',
    required: false,
    enum: ["none", "blank", "null"],
  })
  @IsOptional()
  @IsIn(["none", "blank", "null"])
  normalizeFieldsEmptyValueCoercion?: "none" | "blank" | "null";
}
```

Remove the `IsObject` import from `class-validator` since it's no longer used.

- [ ] **Step 2: Commit**

```bash
git add apps/backend-services/src/benchmark/dto/ocr-improvement-run.dto.ts
git commit -m "refactor: remove hitlFilters from OcrImprovementGenerateDto"
```

---

### Task 2: Update controller to remove HITL filter logic

**Files:**
- Modify: `apps/backend-services/src/benchmark/benchmark-run.controller.ts:61-82,109-113,127,152-161`

- [ ] **Step 1: Remove mapHitlFilters function and update generateCandidate**

Delete the `mapHitlFilters` function (lines 61-82) entirely.

Update the `@ApiOperation` decorator on `generateCandidate` (lines 109-113):

```typescript
  @ApiOperation({
    summary: "Generate candidate workflow from baseline run errors",
    description:
      "Extracts field mismatches from the baseline run, runs AI recommendation, and creates a candidate workflow. " +
      "Requires a promoted baseline run on the definition. " +
      "Does not start a benchmark run. Use the workflow editor to review, then create a definition and run normally.",
  })
```

Replace the body of `generateCandidate` (lines 130-172) with:

```typescript
  async generateCandidate(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Body() dto: OcrImprovementGenerateDto,
    @Req() req: Request,
  ): Promise<OcrImprovementGenerateResponseDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/definitions/${definitionId}/ocr-improvement/generate`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    const definition = await this.benchmarkDefinitionService.getDefinitionById(
      projectId,
      definitionId,
    );
    let actorId = req.resolvedIdentity?.actorId;
    if (!actorId) {
      const sourceWorkflow = await this.workflowService.getWorkflowById(
        definition.workflow.workflowVersionId,
      );
      if (!sourceWorkflow) {
        throw new NotFoundException(
          `Workflow not found: ${definition.workflow.workflowVersionId}`,
        );
      }
      actorId = sourceWorkflow.actorId;
    }
    const result = await this.ocrImprovementPipeline.generate({
      workflowVersionId: definition.workflow.workflowVersionId,
      actorId,
      definitionId,
      normalizeFieldsEmptyValueCoercion: dto.normalizeFieldsEmptyValueCoercion,
    });
    return {
      candidateWorkflowVersionId: result.candidateWorkflowVersionId,
      candidateLineageId: result.candidateLineageId,
      recommendationsSummary: result.recommendationsSummary,
      analysis: result.analysis,
      pipelineMessage: result.pipelineMessage,
      rejectionDetails: result.rejectionDetails,
      status: result.status,
      error: result.error,
    };
  }
```

Key changes: removed `project` variable (no longer needed for groupId), removed `hitlFilters` mapping, removed `hitlFilters` from pipeline input.

Also remove the now-unused import of `HitlAggregationFilters`:

```typescript
// DELETE this line:
import type { HitlAggregationFilters } from "@/hitl/hitl-aggregation.service";
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend-services/src/benchmark/benchmark-run.controller.ts
git commit -m "refactor: remove HITL filter logic from generate controller"
```

---

### Task 3: Update pipeline service to use baseline run mismatches

**Files:**
- Modify: `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts`

- [ ] **Step 1: Update imports and GenerateInput interface**

Replace the `HitlAggregationService` imports (lines 30-31) with `BenchmarkRunDbService`:

```typescript
import { BenchmarkRunDbService } from "./benchmark-run-db.service";
```

Remove:
```typescript
import type { HitlAggregationFilters } from "../hitl/hitl-aggregation.service";
import { HitlAggregationService } from "../hitl/hitl-aggregation.service";
```

Update the `GenerateInput` interface (lines 40-47) — remove `hitlFilters`, make `definitionId` required:

```typescript
export interface GenerateInput {
  workflowVersionId: string;
  actorId: string;
  /** Definition ID — used to find baseline run and persist debug log */
  definitionId: string;
  normalizeFieldsEmptyValueCoercion?: OcrNormalizeFieldsEmptyValueCoercion;
}
```

- [ ] **Step 2: Update constructor**

Replace the `HitlAggregationService` dependency in the constructor (line 69) with `BenchmarkRunDbService`:

```typescript
  constructor(
    private readonly benchmarkRunDb: BenchmarkRunDbService,
    private readonly toolManifest: ToolManifestService,
    private readonly aiRecommendation: AiRecommendationService,
    private readonly workflowService: WorkflowService,
    private readonly definitionDb: BenchmarkDefinitionDbService,
  ) {}
```

- [ ] **Step 3: Replace step 1 in generate() method**

Replace the step 1 block (lines 117-143 — from `// Step 1:` through the `corrections.length === 0` early return) with:

```typescript
      // Step 1: Extract mismatches from baseline run
      let stepStart = Date.now();
      const baselineRun = await this.benchmarkRunDb.findBaselineBenchmarkRun(
        input.definitionId,
      );
      if (!baselineRun || baselineRun.status !== "completed") {
        logStep("baseline_mismatch_extraction", stepStart, {
          error: "No completed baseline run found",
        });
        await persistLog();
        return {
          candidateWorkflowVersionId: "",
          candidateLineageId: "",
          recommendationsSummary: {
            applied: 0,
            rejected: 0,
            toolIds: [],
          },
          status: "error",
          error:
            "No completed baseline run found for this definition. Promote a run to baseline first.",
        };
      }

      const metrics = baselineRun.metrics as Record<string, unknown> | null;
      const perSampleResults = (
        Array.isArray(metrics?.perSampleResults)
          ? metrics.perSampleResults
          : []
      ) as Array<{
        sampleId: string;
        evaluationDetails?: Array<{
          field: string;
          matched: boolean;
          expected?: unknown;
          predicted?: unknown;
        }>;
      }>;

      const corrections: Array<{
        fieldKey: string;
        originalValue: string;
        correctedValue: string;
        action: string;
      }> = [];

      for (const sample of perSampleResults) {
        if (!Array.isArray(sample.evaluationDetails)) continue;
        for (const detail of sample.evaluationDetails) {
          if (detail.matched) continue;
          corrections.push({
            fieldKey: detail.field,
            originalValue: String(detail.predicted ?? ""),
            correctedValue: String(detail.expected ?? ""),
            action: "mismatch",
          });
        }
      }

      logStep("baseline_mismatch_extraction", stepStart, {
        baselineRunId: baselineRun.id,
        totalMismatches: corrections.length,
        sampleCorrections: corrections.slice(0, 5),
      });

      if (corrections.length === 0) {
        await persistLog();
        return {
          candidateWorkflowVersionId: "",
          candidateLineageId: "",
          recommendationsSummary: {
            applied: 0,
            rejected: 0,
            toolIds: [],
          },
          pipelineMessage:
            "Baseline run has no field mismatches; nothing to recommend.",
          status: "no_recommendations",
        };
      }
```

- [ ] **Step 4: Update the correctionInput mapping**

Replace the old `correctionInput` mapping (lines 156-161) with a direct reference since `corrections` is already in the right shape:

```typescript
      const correctionInput = corrections;
```

- [ ] **Step 5: Update the log message**

Update the pipeline prepared log (line 226-228) — change `correctionInput.length` to `corrections.length` if needed. This should already work since both variables have the same data.

- [ ] **Step 6: Remove the persistLog call's reference to definitionId being optional**

The `persistLog` helper (lines 102-114) checks `if (!input.definitionId) return;`. Since `definitionId` is now required, this guard is still safe but will always pass. Leave it as-is for safety.

- [ ] **Step 7: Commit**

```bash
git add apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts
git commit -m "feat: source pipeline corrections from baseline run mismatches instead of HITL"
```

---

### Task 4: Update tests

**Files:**
- Modify: `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.spec.ts`

- [ ] **Step 1: Rewrite the test file**

Replace the entire contents of the spec file with:

```typescript
/**
 * Unit tests for OcrImprovementPipelineService.
 */

import { Test, TestingModule } from "@nestjs/testing";
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
    });

    expect(result.status).toBe("no_recommendations");
    expect(result.pipelineMessage).toContain("no field mismatches");
  });

  it("should extract mismatches and create candidate workflow", async () => {
    mockBenchmarkRunDb.findBaselineBenchmarkRun.mockResolvedValue(
      makeBaselineRun(),
    );

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
      definitionId: "def-1",
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
  });

  it("should return error when workflow not found", async () => {
    mockBenchmarkRunDb.findBaselineBenchmarkRun.mockResolvedValue(
      makeBaselineRun(),
    );
    mockWorkflowService.getWorkflowById.mockResolvedValue(null);

    const result = await service.generate({
      workflowVersionId: "wf-missing",
      actorId: "user-1",
      definitionId: "def-1",
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("not found");
  });

  it("applies normalizeFieldsEmptyValueCoercion to every ocr.normalizeFields node in the candidate", async () => {
    mockBenchmarkRunDb.findBaselineBenchmarkRun.mockResolvedValue(
      makeBaselineRun(),
    );

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
      definitionId: "def-1",
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

    await service.generate({
      workflowVersionId: "wf-1",
      actorId: "user-1",
      definitionId: "def-1",
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/backend-services && npx jest --testPathPattern=ocr-improvement-pipeline.service.spec.ts --verbose`
Expected: All 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.spec.ts
git commit -m "test: update pipeline tests for baseline mismatch extraction"
```

---

### Task 5: Update documentation

**Files:**
- Modify: `docs-md/OCR_IMPROVEMENT_PIPELINE.md` (if it references HITL aggregation in step 1)

- [ ] **Step 1: Update pipeline documentation**

Find any references to "HITL aggregation" or "HITL corrections" in the pipeline docs and update them to describe "baseline run mismatch extraction." Specifically:

- Step 1 should describe extracting mismatches from the baseline run's `evaluationDetails`
- The troubleshooting section should mention "No completed baseline run found" error and the fix (promote a baseline first)
- Remove references to `hitlFilters` parameter

- [ ] **Step 2: Commit**

```bash
git add docs-md/OCR_IMPROVEMENT_PIPELINE.md
git commit -m "docs: update pipeline docs for baseline mismatch source"
```

---

### Task 6: Run full test suite and verify

- [ ] **Step 1: Run all benchmark-related tests**

Run: `cd apps/backend-services && npx jest --testPathPattern=benchmark --verbose`
Expected: All tests pass. No remaining references to `hitlFilters` in pipeline-related test files.

- [ ] **Step 2: Run lint**

Run: `cd apps/backend-services && npx eslint src/benchmark/ocr-improvement-pipeline.service.ts src/benchmark/benchmark-run.controller.ts src/benchmark/dto/ocr-improvement-run.dto.ts`
Expected: No errors.

- [ ] **Step 3: Verify no unused imports remain**

Check that `HitlAggregationService` is not imported in `ocr-improvement-pipeline.service.ts` or `benchmark-run.controller.ts`. Check that `mapHitlFilters` is fully removed.

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: fix lint and cleanup after pipeline baseline mismatch migration"
```
