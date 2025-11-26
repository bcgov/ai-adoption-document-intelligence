// Shared types for the application

export interface User {
  id: string;
  name: string;
  email: string;
}

export type DocumentStatus = 'pre_ocr' | 'ongoing_ocr' | 'completed_ocr' | 'failed';

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
  priority?: 'low' | 'medium' | 'high' | 'urgent' | string;
  confidence_score?: number | null;
  file_url?: string | null;
  extracted_data?: Record<string, unknown> & {
    content?: string;
  };
}

export interface BoundingRegion {
  pageNumber: number;
  polygon: number[];
}

export interface KeyValueElement {
  content: string;
  boundingRegions: BoundingRegion[];
  spans: Array<{
    offset: number;
    length: number;
  }>;
}

export interface KeyValuePair {
  key: KeyValueElement;
  value?: KeyValueElement;
  confidence: number;
}

export interface OcrResult {
  id: string;
  document_id: string;
  extracted_text: string;
  pages: unknown[];
  tables: unknown[];
  paragraphs: unknown[];
  styles: unknown[];
  sections: unknown[];
  figures: unknown[];
  keyValuePairs?: KeyValuePair[];
  metadata?: Record<string, unknown>;
  processed_at: string;
}

export interface UploadDocumentPayload {
  title: string;
  file: string; // base64
  file_type: 'pdf' | 'image' | 'scan';
  original_filename?: string;
  metadata?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}
