import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";
import { GraphWorkflowConfig } from "../graph-workflow-types";

export class CreateWorkflowDto {
  @ApiProperty({
    description: "Display name for the workflow",
    example: "Invoice processing",
  })
  @IsString()
  name: string;

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
      "Graph workflow configuration (GraphWorkflowConfig JSON).",
  })
  @IsObject()
  config: GraphWorkflowConfig;
}
