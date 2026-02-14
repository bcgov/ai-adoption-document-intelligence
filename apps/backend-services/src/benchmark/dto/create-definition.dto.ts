/**
 * Create Benchmark Definition DTO
 *
 * DTO for creating a new benchmark definition.
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 */

import { IsString, IsNotEmpty, IsObject, IsOptional } from "class-validator";

export class CreateDefinitionDto {
  /**
   * Definition name
   */
  @IsString()
  @IsNotEmpty()
  name: string;

  /**
   * Dataset version ID
   */
  @IsString()
  @IsNotEmpty()
  datasetVersionId: string;

  /**
   * Split ID
   */
  @IsString()
  @IsNotEmpty()
  splitId: string;

  /**
   * Workflow ID
   */
  @IsString()
  @IsNotEmpty()
  workflowId: string;

  /**
   * Evaluator type (must match a registered evaluator)
   */
  @IsString()
  @IsNotEmpty()
  evaluatorType: string;

  /**
   * Evaluator configuration (JSON object)
   */
  @IsObject()
  evaluatorConfig: Record<string, unknown>;

  /**
   * Runtime settings (JSON object)
   */
  @IsObject()
  runtimeSettings: Record<string, unknown>;

  /**
   * Artifact policy (JSON object)
   */
  @IsObject()
  artifactPolicy: Record<string, unknown>;
}
