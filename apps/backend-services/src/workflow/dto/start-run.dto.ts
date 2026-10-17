import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";

/**
 * Body of `POST /api/workflows/:id/runs`. All fields optional — a
 * workflow with no declared inputs can be triggered with `{}`.
 */
export class StartRunRequestDto {
  @ApiProperty({
    required: false,
    type: Object,
    description:
      "Caller-supplied seed values for the workflow's `ctx` blackboard. " +
      "Validated against the workflow's derived input schema (see " +
      "`GET /api/workflows/:id/run-spec`). Required fields with no " +
      "`default` MUST be present.",
    example: { customerId: "cust-001" },
  })
  @IsOptional()
  @IsObject()
  initialCtx?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description:
      "Specific `WorkflowVersion.id` to execute. Defaults to the " +
      "lineage's head version when omitted.",
    example: "wv-abc-123",
  })
  @IsOptional()
  @IsString()
  workflowVersionId?: string;
}

/**
 * Response of `POST /api/workflows/:id/runs`.
 */
export class StartRunResponseDto {
  @ApiProperty({
    description: "Temporal workflow execution id for the started run.",
    example: "graph-adhoc-9f8e7d6c-5b4a-3210-fedc-ba9876543210",
  })
  workflowId!: string;

  @ApiProperty({
    description:
      "The resolved `WorkflowVersion.id` the run was started with " +
      "(head if `workflowVersionId` was omitted from the request).",
    example: "wv-abc-123",
  })
  workflowVersionId!: string;

  @ApiProperty({ enum: ["started"], example: "started" })
  status!: "started";
}
