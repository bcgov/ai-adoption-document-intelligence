# Controlled Improvement Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the OCR improvement pipeline into generate-only + normal benchmark flow, fix the immutability violation in "apply candidate to base," and clean up removed code paths.

**Architecture:** Extract the generate logic from `OcrImprovementPipelineService.run()` into a standalone `generate()` method exposed via a new endpoint. Replace the old `promoteCandidateWorkflow` (which mutated definitions) with a new `applyToBaseWorkflow` method that only copies the candidate config to the base lineage and optionally cleans up candidate artifacts. The frontend gets `workflowKind`/`sourceWorkflowId` fields on definition's workflow info to drive button visibility.

**Tech Stack:** NestJS, Prisma, React (Mantine), TanStack Query

---

## File Structure

### Backend — Modified
- `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts` — extract `generate()` from `run()`
- `apps/backend-services/src/benchmark/benchmark-run.controller.ts` — replace `/ocr-improvement/run` with `/ocr-improvement/generate`, add `/apply-candidate-to-base`
- `apps/backend-services/src/benchmark/benchmark-definition.service.ts` — remove `promoteCandidateWorkflow`, add `applyToBaseWorkflow`
- `apps/backend-services/src/benchmark/benchmark-definition.controller.ts` — remove promote-candidate route
- `apps/backend-services/src/benchmark/dto/ocr-improvement-run.dto.ts` — rename to generate DTO, simplify
- `apps/backend-services/src/benchmark/dto/definition-response.dto.ts` — add `workflowKind`, `sourceWorkflowId` to `WorkflowInfo`
- `apps/backend-services/src/benchmark/dto/create-run.dto.ts` — add TODO on `workflowConfigOverride`
- `apps/backend-services/src/benchmark/dto/index.ts` — update exports

### Backend — New
- `apps/backend-services/src/benchmark/dto/apply-candidate-to-base.dto.ts` — request DTO
- `apps/backend-services/src/benchmark/dto/apply-candidate-to-base-response.dto.ts` — response DTO

### Frontend — Modified
- `apps/frontend/src/features/benchmarking/hooks/useRuns.ts` — replace `useRunOcrImprovement` with `useGenerateCandidate`
- `apps/frontend/src/features/benchmarking/hooks/useDefinitions.ts` — replace `usePromoteCandidateWorkflow` with `useApplyToBaseWorkflow`, add `WorkflowInfo` fields
- `apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx` — update pipeline button to call generate, update `WorkflowInfo` type
- `apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx` — replace old apply-candidate button with new one based on `workflowKind`

### Tests — Modified
- `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.spec.ts` — update for `generate()`
- `apps/backend-services/src/benchmark/benchmark-definition.service.spec.ts` — remove `promoteCandidateWorkflow` tests, add `applyToBaseWorkflow` tests

### Documentation — Modified
- `docs-md/OCR_IMPROVEMENT_PIPELINE.md` — update to reflect new flow

---

## Task 1: Backend — Add `workflowKind` and `sourceWorkflowId` to `WorkflowInfo` DTO

The frontend needs to know if a definition's workflow is a candidate to show the "Apply to Base" button. Add these fields to the definition response DTO.

**Files:**
- Modify: `apps/backend-services/src/benchmark/dto/definition-response.dto.ts:31-51`
- Modify: `apps/backend-services/src/benchmark/benchmark-definition.service.ts` (mapToDefinitionDetails)

- [ ] **Step 1: Add fields to `WorkflowInfo` DTO**

In `apps/backend-services/src/benchmark/dto/definition-response.dto.ts`, add two optional fields to `WorkflowInfo`:

```typescript
export class WorkflowInfo {
  // ... existing fields (id, workflowVersionId, name, version) ...

  /**
   * Workflow lineage kind ("primary" or "benchmark_candidate")
   */
  @ApiProperty({
    description: 'Workflow lineage kind ("primary" or "benchmark_candidate")',
    required: false,
  })
  workflowKind?: string;

  /**
   * Source workflow lineage ID (set when workflowKind is "benchmark_candidate")
   */
  @ApiProperty({
    description: "Source workflow lineage ID for candidate workflows",
    required: false,
  })
  sourceWorkflowId?: string | null;
}
```

- [ ] **Step 2: Update `mapToDefinitionDetails` to populate the new fields**

In `apps/backend-services/src/benchmark/benchmark-definition.service.ts`, the `mapToDefinitionDetails` method builds the `workflow` object. Find the section that builds it (around the `workflow` local variable assignment) and add the two new fields. The definition's include already joins `workflowVersion.lineage`, so the data is available.

Add to the workflow object:
```typescript
workflowKind: definition.workflowVersion.lineage.workflow_kind,
sourceWorkflowId: definition.workflowVersion.lineage.source_workflow_id ?? null,
```

Also update `mapToDefinitionSummary` if it includes workflow info — check if it has a `workflow` field and add the same two fields.

