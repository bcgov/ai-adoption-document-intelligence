/**
 * Benchmark Run Response DTOs
 *
 * Response objects for benchmark run operations.
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BaselineComparison, MetricThreshold } from "./promote-baseline.dto";

/**
 * Benchmark run summary (for list view)
 */
export class RunSummaryDto {
  /**
   * Run ID
   */
  @ApiProperty({ description: 'Run ID' })
  id: string;

  /**
   * Definition ID
   */
  @ApiProperty({ description: 'Definition ID' })
  definitionId: string;

  /**
   * Definition name
   */
  @ApiProperty({ description: 'Definition name' })
  definitionName: string;

  /**
   * Run status (pending, running, completed, failed, cancelled)
   */
  @ApiProperty({ description: 'Run status (pending, running, completed, failed, cancelled)' })
  status: string;

  /**
   * Start timestamp
   */
  @ApiProperty({ description: 'Start timestamp', nullable: true, type: Date })
  startedAt: Date | null;

  /**
   * Completion timestamp
   */
  @ApiProperty({ description: 'Completion timestamp', nullable: true, type: Date })
  completedAt: Date | null;

  /**
   * Duration in milliseconds (if completed)
   */
  @ApiProperty({ description: 'Duration in milliseconds', nullable: true })
  durationMs: number | null;

  /**
   * Headline metrics (if completed)
   */
  @ApiProperty({ description: 'Headline metrics', nullable: true, type: 'object', additionalProperties: true })
  headlineMetrics: Record<string, unknown> | null;

  /**
   * Whether this run has a regression compared to baseline
   */
  @ApiPropertyOptional({ description: 'Whether this run has a regression compared to baseline' })
  hasRegression?: boolean;

  /**
   * Number of regressed metrics (if compared against baseline)
   */
  @ApiPropertyOptional({ description: 'Number of regressed metrics compared against baseline' })
  regressedMetricCount?: number;

  /**
   * Whether this is the baseline run
   */
  @ApiPropertyOptional({ description: 'Whether this is the baseline run' })
  isBaseline?: boolean;

  /**
   * Run tags (e.g., version, environment)
   */
  @ApiPropertyOptional({ description: 'Run tags (e.g., version, environment)', type: 'object', additionalProperties: true })
  tags?: Record<string, unknown>;
}

/**
 * Full benchmark run details
 */
export class RunDetailsDto {
  /**
   * Run ID
   */
  @ApiProperty({ description: 'Run ID' })
  id: string;

  /**
   * Definition ID
   */
  @ApiProperty({ description: 'Definition ID' })
  definitionId: string;

  /**
   * Definition name
   */
  @ApiProperty({ description: 'Definition name' })
  definitionName: string;

  /**
   * Project ID
   */
  @ApiProperty({ description: 'Project ID' })
  projectId: string;

  /**
   * Run status (pending, running, completed, failed, cancelled)
   */
  @ApiProperty({ description: 'Run status (pending, running, completed, failed, cancelled)' })
  status: string;

  /**
   * Temporal workflow ID
   */
  @ApiProperty({ description: 'Temporal workflow ID' })
  temporalWorkflowId: string;

  /**
   * Worker image digest
   */
  @ApiProperty({ description: 'Worker image digest', nullable: true })
  workerImageDigest: string | null;

  /**
   * Worker git SHA
   */
  @ApiProperty({ description: 'Worker git SHA' })
  workerGitSha: string;

  /**
   * Start timestamp
   */
  @ApiProperty({ description: 'Start timestamp', nullable: true, type: Date })
  startedAt: Date | null;

  /**
   * Completion timestamp
   */
  @ApiProperty({ description: 'Completion timestamp', nullable: true, type: Date })
  completedAt: Date | null;

  /**
   * Aggregated metrics
   */
  @ApiProperty({ description: 'Aggregated metrics', type: 'object', additionalProperties: true })
  metrics: Record<string, unknown>;

  /**
   * Run parameters
   */
  @ApiProperty({ description: 'Run parameters', type: 'object', additionalProperties: true })
  params: Record<string, unknown>;

  /**
   * Run tags
   */
  @ApiProperty({ description: 'Run tags', type: 'object', additionalProperties: true })
  tags: Record<string, unknown>;

  /**
   * Error message (if failed)
   */
  @ApiProperty({ description: 'Error message (if failed)', nullable: true })
  error: string | null;

  /**
   * Whether this is the baseline run
   */
  @ApiProperty({ description: 'Whether this is the baseline run' })
  isBaseline: boolean;

  /**
   * Baseline thresholds (if this run is a baseline)
   */
  @ApiProperty({ description: 'Baseline thresholds (if this run is a baseline)', nullable: true, isArray: true })
  baselineThresholds: MetricThreshold[] | null;

  /**
   * Baseline comparison result (if compared against a baseline)
   */
  @ApiProperty({ description: 'Baseline comparison result', nullable: true })
  baselineComparison: BaselineComparison | null;

  /**
   * Creation timestamp
   */
  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;
}

/**
 * Sample failure info for drill-down
 */
export class SampleFailureDto {
  /**
   * Sample ID
   */
  @ApiProperty({ description: 'Sample ID' })
  sampleId: string;

  /**
   * Metric value (e.g., error rate, accuracy)
   */
  @ApiProperty({ description: 'Metric value (e.g., error rate, accuracy)' })
  metricValue: number;

  /**
   * Metric name
   */
  @ApiProperty({ description: 'Metric name' })
  metricName: string;

  /**
   * Sample metadata
   */
  @ApiPropertyOptional({ description: 'Sample metadata', type: 'object', additionalProperties: true })
  metadata?: Record<string, unknown>;
}

/**
 * Per-field error breakdown (for schema-aware evaluator)
 */
export class FieldErrorBreakdownDto {
  /**
   * Field name
   */
  @ApiProperty({ description: 'Field name' })
  fieldName: string;

  /**
   * Error count
   */
  @ApiProperty({ description: 'Error count' })
  errorCount: number;

  /**
   * Error rate (0-1)
   */
  @ApiProperty({ description: 'Error rate (0-1)' })
  errorRate: number;
}

/**
 * Drill-down response with detailed analysis
 */
export class DrillDownResponseDto {
  /**
   * Run ID
   */
  @ApiProperty({ description: 'Run ID' })
  runId: string;

  /**
   * Aggregated metrics
   */
  @ApiProperty({ description: 'Aggregated metrics', type: 'object', additionalProperties: true })
  aggregatedMetrics: Record<string, unknown>;

  /**
   * Top N worst-performing samples
   */
  @ApiProperty({ description: 'Top N worst-performing samples', type: () => SampleFailureDto, isArray: true })
  worstSamples: SampleFailureDto[];

  /**
   * Per-field error breakdown (if schema-aware evaluator)
   */
  @ApiProperty({ description: 'Per-field error breakdown (schema-aware evaluator)', nullable: true, type: () => FieldErrorBreakdownDto, isArray: true })
  fieldErrorBreakdown: FieldErrorBreakdownDto[] | null;
}
