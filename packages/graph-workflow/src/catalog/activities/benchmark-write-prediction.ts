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
  inputs: [
    { name: "predictionData", label: "Prediction data", required: true },
    { name: "outputDir", label: "Output directory", required: true },
    { name: "sampleId", label: "Sample ID", required: true },
  ],
  outputs: [
    {
      name: "predictionPath",
      label: "Prediction path",
      description: "Absolute path to the written prediction JSON file.",
      required: true,
    },
  ],
  parametersSchema: benchmarkWritePredictionParametersSchema,
};