- [ ] **Step 3: Verify the build compiles**

Run: `cd apps/backend-services && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Run existing tests to verify nothing breaks**

Run: `cd apps/backend-services && npx jest --testPathPattern="benchmark-definition.service.spec" --no-coverage`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/benchmark/dto/definition-response.dto.ts apps/backend-services/src/benchmark/benchmark-definition.service.ts
git commit -m "feat: add workflowKind and sourceWorkflowId to definition WorkflowInfo DTO"
```

---

## Task 2: Backend — Extract `generate()` from pipeline service

Split the current `run()` method into `generate()` (steps 1-7, creates candidate only) and keep `run()` calling `generate()` + benchmark start. Then the controller can expose generate independently.

**Files:**
- Modify: `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts`
- Test: `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.spec.ts`

- [ ] **Step 1: Write the failing test for `generate()`**

Add to `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.spec.ts`:

```typescript
describe("generate", () => {
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
      workflowVersionId: "candidate-v1",
      id: "candidate-lineage-1",
    });

    const result = await service.generate({
      workflowVersionId: "wf-1",
      actorId: "user-1",
    });

    expect(result.status).toBe("candidate_created");
    expect(result.candidateWorkflowVersionId).toBe("candidate-v1");
    expect(result.candidateLineageId).toBe("candidate-lineage-1");
    expect(result.recommendationsSummary.applied).toBeGreaterThan(0);
    // Must NOT start a benchmark run
    expect(mockBenchmarkRunService.startRun).not.toHaveBeenCalled();
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend-services && npx jest --testPathPattern="ocr-improvement-pipeline.service.spec" --no-coverage`
Expected: FAIL — `service.generate is not a function`

- [ ] **Step 3: Implement `generate()` and `GenerateInput`/`GenerateResult` types**

In `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts`:

Add new interfaces:

```typescript
export interface GenerateInput {
  workflowVersionId: string;
  actorId: string;
  hitlFilters?: HitlAggregationFilters;
  normalizeFieldsEmptyValueCoercion?: OcrNormalizeFieldsEmptyValueCoercion;
}

export interface GenerateResult {
  candidateWorkflowVersionId: string;
  candidateLineageId: string;
  recommendationsSummary: {
    applied: number;
    rejected: number;
    toolIds: string[];
  };
  analysis?: string;
  pipelineMessage?: string;
  rejectionDetails?: string[];
  status: "candidate_created" | "no_recommendations" | "error";
  error?: string;
}
```

Extract steps 1-7 from `run()` into a new `async generate(input: GenerateInput): Promise<GenerateResult>` method. This is the code from the start of the `try` block in `run()` up through `createCandidateVersion`. The method returns `candidate_created` with the candidate IDs on success.

Then refactor `run()` to call `this.generate(...)` first, check the status, and if `candidate_created`, proceed with the benchmark run steps (steps 8 onward). Remove `BenchmarkRunService` from `generate()` — it should have no dependency on running benchmarks.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend-services && npx jest --testPathPattern="ocr-improvement-pipeline.service.spec" --no-coverage`
Expected: All tests PASS (both new `generate` tests and existing `run` tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.spec.ts
git commit -m "feat: extract generate() from pipeline service for candidate-only creation"
```

---

## Task 3: Backend — New generate endpoint + remove combined run endpoint

Replace `POST .../ocr-improvement/run` with `POST .../ocr-improvement/generate` on the controller.

**Files:**
- Modify: `apps/backend-services/src/benchmark/benchmark-run.controller.ts:103-176`
- Modify: `apps/backend-services/src/benchmark/dto/ocr-improvement-run.dto.ts`
- Modify: `apps/backend-services/src/benchmark/dto/index.ts`

- [ ] **Step 1: Create generate DTO**

Replace the content of `apps/backend-services/src/benchmark/dto/ocr-improvement-run.dto.ts` with:

```typescript
/**
 * DTOs for OCR improvement pipeline generate endpoint.
 */

import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional } from "class-validator";

export class OcrImprovementGenerateDto {
  @ApiProperty({
    description:
      "Optional filters for HITL correction aggregation (e.g. startDate, endDate, groupIds, fieldKeys)",
    required: false,
  })
  @IsOptional()
  @IsObject()
  hitlFilters?: Record<string, unknown>;

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

export class OcrImprovementGenerateResponseDto {
  @ApiProperty({ description: "Candidate workflow version ID" })
  candidateWorkflowVersionId: string;

  @ApiProperty({ description: "Candidate workflow lineage ID" })
  candidateLineageId: string;

  @ApiProperty({ description: "Summary of applied/rejected recommendations" })
  recommendationsSummary: {
    applied: number;
    rejected: number;
    toolIds: string[];
  };

  @ApiProperty({ description: "AI analysis text", required: false })
  analysis?: string;

  @ApiProperty({
    description: "Human-readable message when status is no_recommendations",
    required: false,
  })
  pipelineMessage?: string;

  @ApiProperty({
    description: "Per-recommendation rejection reasons",
    required: false,
  })
  rejectionDetails?: string[];

  @ApiProperty({
    description: "Pipeline status",
    enum: ["candidate_created", "no_recommendations", "error"],
  })
  status: "candidate_created" | "no_recommendations" | "error";

  @ApiProperty({ description: "Error message if status is error", required: false })
  error?: string;
}
```

