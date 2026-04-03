/**
 * DTOs for OCR improvement pipeline run.
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-05-ui.md
 */

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
  /**
   * Optional filters for HITL correction aggregation (e.g. startDate, endDate, groupIds, fieldKeys).
   */
  @IsOptional()
  @IsObject()
  hitlFilters?: Record<string, unknown>;

  /**
   * When true, the server polls until the candidate benchmark run reaches a terminal
   * status and returns baseline comparison (US-013). Default false (fire-and-forget).
   */
  @IsOptional()
  @IsBoolean()
  waitForPipelineRunCompletion?: boolean;

  /**
   * Poll interval when waiting for the candidate run (ms). Default 5000.
   */
  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(120_000)
  pipelineRunPollIntervalMs?: number;

  /**
   * Max time to wait for the candidate run (ms). Default 3600000 (1 hour).
   */
  @IsOptional()
  @IsInt()
  @Min(5000)
  @Max(7_200_000)
  pipelineRunWaitTimeoutMs?: number;

  /**
   * When set, the candidate workflow forces this `emptyValueCoercion` on every
   * `ocr.normalizeFields` node (`none` | `blank` | `null`). Omit to keep graph / AI values.
   */
  @IsOptional()
  @IsIn(["none", "blank", "null"])
  normalizeFieldsEmptyValueCoercion?: "none" | "blank" | "null";
}

export interface OcrImprovementRunResponseDto {
  candidateWorkflowVersionId: string;
  benchmarkRunId: string;
  recommendationsSummary: {
    applied: number;
    rejected: number;
    toolIds: string[];
  };
  analysis?: string;
  /** Human-readable reason when status is no_recommendations. */
  pipelineMessage?: string;
  /** One line per failed recommendation when graph apply rejected all. */
  rejectionDetails?: string[];
  status:
    | "benchmark_started"
    | "benchmark_completed"
    | "benchmark_failed"
    | "benchmark_cancelled"
    | "benchmark_wait_timeout"
    | "no_recommendations"
    | "error";
  error?: string;
  /** Terminal status of the candidate run when known (including after wait). */
  benchmarkRunStatus?: string;
  /** Populated when the run finished and baseline comparison was computed. */
  baselineComparison?: BaselineComparison | null;
}
