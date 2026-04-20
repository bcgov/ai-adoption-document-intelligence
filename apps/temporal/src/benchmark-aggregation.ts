/**
 * Benchmark Aggregation & Failure Analysis
 *
 * Aggregates per-sample evaluation results into dataset-level metrics
 * and performs failure analysis to identify worst-performing samples.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-017-metrics-aggregation-failure-analysis.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 5.4, 5.5
 */

import { EvaluationResult } from "./benchmark-types";
import { isNullLike } from "./evaluators/schema-aware-evaluator";

/**
 * Statistical metrics for a single metric across all samples
 */
export interface MetricStatistics {
  /**
   * Metric name
   */
  name: string;

  /**
   * Mean value
   */
  mean: number;

  /**
   * Median value
   */
  median: number;

  /**
   * Standard deviation
   */
  stdDev: number;

  /**
   * 5th percentile
   */
  p5: number;

  /**
   * 25th percentile (Q1)
   */
  p25: number;

  /**
   * 75th percentile (Q3)
   */
  p75: number;

  /**
   * 95th percentile
   */
  p95: number;

  /**
   * Minimum value
   */
  min: number;

  /**
   * Maximum value
   */
  max: number;
}

/**
 * Aggregated dataset-level metrics
 */
export interface AggregatedMetrics {
  /**
   * Total number of samples
   */
  totalSamples: number;

  /**
   * Number of passing samples
   */
  passingSamples: number;

  /**
   * Number of failing samples
   */
  failingSamples: number;

  /**
   * Pass rate (0.0 to 1.0)
   */
  passRate: number;

  /**
   * Statistics for each metric
   */
  metrics: Record<string, MetricStatistics>;
}

/**
 * Worst-performing sample details
 */
export interface WorstSample {
  /**
   * Sample ID
   */
  sampleId: string;

  /**
   * Metric value for the specified metric
   */
  metricValue: number;

  /**
   * All metrics for this sample
   */
  metrics: Record<string, number>;

  /**
   * Diagnostics for this sample
   */
  diagnostics: Record<string, unknown>;
}

/**
 * Per-field error statistics
 */
export interface FieldErrorStats {
  /**
   * Field name
   */
  field: string;

  /**
   * Total occurrences of this field in ground truth
   */
  totalOccurrences: number;

  /**
   * Number of times this field was matched correctly
   */
  matchCount: number;

  /**
   * Number of times this field was missing in prediction
   */
  missingCount: number;

  /**
   * Number of times this field was mismatched
   */
  mismatchCount: number;

  /**
   * Error rate (0.0 to 1.0)
   */
  errorRate: number;

  /**
   * Average F1 score for this field (if applicable)
   */
  avgF1?: number;
}

/**
 * Failure analysis results
 */
export interface FailureAnalysis {
  /**
   * Worst-performing samples
   */
  worstSamples: WorstSample[];

  /**
   * Per-field error breakdown (for schema-aware evaluator)
   */
  perFieldErrors?: FieldErrorStats[];
}

/**
 * Sliced metrics by metadata dimension
 */
export interface SlicedMetrics {
  /**
   * Dimension name (e.g., "docType", "language")
   */
  dimension: string;

  /**
   * Metrics per unique value of this dimension
   */
  slices: Record<string, AggregatedMetrics>;
}

/**
 * Failure analysis options
 */
export interface FailureAnalysisOptions {
  /**
   * Number of worst-performing samples to return
   */
  topN?: number;

  /**
   * Metric name to use for ranking worst samples
   */
  metricName?: string;
}

/**
 * Aggregation options
 */
export interface AggregationOptions {
  /**
   * Metadata dimensions to slice by (e.g., ["docType", "language"])
   */
  sliceDimensions?: string[];

  /**
   * Failure analysis options
   */
  failureAnalysis?: FailureAnalysisOptions;
}

/**
 * Complete aggregation results
 */
