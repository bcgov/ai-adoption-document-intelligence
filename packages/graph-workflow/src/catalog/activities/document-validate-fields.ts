import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const FIELD_TYPES = ["text", "number", "currency"] as const;
// Must mirror `ValidationRule.operator` in
// apps/temporal/src/activities/document-validate-fields.ts — the runtime
// activity treats anything other than `"approximately"` as exact equality
// via the `"equals"` literal. Keeping the catalog vocabulary identical so
// editor-authored rules round-trip into a shape the activity consumes
// without translation.
const MATCH_OPERATORS = ["equals", "approximately"] as const;
const MATCH_TYPES = ["any", "all"] as const;

const arithmeticExpressionSchema = z.object({
  operation: z.enum(["sum", "difference", "product"]).meta({
    title: "Operation",
  }),
  fields: z
    .array(z.string().min(1))
    .min(1)
    .meta({ title: "Operand field paths" }),
  equals: z.string().min(1).meta({ title: "Expected field path" }),
});

const toleranceSchema = z.object({
  amount: z.number().optional().meta({ title: "Tolerance amount" }),
  percentage: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .meta({ title: "Tolerance %" }),
});

const fieldMatchRuleSchema = z.object({
  type: z.literal("field-match"),
  name: z.string().min(1).meta({ title: "Rule name" }),
  primaryField: z.string().min(1).meta({ title: "Primary field path" }),
  attachmentField: z
    .string()
    .min(1)
    .meta({ title: "Attachment field path" }),
  operator: z.enum(MATCH_OPERATORS).meta({ title: "Operator" }),
  tolerance: toleranceSchema.optional(),
  fieldType: z.enum(FIELD_TYPES).meta({ title: "Field type" }),
});

const arithmeticRuleSchema = z.object({
  type: z.literal("arithmetic"),
  name: z.string().min(1).meta({ title: "Rule name" }),
  expression: arithmeticExpressionSchema.meta({
    title: "Expression",
    description:
      "Operation + operand fields + expected-equals field; e.g. `gross - deductions = net`.",
  }),
  operator: z.enum(MATCH_OPERATORS).meta({ title: "Operator" }),
  tolerance: toleranceSchema.optional(),
  fieldType: z.enum(FIELD_TYPES).meta({ title: "Field type" }),
});

const arrayMatchRuleSchema = z.object({
  type: z.literal("array-match"),
  name: z.string().min(1).meta({ title: "Rule name" }),
  primaryFields: z.array(z.string().min(1)).min(1).meta({
    title: "Primary field paths",
  }),
  attachmentFields: z.array(z.string().min(1)).min(1).meta({
    title: "Attachment field paths",
  }),
  matchType: z.enum(MATCH_TYPES).meta({ title: "Match type" }),
  operator: z.enum(MATCH_OPERATORS).meta({ title: "Operator" }),
  tolerance: toleranceSchema.optional(),
  fieldType: z.enum(FIELD_TYPES).meta({ title: "Field type" }),
});

export const validationRuleSchema = z.discriminatedUnion("type", [
  fieldMatchRuleSchema,
  arithmeticRuleSchema,
  arrayMatchRuleSchema,
]);

/**
 * Canonical type for one element of `documentValidateFieldsParametersSchema.rules`.
 * Source of truth for the frontend `ValidationRuleEditor` widget.
 */
export type ValidationRule = z.infer<typeof validationRuleSchema>;

export const documentValidateFieldsParametersSchema = z.object({
  rules: z
    .array(validationRuleSchema)
    .min(1)
    .meta({
      title: "Validation rules",
      description:
        "Cross-document field matching, arithmetic, and array-match rules.",
      "x-widget": "validation-rule-editor",
    }),
});

export const documentValidateFieldsCatalogEntry: ActivityCatalogEntry = {
  activityType: "document.validateFields",
  displayName: "Validate Fields",
  category: "Validation",
  description:
    "Validates fields across related document segments — arithmetic checks, cross-document field matching, array matching.",
  iconHint: "checklist",
  colorHint: "cyan",
  inputs: [
    {
      name: "processedSegments",
      label: "Processed segments",
      description:
        "Array of segments (item 0 = primary, items 1+ = attachments).",
      required: true,
    },
    {
      name: "documentId",
      label: "Document ID",
      description: "Identifier of the document being validated.",
      required: true,
    },
  ],
  outputs: [
    {
      name: "validationResults",
      label: "Validation results",
      description: "Per-rule results plus a summary of matches and mismatches.",
      required: true,
    },
  ],
  parametersSchema: documentValidateFieldsParametersSchema,
};
