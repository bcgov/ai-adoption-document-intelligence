import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const benchmarkMaterializeDatasetParametersSchema = z.object({});

export const benchmarkMaterializeDatasetCatalogEntry: ActivityCatalogEntry = {
  activityType: "benchmark.materializeDataset",
  displayName: "Benchmark — Materialize Dataset",
  category: "Benchmarking",
  description: "Materialize dataset version from object storage to the worker.",
  iconHint: "download",
  colorHint: "green",
  // Storage write: materializes files onto the worker; a cache hit would
  // return a path nothing wrote. See US-134 + TRY_IN_PLACE_DESIGN.md §2.6.
  nonCacheable: true,
  inputs: [
    {
      name: "datasetVersionId",
      label: "Dataset version ID",
      description: "The dataset version to materialize from object storage.",
      required: true,
      kind: "Artifact",
    },
  ],
  outputs: [
    {
      name: "materializedPath",
      label: "Materialized path",
      description: "Local path where the dataset was materialized.",
      required: true,
      kind: "Artifact",
    },
  ],
  parametersSchema: benchmarkMaterializeDatasetParametersSchema,
};
