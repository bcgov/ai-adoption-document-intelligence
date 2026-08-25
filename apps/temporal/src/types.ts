/**
 * Type definitions for OCR activities and results.
 */

import type { OcrPayloadRef } from "./ocr-payload-ref";

// Enrichment (used by ocr.enrich activity and graph workflows)
export interface EnrichmentStepParams {
  documentType: string; // TemplateModel ID -> fetches field_schema
  confidenceThreshold?: number; // Below this, fields are LLM candidates (default 0.85)
  enableLlmEnrichment?: boolean; // Enable Azure OpenAI enrichment (default false)
}

export interface EnrichmentChange {
  fieldKey: string;
  originalValue: string;
  correctedValue: string;
  reason: string;
  source: "rule" | "llm";
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
  status: "running" | "succeeded" | "failed";
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
  /** Labeling field type (`string`, `number`, `date`, …); also set for Mistral template extraction. */
  type?: string;
  content?: string;
  valueString?: string;
  /** Present on numeric fields; extractAzureFieldDisplayValue prefers this over `content` when set. */
  valueNumber?: number;
  valueInteger?: number;
  valueDate?: string;
  valueSelectionMark?: "selected" | "unselected";
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
  selectionMarks?: SelectionMark[];
}

export interface Word {
  content: string;
  polygon: number[];
  /**
   * Per-word OCR confidence (0-1). Optional: some providers (e.g. the
   * VLM+OCR hybrid) deliberately omit it so raw OCR word confidence does
   * not drown the evidence-based field confidence in `ocr.checkConfidence`.
   */
  confidence?: number;
  span: Span;
}

export interface SelectionMark {
  state: "selected" | "unselected";
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
  kind?: "content" | "rowHeader" | "columnHeader" | "stubHead" | "description";
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
  /**
   * Markdown rendering of the document, populated only when the OCR request
   * was made with outputContentFormat="markdown".
   */
  markdown?: string;
  contentFormat?: OcrOutputFormat;
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
export type OcrOutputFormat = "text" | "markdown";

/**
 * PreparedFileData now derives from the PreparedFile kind's Zod schema in
 * @ai-di/graph-workflow (`z.infer<typeof PreparedFileSchema>`), so the
 * activities constructing it and the builder's field drill-down share one
 * definition (KIND_TAXONOMY_REFINEMENT_DESIGN.md §4).
 */
export type { PreparedFileData } from "@ai-di/graph-workflow";

export interface SubmissionResult {
  statusCode: number;
  apimRequestId: string;
  headers: Record<string, string | string[]>;
}

export interface PollResult {
  status: "running" | "succeeded" | "failed";
  /**
   * Port `ocrResponse` — ref only (no inline OCR JSON in history).
   *
   * The name must match the `ocrResponse` output declared by the
   * `azureOcr.poll` catalog entry: the graph runner binds a node's outputs by
   * reading `result[port]`, so a port the activity does not return writes
   * `undefined` into ctx without complaint. This field was called `response`
   * while the catalog said `ocrResponse`, which is why every template that
   * bound the catalog name silently produced an empty `ocrResponseRef`.
   */
  ocrResponse?: OcrPayloadRef;
}
