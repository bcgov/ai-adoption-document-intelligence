/**
 * Workflow-safe OCR payload ref types and guards (no Node/Prisma/blob imports).
 * Activities use `ocr-payload-ref.ts` for I/O helpers.
 */

export interface OcrPayloadRef {
  documentId: string;
  blobPath: string;
  storage: "blob";
  byteLength?: number;
  pageCount?: number;
  /** running | succeeded | failed — used by pollUntil conditions */
  status?: string;
}

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