- [ ] **Step 2: Update DTO index**

In `apps/backend-services/src/benchmark/dto/index.ts`, the export for `ocr-improvement-run.dto` stays (file was renamed in content, not filename). If consumers import `OcrImprovementRunDto` or `OcrImprovementRunResponseDto`, update them. Check imports in the controller — they will be updated in the next step.

- [ ] **Step 3: Replace the controller route**

In `apps/backend-services/src/benchmark/benchmark-run.controller.ts`, replace the `runOcrImprovement` method (lines 103-176) with:

```typescript
@Post("definitions/:definitionId/ocr-improvement/generate")
@HttpCode(HttpStatus.OK)
@Identity({ allowApiKey: true })
@ApiOperation({
  summary: "Generate candidate workflow from HITL corrections",
  description:
    "Aggregates HITL corrections, runs AI recommendation, and creates a candidate workflow. " +
    "Does not start a benchmark run. Use the workflow editor to review, then create a definition and run normally.",
})
@ApiParam({ name: "projectId", description: "Benchmark project ID" })
@ApiParam({ name: "definitionId", description: "Benchmark definition ID" })
@ApiBody({ type: OcrImprovementGenerateDto })
@ApiOkResponse({
  description: "Candidate workflow created or no recommendations",
  type: OcrImprovementGenerateResponseDto,
})
@ApiNotFoundResponse({ description: "Definition not found" })
@ApiForbiddenResponse({ description: "Access denied: not a group member" })
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
  const project =
    await this.benchmarkProjectService.getProjectById(projectId);
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
  let hitlFilters = mapHitlFilters(dto.hitlFilters);
  if (!hitlFilters?.groupIds?.length) {
    hitlFilters = { ...hitlFilters, groupIds: [project.groupId] };
  }
  const result = await this.ocrImprovementPipeline.generate({
    workflowVersionId: definition.workflow.workflowVersionId,
    actorId,
    hitlFilters,
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

Update imports at the top of the controller to use `OcrImprovementGenerateDto` and `OcrImprovementGenerateResponseDto` instead of the old DTO names. Remove the `BenchmarkRunService` dependency from the constructor only if no other method in this controller uses it (it likely does — check first).

- [ ] **Step 4: Add TODO on `workflowConfigOverride`**

In `apps/backend-services/src/benchmark/dto/create-run.dto.ts`, add a comment above `workflowConfigOverride`:

```typescript
// TODO: workflowConfigOverride is no longer used by the improvement pipeline.
// Consider removing if no other consumers exist.
@IsOptional()
@IsObject()
workflowConfigOverride?: Record<string, unknown>;
```

- [ ] **Step 5: Verify the build compiles**

Run: `cd apps/backend-services && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Run tests**

Run: `cd apps/backend-services && npx jest --testPathPattern="(ocr-improvement-pipeline|benchmark-run)" --no-coverage`
Expected: All pass (some old tests may reference `run()` — they should still work since `run()` still exists internally)

- [ ] **Step 7: Commit**

```bash
git add apps/backend-services/src/benchmark/benchmark-run.controller.ts apps/backend-services/src/benchmark/dto/ocr-improvement-run.dto.ts apps/backend-services/src/benchmark/dto/create-run.dto.ts apps/backend-services/src/benchmark/dto/index.ts
git commit -m "feat: replace /ocr-improvement/run with /ocr-improvement/generate endpoint"
```

---

## Task 4: Backend — New `applyToBaseWorkflow` + remove `promoteCandidateWorkflow`

Replace the old mutation-based promote with a clean method that copies the candidate config to the base lineage and optionally cleans up artifacts.

**Files:**
- Create: `apps/backend-services/src/benchmark/dto/apply-candidate-to-base.dto.ts`
- Modify: `apps/backend-services/src/benchmark/dto/index.ts`
- Modify: `apps/backend-services/src/benchmark/benchmark-definition.service.ts`
- Modify: `apps/backend-services/src/benchmark/benchmark-definition.controller.ts`
- Modify: `apps/backend-services/src/benchmark/dto/promote-candidate-workflow.dto.ts` — delete
- Test: `apps/backend-services/src/benchmark/benchmark-definition.service.spec.ts`

- [ ] **Step 1: Create the request/response DTOs**

Create `apps/backend-services/src/benchmark/dto/apply-candidate-to-base.dto.ts`:

