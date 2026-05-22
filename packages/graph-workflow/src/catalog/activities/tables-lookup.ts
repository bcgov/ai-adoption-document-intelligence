import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

export const tablesLookupParametersSchema = z.object({});

export const tablesLookupCatalogEntry: ActivityCatalogEntry = {
  activityType: "tables.lookup",
  displayName: "Reference Data Lookup",
  category: "Reference Data",
  description:
    "Executes a named lookup on a reference table, returning matched rows.",
  iconHint: "database",
  colorHint: "gray",
  inputs: [
    {
      name: "groupId",
      label: "Group ID",
      description: "Group that owns the reference table.",
      required: true,
    },
    {
      name: "tableId",
      label: "Table ID",
      description: "Reference table identifier.",
      required: true,
    },
    {
      name: "lookupName",
      label: "Lookup name",
      description: "Name of the lookup definition.",
      required: true,
    },
  ],
  outputs: [
    {
      name: "result",
      label: "Result",
      description: "Lookup result: single object, array of objects, or null.",
      required: true,
    },
  ],
  parametersSchema: tablesLookupParametersSchema,
};
