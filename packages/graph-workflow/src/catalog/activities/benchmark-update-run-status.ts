import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export const benchmarkUpdateRunStatusParametersSchema = z.object({
  status: z.enum(RUN_STATUSES).meta({
    title: "Status",
    description: "New benchmark run status.",
  }),
  error: z.string().optional().meta({
    title: "Error message",
    description: "Error message (for failed runs).",
    "x-widget": "textarea",
  }),
});

export const benchmarkUpdateRunStatusCatalogEntry: ActivityCatalogEntry = {
  activityType: "benchmark.updateRunStatus",
  displayName: "Benchmark — Update Run Status",
  category: "Benchmarking",
  description: "Update benchmark run status in the database.",
  iconHint: "status-tag",
  colorHint: "green",
  inputs: [
    {
      name: "runId",
      label: "Run ID",
      description: "Benchmark run identifier.",
      required: true,
      kind: "Artifact",
    },
  ],
  outputs: [],
  parametersSchema: benchmarkUpdateRunStatusParametersSchema,
};
