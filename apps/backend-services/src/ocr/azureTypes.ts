export interface AnalysisResponse {
  status: string;
  createdDateTime: string;
  lastUpdatedDateTime: string;
  analyzeResult?: AnalysisResult; // Optional when status is "running"
}

export interface AnalysisResult {
  apiVersion: string;
  modelId: string;
  stringIndexType: string;
  content: string;
  pages: Page[];
  tables: Table[];
  paragraphs: Paragraph[];
  styles: Style[];
  contentFormat: string;
  sections: Section[];
  figures: Figure[];
  keyValuePairs?: KeyValuePair[]; // Optional - only returned with features=keyValuePairs flag
  documents?: AnalyzedDocument[]; // Custom model results
}

export interface Page {
  pageNumber: number;
  angle: number;
  width: number;
  height: number;
  unit: string;
  words: Word[];
  selectionMarks: SelectionMark[];
  lines: Line[];
  spans: Span[];
}

export interface Word {
  content: string;
  polygon: number[];
  confidence: number;
  span: Span;
}

export interface SelectionMark {
  state: string;
  polygon: number[];
  confidence: number;
  span: Span;
}

export interface Line {
  content: string;
  polygon: number[];
  spans: Span[];
}

export interface Table {
  rowCount: number;
  columnCount: number;
  cells: TableCell[];
  boundingRegions: BoundingRegion[];
  spans: Span[];
}

export interface TableCell {
  rowIndex: number;
  columnIndex: number;
  content: string;
  boundingRegions: BoundingRegion[];
  spans: Span[];
  elements: string[];
}

export interface Paragraph {
  spans: Span[];
  boundingRegions: BoundingRegion[];
  content: string;
}

export interface Style {
  confidence: number;
  spans: Span[];
  isHandwritten: boolean;
}

export interface Section {
  spans: Span[];
  elements: string[];
}

export interface Figure {
  id: string;
  boundingRegions: BoundingRegion[];
  spans: Span[];
  elements: string[];
}

export interface Span {
  offset: number;
  length: number;
}

export interface BoundingRegion {
  pageNumber: number;
  polygon: number[];
}

export interface KeyValuePair {
  key: KeyValue;
  value?: KeyValue;
  confidence: number;
}

export interface KeyValue {
  content: string;
  boundingRegions: BoundingRegion[];
  spans: Span[];
}

// Custom model field types (used as the canonical format)
export interface DocumentField {
  type: string; // "string", "number", "selectionMark", "date", etc.
  content: string | null;
  confidence: number;
  boundingRegions?: BoundingRegion[];
  spans?: Span[];
  // Type-specific values
  valueString?: string;
  valueNumber?: number;
  valueSelectionMark?: "selected" | "unselected";
  valueDate?: string;
}

export type ExtractedFields = Record<string, DocumentField>;

export interface AnalyzedDocument {
  docType: string;
  boundingRegions?: BoundingRegion[];
  fields: ExtractedFields;
  confidence: number;
}
