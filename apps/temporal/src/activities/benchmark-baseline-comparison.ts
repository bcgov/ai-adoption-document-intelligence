/**
 * Benchmark Baseline Comparison Activity
 *
 * Compares a completed run against the baseline for its definition.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-034-baseline-management.md
 */

import { getPrismaClient } from './database-client';
import type { Prisma } from '../generated';

export interface BenchmarkBaselineComparisonInput {
  /** Benchmark run ID */
  runId: string;
}

export interface MetricThreshold {
  metricName: string;
  type: 'absolute' | 'relative';
  value: number;
}

export interface MetricComparison {
  metricName: string;
  currentValue: number;
  baselineValue: number;
  delta: number;
  deltaPercent: number;
  passed: boolean;
  threshold?: MetricThreshold;
}

export interface BaselineComparison {
  baselineRunId: string;
  overallPassed: boolean;
  metricComparisons: MetricComparison[];
  regressedMetrics: string[];
}

/**
 * Compare a run against the baseline for its definition
 *
 * Activity type: benchmark.compareAgainstBaseline
 */
export async function benchmarkCompareAgainstBaseline(
  input: BenchmarkBaselineComparisonInput,
): Promise<BaselineComparison | null> {
  const { runId } = input;

  const prisma = getPrismaClient();

  // Get the run
  const run = await prisma.benchmarkRun.findUnique({
    where: { id: runId },
  });

  if (!run) {
    throw new Error(`Run with ID "${runId}" not found`);
  }

  // Find the baseline run for this definition
  const baseline = await prisma.benchmarkRun.findFirst({
    where: {
      definitionId: run.definitionId,
      isBaseline: true,
    },
  });

  // No baseline exists yet
  if (!baseline) {
    console.log(
      JSON.stringify({
        activity: 'benchmarkCompareAgainstBaseline',
        event: 'no_baseline_found',
        runId,
        definitionId: run.definitionId,
        timestamp: new Date().toISOString(),
      }),
    );
    return null;
  }

  // Don't compare baseline against itself
  if (baseline.id === runId) {
    console.log(
      JSON.stringify({
        activity: 'benchmarkCompareAgainstBaseline',
        event: 'skip_self_comparison',
        runId,
        timestamp: new Date().toISOString(),
      }),
    );
    return null;
  }

  const currentMetrics = run.metrics as Record<string, unknown>;
  const baselineMetrics = baseline.metrics as Record<string, unknown>;
  const thresholds = (baseline.baselineThresholds as unknown as MetricThreshold[]) || [];

  const metricComparisons: MetricComparison[] = [];
  const regressedMetrics: string[] = [];

  // Compare each metric that exists in both runs
  for (const metricName of Object.keys(currentMetrics)) {
    const currentValue = currentMetrics[metricName];
    const baselineValue = baselineMetrics[metricName];

    // Skip non-numeric metrics
    if (
      typeof currentValue !== 'number' ||
      typeof baselineValue !== 'number'
    ) {
      continue;
    }

    const delta = currentValue - baselineValue;
    const deltaPercent =
      baselineValue !== 0 ? (delta / baselineValue) * 100 : 0;

    // Find threshold for this metric
    const threshold = thresholds.find((t) => t.metricName === metricName);

    let passed = true;

    if (threshold) {
      if (threshold.type === 'absolute') {
        // Absolute threshold: current value must be >= threshold value
        passed = currentValue >= threshold.value;
      } else if (threshold.type === 'relative') {
        // Relative threshold: current value must be >= (baseline * threshold value)
        passed = currentValue >= baselineValue * threshold.value;
      }

      if (!passed) {
        regressedMetrics.push(metricName);
      }
    }

    metricComparisons.push({
      metricName,
      currentValue,
      baselineValue,
      delta,
      deltaPercent,
      passed,
      threshold,
    });
  }

  const comparison: BaselineComparison = {
    baselineRunId: baseline.id,
    overallPassed: regressedMetrics.length === 0,
    metricComparisons,
    regressedMetrics,
  };

  // Update the run with comparison results
  await prisma.benchmarkRun.update({
    where: { id: runId },
    data: {
      baselineComparison: comparison as unknown as Prisma.InputJsonValue,
      tags: {
        ...(run.tags as Record<string, unknown>),
        ...(regressedMetrics.length > 0 ? { regression: 'true' } : {}),
      } as Prisma.InputJsonValue,
    },
  });

  console.log(
    JSON.stringify({
      activity: 'benchmarkCompareAgainstBaseline',
      event: 'comparison_complete',
      runId,
      baselineRunId: baseline.id,
      overallPassed: comparison.overallPassed,
      regressedMetrics,
      timestamp: new Date().toISOString(),
    }),
  );

  return comparison;
}
