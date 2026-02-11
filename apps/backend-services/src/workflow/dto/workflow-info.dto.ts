import { ApiProperty } from "@nestjs/swagger";
import { GraphWorkflowConfig } from "../graph-workflow-types";

export class WorkflowInfoDto {
  @ApiProperty({ description: "Unique workflow ID" })
  id: string;

  @ApiProperty({ description: "Display name for the workflow" })
  name: string;

  @ApiProperty({
    description: "Optional description",
    nullable: true,
  })
  description: string | null;

  @ApiProperty({ description: "ID of the user who owns the workflow" })
  userId: string;

  @ApiProperty({
    description: "Graph workflow configuration",
    type: "object",
    additionalProperties: true,
  })
  config: GraphWorkflowConfig;

  @ApiProperty({ description: "Schema version for the workflow config" })
  schemaVersion: string;

  @ApiProperty({ description: "Config version (incremented on config change)" })
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
