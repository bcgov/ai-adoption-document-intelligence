import { ApiProperty } from "@nestjs/swagger";
import { GraphWorkflowConfig } from "../graph-workflow-types";

export class WorkflowInfoDto {
  @ApiProperty({
    description: "Stable workflow lineage ID (identity in lists and URLs)",
  })
  id: string;

  @ApiProperty({
    description:
      "ID of the workflow version row whose config is shown (head or pinned snapshot)",
  })
  workflowVersionId: string;

  @ApiProperty({ description: "Display name for the workflow" })
  name: string;

  @ApiProperty({
    description: "Optional description",
    nullable: true,
  })
  description: string | null;

  @ApiProperty({ description: "ID of the user who owns the workflow" })
  userId: string;

  @ApiProperty({ description: "ID of the group this workflow belongs to" })
  groupId: string;

  @ApiProperty({
    description: "Graph workflow configuration",
    type: "object",
    additionalProperties: true,
  })
  config: GraphWorkflowConfig;

  @ApiProperty({ description: "Schema version for the workflow config" })
  schemaVersion: string;

  @ApiProperty({
    description:
      "Immutable revision number for this workflow version row (increments on new config)",
  })
  version: number;

  @ApiProperty({ description: "Creation timestamp" })
  createdAt: Date;

  @ApiProperty({ description: "Last update timestamp" })
  updatedAt: Date;
}

export class WorkflowResponseDto {
  @ApiProperty({ type: WorkflowInfoDto })
  workflow: WorkflowInfoDto;
}

export class WorkflowListResponseDto {
  @ApiProperty({ type: [WorkflowInfoDto] })
  workflows: WorkflowInfoDto[];
}

export class WorkflowVersionSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  versionNumber: number;

  @ApiProperty()
  createdAt: Date;
}

export class WorkflowVersionListResponseDto {
  @ApiProperty({ type: [WorkflowVersionSummaryDto] })
  versions: WorkflowVersionSummaryDto[];
}

export class RevertHeadDto {
  @ApiProperty({
    description:
      "Existing WorkflowVersion.id within this lineage to set as head",
  })
  workflowVersionId: string;
}
