/**
 * Create Benchmark Definition DTO
 *
 * DTO for creating a new benchmark definition.
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class CreateDefinitionDto {
  /**
   * Definition name
   */
  @ApiProperty({ description: "Definition name" })
  @IsString()
  @IsNotEmpty()
  name: string;

  /**
   * Dataset version ID
   */
  @ApiProperty({ description: "Dataset version ID" })
  @IsString()
  @IsNotEmpty()
  datasetVersionId: string;

  /**
   * Split ID (optional — if omitted, the benchmark runs on all samples)
   */
  @ApiPropertyOptional({
    description:
      "Split ID (optional — if omitted, the benchmark runs on all samples)",
  })
  @IsString()
  @IsOptional()
  splitId?: string;

  /**
   * Workflow ID
   */
  @ApiProperty({ description: "Workflow ID" })
  @IsString()
  @IsNotEmpty()
  workflowId: string;

  /**
   * Workflow config overrides — a map of exposed param paths to override values.
   * Keys must match `exposedParams[].path` from the workflow's nodeGroups.
   */
  @ApiPropertyOptional({
    description:
      "Workflow config overrides — map of exposed param paths to values. " +
      'E.g. {"ctx.modelId.defaultValue": "prebuilt-read"}',
    type: "object",
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  workflowConfigOverrides?: Record<string, unknown>;

  /**
   * Evaluator type (must match a registered evaluator)
   */
  @ApiProperty({
    description: "Evaluator type (must match a registered evaluator)",
  })
  @IsString()
  @IsNotEmpty()
  evaluatorType: string;

  /**
   * Evaluator configuration (JSON object)
   */
  @ApiProperty({
    description: "Evaluator configuration (JSON object)",
    type: "object",
    additionalProperties: true,
  })
  @IsObject()
  evaluatorConfig: Record<string, unknown>;

  /**
   * Runtime settings (JSON object)
   */
  @ApiProperty({
    description: "Runtime settings (JSON object)",
    type: "object",
    additionalProperties: true,
  })
  @IsObject()
  runtimeSettings: Record<string, unknown>;
}
