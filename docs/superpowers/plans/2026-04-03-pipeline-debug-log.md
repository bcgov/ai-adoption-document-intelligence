# Pipeline Debug Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store a structured debug log of each generate-candidate pipeline run and expose it in the UI as a collapsible accordion.

**Architecture:** Add a `pipeline_debug_log` JSONB column to `benchmark_definitions`. The pipeline service accumulates log entries during `generate()` and persists them. A new GET endpoint returns the log. The frontend fetches it on demand and renders it as an accordion inside the existing OCR improvement card.

**Tech Stack:** NestJS, Prisma, PostgreSQL, React, Mantine (Accordion), TanStack Query

---

### Task 1: Prisma Schema + Migration

**Files:**
- Modify: `apps/shared/prisma/schema.prisma:606` (after `revision` field)
- Create: migration file (auto-generated)

- [ ] **Step 1: Add the column to the Prisma schema**

In `apps/shared/prisma/schema.prisma`, inside `model BenchmarkDefinition`, add after the `revision` line (line 607):

```prisma
  /// Structured debug log from the last OCR improvement pipeline run (overwritten each run)
  pipelineDebugLog        Json?              @map("pipeline_debug_log")
```

- [ ] **Step 2: Generate and apply the migration**

Run from `apps/backend-services`:

```bash
npx prisma migrate dev --name add_pipeline_debug_log --schema ../shared/prisma/schema.prisma
```

Expected: Migration created and applied. New column `pipeline_debug_log` added to `benchmark_definitions`.

- [ ] **Step 3: Regenerate Prisma client**

Run from `apps/backend-services`:

```bash
npm run db:generate
```

Expected: Prisma client regenerated with `pipelineDebugLog` field available on `BenchmarkDefinition`.

- [ ] **Step 4: Commit**

```bash
git add apps/shared/prisma/schema.prisma apps/shared/prisma/migrations/
git commit -m "feat: add pipeline_debug_log column to benchmark_definitions"
```

---

### Task 2: Pipeline Log Type + Accumulation in Pipeline Service

**Files:**
- Modify: `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts`
- Test: `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.spec.ts`

- [ ] **Step 1: Write failing tests for debug log accumulation**

Add these tests to `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.spec.ts`. The pipeline service needs a new dependency (`BenchmarkDefinitionDbService`) to persist the log, so first update the test setup.

Add the import at the top of the test file:

```typescript
import { BenchmarkDefinitionDbService } from "./benchmark-definition-db.service";
```

Add the mock alongside the existing mocks (after `mockWorkflowService`):

```typescript
const mockDefinitionDbService = {
  updatePipelineDebugLog: jest.fn().mockResolvedValue(undefined),
};
```

Add the provider to the `TestingModule` providers array:

```typescript
{ provide: BenchmarkDefinitionDbService, useValue: mockDefinitionDbService },
```

Then add these test cases inside the existing `describe` block:

```typescript
it("should persist debug log entries on successful generation", async () => {
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

  await service.generate({
    workflowVersionId: "wf-1",
    actorId: "user-1",
    definitionId: "def-1",
  });

  expect(mockDefinitionDbService.updatePipelineDebugLog).toHaveBeenCalledWith(
    "def-1",
    expect.arrayContaining([
      expect.objectContaining({ step: "hitl_aggregation" }),
      expect.objectContaining({ step: "tool_manifest" }),
      expect.objectContaining({ step: "workflow_load" }),
      expect.objectContaining({ step: "prompt_build" }),
      expect.objectContaining({ step: "llm_request" }),
      expect.objectContaining({ step: "recommendation_parse" }),
      expect.objectContaining({ step: "apply_recommendations" }),
      expect.objectContaining({ step: "candidate_creation" }),
    ]),
  );
});

it("should persist debug log with error entry on failure", async () => {
  mockHitlAggregation.getAggregatedCorrections.mockRejectedValue(
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

it("should not attempt to persist debug log when definitionId is not provided", async () => {
  mockHitlAggregation.getAggregatedCorrections.mockResolvedValue({
    corrections: [],
    total: 0,
    filters: {},
  });

  await service.generate({
    workflowVersionId: "wf-1",
    actorId: "user-1",
  });

  expect(mockDefinitionDbService.updatePipelineDebugLog).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `apps/backend-services`:

```bash
npx jest --testPathPattern=ocr-improvement-pipeline.service.spec --no-coverage
```

Expected: FAIL — `BenchmarkDefinitionDbService` not injected, `definitionId` not in `GenerateInput`.

- [ ] **Step 3: Add PipelineLogEntry type and update GenerateInput**

In `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts`, add the log entry type after the existing imports:

```typescript
import { BenchmarkDefinitionDbService } from "./benchmark-definition-db.service";

