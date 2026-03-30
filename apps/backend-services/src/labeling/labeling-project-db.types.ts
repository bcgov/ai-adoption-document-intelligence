import type {
  DocumentLabel,
  FieldDefinition,
  LabeledDocument,
  LabelingProject,
} from "@generated/client";
import type { LabelingDocumentData } from "./labeling-document-db.types";

export type LabelingProjectData = LabelingProject & {
  field_schema: FieldDefinition[];
  documents?: LabeledDocument[];
};

export type LabeledDocumentData = LabeledDocument & {
  labeling_document: LabelingDocumentData;
  labels: DocumentLabel[];
};