```typescript
import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ApplyCandidateToBaseDto {
  @ApiProperty({
    description:
      "Workflow version ID of the candidate to apply to the base lineage",
  })
  @IsString()
  @IsNotEmpty()
  candidateWorkflowVersionId: string;

  @ApiProperty({
    description:
      "Delete the candidate lineage, definitions pointing to it, and their runs",
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  cleanupCandidateArtifacts?: boolean;
}

export class ApplyCandidateToBaseResponseDto {
  @ApiProperty({ description: "New workflow version ID on the base lineage" })
  newBaseWorkflowVersionId: string;

  @ApiProperty({ description: "Base workflow lineage ID" })
  baseLineageId: string;

  @ApiProperty({ description: "New version number on the base lineage" })
  newVersionNumber: number;

  @ApiProperty({
    description: "Whether candidate artifacts were cleaned up",
  })
  cleanedUp: boolean;
}
```

- [ ] **Step 2: Export the new DTO and remove the old one**

In `apps/backend-services/src/benchmark/dto/index.ts`:
- Add: `export * from "./apply-candidate-to-base.dto";`
- Remove: `export * from "./promote-candidate-workflow.dto";`

Delete the file `apps/backend-services/src/benchmark/dto/promote-candidate-workflow.dto.ts`.

- [ ] **Step 3: Write failing tests for `applyToBaseWorkflow`**

In `apps/backend-services/src/benchmark/benchmark-definition.service.spec.ts`, replace the `promoteCandidateWorkflow` describe block (around line 1007) with:

```typescript
describe("applyToBaseWorkflow", () => {
  it("copies candidate config as new version on base lineage", async () => {
    const candidateConfig = {
      schemaVersion: "1.0",
      metadata: {},
      nodes: { n1: { id: "n1", type: "activity", label: "N1", activityType: "test" } },
      edges: [],
      entryNodeId: "n1",
      ctx: {},
    };

    // Mock: find candidate version with its lineage
    jest
      .spyOn(prisma.workflowVersion, "findUnique")
      .mockResolvedValue({
        id: "candidate-v1",
        lineage_id: "candidate-lineage",
        version_number: 1,
        config: candidateConfig,
        created_at: new Date(),
        lineage: {
          id: "candidate-lineage",
          workflow_kind: "benchmark_candidate",
          source_workflow_id: "base-lineage",
          group_id: "group-1",
          name: "Candidate",
          description: null,
          actor_id: "user-1",
          head_version_id: "candidate-v1",
          created_at: new Date(),
          updated_at: new Date(),
        },
      } as never);

    // Mock: find latest version on base lineage
    jest
      .spyOn(prisma.workflowVersion, "findFirst")
      .mockResolvedValue({
        id: "base-v2",
        lineage_id: "base-lineage",
        version_number: 2,
        config: {},
        created_at: new Date(),
      } as never);

    // Mock: create new version
    jest
      .spyOn(prisma.workflowVersion, "create")
      .mockResolvedValue({
        id: "base-v3",
        lineage_id: "base-lineage",
        version_number: 3,
        config: candidateConfig,
        created_at: new Date(),
      } as never);

    // Mock: update lineage head
    jest
      .spyOn(prisma.workflowLineage, "update")
      .mockResolvedValue({} as never);

    const result = await service.applyToBaseWorkflow(
      "project-1",
      "candidate-v1",
      false,
    );

    expect(result.newBaseWorkflowVersionId).toBe("base-v3");
    expect(result.baseLineageId).toBe("base-lineage");
    expect(result.newVersionNumber).toBe(3);
    expect(result.cleanedUp).toBe(false);

    // Verify new version was created on base lineage
    expect(prisma.workflowVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lineage_id: "base-lineage",
          version_number: 3,
        }),
      }),
    );
  });

  it("rejects non-candidate workflows", async () => {
    jest
      .spyOn(prisma.workflowVersion, "findUnique")
      .mockResolvedValue({
        id: "primary-v1",
        lineage_id: "primary-lineage",
        version_number: 1,
        config: {},
        created_at: new Date(),
        lineage: {
          id: "primary-lineage",
          workflow_kind: "primary",
          source_workflow_id: null,
          group_id: "group-1",
          name: "Primary",
          description: null,
          actor_id: "user-1",
          head_version_id: "primary-v1",
          created_at: new Date(),
          updated_at: new Date(),
        },
      } as never);

    await expect(
      service.applyToBaseWorkflow("project-1", "primary-v1", false),
    ).rejects.toThrow("not a benchmark candidate");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd apps/backend-services && npx jest --testPathPattern="benchmark-definition.service.spec" --no-coverage`
Expected: FAIL — `service.applyToBaseWorkflow is not a function`

- [ ] **Step 5: Implement `applyToBaseWorkflow` in `BenchmarkDefinitionService`**

Remove the `promoteCandidateWorkflow` method entirely from `apps/backend-services/src/benchmark/benchmark-definition.service.ts`.

Add the new method:

