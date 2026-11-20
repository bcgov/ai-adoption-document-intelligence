import { ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { GraphWorkflowConfig } from "../graph-workflow-types";

export class CreateWorkflowDto {
  @ApiProperty({
    description: "Display name for the workflow",
    example: "Invoice processing",
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: "Optional description of the workflow",
    example: "Extract data from vendor invoices",
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: "Graph workflow configuration (GraphWorkflowConfig JSON).",
  })
  @IsObject()
  config!: GraphWorkflowConfig;

  @ApiProperty({ description: "Group ID" })
  @IsString()
  @IsNotEmpty()
  groupId!: string;

  @ApiProperty({
    description:
      "Workflow kind. 'workflow' (default, absent) creates a regular primary lineage; 'library' creates a reusable building-block whose declared metadata.inputs[]/metadata.outputs[] define its signature.",
    required: false,
    enum: ["workflow", "library"],
  })
  @IsOptional()
  @IsString()
  @IsIn(["workflow", "library"])
  kind?: "workflow" | "library";
}
