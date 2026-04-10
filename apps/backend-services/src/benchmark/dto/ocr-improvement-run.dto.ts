/**
 * DTOs for OCR improvement pipeline run.
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-05-ui.md
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Max,
  Min,
} from "class-validator";
import type { BaselineComparison } from "./promote-baseline.dto";

export class OcrImprovementRunDto {
  @ApiPropertyOptional({
    description:
      "Optional filters for HITL correction aggregation (e.g. startDate, endDate, groupIds, fieldKeys).",
    type: Object,
  })
  @IsOptional()
  @IsObject()
  hitlFilters?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      "When true, the server polls until the candidate benchmark run reaches a terminal status and returns baseline comparison.",
  })
  @IsOptional()
  @IsBoolean()
  waitForPipelineRunCompletion?: boolean;

  @ApiPropertyOptional({
    description:
      "Poll interval when waiting for the candidate run (ms). Default 5000.",
  })
  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(120_000)
  pipelineRunPollIntervalMs?: number;

  @ApiPropertyOptional({
    description:
      "Max time to wait for the candidate run (ms). Default 3600000 (1 hour).",
  })
  @IsOptional()
  @IsInt()
  @Min(5000)
  @Max(7_200_000)
  pipelineRunWaitTimeoutMs?: number;

  @ApiPropertyOptional({
    description:
      "When set, forces this `emptyValueCoercion` on every `ocr.normalizeFields` node.",
    enum: ["none", "blank", "null"],
  })
  @IsOptional()
  @IsIn(["none", "blank", "null"])
  normalizeFieldsEmptyValueCoercion?: "none" | "blank" | "null";
}

export class OcrImprovementRecommendationsSummaryDto {
  @ApiProperty({
    description: "Number of recommendations applied to the graph",
  })
  applied: number;

  @ApiProperty({ description: "Number of recommendations rejected" })
  rejected: number;

  @ApiProperty({ description: "Tool IDs applied", type: [String] })
  toolIds: string[];
}

export class OcrImprovementRunResponseDto {
  @ApiProperty({
    description: "Head workflow version ID of the candidate lineage",
  })
  candidateWorkflowVersionId: string;

  @ApiProperty({ description: "Benchmark run ID started for the candidate" })
  benchmarkRunId: string;

  @ApiProperty({ type: () => OcrImprovementRecommendationsSummaryDto })
  recommendationsSummary: OcrImprovementRecommendationsSummaryDto;

  @ApiPropertyOptional({ description: "AI analysis summary when available" })
  analysis?: string;

  @ApiPropertyOptional({
    description: "Human-readable reason when status is no_recommendations",
  })
  pipelineMessage?: string;

  @ApiPropertyOptional({
    description:
      "One line per failed recommendation when graph apply rejected tools",
    type: [String],
  })
  rejectionDetails?: string[];

  @ApiProperty({
    description: "Pipeline outcome",
    enum: [
      "benchmark_started",
      "benchmark_completed",
      "benchmark_failed",
      "benchmark_cancelled",
      "benchmark_wait_timeout",
      "no_recommendations",
      "error",
    ],
  })
  status:
    | "benchmark_started"
    | "benchmark_completed"
    | "benchmark_failed"
    | "benchmark_cancelled"
    | "benchmark_wait_timeout"
    | "no_recommendations"
    | "error";

  @ApiPropertyOptional({ description: "Present when status is error" })
  error?: string;

  @ApiPropertyOptional({
    description:
      "Terminal status of the candidate run when known (including after wait)",
  })
  benchmarkRunStatus?: string;

  @ApiPropertyOptional({
    description:
      "Populated when the run finished and baseline comparison was computed",
    type: Object,
  })
  baselineComparison?: BaselineComparison | null;
}
