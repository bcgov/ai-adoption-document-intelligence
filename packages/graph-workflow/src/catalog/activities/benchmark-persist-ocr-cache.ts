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
  // Writes to the benchmark tables; persist activities must always run.
  // See US-134 + TRY_IN_PLACE_DESIGN.md §2.6.
  nonCacheable: true,
  inputs: [
    { name: "sourceRunId", label: "Source run ID", required: true, kind: "Artifact" },
    { name: "sampleId", label: "Sample ID", required: true, kind: "Artifact" },
    { name: "ocrResponse", label: "OCR response", required: true, kind: "Artifact" },
  ],
  outputs: [],
  parametersSchema: benchmarkPersistOcrCacheParametersSchema,
};
