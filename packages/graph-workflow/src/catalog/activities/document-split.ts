/**
 * Catalog entry for `document.split`.
 *
 * Splits a multi-page PDF into segments using one of three strategies.
 * Mirrors the runtime `SplitDocumentInput` shape in
 * apps/temporal/src/activities/split-document.ts.
 *
 * Used as the conditional-fields stress case for the JSON Schema form
 * renderer: the `strategy` field discriminates which additional parameters
 * are required.
 *
 * See docs-md/workflow-builder/WORKFLOW_NODE_CATALOG.md → "Split Document".
 */

import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const SPLIT_STRATEGIES = ["per-page", "fixed-range", "custom-ranges"] as const;

const strategyMeta = {
  title: "Strategy",
  description: "How to divide the source PDF into segments.",
  "x-options-labels": {
    "per-page": "One segment per page",
    "fixed-range": "Fixed-size ranges",
    "custom-ranges": "Custom page ranges",
  },
} as const;

export const documentSplitParametersSchema = z.discriminatedUnion("strategy", [
  z.object({
    strategy: z.literal("per-page").meta(strategyMeta),
  }),
  z.object({
    strategy: z.literal("fixed-range").meta(strategyMeta),
    fixedRangeSize: z
      .number()
      .int()
      .min(1)
      .max(500)
      .meta({
        title: "Pages per segment",
        description: "How many consecutive pages each segment should contain.",
        "x-default": 1,
        "x-step": 1,
      }),
  }),
  z.object({
    strategy: z.literal("custom-ranges").meta(strategyMeta),
    customRanges: z
      .array(
        z.object({
          start: z
            .number()
            .int()
            .min(1)
            .meta({ title: "Start page", "x-step": 1 }),
          end: z
            .number()
            .int()
            .min(1)
            .meta({ title: "End page", "x-step": 1 }),
        }),
      )
      .min(1)
      .meta({
        title: "Page ranges",
        description:
          "Explicit page ranges to extract. Pages are 1-based and inclusive.",
        "x-widget": "page-range-list",
      }),
  }),
]);

export const documentSplitCatalogEntry: ActivityCatalogEntry = {
  activityType: "document.split",
  displayName: "Split Document",
  category: "Document Handling",
  description:
    "Splits a multi-page PDF into segments using one of several strategies (per page, fixed-size ranges, or explicit custom ranges).",
  iconHint: "scissors",
  colorHint: "indigo",
  inputs: [
    {
      name: "blobKey",
      label: "Source file reference (blob key)",
      description: "Storage key for the multi-page PDF to split.",
      required: true,
    },
    {
      name: "groupId",
      label: "Group ID",
      description: "Destination group used for storing the produced segments.",
      required: true,
    },
    {
      name: "documentId",
      label: "Document ID",
      description: "Inferred from the file reference if not provided.",
      required: false,
    },
  ],
  outputs: [
    {
      name: "segments",
      label: "Segments",
      description:
        "List of produced segments — each with segmentIndex, pageRange, blobKey, and pageCount.",
      required: true,
    },
  ],
  parametersSchema: documentSplitParametersSchema,
};

export const SPLIT_STRATEGY_VALUES = SPLIT_STRATEGIES;
