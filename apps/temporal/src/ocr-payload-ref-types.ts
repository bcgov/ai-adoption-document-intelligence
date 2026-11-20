/**
 * Workflow-safe OCR payload ref guard (no Node/Prisma/blob imports).
 * Activities use `ocr-payload-ref.ts` for I/O helpers.
 *
 * The `OcrPayloadRef` TYPE now lives in @ai-di/graph-workflow, derived from
 * the OcrResult kind's Zod schema (`z.infer<typeof OcrResultSchema>`), so the
 * activities constructing the ref and the builder's field drill-down share
 * one definition (KIND_FIELD_SCHEMAS_DESIGN.md §3.4).
 */
import type { OcrPayloadRef } from "@ai-di/graph-workflow";

export type { OcrPayloadRef };

export function isOcrPayloadRef(value: unknown): value is OcrPayloadRef {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as OcrPayloadRef).storage === "blob" &&
    typeof (value as OcrPayloadRef).documentId === "string" &&
    typeof (value as OcrPayloadRef).blobPath === "string"
  );
}
