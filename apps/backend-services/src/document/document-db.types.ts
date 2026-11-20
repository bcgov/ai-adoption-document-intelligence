import type { Document, RejectionReason } from "@generated/client";

export type DocumentData = Document;

/** Why and by whom a document was rejected, read from its rejected review session. */
export interface DocumentRejection {
  reason: RejectionReason | null;
  comment: string | null;
  rejected_at: Date | null;
  /** Email of the reviewer whose session rejected the document; null when that reviewer is an API key. */
  rejected_by: string | null;
}

/** A document as the list endpoint returns it. */
export type DocumentListItem = DocumentData & {
  workflow_name: string | null;
  rejection: DocumentRejection | null;
};
