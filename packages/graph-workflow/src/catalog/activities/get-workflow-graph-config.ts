import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const getWorkflowGraphConfigParametersSchema = z.object({});

export const getWorkflowGraphConfigCatalogEntry: ActivityCatalogEntry = {
  activityType: "getWorkflowGraphConfig",
  displayName: "Load Workflow Graph Config",
  category: "Benchmarking",
  description: "Load a workflow configuration from the database.",
  iconHint: "diagram",
  colorHint: "gray",
  inputs: [
    {
      name: "workflowId",
      label: "Workflow ID",
      description: "Workflow version ID, lineage ID, or lineage name.",
      required: true,
      kind: "Artifact",
    },
  ],
  outputs: [
    {
      name: "graph",
      label: "Graph",
      description: "Graph workflow configuration.",
      required: true,
      kind: "Artifact",
    },
  ],
  parametersSchema: getWorkflowGraphConfigParametersSchema,
};
