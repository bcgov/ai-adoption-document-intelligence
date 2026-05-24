import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const DATA_FORMATS = ["json", "xml", "csv"] as const;

// Must mirror the runtime contract in
// apps/temporal/src/activities/data-transform/execute.ts —
// `fieldMapping` is parsed with `JSON.parse` (string in, object out),
// so a non-parseable string is a runtime error. Catching this at
// save/edit time keeps the editor and the worker aligned.
const fieldMappingSchema = z
  .string()
  .min(1, { message: "fieldMapping must be a non-empty string" })
  .refine(
    (value) => {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "fieldMapping must be valid JSON" },
  )
  .meta({
    title: "Field mapping",
    description:
      "JSON-parseable mapping that defines the output structure. Values can include placeholder expressions like `{{slotName.field.path}}`.",
    "x-widget": "field-mapping-editor",
  });

export const dataTransformParametersSchema = z
  .object({
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
    fieldMapping: fieldMappingSchema,
    xmlEnvelope: z.string().optional().meta({
      title: "XML envelope template",
      description:
        "Wraps the rendered fields in a custom XML envelope. XML output only; must contain exactly one `{{payload}}` placeholder.",
      "x-widget": "textarea",
    }),
  })
  .superRefine((params, ctx) => {
    // Mirror apps/temporal/src/activities/data-transform/xml-envelope-injector.ts:
    // when output is XML and an envelope is supplied, it must contain
    // exactly one `{{payload}}` placeholder.
    if (params.outputFormat !== "xml") return;
    const envelope = params.xmlEnvelope;
    if (envelope === undefined) return;
    const matches = (envelope.match(/\{\{payload\}\}/g) ?? []).length;
    if (matches !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["xmlEnvelope"],
        message:
          "xmlEnvelope must contain exactly one {{payload}} placeholder",
      });
    }
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
      kind: "Artifact",
    },
  ],
  parametersSchema: dataTransformParametersSchema,
};
