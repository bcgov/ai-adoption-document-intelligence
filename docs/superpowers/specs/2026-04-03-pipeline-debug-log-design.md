# Pipeline Debug Log for Generate Candidate Workflow

**Date:** 2026-04-03
**Status:** Approved

## Problem

The generate candidate workflow calls an LLM, applies recommendations, and creates a candidate workflow, but there is no way to inspect what happened after the fact. Users need to see the full prompt sent, the raw LLM response, which tools were applied/rejected, and timing — all from the UI.

## Approach

Store a structured debug log as a JSON column on `BenchmarkDefinition`, overwritten each time "Generate candidate workflow" runs. Expose it via a dedicated GET endpoint. Show it in the UI as a collapsible accordion inside the existing OCR improvement card, hidden by default.

## Database

Add one nullable JSON column to `BenchmarkDefinition`:

```prisma
pipelineDebugLog  Json?  @map("pipeline_debug_log")
```

Migration: standard `ALTER TABLE benchmark_definitions ADD COLUMN pipeline_debug_log JSONB`.

## Data Shape

The column stores a JSON array of `PipelineLogEntry`:

```ts
interface PipelineLogEntry {
  /** Pipeline step identifier */
  step: string;
  /** ISO 8601 timestamp when the step started */
  timestamp: string;
  /** How long the step took in milliseconds */
  durationMs?: number;
  /** Step-specific payload */
  data: Record<string, unknown>;
}
```

### Step Definitions

| Step | `data` contents |
|------|----------------|
| `hitl_aggregation` | `{ filters, correctionCount, sampleCorrections }` — filters used, total count, first 5 corrections as sample |
| `tool_manifest` | `{ tools }` — array of `{ toolId, parameterNames }` |
| `workflow_load` | `{ nodeIds, edgeSummary, insertionSlots }` |
| `prompt_build` | `{ systemMessage, userMessage }` — full prompt text sent to the model |
| `llm_request` | `{ deployment, apiVersion, maxCompletionTokens }` — request metadata (no secrets) |
| `llm_response` | `{ rawContent, tokenUsage }` — raw model response string, usage stats if available |
| `recommendation_parse` | `{ jsonParseFailed, recommendations, analysis }` — parsed tool recommendations with parameters/rationale/priority |
| `apply_recommendations` | `{ applied, rejected }` — applied tool IDs, rejected entries with reasons |
| `candidate_creation` | `{ candidateLineageId, candidateVersionId }` |
| `error` | `{ message, stack }` — captured on failure at any step |

## Backend Changes

### 1. Pipeline Service (`ocr-improvement-pipeline.service.ts`)

- Add `definitionId` to `GenerateInput` so the service can persist the log.
- Create a local `PipelineLogEntry[]` array at the start of `generate()`.
- At each pipeline step, push a log entry with timestamp, duration, and step-specific data.
- In the `finally` block (or end of try + catch), write the accumulated log array to the definition's `pipelineDebugLog` column via `prisma.benchmarkDefinition.update()`.
- The log is persisted regardless of success or failure, so errors are always inspectable.

### 2. Controller (`benchmark-run.controller.ts`)

- Pass `definitionId` into `ocrImprovementPipeline.generate()`.

### 3. New Endpoint

```
GET /api/benchmark/projects/:projectId/definitions/:definitionId/ocr-improvement/debug-log
```

- Reads the definition's `pipelineDebugLog` column.
- Returns `{ entries: PipelineLogEntry[] }` (empty array if null).
- Standard auth + project group access check.
- Full Swagger decorators.

### 4. New DTO (`dto/pipeline-debug-log.dto.ts`)

```ts
class PipelineLogEntryDto {
  @ApiProperty({ description: 'Pipeline step identifier' })
  step: string;

  @ApiProperty({ description: 'ISO 8601 timestamp when the step started' })
  timestamp: string;

  @ApiProperty({ description: 'Step duration in milliseconds', required: false })
  durationMs?: number;

  @ApiProperty({ description: 'Step-specific payload' })
  data: Record<string, unknown>;
}

class PipelineDebugLogResponseDto {
  @ApiProperty({ description: 'Debug log entries from the last pipeline run', type: [PipelineLogEntryDto] })
  entries: PipelineLogEntryDto[];
}
```

## Frontend Changes

### 1. New Hook (`hooks/useRuns.ts`)

```ts
usePipelineDebugLog(projectId, definitionId, enabled)
```

- Calls `GET .../ocr-improvement/debug-log`.
- `enabled` is controlled by whether the user has opened the debug log section.
- Returns `{ entries, isLoading, error }`.

### 2. UI (`DefinitionDetailView.tsx`)

Inside the OCR improvement card, after the existing `generateResult` display:

- **"View Debug Log" button** — always shown in the OCR improvement card. If no log exists yet, the accordion shows "No debug log available. Run the pipeline to generate one."
- Clicking toggles visibility of an accordion section.
- **Accordion items**: One per log entry, rendered in order.
  - **Header**: Step name (human-readable label), timestamp, duration badge (e.g., "1.2s").
  - **Body**: `data` rendered as formatted JSON in a Mantine `<Code block>`.
  - For the `prompt_build` step: show `systemMessage` and `userMessage` as separate nested collapsible sections since they're large.
- The accordion is **collapsed by default** — user must expand each step to see details.

## Files Changed

| File | Change |
|------|--------|
| `apps/shared/prisma/schema.prisma` | Add `pipelineDebugLog` column |
| `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts` | Accumulate and persist debug log entries |
| `apps/backend-services/src/benchmark/ai-recommendation.service.ts` | Return raw response and request metadata for logging |
| `apps/backend-services/src/benchmark/benchmark-run.controller.ts` | Pass `definitionId`, add GET debug-log endpoint |
| `apps/backend-services/src/benchmark/dto/pipeline-debug-log.dto.ts` | New DTO file |
| `apps/backend-services/src/benchmark/dto/index.ts` | Export new DTO |
| `apps/frontend/src/features/benchmarking/hooks/useRuns.ts` | Add `usePipelineDebugLog` hook |
| `apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx` | Add debug log accordion UI |
| New migration file | Prisma migration for the column |
| Tests for controller and pipeline service | Updated to cover debug log |
