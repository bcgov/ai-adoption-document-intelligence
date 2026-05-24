import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const benchmarkAggregateParametersSchema = z.object({});

export const benchmarkAggregateCatalogEntry: ActivityCatalogEntry = {
  activityType: "benchmark.aggregate",
  displayName: "Benchmark — Aggregate",
  category: "Benchmarking",
  description: "Aggregate evaluation results into summary metrics.",
  iconHint: "chart-bar",
  colorHint: "green",
  inputs: [
    { name: "results", label: "Evaluation results", required: true, kind: "Artifact" },
    {
      name: "options",
      label: "Aggregation options",
      required: false,
      kind: "Artifact",
    },
  ],
  outputs: [
    {
      name: "aggregatedMetrics",
      label: "Aggregated metrics",
      description: "Summary metrics across all samples.",
      required: true,
      kind: "Artifact",
    },
  ],
  parametersSchema: benchmarkAggregateParametersSchema,
};