```typescript
/**
 * Copy a candidate workflow config to the base lineage as a new version.
 * Optionally clean up the candidate lineage and any definitions/runs pointing to it.
 *
 * Does NOT mutate any existing definitions — callers create new definitions or revisions separately.
 */
async applyToBaseWorkflow(
  projectId: string,
  candidateWorkflowVersionId: string,
  cleanupCandidateArtifacts: boolean,
): Promise<{
  newBaseWorkflowVersionId: string;
  baseLineageId: string;
  newVersionNumber: number;
  cleanedUp: boolean;
}> {
  this.logger.log(
    `Applying candidate ${candidateWorkflowVersionId} to base workflow`,
  );

  // 1. Load candidate version with lineage
  const candidateVersion = await this.prisma.workflowVersion.findUnique({
    where: { id: candidateWorkflowVersionId },
    include: { lineage: true },
  });

  if (!candidateVersion?.lineage) {
    throw new NotFoundException(
      `Candidate workflow version not found: ${candidateWorkflowVersionId}`,
    );
  }

  const candidateLineage = candidateVersion.lineage;

  if (candidateLineage.workflow_kind !== "benchmark_candidate") {
    throw new BadRequestException(
      `Workflow ${candidateLineage.id} is not a benchmark candidate`,
    );
  }

  if (!candidateLineage.source_workflow_id) {
    throw new BadRequestException(
      `Candidate lineage ${candidateLineage.id} has no source workflow`,
    );
  }

  const baseLineageId = candidateLineage.source_workflow_id;
  const candidateConfig =
    candidateVersion.config as unknown as GraphWorkflowConfig;

  // 2. Validate candidate config
  const validation = validateGraphConfig(candidateConfig);
  if (!validation.valid) {
    throw new BadRequestException({
      message: "Invalid candidate workflow configuration",
      errors: validation.errors,
    });
  }

  // 3. Get next version number on base lineage
  const latestBase = await this.prisma.workflowVersion.findFirst({
    where: { lineage_id: baseLineageId },
    orderBy: { version_number: "desc" },
    select: { version_number: true },
  });

  const nextVersionNumber = (latestBase?.version_number ?? 0) + 1;

  // 4. Create new version on base lineage
  const newVersion = await this.prisma.workflowVersion.create({
    data: {
      lineage_id: baseLineageId,
      version_number: nextVersionNumber,
      config: candidateConfig as unknown as Prisma.InputJsonValue,
    },
  });

  // 5. Update base lineage head
  await this.prisma.workflowLineage.update({
    where: { id: baseLineageId },
    data: { head_version_id: newVersion.id },
  });

  this.logger.log(
    `Created base version ${newVersion.id} (v${nextVersionNumber}) on lineage ${baseLineageId}`,
  );

  // 6. Cleanup candidate artifacts if requested
  let cleanedUp = false;
  if (cleanupCandidateArtifacts) {
    const candidateLineageId = candidateLineage.id;

    // Find all workflow versions on the candidate lineage
    const candidateVersionIds = await this.prisma.workflowVersion.findMany({
      where: { lineage_id: candidateLineageId },
      select: { id: true },
    });
    const versionIds = candidateVersionIds.map((v) => v.id);

    if (versionIds.length > 0) {
      // Find definitions pointing to any candidate version
      const definitions = await this.prisma.benchmarkDefinition.findMany({
        where: {
          projectId,
          workflowVersionId: { in: versionIds },
        },
        select: { id: true },
      });
      const defIds = definitions.map((d) => d.id);

      if (defIds.length > 0) {
        // Delete runs for those definitions (cascade handles ocr cache)
        await this.prisma.benchmarkRun.deleteMany({
          where: { definitionId: { in: defIds } },
        });

        // Delete the definitions
        await this.prisma.benchmarkDefinition.deleteMany({
          where: { id: { in: defIds } },
        });
      }
    }

    // Delete the candidate lineage (cascades to versions)
    await this.prisma.workflowLineage.delete({
      where: { id: candidateLineageId },
    });

    this.logger.log(
      `Cleaned up candidate lineage ${candidateLineageId} and associated artifacts`,
    );
    cleanedUp = true;
  }

  return {
    newBaseWorkflowVersionId: newVersion.id,
    baseLineageId,
    newVersionNumber: nextVersionNumber,
    cleanedUp,
  };
}
```

