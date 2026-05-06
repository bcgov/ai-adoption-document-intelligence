/**
 * Full benchmark run export DTOs.
 *
 * Used by `GET /api/benchmark/projects/:projectId/runs/:runId/download` to
 * return a complete, self-contained dump of a benchmark run: run metadata,
 * aggregated metrics, every per-sample result with `groundTruth`,
 * `prediction`, `evaluationDetails` (resolved from blob storage when needed),
 * and the precomputed error-detection analysis (without heavy curve data).
 * Heavy data is returned inline in a single JSON document so it can be saved
 * to disk and replayed offline.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ErrorDetectionAnalysisResponseDto } from "./error-detection-analysis.dto";
import { RunDetailsDto } from "./run-response.dto";

/**
 * Per-sample record in a downloaded benchmark export.
 *
 * Mirrors {@link PerSampleResultDto} but is used outside the paginated drill-down
 * endpoint so that all evaluation data (including blob-stored `evaluationDetails`)
 * is inlined for offline analysis.
 */
export class BenchmarkRunExportSampleDto {
  @ApiProperty({ description: "Sample ID" })
  sampleId!: string;

  @ApiProperty({
    description: "Sample metadata from manifest",
    type: "object",
    additionalProperties: true,
  })
  metadata!: Record<string, unknown>;

  @ApiProperty({
    description: "Per-sample metrics",
    type: "object",
    additionalProperties: { type: "number" },
  })
  metrics!: Record<string, number>;

  @ApiProperty({ description: "Whether this sample passed the evaluator" })
  pass!: boolean;

  @ApiPropertyOptional({
    description: "Per-sample diagnostics (evaluator-specific debug info)",
    type: "object",
    additionalProperties: true,
  })
  diagnostics?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: "Ground truth data (resolved from blob storage when needed)",
  })
  groundTruth?: unknown;

  @ApiPropertyOptional({
    description:
      "Prediction/output data (resolved from blob storage when needed)",
  })
  prediction?: unknown;

  @ApiPropertyOptional({
    description:
      "Field-by-field evaluation details: each entry includes field name, matched flag, " +
      "confidence score, and any error information from the evaluator. " +
      "Resolved from blob storage when the run was written under the blob-storage scheme.",
  })
  evaluationDetails?: unknown;

  @ApiPropertyOptional({
    description:
      "Path to the per-sample evaluation details blob, included for traceability " +
      "when downloads are inspected against the underlying object store.",
  })
  evaluationBlobPath?: string;

  @ApiPropertyOptional({
    description:
      "Set when this sample's evaluation details could not be loaded from blob storage. " +
      "The export is still returned so the rest of the run is usable.",
  })
  blobReadError?: string;
}

/**
 * A single error instance for a field across all samples.
 */
export class ExportFieldErrorInstanceDto {
  @ApiProperty({ description: "Sample ID where the error occurred" })
  sampleId!: string;

  @ApiProperty({
    description: "Sample metadata (e.g. document filename, type, page number)",
    type: "object",
    additionalProperties: true,
  })
  sampleMetadata!: Record<string, unknown>;

  @ApiProperty({
    description: "Expected (ground truth) value for this field",
    nullable: true,
  })
  expected!: unknown;

  @ApiProperty({
    description: "Predicted value produced by the model for this field",
    nullable: true,
  })
  predicted!: unknown;

  @ApiProperty({
    description: "Confidence score assigned by the evaluator (0–1)",
    nullable: true,
  })
  confidence!: number | null;

  @ApiProperty({ description: "Whether this instance was matched correctly" })
  matched!: boolean;
}

/**
 * Per-field aggregated metrics across all samples, with every individual
 * evaluation instance for comprehensive offline analysis.
 */
export class ExportPerFieldResultDto {
  @ApiProperty({ description: "Field name" })
  name!: string;

  @ApiProperty({
    description:
      "Total number of instances across all samples where this field was evaluated",
  })
  evaluatedCount!: number;

  @ApiProperty({
    description: "Number of correctly matched instances",
  })
  correctCount!: number;

  @ApiProperty({ description: "Number of incorrect instances among evaluated" })
  errorCount!: number;

  @ApiProperty({ description: "Error rate: errorCount / evaluatedCount" })
  errorRate!: number;

  @ApiProperty({
    description: "Accuracy: correctCount / evaluatedCount",
  })
  accuracy!: number;

  @ApiProperty({
    description: "Average confidence score across all evaluated instances",
    nullable: true,
  })
  averageConfidence!: number | null;

  @ApiProperty({
    description:
      "Average confidence score for correctly matched instances only",
    nullable: true,
  })
  averageConfidenceCorrect!: number | null;

  @ApiProperty({
    description: "Average confidence score for error instances only",
    nullable: true,
  })
  averageConfidenceErrors!: number | null;

  @ApiPropertyOptional({
    description:
      "Smallest threshold whose recall ≥ 0.90, or null if unattainable",
    nullable: true,
  })
  suggestedCatch90!: number | null;

  @ApiProperty({
    description: "Threshold maximizing F1 (ties broken by smaller threshold)",
  })
  suggestedBestBalance!: number;

  @ApiPropertyOptional({
    description:
      "Largest threshold whose false-positive rate ≤ 0.10, or null if unattainable",
    nullable: true,
  })
  suggestedMinimizeReview!: number | null;

  @ApiProperty({
    description:
      "Every error instance for this field across all samples, with source " +
      "document, expected/predicted values, and confidence score.",
    type: () => ExportFieldErrorInstanceDto,
    isArray: true,
  })
  errors!: ExportFieldErrorInstanceDto[];
}

/**
 * Top-level export envelope returned by the download endpoint.
 */
export class BenchmarkRunExportDto {
  @ApiProperty({
    description: "ISO timestamp when this export was generated",
  })
  exportedAt!: string;

  @ApiProperty({
    description:
      "Export schema version. Incremented when the export shape changes.",
  })
  exportFormatVersion!: number;

  @ApiProperty({
    description:
      "Full run metadata including status, error, and baseline comparison",
    type: () => RunDetailsDto,
  })
  run!: RunDetailsDto;

  @ApiProperty({
    description:
      "Complete metrics object as stored on the run, including any nested " +
      "`_aggregate` data and the per-sample metric snapshots.",
    type: "object",
    additionalProperties: true,
  })
  metrics!: Record<string, unknown>;

  @ApiProperty({
    description:
      "Per-field results aggregated over all samples. Includes all metrics " +
      "(evaluatedCount, errorCount, errorRate, suggested thresholds) but " +
      "excludes the heavy confidence-threshold curve data.",
    type: () => ExportPerFieldResultDto,
    isArray: true,
  })
  perFieldResults!: ExportPerFieldResultDto[];

  @ApiProperty({
    description:
      "Every per-sample result with full evaluation details inlined. " +
      "Includes ground truth, prediction, field-level matched/confidence, " +
      "and any per-sample diagnostics or error info.",
    type: () => BenchmarkRunExportSampleDto,
    isArray: true,
  })
  perSampleResults!: BenchmarkRunExportSampleDto[];

  @ApiPropertyOptional({
    description:
      "Precomputed error-detection analysis (suggested cut-offs per field, " +
      "without curve data). Omitted for runs that have no per-sample results yet.",
    type: () => ErrorDetectionAnalysisResponseDto,
  })
  errorDetectionAnalysis?: ErrorDetectionAnalysisResponseDto;
}
