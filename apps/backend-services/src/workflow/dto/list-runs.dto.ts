/**
 * US-150 — DTOs for `GET /api/workflows/:id/runs`.
 *
 * Surfaces a paginated list of historical Temporal workflow executions
 * scoped to a single workflow lineage. The endpoint reads from Temporal's
 * visibility store (Elasticsearch-backed) — no sidecar Postgres table.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L21 + L22
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.1
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

/** Status values the visibility query supports for the `status` filter. */
export type RunSummaryStatus = "running" | "succeeded" | "failed" | "cancelled";

export const RUN_SUMMARY_STATUSES: readonly RunSummaryStatus[] = [
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

/** Maximum page size the endpoint will honour. */
export const LIST_RUNS_MAX_LIMIT = 200;

/** Default page size when the caller omits `limit`. */
export const LIST_RUNS_DEFAULT_LIMIT = 50;

/**
 * Query parameters for `GET /api/workflows/:id/runs`.
 *
 * All filters are optional. `limit` defaults to 50 and is capped at 200 —
 * mirrors Temporal's visibility page-size guidance.
 */
export class ListRunsQueryDto {
  @ApiPropertyOptional({
    description:
      "Opaque pagination cursor returned by a previous response's " +
      "`nextCursor` field. When supplied, the endpoint resumes from that " +
      "page; otherwise it returns the first page (most recent runs).",
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description:
      "Maximum number of runs to return on this page. Defaults to 50, " +
      "capped at 200. Must be a positive integer.",
    default: LIST_RUNS_DEFAULT_LIMIT,
    maximum: LIST_RUNS_MAX_LIMIT,
    minimum: 1,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_RUNS_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description:
      "Filter to runs in a specific terminal / running state. Translates " +
      "to Temporal's visibility `ExecutionStatus` attribute.",
    enum: RUN_SUMMARY_STATUSES,
  })
  @IsOptional()
  @IsIn(RUN_SUMMARY_STATUSES as unknown as string[])
  status?: RunSummaryStatus;

  @ApiPropertyOptional({
    description:
      "ISO-8601 timestamp; only include runs whose `startTime` is at or " +
      "after this value. Combined with `startedBefore` for a range filter.",
    example: "2026-05-24T00:00:00.000Z",
  })
  @IsOptional()
  @IsDateString()
  startedAfter?: string;

  @ApiPropertyOptional({
    description:
      "ISO-8601 timestamp; only include runs whose `startTime` is at or " +
      "before this value. Combined with `startedAfter` for a range filter.",
    example: "2026-05-25T00:00:00.000Z",
  })
  @IsOptional()
  @IsDateString()
  startedBefore?: string;

  @ApiPropertyOptional({
    description:
      "Filter to runs of a specific pinned `WorkflowVersion.id`. Translates " +
      "to Temporal's visibility `WorkflowVersionId` search attribute.",
  })
  @IsOptional()
  @IsString()
  workflowVersionId?: string;
}

/** Compact summary of a historical run, one per row in the drawer. */
export class RunSummaryDto {
  @ApiProperty({
    description:
      "Temporal workflow execution id of the run. Pass to `GET " +
      "/:id/runs/:runId/...` endpoints to drill into per-node detail.",
    example: "graph-adhoc-9f8e7d6c-5b4a-3210-fedc-ba9876543210",
  })
  runId!: string;

  @ApiProperty({
    description: "`WorkflowVersion.id` the run executed against.",
    example: "wv-abc-123",
  })
  workflowVersionId!: string;

  @ApiProperty({
    description:
      "Human-readable version number (`WorkflowVersion.version_number`). " +
      "Read from the Temporal execution's `memo.workflowVersion` field " +
      "without an additional Postgres lookup.",
    example: 3,
  })
  versionNumber!: number;

  @ApiProperty({
    description:
      "Lifecycle state of the run. `running` is in-flight; the others " +
      "are terminal.",
    enum: RUN_SUMMARY_STATUSES,
  })
  status!: RunSummaryStatus;

  @ApiProperty({
    description: "ISO-8601 timestamp at which Temporal started the execution.",
    example: "2026-05-24T12:00:00.000Z",
  })
  startedAt!: string;

  @ApiPropertyOptional({
    description:
      "ISO-8601 timestamp at which the execution closed. Absent for " +
      "in-flight (`status === 'running'`) runs.",
    example: "2026-05-24T12:00:42.000Z",
  })
  endedAt?: string;

  @ApiPropertyOptional({
    description:
      "Compact projection of the run's `initialCtx` (first 4 top-level " +
      "keys, strings truncated to 80 chars, Documents rendered as " +
      "`Document(<storage_key tail>)`). Populated ONLY for the first " +
      "page of results (no `cursor` in the request) — subsequent pages " +
      "omit this field to keep pagination cheap (the consumer can fetch " +
      "the full ctx on demand via the run-detail endpoint).",
    type: "object",
    additionalProperties: true,
    example: { customerId: "cust-001", documentUrl: "Document(scan.pdf)" },
  })
  inputCtxSummary?: Record<string, unknown>;
}

/** Response body of `GET /api/workflows/:id/runs`. */
export class ListRunsResponseDto {
  @ApiProperty({
    description:
      "Runs on this page, newest-first (Temporal's default ordering for " +
      "visibility queries).",
    type: () => [RunSummaryDto],
  })
  runs!: RunSummaryDto[];

  @ApiProperty({
    description:
      "Opaque cursor to pass as `cursor` on a follow-up call to fetch " +
      "the next page. `null` when this is the last page.",
    nullable: true,
    type: String,
    example: "next-page-token",
  })
  nextCursor!: string | null;
}
