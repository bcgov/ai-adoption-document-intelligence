import { z } from "zod/v4";
import type { ActivityCatalogEntry } from "../types";

const MARK_STATES = ["selected", "unselected"] as const;

// The table shapes mirror `RecoveryTableConfig` and the types it is built
// from in apps/temporal/src/activities/ocr-recover-numeric-zeros.ts.
const recoveryTableSchema = z.object({
  find: z.object({
    firstCellTextContains: z.string().optional(),
    firstCellTextEquals: z.string().optional(),
  }),
  columns: z.array(
    z.object({
      prefix: z.string(),
      headerEquals: z.string().optional(),
      headerContains: z.string().optional(),
    }),
  ),
  rows: z.array(
    z.object({
      suffix: z.string(),
      labelEquals: z.string().optional(),
      labelContains: z.string().optional(),
    }),
  ),
  recoveryValue: z.number().optional(),
  cellEligibility: z
    .object({
      stripBeforeCheck: z.array(z.string()).optional(),
      requireSelectionMarkInCell: z.boolean().optional(),
      acceptedMarkStates: z.array(z.enum(MARK_STATES)).optional(),
    })
    .optional(),
  fallbackTableFinder: z
    .object({
      shape: z
        .object({
          minRowCount: z.number().optional(),
          maxRowCount: z.number().optional(),
          minColumnCount: z.number().optional(),
          maxColumnCount: z.number().optional(),
        })
        .optional(),
      labelAnchor: z
        .object({ minLabelMatches: z.number().optional() })
        .optional(),
      positionalAnchor: z
        .object({
          minVotes: z.number().optional(),
          dominanceRatio: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const ocrRecoverNumericZerosFromCheckboxesParametersSchema = z.object({
  tables: z.array(recoveryTableSchema).optional().meta({
    title: "Tables",
    description:
      "One entry per table: how to find it, which column and row each field key comes from (prefix + suffix), and the value to write. With no tables the step changes nothing.",
    "x-widget": "json",
  }),
});

export type OcrRecoverNumericZerosFromCheckboxesParameters = z.infer<
  typeof ocrRecoverNumericZerosFromCheckboxesParametersSchema
>;

export const ocrRecoverNumericZerosFromCheckboxesCatalogEntry: ActivityCatalogEntry =
  {
    activityType: "ocr.recoverNumericZerosFromCheckboxes",
    displayName: "Recover Numeric Zeros from Checkboxes",
    category: "OCR Cleanup & Correction",
    description:
      "Fills in numeric fields Azure left empty because it read a written 0 as a checkbox: in the configured tables, an empty cell with a checkbox mark gets the recovery value (0 by default).",
    iconHint: "broom",
    colorHint: "teal",
    inputs: [
      {
        name: "ocrResult",
        label: "OCR result",
        description: "OCR result to correct, with its tables and page layout.",
        required: true,
        kind: "OcrResult",
      },
    ],
    outputs: [
      {
        name: "ocrResult",
        label: "Corrected result",
        description: "OCR result with the recovered values filled in.",
        required: true,
        kind: "OcrResult",
      },
      {
        name: "changes",
        label: "Corrections",
        description:
          "List of fields filled in, with the strategy that found each table.",
        required: false,
        kind: "Artifact",
      },
    ],
    parametersSchema: ocrRecoverNumericZerosFromCheckboxesParametersSchema,
  };
