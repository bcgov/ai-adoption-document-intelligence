import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const benchmarkLoadOcrCacheParametersSchema = z.object({});

export const benchmarkLoadOcrCacheCatalogEntry: ActivityCatalogEntry = {
  activityType: "benchmark.loadOcrCache",
  displayName: "Benchmark — Load OCR Cache",
  category: "Benchmarking",
  description: "Load cached Azure OCR poll JSON for a benchmark sample.",
  iconHint: "database",
  colorHint: "green",
  inputs: [
    { name: "sourceRunId", label: "Source run ID", required: true, kind: "Artifact" },
    { name: "sampleId", label: "Sample ID", required: true, kind: "Artifact" },
  ],
  outputs: [
    {
      name: "ocrResponse",
      label: "OCR response",
      description: "Cached Azure OCR response (null if not found).",
      required: false,
      kind: "Artifact",
    },
  ],
  parametersSchema: benchmarkLoadOcrCacheParametersSchema,
};
