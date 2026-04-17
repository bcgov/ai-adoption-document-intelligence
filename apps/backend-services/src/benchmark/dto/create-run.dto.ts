/**
 * Create Benchmark Run DTO
 *
 * Request object for starting a new benchmark run.
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 */

import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsObject, IsOptional, IsUUID } from "class-validator";

/**
 * DTO for creating a benchmark run
 */
export class CreateRunDto {
  @ApiPropertyOptional({
    description:
      "Optional runtime settings override (merged with definition runtime settings)",
    type: Object,
  })
  @IsOptional()
  @IsObject()
  runtimeSettingsOverride?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: "Optional tags for this run",
    type: Object,
  })
  @IsOptional()
  @IsObject()
  tags?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      "When set, the run uses this workflow version's config (e.g. a candidate). Otherwise the definition's pinned workflow is used.",
    format: "uuid",
  })
  @IsOptional()
  @IsUUID()
  candidateWorkflowVersionId?: string;

  @ApiPropertyOptional({
    description:
      "When true, persist Azure OCR poll JSON per sample for replay. Default false when omitted.",
  })
  @IsOptional()
  @IsBoolean()
  persistOcrCache?: boolean;

  @ApiPropertyOptional({
    description:
      "Replay OCR from a prior completed baseline run (same definition). Replay runs do not persist cache.",
    format: "uuid",
  })
  @IsOptional()
  @IsUUID()
  ocrCacheBaselineRunId?: string;
}
