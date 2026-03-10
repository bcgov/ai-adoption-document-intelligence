/**
 * Create Benchmark Run DTO
 *
 * Request object for starting a new benchmark run.
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 */

import { IsObject, IsOptional } from "class-validator";

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
}
