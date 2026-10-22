import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";

/**
 * Body of `POST /api/workflows/:id/tries`.
 *
 * Deliberately the same shape as `StartRunRequestDto` with NO `trigger`
 * field: what separates a Try from a production run is the endpoint, not a
 * caller-supplied flag. `RunTrigger` is stamped server-side (G-021/D-17) so
 * an API client cannot opt its own production runs into the cancel set that
 * editor activity sweeps.
 */
export class StartTryRequestDto {
  @ApiProperty({
    required: false,
    type: Object,
    description:
      "Caller-supplied seed values for the workflow's `ctx` blackboard. " +
      "Validated against the workflow's derived input schema (see " +
      "`GET /api/workflows/:id/run-spec`), exactly as for a production run.",
    example: { customerId: "cust-001" },
  })
  @IsOptional()
  @IsObject()
  initialCtx?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description:
      "Specific `WorkflowVersion.id` to try. Defaults to the lineage's " +
      "head version when omitted — the editor sends the version it is " +
      "currently showing so a Try run while replaying an old version " +
      "executes the graph on screen.",
    example: "wv-abc-123",
  })
  @IsOptional()
  @IsString()
  workflowVersionId?: string;
}

/**
 * Response of `POST /api/workflows/:id/tries`. Same shape as a production
 * run start — the caller still needs the execution id to poll node statuses.
 */
export class StartTryResponseDto {
  @ApiProperty({
    description: "Temporal workflow execution id for the started Try run.",
    example: "graph-adhoc-9f8e7d6c-5b4a-3210-fedc-ba9876543210",
  })
  workflowId!: string;

  @ApiProperty({
    description:
      "The resolved `WorkflowVersion.id` the Try was started with " +
      "(head if `workflowVersionId` was omitted from the request).",
    example: "wv-abc-123",
  })
  workflowVersionId!: string;

  @ApiProperty({ enum: ["started"], example: "started" })
  status!: "started";
}
