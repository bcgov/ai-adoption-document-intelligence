import type { Line, OCRResult, Page, Paragraph, Word } from "../../types";
import {
  type MistralFieldDefRow,
  mistralAnnotationToDocumentsAndKeyValuePairs,
} from "./mistral-annotation-to-azure-fields";
import type { MistralOcrApiResponse } from "./mistral-ocr-types";

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
    word_confidence_scores?: Array<{
      text: string;
      confidence: number;
      start_index: number;
    }>;
    average_page_confidence_score?: number;
  } | null;
}): Word[] {
  const scores = page.confidence_scores?.word_confidence_scores;
  const fallbackAvg =
    page.confidence_scores?.average_page_confidence_score ?? 0.95;
  if (scores && scores.length > 0) {
    return scores.map((w) => ({
      content: w.text,
      polygon: [],
      confidence: w.confidence,
      span: { offset: w.start_index, length: w.text.length },
    }));
  }
  return wordsFromPageMarkdown(page.markdown, fallbackAvg);
}

function linesFromMarkdown(markdown: string): Line[] {
  const trimmed = markdown.trim();
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
    const lines = linesFromMarkdown(p.markdown ?? "");

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
