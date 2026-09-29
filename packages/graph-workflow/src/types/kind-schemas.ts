/**
 * Zod source-of-truth schemas for built-in kinds that carry field schemas
 * (KIND_FIELD_SCHEMAS_DESIGN.md §3.3–§3.4).
 *
 * `Document` and `Classification` stay schema-free ANCESTORS: they remain
 * wildcards for the family, and shape-honest SUBKINDS (e.g. `PreparedFile`)
 * carry the schemas instead. See
 * docs-md/workflow-builder/KIND_TAXONOMY_REFINEMENT_DESIGN.md.
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

/**
 * The PreparedFile-kind value: file.prepare's output, consumed verbatim by
 * azureOcr.submit and mistralOcr.process. Field set verified against
 * apps/temporal prepare-file-data.ts (KIND_TAXONOMY_REFINEMENT_DESIGN.md §4).
 */
export const PreparedFileSchema = z.object({
  fileName: z.string(),
  fileType: z.enum(["pdf", "image"]),
  contentType: z.string(),
  blobKey: z.string(),
  /** Azure Document Intelligence model ID. */
  modelId: z.string(),
  /** Azure outputContentFormat: "text" (default) or "markdown". */
  outputFormat: z.enum(["text", "markdown"]).optional(),
});

/**
 * Single-source runtime type for PreparedFile-kind values; apps/temporal
 * re-exports this as its `PreparedFileData`.
 */
export type PreparedFileData = z.infer<typeof PreparedFileSchema>;

/** Shared page-range fragment. Deliberately NOT a registered kind: page
 *  ranges are not artifacts, so drill-down stops at the object
 *  (KIND_TAXONOMY_REFINEMENT_DESIGN.md §4). */
const PageRangeSchema = z.object({ start: z.number(), end: z.number() });

/**
 * document.split's per-segment output. Field set verified against
 * apps/temporal split-document.ts:18-23 (KIND_TAXONOMY_REFINEMENT_DESIGN.md §4).
 */
export const DocumentSegmentSchema = z.object({
  segmentIndex: z.number(),
  pageRange: PageRangeSchema,
  blobKey: z.string(),
  pageCount: z.number(),
});
export type DocumentSegment = z.infer<typeof DocumentSegmentSchema>;

/**
 * document.splitAndClassify's per-segment output — DocumentSegment plus
 * classification results (runtime `SegmentWithType extends DocumentSegment`
 * in split-and-classify-document.ts:17-20).
 */
export const TypedSegmentSchema = DocumentSegmentSchema.extend({
  segmentType: z.string(),
  keywordMatch: z.string().optional(),
  confidence: z.number(),
});
export type SegmentWithType = z.infer<typeof TypedSegmentSchema>;

/**
 * document.selectClassifiedPages' per-segment output. Field set verified
 * against apps/temporal select-classified-pages.ts:12-17.
 */
export const ClassifiedPageSegmentSchema = z.object({
  pageRange: PageRangeSchema,
  confidence: z.number(),
});
export type ClassifiedPageSegment = z.infer<typeof ClassifiedPageSegmentSchema>;

/**
 * document.flattenClassifiedDocuments' per-segment output. Field set
 * verified against apps/temporal flatten-classified-documents.ts:15-22
 * (runtime `ClassifiedSegment`, renamed `LabeledSegment` here per Task 13).
 */
export const LabeledSegmentSchema = z.object({
  label: z.string(),
  pageRange: PageRangeSchema,
  confidence: z.number(),
});
export type LabeledSegment = z.infer<typeof LabeledSegmentSchema>;

/** Identity map consumed by `zodToFields` to emit kind references. */
export const KIND_SCHEMAS: KindSchemaMap = new Map<ZodType, KindRef>([
  [OcrResultSchema, "OcrResult"],
  [PreparedFileSchema, "PreparedFile"],
  [DocumentSegmentSchema, "DocumentSegment"],
  [TypedSegmentSchema, "TypedSegment"],
  [ClassifiedPageSegmentSchema, "ClassifiedPageSegment"],
  [LabeledSegmentSchema, "LabeledSegment"],
]);
