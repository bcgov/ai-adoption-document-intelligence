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
  inputs: [
    {
      name: "datasetVersionId",
      label: "Dataset version ID",
      required: true,
    },
  ],
  outputs: [
    {
      name: "materializedPath",
      label: "Materialized path",
      description: "Local path where the dataset was materialized.",
      required: true,
    },
  ],
  parametersSchema: benchmarkMaterializeDatasetParametersSchema,
};
