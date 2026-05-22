import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const benchmarkLoadDatasetManifestParametersSchema = z.object({});

export const benchmarkLoadDatasetManifestCatalogEntry: ActivityCatalogEntry = {
  activityType: "benchmark.loadDatasetManifest",
  displayName: "Benchmark — Load Dataset Manifest",
  category: "Benchmarking",
  description: "Load dataset manifest from materialized data.",
  iconHint: "document",
  colorHint: "green",
  inputs: [
    {
      name: "materializedPath",
      label: "Materialized path",
      required: true,
    },
  ],
  outputs: [
    {
      name: "manifest",
      label: "Manifest",
      description: "Parsed dataset manifest (metadata + sample list).",
      required: true,
    },
  ],
  parametersSchema: benchmarkLoadDatasetManifestParametersSchema,
};
