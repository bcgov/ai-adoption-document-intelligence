import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const benchmarkEvaluateParametersSchema = z.object({});

export const benchmarkEvaluateCatalogEntry: ActivityCatalogEntry = {
  activityType: "benchmark.evaluate",
  displayName: "Benchmark — Evaluate",
  category: "Benchmarking",
  description: "Evaluate benchmark run results against ground truth.",
  iconHint: "chart",
  colorHint: "green",
  inputs: [
    { name: "sampleId", label: "Sample ID", required: true },
    { name: "inputPaths", label: "Input paths", required: true },
    { name: "predictionPaths", label: "Prediction paths", required: true },
    { name: "groundTruthPaths", label: "Ground truth paths", required: true },
    { name: "metadata", label: "Sample metadata", required: true },
    { name: "evaluatorType", label: "Evaluator type", required: true },
    { name: "evaluatorConfig", label: "Evaluator config", required: true },
    {
      name: "predictionConfidences",
      label: "Prediction confidences",
      description: "Optional per-field confidence map.",
      required: false,
    },
  ],
  outputs: [
    {
      name: "evaluationResult",
      label: "Evaluation result",
      description: "Per-sample evaluation metrics and details.",
      required: true,
    },
  ],
  parametersSchema: benchmarkEvaluateParametersSchema,
};
