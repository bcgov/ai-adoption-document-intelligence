/**
 * Update Benchmark Definition DTO
 *
 * DTO for updating an existing benchmark definition.
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 */

import { IsObject, IsOptional, IsString } from "class-validator";

export class UpdateDefinitionDto {
  /**
   * Definition name
   */
  @IsString()
  @IsOptional()
  name?: string;

  /**
   * Dataset version ID
   */
  @IsString()
  @IsOptional()
  datasetVersionId?: string;

  /**
   * Split ID
   */
  @IsString()
  @IsOptional()
  splitId?: string;

  /**
   * Workflow ID
   */
  @IsString()
  @IsOptional()
  workflowId?: string;

  /**
   * Evaluator type (must match a registered evaluator)
   */
  @IsString()
  @IsOptional()
  evaluatorType?: string;

  /**
   * Evaluator configuration (JSON object)
   */
  @IsObject()
  @IsOptional()
  evaluatorConfig?: Record<string, unknown>;

  /**
   * Runtime settings (JSON object)
   */
  @IsObject()
  @IsOptional()
  runtimeSettings?: Record<string, unknown>;

  /**
   * Artifact policy (JSON object)
   */
  @IsObject()
  @IsOptional()
  artifactPolicy?: Record<string, unknown>;
}
