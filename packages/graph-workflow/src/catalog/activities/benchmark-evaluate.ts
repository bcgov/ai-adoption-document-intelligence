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
    {
      name: "sampleId",
      label: "Sample ID",
      description: "Benchmark sample identifier being evaluated.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "inputPaths",
      label: "Input paths",
      description: "Paths to the sample's source input files.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "predictionPaths",
      label: "Prediction paths",
      description: "Paths to the workflow's predicted output files.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "groundTruthPaths",
      label: "Ground truth paths",
      description: "Paths to the expected (correct) output files.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "metadata",
      label: "Sample metadata",
      description: "Additional metadata describing the benchmark sample.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "evaluatorType",
      label: "Evaluator type",
      description: "Which evaluator to score the prediction with.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "evaluatorConfig",
      label: "Evaluator config",
      description: "Configuration options passed to the evaluator.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "predictionConfidences",
      label: "Prediction confidences",
      description: "Optional per-field confidence map.",
      required: false,
      kind: "Artifact",
    },
  ],
  outputs: [
    {
      name: "evaluationResult",
      label: "Evaluation result",
      description: "Per-sample evaluation metrics and details.",
      required: true,
      kind: "Artifact",
    },
  ],
  parametersSchema: benchmarkEvaluateParametersSchema,
};
