import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const DATA_FORMATS = ["json", "xml", "csv"] as const;

export const dataTransformParametersSchema = z.object({
  inputFormat: z.enum(DATA_FORMATS).meta({
    title: "Input format",
    description: "How to parse string-valued inputs.",
    "x-default": "json",
  }),
  outputFormat: z.enum(DATA_FORMATS).meta({
    title: "Output format",
    description: "Format for the rendered output.",
    "x-default": "json",
  }),
  fieldMapping: z
    .union([z.string().min(1), z.record(z.string(), z.unknown())])
    .meta({
      title: "Field mapping",
      description:
        "Defines the output structure. Values can include placeholder expressions like `{{slotName.field.path}}`.",
      "x-widget": "field-mapping-editor",
    }),
  xmlEnvelope: z.string().optional().meta({
    title: "XML envelope template",
    description:
      "Wraps the rendered fields in a custom XML envelope. XML output only.",
    "x-widget": "textarea",
  }),
});

export const dataTransformCatalogEntry: ActivityCatalogEntry = {
  activityType: "data.transform",
  displayName: "Generic Data Transform",
  category: "Data Transformation",
  description:
    "Generic transformer — reads inputs in JSON/XML/CSV, maps fields, and writes a new structure in JSON/XML/CSV.",
  iconHint: "transform",
  colorHint: "violet",
  inputs: [],
  outputs: [
    {
      name: "output",
      label: "Output",
      description: "Rendered result in the chosen output format.",
      required: true,
    },
  ],
  parametersSchema: dataTransformParametersSchema,
};
