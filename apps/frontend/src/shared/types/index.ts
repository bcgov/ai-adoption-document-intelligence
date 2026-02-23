// Shared types for the application

export type DocumentStatus =
  | "pre_ocr"
  | "ongoing_ocr"
  | "completed_ocr"
  | "needs_validation"
  | "failed"
  | "rejected_by_human";

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
  file_type: string;
  file_size: number;
  source: string;
  status: DocumentStatus | string;
  created_at: string;
  updated_at: string;
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

export interface OcrResult {
  id: string;
  document_id: string;
  keyValuePairs?: ExtractedFields;
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
  workflow_id?: string;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}
