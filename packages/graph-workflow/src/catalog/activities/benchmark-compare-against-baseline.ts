import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const benchmarkCompareAgainstBaselineParametersSchema = z.object({});

export const benchmarkCompareAgainstBaselineCatalogEntry: ActivityCatalogEntry =
  {
    activityType: "benchmark.compareAgainstBaseline",
    displayName: "Benchmark — Compare Against Baseline",
    category: "Benchmarking",
    description:
      "Compare run metrics against baseline and detect regressions.",
    iconHint: "chart-diff",
    colorHint: "green",
    inputs: [
      {
        name: "runId",
        label: "Run ID",
        description: "Benchmark run identifier.",
        required: true,
      },
    ],
    outputs: [
      {
        name: "comparison",
        label: "Comparison",
        description: "Baseline comparison result (null if no baseline).",
        required: false,
      },
    ],
    parametersSchema: benchmarkCompareAgainstBaselineParametersSchema,
  };
