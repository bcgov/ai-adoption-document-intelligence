/**
 * Benchmark Baseline Comparison Activity
 *
 * Compares a completed run against the baseline for its definition.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-034-baseline-management.md
 */

import type { Prisma } from "../generated";
import {
  type BaselineComparison,
  computeMetricComparisons,
  type MetricThreshold,
} from "./benchmark-comparison-utils";
import { getPrismaClient } from "./database-client";
import { createActivityLogger } from "../logger";

export type {
  BaselineComparison,
  MetricComparison,
  MetricThreshold,
} from "./benchmark-comparison-utils";

export interface BenchmarkBaselineComparisonInput {
  /** Benchmark run ID */
  runId: string;
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
  const log = createActivityLogger("benchmarkCompareAgainstBaseline", {
    runId,
  });
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
      status: "completed",
    },
  });

  // No baseline exists yet
  if (!baseline) {
    log.info("No baseline found for definition", {
      event: "no_baseline_found",
      definitionId: run.definitionId,
    });
    return null;
  }

  // Don't compare baseline against itself
  if (baseline.id === runId) {
    log.info("Skip self-comparison", {
      event: "skip_self_comparison",
    });
    return null;
  }

  const currentMetrics = run.metrics as Record<string, unknown>;
  const baselineMetrics = baseline.metrics as Record<string, unknown>;
  const thresholds =
    (baseline.baselineThresholds as unknown as MetricThreshold[]) || [];

  const { metricComparisons, regressedMetrics } = computeMetricComparisons(
    currentMetrics,
    baselineMetrics,
    thresholds,
  );

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
        ...(regressedMetrics.length > 0 ? { regression: "true" } : {}),
      } as Prisma.InputJsonValue,
    },
  });

  log.info("Baseline comparison complete", {
    event: "comparison_complete",
    baselineRunId: baseline.id,
    overallPassed: comparison.overallPassed,
    regressedMetrics,
  });

  return comparison;
}
