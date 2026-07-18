/**
 * Zod source-of-truth schemas for built-in kinds that carry field schemas
 * (KIND_FIELD_SCHEMAS_DESIGN.md §3.3–§3.4).
 *
 * v1 seeds OcrResult ONLY. Document and Classification are deliberately
 * schema-free: their runtime shapes are polymorphic (a "Document" is
 * sometimes PreparedFileData, sometimes a bare blob-key string; a
 * "Classification" is a string from document.classify but a label→segments
 * map from azureClassify.poll) and an honest wildcard beats a lying type
 * (spec §2 principle 3).
 *
 * Kinds compose by referencing each other's schema OBJECT (identity), so a
 * referenced kind's schema must be declared before schemas that embed it.
 */
import { type ZodType, z } from "zod/v4";
import type { KindRef } from "./artifacts";
import type { KindSchemaMap } from "./zod-to-fields";

/**
 * The OcrResult-kind ctx value: a blob POINTER to the full OCR payload, not
 * the payload itself. Both azureOcr.extract and mistral.ocr construct exactly
 * this object; pollUntil conditions read `.status` off it.
 */
export const OcrResultSchema = z.object({
  documentId: z.string(),
  blobPath: z.string(),
  storage: z.literal("blob"),
  byteLength: z.number().optional(),
  pageCount: z.number().optional(),
  /** running | succeeded | failed — used by pollUntil conditions */
  status: z.string().optional(),
});

/**
 * The single-source runtime type for OcrResult-kind values. The Temporal
 * activities that construct the object type against THIS (imported as
 * `OcrPayloadRef`), so a schema change fails compilation there.
 */
export type OcrPayloadRef = z.infer<typeof OcrResultSchema>;

/** Identity map consumed by `zodToFields` to emit kind references. */
export const KIND_SCHEMAS: KindSchemaMap = new Map<ZodType, KindRef>([
  [OcrResultSchema, "OcrResult"],
]);
