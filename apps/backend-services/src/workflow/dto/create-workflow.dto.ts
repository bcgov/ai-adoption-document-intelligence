import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";
import { WorkflowStepsConfig } from "../workflow-types";

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
      "Workflow steps configuration. Keys are step names (e.g. prepareFileData, ocr); values are step configs with optional enabled and parameters.",
    example: {
      prepareFileData: { enabled: true },
      ocr: { enabled: true, parameters: { model_id: "prebuilt-layout" } },
    },
  })
  @IsObject()
  config: WorkflowStepsConfig;
}
