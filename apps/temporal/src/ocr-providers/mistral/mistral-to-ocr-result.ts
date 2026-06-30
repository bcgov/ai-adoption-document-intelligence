import type { Line, OCRResult, Page, Paragraph, Word } from "../../types";
import {
  type MistralFieldDefRow,
  mistralAnnotationToDocumentsAndKeyValuePairs,
} from "./mistral-annotation-to-azure-fields";
import type {
  MistralOcrApiResponse,
  MistralOcrBbox,
  MistralOcrLineConfidenceScore,
  MistralOcrWordConfidenceScore,
} from "./mistral-ocr-types";

export interface MistralToOcrResultContext {
  fileName: string;
  fileType: string;
  requestId: string;
  modelId: string;
}

/** Optional `TemplateModel.field_schema` rows (same shape as labeling) for typed `documents[0].fields`. */
export interface MistralOcrResultOptions {
  fieldDefs?: MistralFieldDefRow[];
}

/**
 * Convert a Mistral axis-aligned bbox `{ top_left_x, top_left_y, bottom_right_x, bottom_right_y }`
 * to the canonical 8-element flat polygon `[x1,y1,x2,y2,x3,y3,x4,y4]`, clockwise
 * from the top-left corner. Same units as the source bbox (Mistral returns
 * pixels; `OCRResult.pages[].unit` is set to `"pixel"` to match).
 */
function bboxToPolygon(bbox: MistralOcrBbox): number[] {
  const { top_left_x: x1, top_left_y: y1 } = bbox;
  const { bottom_right_x: x2, bottom_right_y: y2 } = bbox;
  return [x1, y1, x2, y1, x2, y2, x1, y2];
}

function polygonFromBbox(bbox?: MistralOcrBbox): number[] {
  return bbox ? bboxToPolygon(bbox) : [];
}

function wordsFromPageMarkdown(markdown: string, confidence: number): Word[] {
  const trimmed = markdown.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return [
    {
      content: trimmed,
      polygon: [],
      confidence,
      span: { offset: 0, length: trimmed.length },
    },
  ];
}

function wordsFromMistralPage(page: {
  markdown: string;
  confidence_scores?: {
    word_confidence_scores?: MistralOcrWordConfidenceScore[];
    average_page_confidence_score?: number;
  } | null;
}): Word[] {
  const scores = page.confidence_scores?.word_confidence_scores;
  const fallbackAvg =
    page.confidence_scores?.average_page_confidence_score ?? 0.95;
  if (scores && scores.length > 0) {
    return scores.map((w) => ({
      content: w.text,
      polygon: polygonFromBbox(w.bbox),
      confidence: w.confidence,
      span: { offset: w.start_index, length: w.text.length },
    }));
  }
  return wordsFromPageMarkdown(page.markdown, fallbackAvg);
}

function linesFromPage(page: {
  markdown: string;
  confidence_scores?: {
    line_confidence_scores?: MistralOcrLineConfidenceScore[];
  } | null;
}): Line[] {
  const lineScores = page.confidence_scores?.line_confidence_scores;
  if (lineScores && lineScores.length > 0) {
    return lineScores.map((l) => ({
      content: l.text,
      polygon: polygonFromBbox(l.bbox),
      spans: [{ offset: l.start_index, length: l.text.length }],
    }));
  }
  const trimmed = (page.markdown ?? "").trim();
  if (!trimmed) {
    return [];
  }
  return [
    {
      content: trimmed,
      polygon: [],
      spans: [{ offset: 0, length: trimmed.length }],
    },
  ];
}

function paragraphsFromMarkdown(markdown: string): Paragraph[] {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return [];
  }
  return [
    {
      content: trimmed,
      boundingRegions: [],
      spans: [{ offset: 0, length: trimmed.length }],
    },
  ];
}

/**
 * Maps Mistral `POST /v1/ocr` JSON to canonical {@link OCRResult}.
 * When `fieldDefs` is provided (same template as `document_annotation_format`),
 * structured fields are stored like Azure custom models (`documents[0].fields`).
 */
export function mistralOcrResponseToOcrResult(
  data: MistralOcrApiResponse,
  ctx: MistralToOcrResultContext,
  options?: MistralOcrResultOptions,
): OCRResult {
  const pages: Page[] = (data.pages ?? []).map((p, idx) => {
    const pageNumber = typeof p.index === "number" ? p.index + 1 : idx + 1;
    const width = p.dimensions?.width ?? 612;
    const height = p.dimensions?.height ?? 792;
    const words = wordsFromMistralPage(p);
    const lines = linesFromPage(p);

    return {
      pageNumber,
      width,
      height,
      unit: "pixel",
      words,
      lines,
      spans: [],
    };
  });

  const extractedText = (data.pages ?? [])
    .map((p) => p.markdown ?? "")
    .join("\n\n");

  const fieldDefs = options?.fieldDefs ?? [];
  const { documents, keyValuePairs } =
    mistralAnnotationToDocumentsAndKeyValuePairs(
      data.document_annotation,
      fieldDefs,
    );

  return {
    success: true,
    status: "succeeded",
    apimRequestId: ctx.requestId,
    fileName: ctx.fileName,
    fileType: ctx.fileType as OCRResult["fileType"],
    modelId: ctx.modelId || data.model,
    extractedText,
    pages,
    tables: [],
    paragraphs: (data.pages ?? []).flatMap((p) =>
      paragraphsFromMarkdown(p.markdown ?? ""),
    ),
    keyValuePairs,
    ...(documents ? { documents } : {}),
    sections: [],
    figures: [],
    processedAt: new Date().toISOString(),
  };
}