/** Single entry in the pipeline debug log, captured at each step of generate(). */
export interface PipelineLogEntry {
  /** Pipeline step identifier (e.g. "hitl_aggregation", "llm_request") */
  step: string;
  /** ISO 8601 timestamp when the step started */
  timestamp: string;
  /** How long the step took in milliseconds */
  durationMs?: number;
  /** Step-specific payload — varies by step */
  data: Record<string, unknown>;
}
```

Add `definitionId` to `GenerateInput`:

```typescript
export interface GenerateInput {
  workflowVersionId: string;
  actorId: string;
  /** When provided, debug log entries are persisted to this definition's pipelineDebugLog column */
  definitionId?: string;
  hitlFilters?: HitlAggregationFilters;
  normalizeFieldsEmptyValueCoercion?: OcrNormalizeFieldsEmptyValueCoercion;
}
```

- [ ] **Step 4: Inject BenchmarkDefinitionDbService and implement log accumulation**

Update the constructor to add the new dependency:

```typescript
constructor(
  private readonly hitlAggregation: HitlAggregationService,
  private readonly toolManifest: ToolManifestService,
  private readonly aiRecommendation: AiRecommendationService,
  private readonly workflowService: WorkflowService,
  private readonly definitionDb: BenchmarkDefinitionDbService,
) {}
```

Replace the entire `generate()` method body. The structure stays the same but wraps each step to capture log entries. Here is the full replacement for the `generate` method:

```typescript
async generate(input: GenerateInput): Promise<GenerateResult> {
  this.logger.log(
    `Generating candidate workflow for workflow version ${input.workflowVersionId}`,
  );

  // Debug log entries accumulated throughout the pipeline run
  const logEntries: PipelineLogEntry[] = [];

  /** Helper: push a log entry with timing */
  const logStep = (
    step: string,
    startMs: number,
    data: Record<string, unknown>,
  ) => {
    logEntries.push({
      step,
      timestamp: new Date(startMs).toISOString(),
      durationMs: Date.now() - startMs,
      data,
    });
  };

  /** Helper: persist accumulated debug log to the definition (best-effort, never throws) */
  const persistLog = async () => {
    if (!input.definitionId) return;
    try {
      await this.definitionDb.updatePipelineDebugLog(
        input.definitionId,
        logEntries,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to persist pipeline debug log: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  try {
    // Step 1: Aggregate HITL corrections
    let stepStart = Date.now();
    const { corrections } =
      await this.hitlAggregation.getAggregatedCorrections(
        input.hitlFilters ?? {},
      );
    logStep("hitl_aggregation", stepStart, {
      filters: input.hitlFilters ?? {},
      correctionCount: corrections.length,
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
          "No HITL corrections matched the aggregation filters; nothing to recommend.",
        status: "no_recommendations",
      };
    }

    // Step 2: Get tool manifest
    stepStart = Date.now();
    const manifest = this.toolManifest.getManifest();
    logStep("tool_manifest", stepStart, {
      tools: manifest.map((t) => ({
        toolId: t.toolId,
        parameterNames: t.parameters.map((p) => p.name),
      })),
    });

    // Step 3: Build AI input for AiRecommendationService
    const correctionInput = corrections.map((c) => ({
      fieldKey: c.fieldKey,
      originalValue: c.originalValue,
      correctedValue: c.correctedValue,
      action: c.action,
    }));

    const toolInput = manifest.map((t) => ({
      toolId: t.toolId,
      label: t.label,
      description: t.description,
      parameters: t.parameters.map((p) => ({
        name: p.name,
        type: p.type,
        description: p.description,
        required: p.required,
        default: p.default,
      })),
    }));

    // Step 4: Load current workflow and build summary
    stepStart = Date.now();
    const currentWorkflow = await this.workflowService.getWorkflowById(
      input.workflowVersionId,
    );
    if (!currentWorkflow) {
      logStep("workflow_load", stepStart, {
        error: `Workflow version ${input.workflowVersionId} not found`,
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
        error: `Workflow version ${input.workflowVersionId} not found`,
      };
    }

    const config = currentWorkflow.config as GraphWorkflowConfig;
    const insertionSlots = buildInsertionSlots(config, {
      postAzureOcrExtractOnly: true,
    });
    const workflowSummary = {
      nodeIds: Object.keys(config.nodes),
      activityTypes: Object.values(config.nodes)
        .filter((n): n is ActivityNode => n.type === "activity")
        .map((n) => n.activityType),
      edgeSummary: config.edges.map((e) => `${e.source} -> ${e.target}`),
      activityNodes: Object.entries(config.nodes)
        .filter(([, n]) => n.type === "activity")
        .map(([nodeId, n]) => ({
          nodeId,
          activityType: (n as ActivityNode).activityType,
        })),
      insertionSlots: insertionSlots.map((s) => ({
        slotIndex: s.slotIndex,
        afterNodeId: s.afterNodeId,
        beforeNodeId: s.beforeNodeId,
        afterActivityType: s.afterActivityType,
        beforeActivityType: s.beforeActivityType,
      })),
    };
    logStep("workflow_load", stepStart, {
      nodeIds: workflowSummary.nodeIds,
      edgeSummary: workflowSummary.edgeSummary,
      insertionSlots: workflowSummary.insertionSlots,
    });

    this.logger.log(
      `Pipeline prepared: ${correctionInput.length} corrections, ${toolInput.length} tools, ${workflowSummary.nodeIds.length} nodes, ${insertionSlots.length} insertion slots`,
    );

    // Step 5: Run AI recommendation (with prompt and response logging)
    stepStart = Date.now();
    const aiOutput = await this.aiRecommendation.getRecommendations(
      {
        corrections: correctionInput,
        availableTools: toolInput,
        currentWorkflowSummary: workflowSummary,
      },
      manifest.map((t) => t.toolId),
    );
    // Log prompt_build, llm_request, and llm_response from the AI service debug info
    if (aiOutput.debugInfo) {
      logEntries.push(...aiOutput.debugInfo);
    }
    logStep("recommendation_parse", stepStart, {
      recommendations: aiOutput.recommendations,
      analysis: aiOutput.analysis,
    });

    if (aiOutput.recommendations.length === 0) {
      await persistLog();
      return {
        candidateWorkflowVersionId: "",
        candidateLineageId: "",
        recommendationsSummary: {
          applied: 0,
          rejected: 0,
          toolIds: [],
        },
        analysis: aiOutput.analysis,
        pipelineMessage:
          "The model returned analysis but no structured tool recommendations (or every tool id was invalid). Check backend logs for rejected tool ids.",
        status: "no_recommendations",
      };
    }

    const pipelineSlot =
      findSlotImmediatelyAfterAzureOcrExtract(insertionSlots);
    if (!pipelineSlot) {
      await persistLog();
      return {
        candidateWorkflowVersionId: "",
        candidateLineageId: "",
        recommendationsSummary: {
          applied: 0,
          rejected: 0,
          toolIds: [],
        },
        analysis: aiOutput.analysis,
        pipelineMessage:
          "No insertion edge after azureOcr.extract; cannot apply correction tools.",
        status: "no_recommendations",
      };
    }

    const recommendationsWithInsertion = aiOutput.recommendations.map(
      (r) => ({
        toolId: r.toolId,
        parameters: r.parameters,
        rationale: r.rationale,
        priority: r.priority,
        insertionPoint: {
          afterNodeId: pipelineSlot.afterNodeId,
          beforeNodeId: pipelineSlot.beforeNodeId,
        },
      }),
    );

    const resolvedRecommendations = resolveRecommendationsInsertionSlots(
      recommendationsWithInsertion,
      insertionSlots,
    );
    const recommendationsForApply: ToolRecommendation[] =
      resolvedRecommendations.map((r) => ({
        toolId: r.toolId,
        parameters: r.parameters,
        insertionPoint: r.insertionPoint,
        rationale: r.rationale,
        priority: r.priority,
      }));

    // Step 6: Apply recommendations to get candidate config
    stepStart = Date.now();
    const modification = applyRecommendations(
      config,
      recommendationsForApply,
    );

    if (modification.appliedRecommendations.length === 0) {
      modification.rejectedRecommendations.forEach(
        ({ recommendation, reason }) => {
          this.logger.debug(
            `Recommendation rejected: toolId=${recommendation.toolId} afterNodeId=${recommendation.insertionPoint.afterNodeId} beforeNodeId=${recommendation.insertionPoint.beforeNodeId} reason=${reason}`,
          );
        },
      );
      this.logger.debug(
        `Workflow node IDs: ${Object.keys(config.nodes).join(", ")}`,
      );
      logStep("apply_recommendations", stepStart, {
        applied: [],
        rejected: modification.rejectedRecommendations.map(
          ({ recommendation, reason }) => ({
            toolId: recommendation.toolId,
            reason,
          }),
        ),
      });
      await persistLog();
      return {
        candidateWorkflowVersionId: "",
        candidateLineageId: "",
        recommendationsSummary: {
          applied: 0,
          rejected: modification.rejectedRecommendations.length,
          toolIds: [],
        },
        analysis: aiOutput.analysis,
        pipelineMessage:
          "Recommendations could not be inserted into the workflow graph (wrong node ids or missing edges).",
        rejectionDetails: modification.rejectedRecommendations.map(
          ({ recommendation, reason }) =>
            `${recommendation.toolId}: ${reason}`,
        ),
        status: "no_recommendations",
      };
    }

    logStep("apply_recommendations", stepStart, {
      applied: modification.appliedRecommendations.map((r) => r.toolId),
      rejected: modification.rejectedRecommendations.map(
        ({ recommendation, reason }) => ({
          toolId: recommendation.toolId,
          reason,
        }),
      ),
    });

    const candidateConfig =
      input.normalizeFieldsEmptyValueCoercion != null
        ? applyOcrNormalizeFieldsEmptyValueCoercion(
            modification.newConfig,
            input.normalizeFieldsEmptyValueCoercion,
          )
        : modification.newConfig;

    // Step 7: Create candidate workflow
    stepStart = Date.now();
    const candidate = await this.workflowService.createCandidateVersion(
      input.workflowVersionId,
      candidateConfig,
      input.actorId,
    );
    logStep("candidate_creation", stepStart, {
      candidateLineageId: candidate.id,
      candidateVersionId: candidate.workflowVersionId,
    });

    await persistLog();

    return {
      status: "candidate_created",
      candidateWorkflowVersionId: candidate.workflowVersionId,
      candidateLineageId: candidate.id,
      recommendationsSummary: {
        applied: modification.appliedRecommendations.length,
        rejected: modification.rejectedRecommendations.length,
        toolIds: modification.appliedRecommendations.map((r) => r.toolId),
      },
      analysis: aiOutput.analysis,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    this.logger.error(`OCR improvement pipeline generate failed: ${message}`);
    logEntries.push({
      step: "error",
      timestamp: new Date().toISOString(),
      data: { message, stack },
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
      error: message,
    };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/backend-services && npx jest --testPathPattern=ocr-improvement-pipeline.service.spec --no-coverage
```

Expected: All tests PASS (existing + new). The existing tests still pass because `definitionId` is optional — when omitted, `persistLog` is a no-op.

- [ ] **Step 6: Commit**

```bash
git add apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.spec.ts
git commit -m "feat: accumulate and persist pipeline debug log entries in generate()"
```

---

### Task 3: Add debugInfo to AiRecommendationService Output

**Files:**
- Modify: `apps/backend-services/src/benchmark/ai-recommendation.service.ts`

The pipeline service needs prompt text and LLM response for the debug log. Update `AiRecommendationOutput` to carry debug info and populate it in `getRecommendations()`.

- [ ] **Step 1: Update the output interface and populate debugInfo**

In `apps/backend-services/src/benchmark/ai-recommendation.service.ts`, import `PipelineLogEntry`:

```typescript
import type { PipelineLogEntry } from "./ocr-improvement-pipeline.service";
```

Update `AiRecommendationOutput`:

```typescript
export interface AiRecommendationOutput {
  recommendations: ToolRecommendationOutput[];
  analysis: string;
  /** Debug log entries for the LLM call: prompt_build, llm_request, llm_response */
  debugInfo?: PipelineLogEntry[];
}
```

In `getRecommendations()`, after building `systemMessage` and `userMessage` (after line 285), build the prompt_build and llm_request entries. After receiving the response, build the llm_response entry. Collect them all and return as `debugInfo`.

Add this block after `const userMessage = buildUserMessage(input);` (line 285):

```typescript
const debugInfo: PipelineLogEntry[] = [];

// Log the prompt that will be sent to the LLM
debugInfo.push({
  step: "prompt_build",
  timestamp: new Date().toISOString(),
  data: {
    systemMessage: systemMessage,
    userMessage: userMessage,
  },
});

// Log LLM request metadata (no secrets)
debugInfo.push({
  step: "llm_request",
  timestamp: new Date().toISOString(),
  data: {
    deployment,
    apiVersion,
    maxCompletionTokens: 4096,
  },
});
```

After the response is received (after `responseContent = response.data?.choices?.[0]?.message?.content;` on line 313), capture the full response including any usage stats:

```typescript
// Log the raw LLM response
debugInfo.push({
  step: "llm_response",
  timestamp: new Date().toISOString(),
  data: {
    rawContent: responseContent,
    tokenUsage: response.data?.usage ?? null,
  },
});
```

Note: the `response` variable is scoped inside the try block. You need to capture `response.data?.usage` alongside `responseContent`. Declare `let tokenUsage: unknown = null;` before the try block, then assign `tokenUsage = response.data?.usage ?? null;` inside the try block after getting `responseContent`. Then use `tokenUsage` in the debugInfo entry (which should be placed after the try/catch for the HTTP call).

At the end of the method, add `debugInfo` to the return value. Update both return statements (the early return at line 351 and the final return at line 364):

```typescript
return { recommendations: [], analysis: parsed.analysis, debugInfo };
```

and:

```typescript
return { recommendations, analysis: parsed.analysis, debugInfo };
```

- [ ] **Step 2: Run the pipeline tests to ensure nothing breaks**

```bash
cd apps/backend-services && npx jest --testPathPattern=ocr-improvement-pipeline.service.spec --no-coverage
```

Expected: PASS — `debugInfo` is optional so existing mocks still work.

- [ ] **Step 3: Commit**

```bash
git add apps/backend-services/src/benchmark/ai-recommendation.service.ts
git commit -m "feat: return debugInfo (prompt, request metadata, raw response) from AiRecommendationService"
```

---

### Task 4: Add updatePipelineDebugLog to BenchmarkDefinitionDbService

**Files:**
- Modify: `apps/backend-services/src/benchmark/benchmark-definition-db.service.ts`
- Test: `apps/backend-services/src/benchmark/benchmark-definition-db.service.spec.ts`

- [ ] **Step 1: Write failing test**

In `apps/backend-services/src/benchmark/benchmark-definition-db.service.spec.ts`, add a test for the new method. First read the file to understand the existing test setup, then add:

```typescript
describe("updatePipelineDebugLog", () => {
  it("should update the pipelineDebugLog column", async () => {
    const entries = [
      { step: "hitl_aggregation", timestamp: "2026-04-03T00:00:00Z", data: { correctionCount: 5 } },
    ];

    mockPrismaClient.benchmarkDefinition.update.mockResolvedValue({
      id: "def-1",
      pipelineDebugLog: entries,
    });

    await service.updatePipelineDebugLog("def-1", entries);

    expect(mockPrismaClient.benchmarkDefinition.update).toHaveBeenCalledWith({
      where: { id: "def-1" },
      data: { pipelineDebugLog: entries },
      select: { id: true },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend-services && npx jest --testPathPattern=benchmark-definition-db.service.spec --no-coverage
```

Expected: FAIL — `updatePipelineDebugLog` does not exist.

- [ ] **Step 3: Implement updatePipelineDebugLog**

In `apps/backend-services/src/benchmark/benchmark-definition-db.service.ts`, add the method:

```typescript
/** Persist pipeline debug log entries to a definition (overwrites previous log). */
async updatePipelineDebugLog(
  definitionId: string,
  entries: Array<{ step: string; timestamp: string; durationMs?: number; data: Record<string, unknown> }>,
): Promise<void> {
  await this.prisma.benchmarkDefinition.update({
    where: { id: definitionId },
    data: { pipelineDebugLog: entries as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
}
```

Make sure `Prisma` is imported (it should already be — check the existing imports).

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend-services && npx jest --testPathPattern=benchmark-definition-db.service.spec --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/benchmark/benchmark-definition-db.service.ts apps/backend-services/src/benchmark/benchmark-definition-db.service.spec.ts
git commit -m "feat: add updatePipelineDebugLog method to BenchmarkDefinitionDbService"
```

---

### Task 5: New DTO + GET Endpoint on Controller

**Files:**
- Create: `apps/backend-services/src/benchmark/dto/pipeline-debug-log.dto.ts`
- Modify: `apps/backend-services/src/benchmark/dto/index.ts`
- Modify: `apps/backend-services/src/benchmark/benchmark-run.controller.ts`
- Test: `apps/backend-services/src/benchmark/benchmark-run.controller.spec.ts`

- [ ] **Step 1: Write the failing test for the new endpoint**

In `apps/backend-services/src/benchmark/benchmark-run.controller.spec.ts`, add a new `describe` block for the debug log endpoint. First update `mockDefinitionService` to include `getPipelineDebugLog`:

Add to the `mockDefinitionService` object (alongside existing methods):

```typescript
getPipelineDebugLog: jest.fn().mockResolvedValue({
  entries: [
    { step: "hitl_aggregation", timestamp: "2026-04-03T00:00:00Z", durationMs: 50, data: { correctionCount: 3 } },
    { step: "llm_request", timestamp: "2026-04-03T00:00:01Z", durationMs: 2000, data: { deployment: "gpt-4o" } },
  ],
}),
```

Then add the test block:

```typescript
describe("GET /definitions/:definitionId/ocr-improvement/debug-log", () => {
  it("returns the pipeline debug log entries", async () => {
    const result = await controller.getPipelineDebugLog(
      projectId,
      "def-1",
      mockReq,
    );

    expect(
      mockDefinitionService.getPipelineDebugLog,
    ).toHaveBeenCalledWith(projectId, "def-1");
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].step).toBe("hitl_aggregation");
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/backend-services && npx jest --testPathPattern=benchmark-run.controller.spec --no-coverage
```

Expected: FAIL — `getPipelineDebugLog` not on controller.

- [ ] **Step 3: Create the DTO file**

Create `apps/backend-services/src/benchmark/dto/pipeline-debug-log.dto.ts`:

```typescript
/**
 * DTOs for the pipeline debug log endpoint.
 *
 * Returns structured log entries from the last OCR improvement pipeline run.
 */

import { ApiProperty } from "@nestjs/swagger";

export class PipelineLogEntryDto {
  @ApiProperty({ description: "Pipeline step identifier (e.g. hitl_aggregation, llm_request)" })
  step: string;

  @ApiProperty({ description: "ISO 8601 timestamp when the step started" })
  timestamp: string;

  @ApiProperty({ description: "Step duration in milliseconds", required: false })
  durationMs?: number;

  @ApiProperty({ description: "Step-specific payload (varies by step)" })
  data: Record<string, unknown>;
}

export class PipelineDebugLogResponseDto {
  @ApiProperty({
    description: "Debug log entries from the last pipeline run",
    type: [PipelineLogEntryDto],
  })
  entries: PipelineLogEntryDto[];
}
```

- [ ] **Step 4: Export the DTO from the barrel**

In `apps/backend-services/src/benchmark/dto/index.ts`, add:

```typescript
export * from "./pipeline-debug-log.dto";
```

- [ ] **Step 5: Add getPipelineDebugLog to BenchmarkDefinitionService**

In `apps/backend-services/src/benchmark/benchmark-definition.service.ts`, add this method:

```typescript
/** Get the pipeline debug log for a definition. Returns empty entries if no log exists. */
async getPipelineDebugLog(
  projectId: string,
  definitionId: string,
): Promise<{ entries: Array<{ step: string; timestamp: string; durationMs?: number; data: Record<string, unknown> }> }> {
  const definition = await this.prisma.benchmarkDefinition.findFirst({
    where: { id: definitionId, projectId },
    select: { pipelineDebugLog: true },
  });
  if (!definition) {
    throw new NotFoundException(`Definition ${definitionId} not found in project ${projectId}`);
  }
  const entries = Array.isArray(definition.pipelineDebugLog)
    ? (definition.pipelineDebugLog as Array<{ step: string; timestamp: string; durationMs?: number; data: Record<string, unknown> }>)
    : [];
  return { entries };
}
```

- [ ] **Step 6: Add the GET endpoint to the controller**

In `apps/backend-services/src/benchmark/benchmark-run.controller.ts`, add the import for the new DTO (in the import block from `"./dto"`):

```typescript
import {
  // ... existing imports
  PipelineDebugLogResponseDto,
} from "./dto";
```

Add the endpoint method to `BenchmarkRunController` (before the `startRun` method, after the `generateCandidate` method):

```typescript
@Get("definitions/:definitionId/ocr-improvement/debug-log")
@Identity({ allowApiKey: true })
@ApiOperation({
  summary: "Get pipeline debug log for a definition",
  description:
    "Returns structured debug log entries from the last OCR improvement pipeline run. " +
    "Includes prompts sent to the LLM, raw responses, timing, and step-by-step details.",
})
@ApiParam({ name: "projectId", description: "Benchmark project ID" })
@ApiParam({ name: "definitionId", description: "Benchmark definition ID" })
@ApiOkResponse({
  description: "Pipeline debug log entries",
  type: PipelineDebugLogResponseDto,
})
@ApiNotFoundResponse({ description: "Definition not found" })
@ApiForbiddenResponse({ description: "Access denied: not a group member" })
async getPipelineDebugLog(
  @Param("projectId") projectId: string,
  @Param("definitionId") definitionId: string,
  @Req() req: Request,
): Promise<PipelineDebugLogResponseDto> {
  this.logger.log(
    `GET /api/benchmark/projects/${projectId}/definitions/${definitionId}/ocr-improvement/debug-log`,
  );
  await this.assertProjectGroupAccess(projectId, req);
  return this.benchmarkDefinitionService.getPipelineDebugLog(
    projectId,
    definitionId,
  );
}
```

- [ ] **Step 7: Pass definitionId to generate() in the controller**

In the existing `generateCandidate` method, update the `generate()` call to pass `definitionId`:

Change:

```typescript
const result = await this.ocrImprovementPipeline.generate({
  workflowVersionId: definition.workflow.workflowVersionId,
  actorId,
  hitlFilters,
  normalizeFieldsEmptyValueCoercion: dto.normalizeFieldsEmptyValueCoercion,
});
```

To:

```typescript
const result = await this.ocrImprovementPipeline.generate({
  workflowVersionId: definition.workflow.workflowVersionId,
  actorId,
  definitionId,
  hitlFilters,
  normalizeFieldsEmptyValueCoercion: dto.normalizeFieldsEmptyValueCoercion,
});
```

- [ ] **Step 8: Run the controller tests**

```bash
cd apps/backend-services && npx jest --testPathPattern=benchmark-run.controller.spec --no-coverage
```

Expected: PASS

- [ ] **Step 9: Run all benchmark tests to check for regressions**

```bash
cd apps/backend-services && npx jest --testPathPattern=benchmark --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/backend-services/src/benchmark/dto/pipeline-debug-log.dto.ts apps/backend-services/src/benchmark/dto/index.ts apps/backend-services/src/benchmark/benchmark-run.controller.ts apps/backend-services/src/benchmark/benchmark-run.controller.spec.ts apps/backend-services/src/benchmark/benchmark-definition.service.ts
git commit -m "feat: add GET debug-log endpoint and pipeline debug log DTO"
```

---

### Task 6: Frontend Hook

**Files:**
- Modify: `apps/frontend/src/features/benchmarking/hooks/useRuns.ts`

- [ ] **Step 1: Add the PipelineLogEntry type and usePipelineDebugLog hook**

In `apps/frontend/src/features/benchmarking/hooks/useRuns.ts`, add the type and hook.

Add the type after the `GenerateCandidateResult` interface (after line 89):

```typescript
/** Single entry in the pipeline debug log */
interface PipelineLogEntry {
  /** Pipeline step identifier */
  step: string;
  /** ISO 8601 timestamp when the step started */
  timestamp: string;
  /** Step duration in milliseconds */
  durationMs?: number;
  /** Step-specific payload */
  data: Record<string, unknown>;
}

interface PipelineDebugLogResult {
  entries: PipelineLogEntry[];
}
```

Add the hook after `useGenerateCandidate` (after line 306):

```typescript
/**
 * Fetch the pipeline debug log for a definition.
 * Only fetches when `enabled` is true (i.e., user opened the debug log section).
 */
export const usePipelineDebugLog = (
  projectId: string,
  definitionId: string,
  enabled: boolean,
) => {
  const query = useQuery({
    queryKey: ["pipeline-debug-log", projectId, definitionId],
    queryFn: async () => {
      const response = await apiService.get<PipelineDebugLogResult>(
        `/benchmark/projects/${projectId}/definitions/${definitionId}/ocr-improvement/debug-log`,
      );
      return response.data;
    },
    enabled: !!projectId && !!definitionId && enabled,
  });

  return {
    entries: query.data?.entries ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
};
```

Add `PipelineLogEntry` to the type exports at the bottom of the file:

```typescript
export type {
  BaselineComparison,
  HistoricalRunData,
  MetricComparison,
  MetricThreshold,
  PerSampleResult,
  PerSampleResultsData,
  PipelineLogEntry,
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/benchmarking/hooks/useRuns.ts
git commit -m "feat: add usePipelineDebugLog hook for fetching debug log on demand"
```

---

### Task 7: Frontend Accordion UI

**Files:**
- Modify: `apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx`

- [ ] **Step 1: Add imports**

Add `Accordion`, `Collapse` to the Mantine imports and the new hook:

Update the Mantine import line to add `Accordion` and `JsonInput`:

```typescript
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from "@mantine/core";
```

Add the icon import:

```typescript
import { IconBug } from "@tabler/icons-react";
```

Add the hook import:

```typescript
import { useBaselineHistory, useDefinition } from "../hooks/useDefinitions";
import { useGenerateCandidate, usePipelineDebugLog, useStartRun } from "../hooks/useRuns";
```

- [ ] **Step 2: Add state and hook usage**

Inside the `DefinitionDetailView` component, after the `persistOcrCache` state (after line 135), add:

```typescript
// Pipeline debug log: only fetches when the user expands the section
const [showDebugLog, setShowDebugLog] = useState(false);
const {
  entries: debugLogEntries,
  isLoading: isLoadingDebugLog,
} = usePipelineDebugLog(
  definition.projectId,
  definition.id,
  showDebugLog,
);
```

- [ ] **Step 3: Add the debug log helper for human-readable step names**

Add this helper function inside the component, before the return statement:

```typescript
/** Map step identifiers to human-readable labels for the accordion headers */
const stepLabel = (step: string): string => {
  const labels: Record<string, string> = {
    hitl_aggregation: "HITL Correction Aggregation",
    tool_manifest: "Tool Manifest",
    workflow_load: "Workflow Load",
    prompt_build: "LLM Prompt",
    llm_request: "LLM Request Metadata",
    llm_response: "LLM Response",
    recommendation_parse: "Recommendation Parsing",
    apply_recommendations: "Apply Recommendations",
    candidate_creation: "Candidate Creation",
    error: "Error",
  };
  return labels[step] ?? step;
};
```

- [ ] **Step 4: Add the debug log UI section**

In the JSX, inside the OCR improvement `<Card>`, after the `generateResult` block (after the closing `)}` on line 434 and before the `workflowConfigOverrides` block), add:

```tsx
{/* Pipeline debug log — collapsible accordion, fetched on demand */}
<Button
  variant="subtle"
  size="xs"
  leftSection={<IconBug size={14} />}
  onClick={() => {
    setShowDebugLog((prev) => !prev);
  }}
  data-testid="toggle-debug-log-btn"
>
  {showDebugLog ? "Hide debug log" : "View debug log"}
</Button>

{showDebugLog && (
  <Stack gap="xs">
    {isLoadingDebugLog ? (
      <Loader size="sm" />
    ) : debugLogEntries.length === 0 ? (
      <Text size="sm" c="dimmed" data-testid="no-debug-log-message">
        No debug log available. Run the pipeline to generate one.
      </Text>
    ) : (
      <Accordion
        variant="separated"
        multiple
        data-testid="pipeline-debug-log-accordion"
      >
        {debugLogEntries.map((entry, idx) => (
          <Accordion.Item
            key={`${entry.step}-${idx}`}
            value={`${entry.step}-${idx}`}
          >
            <Accordion.Control>
              <Group gap="sm">
                <Text size="sm" fw={500}>
                  {stepLabel(entry.step)}
                </Text>
                {entry.durationMs != null && (
                  <Badge size="xs" variant="light" color="gray">
                    {entry.durationMs < 1000
                      ? `${entry.durationMs}ms`
                      : `${(entry.durationMs / 1000).toFixed(1)}s`}
                  </Badge>
                )}
                <Text size="xs" c="dimmed">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              {entry.step === "prompt_build" ? (
                <Stack gap="xs">
                  {/* Show system and user messages as separate collapsible sections */}
                  <Accordion variant="contained" multiple>
                    <Accordion.Item value="system">
                      <Accordion.Control>
                        <Text size="sm" fw={500}>
                          System Message
                        </Text>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Code
                          block
                          style={{
                            fontSize: 12,
                            maxHeight: 400,
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {typeof entry.data.systemMessage === "string"
                            ? entry.data.systemMessage
                            : JSON.stringify(
                                entry.data.systemMessage,
                                null,
                                2,
                              )}
                        </Code>
                      </Accordion.Panel>
                    </Accordion.Item>
                    <Accordion.Item value="user">
                      <Accordion.Control>
                        <Text size="sm" fw={500}>
                          User Message
                        </Text>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Code
                          block
                          style={{
                            fontSize: 12,
                            maxHeight: 400,
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {typeof entry.data.userMessage === "string"
                            ? entry.data.userMessage
                            : JSON.stringify(
                                entry.data.userMessage,
                                null,
                                2,
                              )}
                        </Code>
                      </Accordion.Panel>
                    </Accordion.Item>
                  </Accordion>
                </Stack>
              ) : (
                <Code
                  block
                  style={{
                    fontSize: 12,
                    maxHeight: 400,
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(entry.data, null, 2)}
                </Code>
              )}
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    )}
  </Stack>
)}
```

- [ ] **Step 5: Verify the frontend compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx
git commit -m "feat: add pipeline debug log accordion UI in OCR improvement card"
```

---

### Task 8: Update Documentation

**Files:**
- Modify: `docs-md/OCR_IMPROVEMENT_PIPELINE.md`

- [ ] **Step 1: Add debug log section to the pipeline docs**

Add a new section to `docs-md/OCR_IMPROVEMENT_PIPELINE.md` describing the debug log feature:

```markdown
## Pipeline Debug Log

Each run of the "Generate candidate workflow" button captures a structured debug log with timing and full details of each pipeline step. The log is stored on the `BenchmarkDefinition` record and overwritten on each generation run.

### Viewing the Debug Log

In the OCR improvement card on the definition detail view, click **"View debug log"** to expand the debug log accordion. Each step is shown as a collapsible section with:

- **Step name** — human-readable label (e.g., "LLM Prompt", "HITL Correction Aggregation")
- **Duration** — how long the step took
- **Timestamp** — when the step started
- **Data** — step-specific payload shown as formatted JSON

The "LLM Prompt" step has nested collapsible sections for the system message and user message, since these can be large.

### API Access

```
GET /api/benchmark/projects/:projectId/definitions/:definitionId/ocr-improvement/debug-log
```

Returns `{ entries: PipelineLogEntry[] }` where each entry has `step`, `timestamp`, `durationMs`, and `data` fields.

### Debug Log Steps

| Step | What it captures |
|------|-----------------|
| `hitl_aggregation` | Filters used, correction count, sample corrections |
| `tool_manifest` | Available tool IDs and their parameter names |
| `workflow_load` | Graph node IDs, edges, insertion slots |
| `prompt_build` | Full system and user messages sent to the LLM |
| `llm_request` | Model deployment, API version, max tokens |
| `llm_response` | Raw model response content, token usage stats |
| `recommendation_parse` | Parsed tool recommendations with rationale |
| `apply_recommendations` | Which tools were applied/rejected and why |
| `candidate_creation` | New candidate lineage and version IDs |
| `error` | Error message and stack trace (on failure) |
```

- [ ] **Step 2: Commit**

```bash
git add docs-md/OCR_IMPROVEMENT_PIPELINE.md
git commit -m "docs: add pipeline debug log section to OCR improvement pipeline docs"
```

---

### Task 9: Final Integration Test

- [ ] **Step 1: Run all backend tests**

```bash
cd apps/backend-services && npx jest --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 2: Run frontend type check**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run backend type check**

```bash
cd apps/backend-services && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run linting**

```bash
cd apps/backend-services && npx eslint src/benchmark/ --ext .ts
cd apps/frontend && npx eslint src/features/benchmarking/ --ext .ts,.tsx
```

Expected: No errors (or only pre-existing ones).
