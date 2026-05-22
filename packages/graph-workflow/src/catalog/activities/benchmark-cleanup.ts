import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const benchmarkCleanupParametersSchema = z.object({});

export const benchmarkCleanupCatalogEntry: ActivityCatalogEntry = {
  activityType: "benchmark.cleanup",
  displayName: "Benchmark — Cleanup",
  category: "Benchmarking",
  description: "Clean up temporary files and materialized datasets.",
  iconHint: "trash",
  colorHint: "gray",
  inputs: [
    {
      name: "materializedDatasetPaths",
      label: "Materialized dataset paths",
      required: false,
    },
    {
      name: "temporaryOutputPaths",
      label: "Temporary output paths",
      required: false,
    },
    {
      name: "preserveCachedDatasets",
      label: "Preserve cached datasets",
      required: false,
    },
  ],
  outputs: [],
  parametersSchema: benchmarkCleanupParametersSchema,
};
