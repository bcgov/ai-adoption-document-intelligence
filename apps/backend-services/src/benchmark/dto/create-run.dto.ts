/**
 * Create Benchmark Run DTO
 *
 * Request object for starting a new benchmark run.
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 */

import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

/**
 * DTO for creating a benchmark run
 */
export class CreateRunDto {
  /**
   * Optional runtime settings override
   * If provided, these will override the definition's runtime settings
   */
  @IsOptional()
  @IsObject()
  runtimeSettingsOverride?: Record<string, unknown>;

  /**
   * Optional tags to attach to this run
   */
  @IsOptional()
  @IsObject()
  tags?: Record<string, unknown>;

  /**
   * Optional workflow configuration override.
   * When provided, the run uses this config instead of the definition's workflow config.
   * Used by the AI recommendation pipeline to run candidate workflows for comparison.
   */
  // TODO: workflowConfigOverride is no longer used by the improvement pipeline.
  // Consider removing if no other consumers exist.
  @IsOptional()
  @IsObject()
  workflowConfigOverride?: Record<string, unknown>;

  /**
   * Optional workflow version ID override (WorkflowVersion.id).
   * When `workflowConfigOverride` is omitted, the run loads graph config from this row
   * so execution matches the referenced version (hash matches stored config).
   * When both are set, the override must match the stored config for that version.
   */
  @IsOptional()
  candidateWorkflowVersionId?: string;

  /**
   * When true, persist Azure OCR poll JSON per sample to benchmark_ocr_cache for replay.
   * When omitted, defaults to true (unless `ocrCacheBaselineRunId` is set — replay never persists).
   */
  @IsOptional()
  @IsBoolean()
  persistOcrCache?: boolean;

  /**
   * When set, load OCR poll JSON from cache rows for this completed benchmark run (same definition).
   * Mutually exclusive with persistOcrCache in practice (one populates cache, one consumes it).
   */
  @IsOptional()
  @IsUUID()
  ocrCacheBaselineRunId?: string;
}
