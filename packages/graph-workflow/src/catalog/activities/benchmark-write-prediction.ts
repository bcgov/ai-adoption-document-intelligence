import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const benchmarkWritePredictionParametersSchema = z.object({});

export const benchmarkWritePredictionCatalogEntry: ActivityCatalogEntry = {
  activityType: "benchmark.writePrediction",
  displayName: "Benchmark — Write Prediction",
  category: "Benchmarking",
  description: "Write workflow prediction data to a JSON file for evaluation.",
  iconHint: "save",
  colorHint: "green",
  // Writes prediction JSON to disk; must always run. See US-134 +
  // TRY_IN_PLACE_DESIGN.md §2.6.
  nonCacheable: true,
  inputs: [
    { name: "predictionData", label: "Prediction data", required: true, kind: "Artifact" },
    { name: "outputDir", label: "Output directory", required: true, kind: "Artifact" },
    { name: "sampleId", label: "Sample ID", required: true, kind: "Artifact" },
  ],
  outputs: [
    {
      name: "predictionPath",
      label: "Prediction path",
      description: "Absolute path to the written prediction JSON file.",
      required: true,
      kind: "Artifact",
    },
  ],
  parametersSchema: benchmarkWritePredictionParametersSchema,
};
