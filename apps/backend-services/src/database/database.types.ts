import type {
  Document,
  DocumentLabel,
  FieldCorrection,
  FieldDefinition,
  LabeledDocument,
  LabelingProject,
  OcrResult,
  ReviewSession,
} from "@generated/client";
import type { LabelingDocumentData } from "@/labeling/labeling-document-db.types";

export type { LabelingDocumentData };
export type DocumentData = Document;
export type LabelingProjectData = LabelingProject & {
  field_schema: FieldDefinition[];
  documents?: LabeledDocument[];
};
export type LabeledDocumentData = LabeledDocument & {
  labeling_document: LabelingDocumentData;
  labels: DocumentLabel[];
};
export type ReviewSessionData = ReviewSession & {
  document: Document & {
    ocr_result: OcrResult | null;
  };
  corrections: FieldCorrection[];
};
