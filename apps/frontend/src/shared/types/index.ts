// Shared types for the application

export type DocumentStatus =
  | "pre_ocr"
  | "ongoing_ocr"
  | "extracted"
  | "awaiting_review"
  | "complete"
  | "failed"
  | "conversion_failed";

export enum RejectionReason {
  INPUT_QUALITY = "INPUT_QUALITY", // Scan unreadable, cutoff, skew
  OCR_FAILURE = "OCR_FAILURE", // Missing fields, hallucinations
  MODEL_MISMATCH = "MODEL_MISMATCH", // Wrong document type/template
  CONFIDENCE_TOO_LOW = "CONFIDENCE_TOO_LOW", // Confidence too low to trust
  SYSTEMIC_ERROR = "SYSTEMIC_ERROR", // Pipeline bug
}

export interface Document {
  id: string;
  title: string;
  original_filename: string;
  file_path: string;
  /** Normalized PDF blob key when conversion succeeded; null if conversion failed. */
  normalized_file_path?: string | null;
  file_type: string;
  file_size: number;
  source: string;
  status: DocumentStatus | string;
  created_at: string;
  updated_at: string;
  /**
   * Set once the ephemeral-cleanup janitor purged the document's blobs per its
   * workflow's retention policy. When set, the original/normalized PDF is gone
   * (view/download return 410) but the extracted OCR data is retained.
   */
  purged_at?: string | null;
  metadata?: Record<string, unknown>;
  apim_request_id?: string | null;
  intake_method?: string | null;
  ministry?: string | null;
  priority?: "low" | "medium" | "high" | "urgent" | string;
  confidence_score?: number | null;
  file_url?: string | null;
  extracted_data?: Record<string, unknown> & {
    content?: string;
  };
  model_id?: string;
  needsReview?: boolean; // Set by backend when workflow is awaiting review
  workflow_name?: string | null; // Name of the workflow used to process this document
}

export interface BoundingRegion {
  pageNumber: number;
  polygon: number[];
}

export interface Span {
  offset: number;
  length: number;
}

// Unified field format (used for both custom and prebuilt models)
export interface DocumentField {
  type: string; // "string", "number", "selectionMark", "date", etc.
  content: string | null;
  confidence: number;
  boundingRegions?: BoundingRegion[];
  spans?: Span[];
  // Type-specific values (from custom models)
  valueString?: string;
  valueNumber?: number;
  valueSelectionMark?: "selected" | "unselected";
  valueDate?: string;
}

export type ExtractedFields = Record<string, DocumentField>;

/**
 * Structured OCR text output, populated for prebuilt read/layout models where
 * there are no key/value fields to extract. `format` indicates whether
 * `markdown` is meaningful; `text` is always the plain-text rendering.
 */
export interface OcrContent {
  format: "text" | "markdown";
  text?: string | null;
  markdown?: string | null;
}

export interface OcrResult {
  id: string;
  document_id: string;
  keyValuePairs?: ExtractedFields;
  content?: OcrContent | null;
  processed_at: string;
}

export interface OcrEndpointResponse {
  document_id: string;
  status: string;
  title: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
  updated_at: string;
  apim_request_id: string | null;
  model_id: string;
  ocr_result: OcrResult | null;
}

export interface UploadDocumentPayload {
  title: string;
  file: string; // base64
  file_type: "pdf" | "image" | "scan";
  original_filename?: string;
  metadata?: Record<string, unknown>;
  model_id: string;
  /** @deprecated Server accepts workflow_config_id; lineage id is resolved server-side */
  workflow_id?: string;
  /** WorkflowVersion.id for documents.workflow_config_id FK */
  workflow_config_id?: string;
  group_id: string;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}