export interface BenchmarkAggregationResult {
  /**
   * Overall aggregated metrics
   */
  overall: AggregatedMetrics;

  /**
   * Sliced metrics by metadata dimensions
   */
  sliced?: SlicedMetrics[];

  /**
   * Failure analysis results
   */
  failureAnalysis?: FailureAnalysis;
}

/**
 * Aggregate evaluation results into dataset-level metrics
 */
export function aggregateResults(
  results: EvaluationResult[],
  options?: AggregationOptions,
): BenchmarkAggregationResult {
  // Compute overall metrics
  const overall = computeAggregatedMetrics(results);

  // Compute sliced metrics if requested
  const sliced = options?.sliceDimensions
    ? computeSlicedMetrics(results, options.sliceDimensions)
    : undefined;

  // Perform failure analysis if requested
  const failureAnalysis = options?.failureAnalysis
    ? performFailureAnalysis(results, options.failureAnalysis)
    : undefined;

  return {
    overall,
    sliced,
    failureAnalysis,
  };
}

/**
 * Compute aggregated metrics for a set of evaluation results
 */
export function computeAggregatedMetrics(
  results: EvaluationResult[],
): AggregatedMetrics {
  const totalSamples = results.length;
  const passingSamples = results.filter((r) => r.pass).length;
  const failingSamples = totalSamples - passingSamples;
  const passRate = totalSamples > 0 ? passingSamples / totalSamples : 0;

  // If no results, return zero-value metrics
  if (totalSamples === 0) {
    return {
      totalSamples: 0,
      passingSamples: 0,
      failingSamples: 0,
      passRate: 0,
      metrics: {},
    };
  }

  // Collect all metric names
  const metricNames = new Set<string>();
  for (const result of results) {
    for (const metricName of Object.keys(result.metrics)) {
      metricNames.add(metricName);
    }
  }

  // Compute statistics for each metric
  const metrics: Record<string, MetricStatistics> = {};
  for (const metricName of metricNames) {
    const values = results
      .map((r) => r.metrics[metricName])
      .filter((v) => v !== undefined && !Number.isNaN(v));

    if (values.length > 0) {
      metrics[metricName] = computeStatistics(metricName, values);
    }
  }

  return {
    totalSamples,
    passingSamples,
    failingSamples,
    passRate,
    metrics,
  };
}

/**
 * Compute statistical metrics for a set of values
 */
export function computeStatistics(
  name: string,
  values: number[],
): MetricStatistics {
  if (values.length === 0) {
    return {
      name,
      mean: 0,
      median: 0,
      stdDev: 0,
      p5: 0,
      p25: 0,
      p75: 0,
      p95: 0,
      min: 0,
      max: 0,
    };
  }

  // Sort values for percentile calculation
  const sorted = [...values].sort((a, b) => a - b);

  // Mean
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

  // Median
  const median = percentile(sorted, 50);

  // Standard deviation
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Percentiles
  const p5 = percentile(sorted, 5);
  const p25 = percentile(sorted, 25);
  const p75 = percentile(sorted, 75);
  const p95 = percentile(sorted, 95);

  // Min and max
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return {
    name,
    mean,
    median,
    stdDev,
    p5,
    p25,
    p75,
    p95,
    min,
    max,
  };
}

/**
 * Calculate percentile value from sorted array
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return sortedValues[lower];
  }

  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Compute sliced metrics by metadata dimensions
 */
