/**
 * Benchmark Baseline Comparison Utilities
 *
 * Shared types and logic for comparing benchmark run metrics against a baseline.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-034-baseline-management.md
 */

export interface MetricThreshold {
  metricName: string;
  type: "absolute" | "relative";
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
 * Compare current metrics against baseline metrics using optional thresholds.
 *
 * For each numeric metric present in both sets:
 * - absolute threshold: current value must be >= threshold.value
 * - relative threshold: current value must be >= baseline * threshold.value
 *
 * Returns the list of per-metric comparisons and the names of regressed metrics.
 */
export function computeMetricComparisons(
  currentMetrics: Record<string, unknown>,
  baselineMetrics: Record<string, unknown>,
  thresholds: MetricThreshold[],
): { metricComparisons: MetricComparison[]; regressedMetrics: string[] } {
  const thresholdMap = new Map<string, MetricThreshold>();
  for (const threshold of thresholds) {
    thresholdMap.set(threshold.metricName, threshold);
  }

  const metricComparisons: MetricComparison[] = [];
  const regressedMetrics: string[] = [];

  for (const [metricName, currentValueRaw] of Object.entries(currentMetrics)) {
    if (typeof currentValueRaw !== "number") continue;

    const baselineValueRaw = baselineMetrics[metricName];
    if (typeof baselineValueRaw !== "number") continue;

    const currentValue = currentValueRaw;
    const baselineValue = baselineValueRaw;
    const delta = currentValue - baselineValue;
    const deltaPercent =
      baselineValue !== 0 ? (delta / baselineValue) * 100 : 0;

    const threshold = thresholdMap.get(metricName);
    let passed = true;

    if (threshold) {
      if (threshold.type === "absolute") {
        passed = currentValue >= threshold.value;
      } else if (threshold.type === "relative") {
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

  return { metricComparisons, regressedMetrics };
}
