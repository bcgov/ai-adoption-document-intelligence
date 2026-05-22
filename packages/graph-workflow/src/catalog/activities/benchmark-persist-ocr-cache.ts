import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const benchmarkPersistOcrCacheParametersSchema = z.object({});

export const benchmarkPersistOcrCacheCatalogEntry: ActivityCatalogEntry = {
  activityType: "benchmark.persistOcrCache",
  displayName: "Benchmark — Persist OCR Cache",
  category: "Benchmarking",
  description: "Persist Azure OCR poll JSON for a benchmark sample.",
  iconHint: "save",
  colorHint: "green",
  inputs: [
    { name: "sourceRunId", label: "Source run ID", required: true },
    { name: "sampleId", label: "Sample ID", required: true },
    { name: "ocrResponse", label: "OCR response", required: true },
  ],
  outputs: [],
  parametersSchema: benchmarkPersistOcrCacheParametersSchema,
};
