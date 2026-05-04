/**
 * Subset of Mistral OCR API (`POST /v1/ocr`) response used by the Temporal activity.
 * @see https://docs.mistral.ai/api/#tag/ocr
 */

export interface MistralOcrWordConfidenceScore {
  text: string;
  confidence: number;
  start_index: number;
}

export interface MistralOcrPageConfidenceScores {
  word_confidence_scores?: MistralOcrWordConfidenceScore[];
  average_page_confidence_score: number;
  minimum_page_confidence_score: number;
}

export interface MistralOcrPageDimensions {
  dpi: number;
  width: number;
  height: number;
}

export interface MistralOcrPage {
  index: number;
  markdown: string;
  dimensions: MistralOcrPageDimensions;
  confidence_scores?: MistralOcrPageConfidenceScores | null;
}

export interface MistralOcrUsageInfo {
  pages_processed: number;
}

export interface MistralOcrApiResponse {
  model: string;
  pages: MistralOcrPage[];
  document_annotation?: string | null;
  usage_info: MistralOcrUsageInfo;
}
