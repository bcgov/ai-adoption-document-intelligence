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
      kind: "Artifact",
    },
    {
      name: "temporaryOutputPaths",
      label: "Temporary output paths",
      required: false,
      kind: "Artifact",
    },
    {
      name: "preserveCachedDatasets",
      label: "Preserve cached datasets",
      required: false,
      kind: "Artifact",
    },
  ],
  outputs: [],
  parametersSchema: benchmarkCleanupParametersSchema,
};
