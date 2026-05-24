import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const benchmarkPersistEvaluationDetailsParametersSchema = z.object({});

export const benchmarkPersistEvaluationDetailsCatalogEntry: ActivityCatalogEntry =
  {
    activityType: "benchmark.persistEvaluationDetails",
    displayName: "Benchmark — Persist Evaluation Details",
    category: "Benchmarking",
    description: "Write per-sample evaluation details to blob storage.",
    iconHint: "save",
    colorHint: "green",
    inputs: [
      { name: "runId", label: "Run ID", required: true, kind: "Artifact" },
      { name: "sampleId", label: "Sample ID", required: true, kind: "Artifact" },
      {
        name: "details",
        label: "Details",
        description:
          "Heavy evaluation fields (groundTruth, prediction, evaluationDetails, diagnostics).",
        required: true,
        kind: "Artifact",
      },
    ],
    outputs: [
      {
        name: "evaluationBlobPath",
        label: "Evaluation blob path",
        description: "Blob storage key the evaluation details were written to.",
        required: true,
        kind: "Artifact",
      },
    ],
    parametersSchema: benchmarkPersistEvaluationDetailsParametersSchema,
  };