Make sure `GraphWorkflowConfig`, `validateGraphConfig`, `Prisma`, `BadRequestException`, and `NotFoundException` are all imported (most should already be).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/backend-services && npx jest --testPathPattern="benchmark-definition.service.spec" --no-coverage`
Expected: All tests PASS. The old `promoteCandidateWorkflow` tests should now be replaced.

- [ ] **Step 7: Update the controller**

In `apps/backend-services/src/benchmark/benchmark-definition.controller.ts`:

Remove the `promoteCandidateWorkflow` route (the `@Post(":definitionId/promote-candidate-workflow")` method). Remove the import of `PromoteCandidateWorkflowDto`.

In `apps/backend-services/src/benchmark/benchmark-run.controller.ts`, add the new route (it lives here because it's a project-level action, not definition-scoped):

```typescript
@Post("apply-candidate-to-base")
@HttpCode(HttpStatus.OK)
@Identity({ allowApiKey: true })
@ApiOperation({
  summary: "Apply candidate workflow config to its base lineage",
  description:
    "Copies the candidate workflow config as a new version on the base lineage. " +
    "Optionally cleans up the candidate lineage and any definitions/runs pointing to it.",
})
@ApiParam({ name: "projectId", description: "Benchmark project ID" })
@ApiBody({ type: ApplyCandidateToBaseDto })
@ApiOkResponse({
  description: "Candidate applied to base lineage",
  type: ApplyCandidateToBaseResponseDto,
})
@ApiNotFoundResponse({ description: "Candidate workflow not found" })
@ApiForbiddenResponse({ description: "Access denied: not a group member" })
async applyCandidateToBase(
  @Param("projectId") projectId: string,
  @Body() dto: ApplyCandidateToBaseDto,
  @Req() req: Request,
): Promise<ApplyCandidateToBaseResponseDto> {
  this.logger.log(
    `POST /api/benchmark/projects/${projectId}/apply-candidate-to-base`,
  );
  await this.assertProjectGroupAccess(projectId, req);

  return this.benchmarkDefinitionService.applyToBaseWorkflow(
    projectId,
    dto.candidateWorkflowVersionId,
    dto.cleanupCandidateArtifacts ?? true,
  );
}
```

Add imports for `ApplyCandidateToBaseDto` and `ApplyCandidateToBaseResponseDto` from the dto index.

- [ ] **Step 8: Verify the build compiles**

Run: `cd apps/backend-services && npx tsc --noEmit`
Expected: No type errors. If there are errors from removed `PromoteCandidateWorkflowDto` imports, fix them.

- [ ] **Step 9: Run all benchmark tests**

Run: `cd apps/backend-services && npx jest --testPathPattern="benchmark" --no-coverage`
Expected: All pass

- [ ] **Step 10: Commit**

```bash
git add apps/backend-services/src/benchmark/dto/apply-candidate-to-base.dto.ts apps/backend-services/src/benchmark/dto/index.ts apps/backend-services/src/benchmark/benchmark-definition.service.ts apps/backend-services/src/benchmark/benchmark-definition.service.spec.ts apps/backend-services/src/benchmark/benchmark-definition.controller.ts apps/backend-services/src/benchmark/benchmark-run.controller.ts
git rm apps/backend-services/src/benchmark/dto/promote-candidate-workflow.dto.ts
git commit -m "feat: replace promoteCandidateWorkflow with applyToBaseWorkflow, respects immutability"
```

---

## Task 5: Frontend — Update hooks for generate + apply-to-base

Replace the old hooks with ones that call the new endpoints.

**Files:**
- Modify: `apps/frontend/src/features/benchmarking/hooks/useRuns.ts`
- Modify: `apps/frontend/src/features/benchmarking/hooks/useDefinitions.ts`

- [ ] **Step 1: Replace `useRunOcrImprovement` with `useGenerateCandidate` in `useRuns.ts`**

In `apps/frontend/src/features/benchmarking/hooks/useRuns.ts`, replace the `useRunOcrImprovement` hook (around lines 294-336) with:

```typescript
interface GenerateCandidateResult {
  candidateWorkflowVersionId: string;
  candidateLineageId: string;
  recommendationsSummary: {
    applied: number;
    rejected: number;
    toolIds: string[];
  };
  analysis?: string;
  pipelineMessage?: string;
  rejectionDetails?: string[];
  status: "candidate_created" | "no_recommendations" | "error";
  error?: string;
}

export const useGenerateCandidate = (
  projectId: string,
  definitionId: string,
) => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (
      body: {
        hitlFilters?: Record<string, unknown>;
        normalizeFieldsEmptyValueCoercion?: "none" | "blank" | "null";
      } = {},
    ) => {
      const response = await apiService.post<GenerateCandidateResult>(
        `/benchmark/projects/${projectId}/definitions/${definitionId}/ocr-improvement/generate`,
        body,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-definition", projectId, definitionId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-definitions", projectId],
      });
    },
  });

  return {
    generateCandidate: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    result: mutation.data,
    error: mutation.error,
  };
};
```

Remove the old `OcrImprovementRunResult` interface and `useRunOcrImprovement` export.

- [ ] **Step 2: Replace `usePromoteCandidateWorkflow` with `useApplyToBaseWorkflow` in `useDefinitions.ts`**

In `apps/frontend/src/features/benchmarking/hooks/useDefinitions.ts`, replace `usePromoteCandidateWorkflow` (around lines 208-242) with:

```typescript
interface ApplyToBaseResult {
  newBaseWorkflowVersionId: string;
  baseLineageId: string;
  newVersionNumber: number;
  cleanedUp: boolean;
}

