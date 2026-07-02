/**
 * Subset of Mistral OCR API (`POST /v1/ocr`) response used by the Temporal activity.
 * @see https://docs.mistral.ai/api/#tag/ocr
 *
 * Bounding boxes:
 * - Mistral returns `images[]` per page with explicit corner coordinates
 *   (`top_left_x`, `top_left_y`, `bottom_right_x`, `bottom_right_y`) in the
 *   page's pixel space.
 * - When the request includes word-level granularity, individual word entries
 *   may carry an inline `bbox` object using the same corner convention. The
 *   mapper treats these fields as optional so older responses without bbox
 *   data still parse.
 */

/** Axis-aligned rectangle in page pixels, top-left origin. */
export interface MistralOcrBbox {
  top_left_x: number;
  top_left_y: number;
  bottom_right_x: number;
  bottom_right_y: number;
}

export interface MistralOcrWordConfidenceScore {
  text: string;
  confidence: number;
  start_index: number;
  /** Optional axis-aligned bbox in the page's pixel space (top-left origin). */
  bbox?: MistralOcrBbox;
}

export interface MistralOcrLineConfidenceScore {
  text: string;
  confidence: number;
  start_index: number;
  /** Optional axis-aligned bbox in the page's pixel space (top-left origin). */
  bbox?: MistralOcrBbox;
}

export interface MistralOcrPageConfidenceScores {
  word_confidence_scores?: MistralOcrWordConfidenceScore[];
  line_confidence_scores?: MistralOcrLineConfidenceScore[];
  average_page_confidence_score: number;
  minimum_page_confidence_score: number;
}

export interface MistralOcrPageDimensions {
  dpi: number;
  width: number;
  height: number;
}

export interface MistralOcrImage {
  id: string;
  top_left_x: number;
  top_left_y: number;
  bottom_right_x: number;
  bottom_right_y: number;
  image_base64?: string | null;
  image_annotation?: string | null;
}

export interface MistralOcrPage {
  index: number;
  markdown: string;
  dimensions: MistralOcrPageDimensions;
  confidence_scores?: MistralOcrPageConfidenceScores | null;
  images?: MistralOcrImage[];
}

export interface MistralOcrUsageInfo {
  pages_processed: number;
  doc_size_bytes?: number;
}

export interface MistralOcrApiResponse {
  model: string;
  pages: MistralOcrPage[];
  document_annotation?: string | null;
  usage_info: MistralOcrUsageInfo;
}
