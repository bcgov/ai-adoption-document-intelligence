/**
 * DTOs for the pipeline debug log endpoint.
 *
 * Returns structured log entries from the last OCR improvement pipeline run.
 */

import { ApiProperty } from "@nestjs/swagger";

export class PipelineLogEntryDto {
  @ApiProperty({
    description:
      "Pipeline step identifier (e.g. baseline_mismatch_extraction, llm_request)",
  })
  step!: string;

  @ApiProperty({ description: "ISO 8601 timestamp when the step started" })
  timestamp!: string;

  @ApiProperty({
    description: "Step duration in milliseconds",
    required: false,
  })
  durationMs?: number;

  @ApiProperty({ description: "Step-specific payload (varies by step)" })
  data!: Record<string, unknown>;
}

export class PipelineDebugLogResponseDto {
  @ApiProperty({
    description: "Debug log entries from the last pipeline run",
    type: [PipelineLogEntryDto],
  })
  entries!: PipelineLogEntryDto[];
}
