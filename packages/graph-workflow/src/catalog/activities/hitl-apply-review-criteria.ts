import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const REVIEW_ACTIONS = ["review", "skip"] as const;

// The rule shapes mirror `ReviewCriteriaCondition`, `ReviewCriteriaRuleSelect`
// and `ReviewCriteriaRule` in
// apps/temporal/src/activities/hitl-apply-review-criteria.ts. Every condition
// reads the prediction only, never ground truth.
const reviewCriteriaConditionSchema = z.union([
  z.object({ confidenceBelow: z.number() }),
  z.object({ predictionIsBlank: z.literal(true) }),
  z.object({ predictionLengthAtMost: z.number() }),
  z.object({ formatValidationFails: z.literal(true) }),
  z.object({
    valueOutsideRange: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
    }),
  }),
  z.object({ valueWasInferred: z.literal(true) }),
  z.object({ always: z.literal(true) }),
]);

const reviewCriteriaRuleSchema = z.object({
  name: z.string().min(1),
  select: z.object({
    fields: z.array(z.string()).optional(),
    fieldPatterns: z.array(z.string()).optional(),
    excludeFieldPatterns: z.array(z.string()).optional(),
    fieldTypes: z.array(z.string()).optional(),
  }),
  when: z.array(reviewCriteriaConditionSchema).optional(),
  skipWhen: z.array(reviewCriteriaConditionSchema).optional(),
  action: z.enum(REVIEW_ACTIONS),
  reason: z.string(),
});

export const hitlApplyReviewCriteriaParametersSchema = z.object({
  documentType: z.string().optional().meta({
    title: "Document type",
    description:
      "Template model whose field schema backs format checks and selection by field type.",
    "x-widget": "documentTypePicker",
  }),
  rules: z.array(reviewCriteriaRuleSchema).min(1).meta({
    title: "Rules",
    description:
      "Ordered rules; the first one that matches a field decides it. Each selects fields, sets conditions (when, skipWhen) and an action, review or skip.",
    "x-widget": "json",
  }),
  defaultAction: z.enum(REVIEW_ACTIONS).optional().meta({
    title: "Default action",
    description: "What happens to a field no rule matches.",
    "x-default": "skip",
  }),
  inferredFieldKeys: z.array(z.string()).optional().meta({
    title: "Inferred fields",
    description:
      "Field keys an earlier step inferred rather than read, for the valueWasInferred condition.",
  }),
  ruleConfidenceOverrides: z.record(z.string(), z.number()).optional().meta({
    title: "Confidence overrides",
    description:
      "Confidence threshold per rule name, replacing the threshold in that rule's confidenceBelow conditions.",
    "x-widget": "json",
  }),
});

export type HitlApplyReviewCriteriaParameters = z.infer<
  typeof hitlApplyReviewCriteriaParametersSchema
>;

export const hitlApplyReviewCriteriaCatalogEntry: ActivityCatalogEntry = {
  activityType: "hitl.applyReviewCriteria",
  displayName: "Apply Review Criteria",
  category: "OCR Quality",
  description:
    "Decides, field by field, whether a human should review it or it can be auto-skipped, using an author-configured list of rules evaluated against the prediction only (never ground truth).",
  iconHint: "checklist",
  colorHint: "teal",
  inputs: [
    {
      name: "documentId",
      label: "Document ID",
      description: "Identifier of the document being reviewed.",
      required: true,
      kind: "DocumentId",
    },
    {
      name: "ocrResult",
      label: "OCR result",
      description: "OCR result whose fields the rules check.",
      required: true,
      kind: "OcrResult",
    },
  ],
  outputs: [
    {
      name: "reviewPlan",
      label: "Review plan",
      description:
        "One entry per field: review or skip, the rule that decided, and why.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "requiresReview",
      label: "Needs review",
      description: "True when at least one field needs a reviewer.",
      required: true,
      kind: "Artifact",
    },
    {
      name: "reviewFieldCount",
      label: "Fields to review",
      description: "Number of fields that need a reviewer.",
      required: false,
      kind: "Artifact",
    },
    {
      name: "countsByRule",
      label: "Fields per rule",
      description:
        "How many fields each rule decided, keyed by rule name; fields no rule matched count under __default__.",
      required: false,
      kind: "Artifact",
    },
  ],
  parametersSchema: hitlApplyReviewCriteriaParametersSchema,
};
