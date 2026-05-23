import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const PATTERN_SCOPES = [
  "fullText",
  "title",
  "paragraph",
  "section",
  "keyValueKey",
  "keyValueValue",
] as const;
const PATTERN_OPERATORS = ["contains", "startsWith", "matches"] as const;

export const CLASSIFICATION_PATTERN_SCOPES = PATTERN_SCOPES;
export const CLASSIFICATION_PATTERN_OPERATORS = PATTERN_OPERATORS;

export const classificationPatternSchema = z.object({
  scope: z.enum(PATTERN_SCOPES).meta({
    title: "Where to look",
    description: "Region of the OCR result to match against.",
  }),
  operator: z.enum(PATTERN_OPERATORS).meta({
    title: "Operator",
    description: "How to compare the value.",
  }),
  value: z.string().min(1).meta({
    title: "Value",
    description: "String or regex pattern to match.",
  }),
});

/**
 * Canonical type for one element of `classificationRuleSchema.patterns`.
 * Source of truth for the frontend `ClassificationRuleEditor` widget.
 */
export type ClassificationPattern = z.infer<typeof classificationPatternSchema>;

export const classificationRuleSchema = z.object({
  name: z.string().min(1).meta({ title: "Rule name" }),
  resultType: z.string().min(1).meta({
    title: "Result type",
    description: "Document type to assign if this rule matches.",
  }),
  patterns: z
    .array(classificationPatternSchema)
    .min(1)
    .meta({
      title: "Patterns",
      description: "ALL patterns must match for the rule to fire.",
    }),
});

/**
 * Canonical type for one element of
 * `documentClassifyParametersSchema.rules`. Source of truth for the frontend
 * `ClassificationRuleEditor` widget.
 */
export type ClassificationRule = z.infer<typeof classificationRuleSchema>;

export const documentClassifyParametersSchema = z.object({
  classifierType: z
    .literal("rule-based")
    .meta({
      title: "Classifier strategy",
      description: "Currently only rule-based classification is supported.",
      "x-default": "rule-based",
    }),
  rules: z
    .array(classificationRuleSchema)
    .min(1)
    .meta({
      title: "Classification rules",
      description:
        "Tried in order; the first rule whose patterns all match wins.",
      "x-widget": "classification-rule-editor",
    }),
});

export const documentClassifyCatalogEntry: ActivityCatalogEntry = {
  activityType: "document.classify",
  displayName: "Classify Document",
  category: "Document Handling",
  description:
    "Classifies a document segment's type using rule-based pattern matching on its OCR text.",
  iconHint: "tag",
  colorHint: "indigo",
  inputs: [
    {
      name: "ocrResult",
      label: "OCR result for this segment",
      description: "Segment OCR result to classify.",
      required: true,
    },
    {
      name: "segment",
      label: "Segment metadata",
      description: "Segment metadata produced upstream.",
      required: true,
    },
  ],
  outputs: [
    {
      name: "segmentType",
      label: "Detected segment type",
      description: "Document type assigned by the matched rule.",
      required: true,
    },
    {
      name: "confidence",
      label: "Confidence",
      description: "Classification confidence (0–1).",
      required: false,
    },
    {
      name: "matchedRule",
      label: "Matched rule",
      description: "Name of the rule that matched.",
      required: false,
    },
  ],
  parametersSchema: documentClassifyParametersSchema,
};
