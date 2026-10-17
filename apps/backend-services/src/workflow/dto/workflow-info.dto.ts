import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";
import { GraphWorkflowConfig } from "../graph-workflow-types";

export class WorkflowInfoDto {
  @ApiProperty({
    description: "Stable workflow lineage ID (identity in lists and URLs)",
  })
  id!: string;

  @ApiProperty({
    description:
      "ID of the workflow version row whose config is shown (head or pinned snapshot)",
  })
  workflowVersionId!: string;

  @ApiProperty({
    description:
      "URL/CLI-friendly stable handle, unique within the group. Use this in upload requests (workflow_slug).",
    example: "ocr-only-minimal",
  })
  slug!: string;

  @ApiProperty({ description: "Display name for the workflow" })
  name!: string;

  @ApiProperty({
    description: "Optional description",
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({ description: "ID of the user who owns the workflow" })
  actorId!: string;

  @ApiProperty({ description: "ID of the group this workflow belongs to" })
  groupId!: string;

  @ApiProperty({
    description: "Graph workflow configuration",
    type: "object",
    additionalProperties: true,
  })
  config!: GraphWorkflowConfig;

  @ApiProperty({ description: "Schema version for the workflow config" })
  schemaVersion!: string;

  @ApiProperty({
    description:
      "Immutable revision number for this workflow version row (increments on new config)",
  })
  version!: number;

  @ApiProperty({ description: "Creation timestamp" })
  createdAt!: Date;

  @ApiProperty({ description: "Last update timestamp" })
  updatedAt!: Date;
}

export class WorkflowResponseDto {
  @ApiProperty({ type: WorkflowInfoDto })
  workflow!: WorkflowInfoDto;
}

export class GraphValidationErrorDto {
  @ApiProperty({
    description:
      "Where in the config the problem sits (e.g. `nodes.ocr1.inputs.fileData`)",
  })
  path!: string;

  @ApiProperty({ description: "What is wrong, in author-facing words" })
  message!: string;

  @ApiProperty({
    description:
      "`error` blocks running (never saving); `warning` is advisory everywhere",
    enum: ["error", "warning"],
  })
  severity!: "error" | "warning";
}

export class WorkflowSaveValidationDto {
  @ApiProperty({
    description:
      "True when the saved config has no severity-`error` findings and can run as it stands",
  })
  valid!: boolean;

  @ApiProperty({ type: [GraphValidationErrorDto] })
  errors!: GraphValidationErrorDto[];
}

/**
 * Draft-save (2026-08-02): saving always persists a storable config; the
 * validator's verdict rides along in the response instead of gating it.
 * Run start is where `valid: false` becomes a refusal.
 */
export class WorkflowSaveResponseDto extends WorkflowResponseDto {
  @ApiProperty({
    type: WorkflowSaveValidationDto,
    description:
      "Validation verdict for the config that was just persisted. Save " +
      "succeeds regardless; running is refused while `valid` is false.",
  })
  validation!: WorkflowSaveValidationDto;
}

export class WorkflowListResponseDto {
  @ApiProperty({ type: [WorkflowInfoDto] })
  workflows!: WorkflowInfoDto[];
}

export class WorkflowVersionSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  versionNumber!: number;

  @ApiProperty()
  createdAt!: Date;
}

export class WorkflowVersionListResponseDto {
  @ApiProperty({ type: [WorkflowVersionSummaryDto] })
  versions!: WorkflowVersionSummaryDto[];
}

export class RevertHeadDto {
  @ApiProperty({
    description:
      "Existing WorkflowVersion.id within this lineage to set as head",
  })
  @IsString()
  workflowVersionId!: string;
}
