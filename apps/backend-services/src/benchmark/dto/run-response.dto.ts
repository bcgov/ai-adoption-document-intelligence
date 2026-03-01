/**
 * Benchmark Run Response DTOs
 *
 * Response objects for benchmark run operations.
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 */

import { BaselineComparison, MetricThreshold } from "./promote-baseline.dto";

/**
 * Benchmark run summary (for list view)
 */
export class RunSummaryDto {
  /**
   * Run ID
   */
  id: string;

  /**
   * Definition ID
   */
  definitionId: string;

  /**
   * Definition name
   */
  definitionName: string;

  /**
   * Run status (pending, running, completed, failed, cancelled)
   */
  status: string;

  /**
   * Start timestamp
   */
  startedAt: Date | null;

  /**
   * Completion timestamp
   */
  completedAt: Date | null;

  /**
   * Duration in milliseconds (if completed)
   */
  durationMs: number | null;

  /**
   * Headline metrics (if completed)
   */
  headlineMetrics: Record<string, unknown> | null;

  /**
   * Whether this run has a regression compared to baseline
   */
  hasRegression?: boolean;

  /**
   * Number of regressed metrics (if compared against baseline)
   */
  regressedMetricCount?: number;

  /**
   * Whether this is the baseline run
   */
  isBaseline?: boolean;

  /**
   * Run tags (e.g., version, environment)
   */
  tags?: Record<string, unknown>;
}

/**
 * Full benchmark run details
 */
export class RunDetailsDto {
  /**
   * Run ID
   */
  id: string;

  /**
   * Definition ID
   */
  definitionId: string;

  /**
   * Definition name
   */
  definitionName: string;

  /**
   * Project ID
   */
  projectId: string;

  /**
   * Run status (pending, running, completed, failed, cancelled)
   */
  status: string;

  /**
   * Temporal workflow ID
   */
  temporalWorkflowId: string;

  /**
   * Worker image digest
   */
  workerImageDigest: string | null;

  /**
   * Worker git SHA
   */
  workerGitSha: string;

  /**
   * Start timestamp
   */
  startedAt: Date | null;

  /**
   * Completion timestamp
   */
  completedAt: Date | null;

  /**
   * Aggregated metrics
   */
  metrics: Record<string, unknown>;

  /**
   * Run parameters
   */
  params: Record<string, unknown>;

  /**
   * Run tags
   */
  tags: Record<string, unknown>;

  /**
   * Error message (if failed)
   */
  error: string | null;

  /**
   * Whether this is the baseline run
   */
  isBaseline: boolean;

  /**
   * Baseline thresholds (if this run is a baseline)
   */
  baselineThresholds: MetricThreshold[] | null;

  /**
   * Baseline comparison result (if compared against a baseline)
   */
  baselineComparison: BaselineComparison | null;

  /**
   * Creation timestamp
   */
  createdAt: Date;
}

/**
 * Sample failure info for drill-down
 */
export class SampleFailureDto {
  /**
   * Sample ID
   */
  sampleId: string;

  /**
   * Metric value (e.g., error rate, accuracy)
   */
  metricValue: number;

  /**
   * Metric name
   */
  metricName: string;

  /**
   * Sample metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Per-field error breakdown (for schema-aware evaluator)
 */
export class FieldErrorBreakdownDto {
  /**
   * Field name
   */
  fieldName: string;

  /**
   * Error count
   */
  errorCount: number;

  /**
   * Error rate (0-1)
   */
  errorRate: number;
}

/**
 * Drill-down response with detailed analysis
 */
export class DrillDownResponseDto {
  /**
   * Run ID
   */
  runId: string;

  /**
   * Aggregated metrics
   */
  aggregatedMetrics: Record<string, unknown>;

  /**
   * Top N worst-performing samples
   */
  worstSamples: SampleFailureDto[];

  /**
   * Per-field error breakdown (if schema-aware evaluator)
   */
  fieldErrorBreakdown: FieldErrorBreakdownDto[] | null;

  /**
   * Error clustering tags
   */
  errorClusters: Record<string, number>;
}