export function computeSlicedMetrics(
  results: EvaluationResult[],
  dimensions: string[],
): SlicedMetrics[] {
  const sliced: SlicedMetrics[] = [];

  for (const dimension of dimensions) {
    // Group results by dimension value
    const groups = new Map<string, EvaluationResult[]>();

    for (const result of results) {
      // Extract dimension value from metadata (passed via diagnostics in EvaluationInput)
      // Note: We assume metadata is stored in result.diagnostics.metadata or as top-level metadata
      const metadata =
        (result.diagnostics?.metadata as Record<string, unknown>) || {};
      const dimensionValue = String(metadata[dimension] ?? "unknown");

      if (!groups.has(dimensionValue)) {
        groups.set(dimensionValue, []);
      }
      groups.get(dimensionValue)!.push(result);
    }

    // Compute metrics for each slice
    const slices: Record<string, AggregatedMetrics> = {};
    for (const [value, groupResults] of groups) {
      slices[value] = computeAggregatedMetrics(groupResults);
    }

    sliced.push({
      dimension,
      slices,
    });
  }

  return sliced;
}

/**
 * Perform failure analysis
 */
export function performFailureAnalysis(
  results: EvaluationResult[],
  options: FailureAnalysisOptions,
): FailureAnalysis {
  const topN = options.topN ?? 10;
  const metricName = options.metricName ?? "f1";

  // Find worst-performing samples
  const worstSamples = findWorstSamples(results, metricName, topN);

  // Compute per-field error breakdown (for schema-aware evaluator)
  const perFieldErrors = computePerFieldErrors(results);

  return {
    worstSamples,
    perFieldErrors: perFieldErrors.length > 0 ? perFieldErrors : undefined,
  };
}

/**
 * Find N worst-performing samples by metric
 */
export function findWorstSamples(
  results: EvaluationResult[],
  metricName: string,
  topN: number,
): WorstSample[] {
  // Filter results that have the specified metric
  const withMetric = results
    .filter((r) => metricName in r.metrics)
    .map((r) => ({
      sampleId: r.sampleId,
      metricValue: r.metrics[metricName],
      metrics: r.metrics,
      diagnostics: r.diagnostics,
    }));

  // Sort by metric value (ascending = worst first)
  withMetric.sort((a, b) => a.metricValue - b.metricValue);

  // Return top N
  return withMetric.slice(0, topN);
}

/**
 * Compute per-field error breakdown for schema-aware evaluator
 */
export function computePerFieldErrors(
  results: EvaluationResult[],
): FieldErrorStats[] {
  // This function assumes schema-aware evaluator diagnostics structure
  // which includes: missingFields, extraFields, mismatchedFields, comparisonResults

  const fieldStats = new Map<
    string,
    {
      total: number;
      matched: number;
      missing: number;
      mismatched: number;
    }
  >();

  for (const result of results) {
    const diagnostics = result.diagnostics;

    // Check if this looks like schema-aware evaluator output
    if (!diagnostics || !diagnostics.comparisonResults) {
      continue;
    }

    const comparisonResults = diagnostics.comparisonResults as Array<{
      field: string;
      matched: boolean;
      predicted?: unknown;
      expected?: unknown;
    }>;

    for (const comparison of comparisonResults) {
      const { field, matched, predicted, expected } = comparison;

      if (!fieldStats.has(field)) {
        fieldStats.set(field, {
          total: 0,
          matched: 0,
          missing: 0,
          mismatched: 0,
        });
      }

      const stats = fieldStats.get(field)!;

      // Count total occurrences (only if field has a real expected value)
      if (!isNullLike(expected)) {
        stats.total++;

        if (matched) {
          stats.matched++;
        } else if (isNullLike(predicted)) {
          stats.missing++;
        } else {
          stats.mismatched++;
        }
      }
    }
  }

  // Convert to array and compute error rates (skip fields with no real occurrences)
  const fieldErrors: FieldErrorStats[] = [];
  for (const [field, stats] of fieldStats) {
    if (stats.total === 0) continue;

    const errorRate = (stats.missing + stats.mismatched) / stats.total;

    fieldErrors.push({
      field,
      totalOccurrences: stats.total,
      matchCount: stats.matched,
      missingCount: stats.missing,
      mismatchCount: stats.mismatched,
      errorRate,
    });
  }

  // Sort by error rate (descending)
  fieldErrors.sort((a, b) => b.errorRate - a.errorRate);

  return fieldErrors;
}
