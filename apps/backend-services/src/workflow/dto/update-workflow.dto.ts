import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";
import { GraphWorkflowConfig } from "../graph-workflow-types";

/**
 * Body of `PUT /api/workflows/:id`.
 *
 * G-063 — `expectedVersion` is REQUIRED. Saving a workflow appends a new
 * version on top of whatever the head is at that moment, so two editors that
 * both loaded version N would each append: the second write silently becomes
 * the head, carrying none of the first author's edits. Nothing was corrupted —
 * version N+1 is still in history — but the head is wrong and neither author
 * is told.
 *
 * Making the token required rather than optional is deliberate: an optional
 * one is only honoured by callers who already thought about concurrency, which
 * are exactly the callers who did not need it. Requiring it forces every writer
 * through read-then-write, which is the discipline that makes the check mean
 * something.
 */
export class UpdateWorkflowDto {
  @ApiProperty({
    description:
      "The `version` the edits were based on — the value returned by GET. The write is rejected with 409 if the workflow's head has moved on since, so a second editor cannot silently overwrite the first.",
    example: 3,
  })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({
    description: "Display name for the workflow",
    example: "Invoice processing",
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: "Optional description of the workflow",
    example: "Extract data from vendor invoices",
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description:
      "Graph workflow configuration (GraphWorkflowConfig JSON). Omit to update metadata only — no new version is appended.",
    required: false,
  })
  @IsObject()
  @IsOptional()
  config?: GraphWorkflowConfig;
}

/** 409 body when the workflow's head moved on before this write landed. */
export class WorkflowVersionConflictDto {
  @ApiProperty({
    description: "Machine-readable discriminator.",
    example: "workflow_version_conflict",
  })
  error!: "workflow_version_conflict";

  @ApiProperty({
    description: "Human-readable explanation.",
    example:
      "This workflow was saved by someone else (version 4). Reload to see their changes before saving yours.",
  })
  message!: string;

  @ApiProperty({
    description: "The version the caller said its edits were based on.",
    example: 3,
  })
  expectedVersion!: number;

  @ApiProperty({
    description: "The workflow's actual current head version.",
    example: 4,
  })
  currentVersion!: number;
}