export const useApplyToBaseWorkflow = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: {
      candidateWorkflowVersionId: string;
      cleanupCandidateArtifacts?: boolean;
    }) => {
      const response = await apiService.post<ApplyToBaseResult>(
        `/benchmark/projects/${projectId}/apply-candidate-to-base`,
        dto,
      );

      if (!response.success || !response.data) {
        throw new Error(
          response.message || "Failed to apply candidate to base",
        );
      }

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-definitions", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-runs", projectId],
      });
    },
  });
};
```

Remove the old `PromoteCandidateWorkflowDto` interface.

- [ ] **Step 3: Add `workflowKind` and `sourceWorkflowId` to frontend `WorkflowInfo`**

In both `apps/frontend/src/features/benchmarking/hooks/useDefinitions.ts` and `apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx`, add to the `WorkflowInfo` interface:

```typescript
interface WorkflowInfo {
  id: string;
  workflowVersionId: string;
  name: string;
  version: number;
  workflowKind?: string;
  sourceWorkflowId?: string | null;
}
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: Errors from components still importing old hooks — these are fixed in the next task.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/benchmarking/hooks/useRuns.ts apps/frontend/src/features/benchmarking/hooks/useDefinitions.ts apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx
git commit -m "feat: frontend hooks for generate candidate and apply-to-base endpoints"
```

---

## Task 6: Frontend — Update DefinitionDetailView for generate-only

The "Run improvement pipeline" button should call generate and show the result without navigating to a run.

**Files:**
- Modify: `apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx`

- [ ] **Step 1: Update imports and handler**

In `apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx`:

Replace the import of `useRunOcrImprovement` with `useGenerateCandidate`:

```typescript
import { useGenerateCandidate, useStartRun } from "../hooks/useRuns";
```

In the component body, replace the `useRunOcrImprovement` call with:

```typescript
const {
  generateCandidate,
  isGenerating: isOcrImprovementRunning,
  result: generateResult,
} = useGenerateCandidate(definition.projectId, definition.id);
```

- [ ] **Step 2: Update the handler and success feedback**

Replace `handleRunOcrImprovement` with:

```typescript
const handleGenerateCandidate = async () => {
  try {
    const result = await generateCandidate({});
    if (result?.status === "candidate_created") {
      notifications.show({
        title: "Candidate workflow created",
        message: `Candidate created. Review it in the workflow editor, then create a definition and benchmark it.`,
        color: "green",
        autoClose: 8000,
      });
    } else if (result?.status === "no_recommendations") {
      notifications.show({
        title: "No recommendations",
        message: result.pipelineMessage || "No tools recommended",
        color: "yellow",
      });
    } else {
      notifications.show({
        title: "Error",
        message: result?.error || "Pipeline failed",
        color: "red",
      });
    }
  } catch (error) {
    notifications.show({
      title: "Error",
      message:
        error instanceof Error ? error.message : "Failed to generate candidate",
      color: "red",
    });
  }
};
```

Update the button's `onClick` to call `handleGenerateCandidate`. Update the button label to "Generate candidate workflow". Update the description text below the button to explain the new flow.

- [ ] **Step 3: Verify frontend builds**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: May still have errors from RunDetailPage — fixed in next task.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx
git commit -m "feat: update definition view to use generate-only pipeline endpoint"
```

---

## Task 7: Frontend — Update RunDetailPage with new "Apply to Base" button

Replace the old button (based on run params) with the new one (based on workflow kind).

**Files:**
- Modify: `apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx`

- [ ] **Step 1: Update imports**

Replace:
```typescript
import {
  useDefinition,
  usePromoteCandidateWorkflow,
} from "../hooks/useDefinitions";
```

With:
```typescript
import {
  useDefinition,
  useApplyToBaseWorkflow,
} from "../hooks/useDefinitions";
```

- [ ] **Step 2: Update button visibility logic**

Remove the old logic (around lines 413-417):
```typescript
const candidateWorkflowRaw = run.params?.candidateWorkflowVersionId;
const candidateWorkflowVersionId =
  typeof candidateWorkflowRaw === "string" ? candidateWorkflowRaw : undefined;
const canApplyCandidateWorkflow =
  run.status === "completed" && Boolean(candidateWorkflowVersionId);
```

Replace with logic that uses the definition's workflow info. The `useDefinition` hook is already called in this component. Add:

```typescript
const canApplyCandidateWorkflow =
  run.status === "completed" &&
  definition?.workflow?.workflowKind === "benchmark_candidate" &&
  !!definition?.workflow?.sourceWorkflowId;

const candidateWorkflowVersionId = definition?.workflow?.workflowVersionId;
```

- [ ] **Step 3: Update the mutation hook and modal**

