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
    {
      name: "predictionData",
      label: "Prediction data",
      description: "The workflow's predicted output to write to disk.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "outputDir",
      label: "Output directory",
      description: "Directory the prediction JSON file will be written to.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "sampleId",
      label: "Sample ID",
      description: "Benchmark sample identifier the prediction belongs to.",
      required: true,
      kind: "Artifact",
    },
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
