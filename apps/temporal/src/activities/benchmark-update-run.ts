/**
 * Benchmark Run Status Update Activity
 *
 * Updates the BenchmarkRun record in Postgres with status, metrics, and completion info.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-022-benchmark-run-workflow.md
 */

import { getPrismaClient } from './database-client';
import type { Prisma } from '../generated';

export interface BenchmarkUpdateRunStatusInput {
  /** Benchmark run ID */
  runId: string;

  /** New status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  /** Aggregated metrics (if available) */
  metrics?: Record<string, unknown>;

  /** Error message (if failed) */
  error?: string;

  /** Completion timestamp */
  completedAt?: Date;
}

interface MetricThreshold {
  metricName: string;
  type: 'absolute' | 'relative';
  value: number;
}

interface MetricComparison {
  metricName: string;
  currentValue: number;
  baselineValue: number;
  delta: number;
  deltaPercent: number;
  passed: boolean;
  threshold?: MetricThreshold;
}

interface BaselineComparison {
  baselineRunId: string;
  overallPassed: boolean;
  metricComparisons: MetricComparison[];
  regressedMetrics: string[];
}

/**
 * Compute baseline comparison for a completed run
 */
async function computeBaselineComparison(
  runId: string,
  metrics: Record<string, unknown>,
  prisma: ReturnType<typeof getPrismaClient>,
): Promise<BaselineComparison | null> {
  // Get the run to find its definition
  const run = await prisma.benchmarkRun.findUnique({
    where: { id: runId },
    select: { definitionId: true },
  });

  if (!run) {
    console.warn(`Run ${runId} not found, skipping baseline comparison`);
    return null;
  }

  // Find the baseline run for this definition
  const baselineRun = await prisma.benchmarkRun.findFirst({
    where: {
      definitionId: run.definitionId,
      isBaseline: true,
      status: 'completed',
    },
    select: {
      id: true,
      metrics: true,
      baselineThresholds: true,
    },
  });

  if (!baselineRun) {
    console.log(`No baseline run found for definition ${run.definitionId}`);
    return null;
  }

  // Extract baseline metrics
  const baselineMetrics = baselineRun.metrics as Record<string, unknown>;
  const thresholds = (baselineRun.baselineThresholds as MetricThreshold[]) || [];

  // Build a map of thresholds by metric name
  const thresholdMap = new Map<string, MetricThreshold>();
  for (const threshold of thresholds) {
    thresholdMap.set(threshold.metricName, threshold);
  }

  // Compute comparison for each metric that exists in both runs
  const metricComparisons: MetricComparison[] = [];

  for (const [metricName, currentValueRaw] of Object.entries(metrics)) {
    // Skip non-numeric metrics
    if (typeof currentValueRaw !== 'number') continue;

    const baselineValueRaw = baselineMetrics[metricName];
    if (typeof baselineValueRaw !== 'number') continue;

    const currentValue = currentValueRaw as number;
    const baselineValue = baselineValueRaw as number;
    const delta = currentValue - baselineValue;
    const deltaPercent = baselineValue !== 0 ? (delta / baselineValue) * 100 : 0;

    // Determine pass/fail based on threshold
    const threshold = thresholdMap.get(metricName);
    let passed = true;

    if (threshold) {
      if (threshold.type === 'absolute') {
        // For absolute threshold: current value must be >= threshold.value
        passed = currentValue >= threshold.value;
      } else if (threshold.type === 'relative') {
        // For relative threshold: current value must be >= threshold.value * baseline
        const minAcceptable = threshold.value * baselineValue;
        passed = currentValue >= minAcceptable;
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

  // Determine overall pass/fail and regressed metrics
  const overallPassed = metricComparisons.every((m) => m.passed);
  const regressedMetrics = metricComparisons
    .filter((m) => !m.passed)
    .map((m) => m.metricName);

  console.log(
    JSON.stringify({
      event: 'baseline_comparison_computed',
      runId,
      baselineRunId: baselineRun.id,
      overallPassed,
      regressedMetricsCount: regressedMetrics.length,
      regressedMetrics,
    }),
  );

  return {
    baselineRunId: baselineRun.id,
    overallPassed,
    metricComparisons,
    regressedMetrics,
  };
}

/**
 * Update BenchmarkRun status in Postgres
 *
 * Activity type: benchmark.updateRunStatus
 */
export async function benchmarkUpdateRunStatus(
  input: BenchmarkUpdateRunStatusInput,
): Promise<void> {
  const { runId, status, metrics, error, completedAt } = input;

  const prisma = getPrismaClient();

  const updateData: Prisma.BenchmarkRunUpdateInput = {
    status,
  };

  if (metrics !== undefined) {
    updateData.metrics = metrics as Prisma.InputJsonValue;
  }

  if (error !== undefined) {
    updateData.error = error;
  }

  if (completedAt !== undefined) {
    updateData.completedAt = completedAt;
  }

  // Set startedAt when transitioning to running
  if (status === 'running') {
    updateData.startedAt = new Date();
  }

  // Compute baseline comparison when run completes successfully with metrics
  if (status === 'completed' && metrics) {
    const baselineComparison = await computeBaselineComparison(
      runId,
      metrics,
      prisma,
    );

    if (baselineComparison) {
      updateData.baselineComparison = baselineComparison as Prisma.InputJsonValue;
    }
  }

  await prisma.benchmarkRun.update({
    where: { id: runId },
    data: updateData,
  });

  console.log(
    JSON.stringify({
      activity: 'benchmarkUpdateRunStatus',
      event: 'status_updated',
      runId,
      status,
      hasMetrics: !!metrics,
      hasError: !!error,
      timestamp: new Date().toISOString(),
    }),
  );
}
