/**
 * Type definitions for Temporal OCR workflow
 */

// Workflow Step Configuration Types
export type WorkflowStepId = 
  | 'updateStatus'
  | 'prepareFileData'
  | 'submitToAzureOCR'
  | 'updateApimRequestId'
  | 'waitBeforePoll'
  | 'pollOCRResults'
  | 'extractOCRResults'
  | 'postOcrCleanup'
  | 'checkOcrConfidence'
  | 'humanReview'
  | 'storeResults';

// Centralized array of valid step IDs for validation
export const VALID_WORKFLOW_STEP_IDS: readonly WorkflowStepId[] = [
  'updateStatus',
  'prepareFileData',
  'submitToAzureOCR',
  'updateApimRequestId',
  'waitBeforePoll',
  'pollOCRResults',
  'extractOCRResults',
  'postOcrCleanup',
  'checkOcrConfidence',
  'humanReview',
  'storeResults',
] as const;

// Step configuration
export interface StepConfig {
  enabled?: boolean; // Defaults to true if not specified
  parameters?: Record<string, unknown>;
}

// Workflow steps configuration (partial - only specify steps you want to customize)
export interface WorkflowStepsConfig {
  [key: string]: StepConfig | undefined;
}

// Step-specific parameter types
export interface PollStepParams {
  maxRetries?: number;
  waitBeforeFirstPoll?: number; // milliseconds
  waitBetweenPolls?: number; // milliseconds
}

export interface ConfidenceStepParams {
  threshold?: number; // 0-1
}

export interface HumanReviewParams {
  timeout?: number; // milliseconds (default: 24 hours)
}

// Workflow Input
export interface OCRWorkflowInput {
  documentId: string; // Document ID from database
  binaryData: string; // Base64-encoded file data
  fileName?: string;
  fileType?: 'pdf' | 'image';
  contentType?: string;
  modelId?: string; // Azure Document Intelligence model ID (defaults to "prebuilt-layout")
  steps?: WorkflowStepsConfig; // Optional step configuration
}

// Workflow State (internal)
export interface OCRWorkflowState {
  apimRequestId: string;
  retryCount: number;
  fileName: string;
  fileType: 'pdf' | 'image';
  contentType: string;
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

export interface AzureDocument {
  docType: string;
  fields: Record<string, any>; // Custom model fields - already in correct format
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
  binaryData: string;
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

// Workflow Query Types
export interface WorkflowStatus {
  currentStep: string;
  status: 'preparing' | 'submitting' | 'polling' | 'extracting' | 'awaiting_review' | 'storing' | 'completed' | 'failed';
  apimRequestId?: string;
  retryCount?: number;
  maxRetries?: number;
  error?: string;
  averageConfidence?: number;
  requiresReview?: boolean;
}

export interface WorkflowProgress {
  retryCount: number;
  maxRetries: number;
  currentStep: string;
  apimRequestId?: string;
  progressPercentage: number;
}

// Rejection reason enum
export enum RejectionReason {
  INPUT_QUALITY = 'INPUT_QUALITY',          // Scan unreadable, cutoff, skew
  OCR_FAILURE = 'OCR_FAILURE',              // Missing fields, hallucinations
  MODEL_MISMATCH = 'MODEL_MISMATCH',         // Wrong document type/template
  CONFIDENCE_TOO_LOW = 'CONFIDENCE_TOO_LOW', // Confidence too low to trust
  SYSTEMIC_ERROR = 'SYSTEMIC_ERROR',         // Pipeline bug
}

// Workflow Signal Types
export interface CancelSignal {
  mode: 'graceful' | 'immediate';
}

export interface HumanApprovalSignal {
  approved: boolean;
  reviewer?: string;
  comments?: string;
  // Rejection fields (required when approved is false)
  rejectionReason?: RejectionReason;
  annotations?: string; // Optional annotations (what failed, where, why)
}
