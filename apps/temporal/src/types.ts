/**
 * Type definitions for OCR activities and results.
 */

// Enrichment (used by ocr.enrich activity and graph workflows)
export interface EnrichmentStepParams {
  documentType: string; // LabelingProject ID -> fetches field_schema
  confidenceThreshold?: number; // Below this, fields are LLM candidates (default 0.85)
  enableLlmEnrichment?: boolean; // Enable Azure OpenAI enrichment (default false)
}

export interface EnrichmentChange {
  fieldKey: string;
  originalValue: string;
  correctedValue: string;
  reason: string;
  source: 'rule' | 'llm';
}

export interface EnrichmentSummary {
  summary: string;
  changes: EnrichmentChange[];
  rulesApplied: string[];
  llmEnriched: boolean;
  llmModel?: string;
  timestamp: string;
}

export interface EnrichmentResult {
  ocrResult: OCRResult;
  summary: EnrichmentSummary | null;
}

// Azure OCR API Response Types
export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  apimRequestId?: string;
}

export interface OCRResponse {
  status: 'running' | 'succeeded' | 'failed';
  analyzeResult?: AnalyzeResult;
  createdDateTime?: string;
  lastUpdatedDateTime?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface AnalyzeResult {
  apiVersion: string;
  modelId: string;
  content: string;
  pages: Page[];
  paragraphs: Paragraph[];
  tables: Table[];
  keyValuePairs: KeyValuePair[];
  sections: Section[];
  figures: Figure[];
  documents?: AzureDocument[]; // Custom models return documents with fields
}

/** Field value shape from Azure Document Intelligence custom models */
export interface AzureDocumentFieldValue {
  content?: string;
  valueString?: string;
  confidence?: number;
  boundingRegions?: BoundingRegion[];
  spans?: Span[];
}

export interface AzureDocument {
  docType: string;
  fields: Record<string, AzureDocumentFieldValue>;
  boundingRegions?: BoundingRegion[];
  spans?: Span[];
  confidence?: number;
}

export interface Page {
  pageNumber: number;
  width: number;
  height: number;
  unit: string;
  words: Word[];
  lines: Line[];
  spans: Span[];
}

export interface Word {
  content: string;
  polygon: number[];
  confidence: number;
  span: Span;
}

export interface Line {
  content: string;
  polygon: number[];
  spans: Span[];
}

export interface Span {
  offset: number;
  length: number;
}

export interface Paragraph {
  role?: string;
  content: string;
  boundingRegions: BoundingRegion[];
  spans: Span[];
}

export interface BoundingRegion {
  pageNumber: number;
  polygon: number[];
}

export interface Table {
  rowCount: number;
  columnCount: number;
  cells: TableCell[];
  boundingRegions: BoundingRegion[];
  spans: Span[];
}

export interface TableCell {
  kind?: 'content' | 'rowHeader' | 'columnHeader' | 'stubHead' | 'description';
  rowIndex: number;
  columnIndex: number;
  rowSpan?: number;
  columnSpan?: number;
  content: string;
  boundingRegions: BoundingRegion[];
  spans: Span[];
}

export interface KeyValuePair {
  key: {
    content: string;
    boundingRegions: BoundingRegion[];
    spans: Span[];
  };
  value?: {
    content: string;
    boundingRegions: BoundingRegion[];
    spans: Span[];
  };
  confidence: number;
}

export interface Section {
  role?: string;
  content: string;
  boundingRegions: BoundingRegion[];
  spans: Span[];
}

export interface Figure {
  content: string;
  boundingRegions: BoundingRegion[];
  spans: Span[];
}

// Final OCR Result
export interface OCRResult {
  success: boolean;
  status: string;
  apimRequestId: string;
  fileName: string;
  fileType: string;
  modelId: string;
  extractedText: string;
  pages: Page[];
  tables: Table[];
  paragraphs: Paragraph[];
  keyValuePairs: KeyValuePair[];
  sections: Section[];
  figures: Figure[];
  documents?: AzureDocument[]; // Custom models return documents with fields
  processedAt: string;
}

// Activity Results
export interface PreparedFileData {
  fileName: string;
  fileType: 'pdf' | 'image';
  contentType: string;
  blobKey: string;
  modelId: string; // Azure Document Intelligence model ID
}

export interface SubmissionResult {
  statusCode: number;
  apimRequestId: string;
  headers: Record<string, string | string[]>;
}

export interface PollResult {
  status: 'running' | 'succeeded' | 'failed';
  response?: OCRResponse;
}
