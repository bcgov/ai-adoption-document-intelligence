/**
 * Update Benchmark Definition DTO
 *
 * DTO for updating an existing benchmark definition.
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 */

import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";

export class UpdateDefinitionDto {
  /**
   * Definition name
   */
  @ApiPropertyOptional({ description: "Definition name" })
  @IsString()
  @IsOptional()
  name?: string;

  /**
   * Dataset version ID
   */
  @ApiPropertyOptional({ description: "Dataset version ID" })
  @IsString()
  @IsOptional()
  datasetVersionId?: string;

  /**
   * Split ID
   */
  @ApiPropertyOptional({ description: "Split ID" })
  @IsString()
  @IsOptional()
  splitId?: string;

  /**
   * Workflow ID
   */
  @ApiPropertyOptional({ description: "Workflow ID" })
  @IsString()
  @IsOptional()
  workflowId?: string;

  /**
   * Evaluator type (must match a registered evaluator)
   */
  @ApiPropertyOptional({
    description: "Evaluator type (must match a registered evaluator)",
  })
  @IsString()
  @IsOptional()
  evaluatorType?: string;

  /**
   * Evaluator configuration (JSON object)
   */
  @ApiPropertyOptional({
    description: "Evaluator configuration (JSON object)",
    type: "object",
    additionalProperties: true,
  })
  @IsObject()
  @IsOptional()
  evaluatorConfig?: Record<string, unknown>;

  /**
   * Runtime settings (JSON object)
   */
  @ApiPropertyOptional({
    description: "Runtime settings (JSON object)",
    type: "object",
    additionalProperties: true,
  })
  @IsObject()
  @IsOptional()
  runtimeSettings?: Record<string, unknown>;
}