Replace the `usePromoteCandidateWorkflow` call with:

```typescript
const applyToBaseMutation = useApplyToBaseWorkflow(projectId ?? "");
const isApplyingToBase = applyToBaseMutation.isPending;
```

Add state for the cleanup checkbox:
```typescript
const [cleanupArtifacts, setCleanupArtifacts] = useState(true);
```

Update the modal content to include the cleanup checkbox and call the new mutation:

```typescript
{canApplyCandidateWorkflow && candidateWorkflowVersionId && (
  <>
    <Button
      variant="light"
      color="gray"
      leftSection={<IconSparkles size={16} />}
      loading={isApplyingToBase}
      disabled={isApplyingToBase}
      onClick={() => setApplyCandidateModalOpen(true)}
      data-testid="apply-candidate-btn"
    >
      Apply to base workflow
    </Button>
    <Modal
      opened={applyCandidateModalOpen}
      onClose={() => setApplyCandidateModalOpen(false)}
      title="Apply candidate to base workflow"
      data-testid="apply-candidate-confirm-modal"
    >
      <Stack gap="md">
        <Text size="sm">
          Copy this candidate workflow config as a new version on the base
          workflow lineage.
        </Text>
        <Switch
          checked={cleanupArtifacts}
          onChange={(e) => setCleanupArtifacts(e.currentTarget.checked)}
          label="Clean up candidate artifacts"
          description="Delete the candidate lineage, test definitions, and their runs"
          size="sm"
          data-testid="cleanup-artifacts-switch"
        />
        <Group justify="flex-end" gap="xs">
          <Button
            variant="subtle"
            onClick={() => setApplyCandidateModalOpen(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              try {
                await applyToBaseMutation.mutateAsync({
                  candidateWorkflowVersionId,
                  cleanupCandidateArtifacts: cleanupArtifacts,
                });
                setApplyCandidateModalOpen(false);
                notifications.show({
                  title: "Success",
                  message: "Candidate applied to base workflow",
                  color: "green",
                });
              } catch (error) {
                notifications.show({
                  title: "Error",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Failed to apply candidate",
                  color: "red",
                });
              }
            }}
            data-testid="apply-candidate-confirm-btn"
          >
            Apply
          </Button>
        </Group>
      </Stack>
    </Modal>
  </>
)}
```

Add `Switch` to the Mantine imports if not already imported.

- [ ] **Step 4: Remove old `isPromotingCandidate` references**

Search the file for any remaining references to the old `promoteCandidateWorkflow` mutation and remove them.

- [ ] **Step 5: Verify frontend builds**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx
git commit -m "feat: update apply-to-base button to use workflow kind instead of run params"
```

---

## Task 8: Cleanup — Remove dead code and update documentation

**Files:**
- Modify: `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts` — remove `run()` method and related types
- Modify: `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.spec.ts` — remove `run()` tests
- Modify: `docs-md/OCR_IMPROVEMENT_PIPELINE.md`

- [ ] **Step 1: Remove `run()` method and its types from the pipeline service**

In `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts`:
- Remove `PipelineInput` interface
- Remove `PipelineResult` interface
- Remove the `run()` method
- Remove the `pollUntilTerminalRun()` private method
- Remove the `sleep()` private method
- Remove the `BenchmarkRunService` constructor dependency (and its import) since `generate()` doesn't need it

- [ ] **Step 2: Remove `run()` tests from the spec**

In `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.spec.ts`:
- Remove the `mockBenchmarkRunService` mock
- Remove `BenchmarkRunService` from the test module providers
- Remove all test cases that test `service.run()` (the ones calling `service.run(...)`)
- Keep only the `generate()` tests from Task 2

- [ ] **Step 3: Run tests to verify**

Run: `cd apps/backend-services && npx jest --testPathPattern="ocr-improvement-pipeline" --no-coverage`
Expected: All pass (only `generate()` tests remain)

- [ ] **Step 4: Update documentation**

Update `docs-md/OCR_IMPROVEMENT_PIPELINE.md` to reflect the new flow:
- Replace references to `POST .../ocr-improvement/run` with `POST .../ocr-improvement/generate`
- Remove references to `waitForPipelineRunCompletion`, `pipelineRunPollIntervalMs`, `pipelineRunWaitTimeoutMs`
- Remove references to `promoteCandidateWorkflow` and the old "Apply candidate to base workflow" behavior
- Add documentation for the new `POST .../apply-candidate-to-base` endpoint
- Update the UI section to describe the new flow (generate → review → create definition → run → apply)
- Update the response status values section

- [ ] **Step 5: Run full backend tests**

Run: `cd apps/backend-services && npx jest --no-coverage`
Expected: All pass

- [ ] **Step 6: Verify frontend builds clean**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.spec.ts docs-md/OCR_IMPROVEMENT_PIPELINE.md
git commit -m "chore: remove combined pipeline run() method and update documentation"
```
