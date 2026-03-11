/**
 * Create Benchmark Run DTO
 *
 * Request object for starting a new benchmark run.
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 */

import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional } from "class-validator";

/**
 * DTO for creating a benchmark run
 */
export class CreateRunDto {
  /**
   * Optional runtime settings override
   * If provided, these will override the definition's runtime settings
   */
  @ApiPropertyOptional({ description: "Optional runtime settings override — overrides the definition's runtime settings", type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  runtimeSettingsOverride?: Record<string, unknown>;

  /**
   * Optional tags to attach to this run
   */
  @ApiPropertyOptional({ description: 'Optional tags to attach to this run', type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  tags?: Record<string, unknown>;
}
