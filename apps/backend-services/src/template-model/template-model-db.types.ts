import type {
  DocumentLabel,
  FieldDefinition,
  LabeledDocument,
  Prisma,
  TemplateModel,
  TrainedModel,
} from "@generated/client";

/**
 * Active TrainedModel slice surfaced alongside TemplateModelData. Holds the
 * fields the frontend needs to label the resolved model id (e.g.
 * km-invoice-v3) on list/detail views without issuing a separate request.
 */
export type ActiveTrainedModelSlice = Pick<
  TrainedModel,
  "id" | "model_id" | "version" | "is_active" | "deleted_at" | "created_at"
>;

export type TemplateModelData = TemplateModel & {
  field_schema: FieldDefinition[];
  documents?: LabeledDocument[];
  active_trained_model?: ActiveTrainedModelSlice | null;
};

export type LabelingDocumentData = {
  id: string;
  title: string;
  original_filename: string;
  file_path: string;
  normalized_file_path: string | null;
  file_type: string;
  file_size: number;
  metadata?: Record<string, unknown> | null;
  source: string;
  status: import("@generated/client").DocumentStatus;
  created_at: Date;
  updated_at: Date;
  apim_request_id?: string | null;
  model_id: string;
  ocr_result?: Prisma.JsonValue | null;
  group_id: string;
};

export type LabeledDocumentData = LabeledDocument & {
  labeling_document: LabelingDocumentData;
  labels: DocumentLabel[];
};
