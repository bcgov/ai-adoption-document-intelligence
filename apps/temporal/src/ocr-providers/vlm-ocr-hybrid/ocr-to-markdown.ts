/**
 * Convert an Azure DI prebuilt-layout response into a markdown string
 * suitable for inclusion in the VLM prompt.
 *
 * Two modes (controlled by `includeBboxAnnotations`):
 *   - off (default): pass the markdown through verbatim. DI's
 *     `outputContentFormat=markdown` already produces a clean rendering
 *     with headings, paragraphs, and tables.
 *   - on: re-segment the markdown by line, prepending each non-empty line
 *     with a normalised bbox tag of the form
 *     `<bbox p="<page>" r="x0,y0,x1,y1">…</bbox>`, where coords are
 *     normalised to 0–1 page-relative (resolution-independent across
 *     samples). Page coords are read from the corresponding line's
 *     polygon (DI returns inches at API 2024-11-30; we convert via
 *     the page's `width`/`height` fields).
 *
 * E05 ships with bbox annotations off by default. The variant 3 of the
 * brief — "image + OCR markdown + inline bbox spatial hints" — is the
 * scope-reduction-deferred path; the `includeBboxAnnotations` flag is
 * the surface that variant would flip.
 *
 * Page boundary handling: the markdown comes through as one
 * concatenated string per the DI response. For multi-page documents we
 * insert a `\n\n--- page N ---\n\n` separator between page-scoped
 * segments. The canonical 40-sample dataset is single-page, so this is
 * mostly defensive; in practice the verbatim DI markdown is what
 * reaches the model.
 */

import type { Line, OCRResponse, Page } from "../../types";

export interface OcrToMarkdownOptions {
  /**
   * When true, re-segment the markdown by line and prepend each line
   * with a `<bbox …>` tag. Default: false.
   */
  includeBboxAnnotations?: boolean;
  /**
   * Truncate the markdown to this many characters. Default: 50000
   * (well under the 30K-token-budget for the canonical SDPR sample).
   */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 50_000;

/**
 * DI returns polygons as flat number arrays: [x0, y0, x1, y1, x2, y2, x3, y3]
 * (top-left, top-right, bottom-right, bottom-left). For axis-aligned
 * bbox extraction we only need the min/max corners.
 */
function polygonToBbox(
  polygon: number[] | undefined,
): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!polygon || polygon.length < 4) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 1 < polygon.length; i += 2) {
    xs.push(polygon[i]);
    ys.push(polygon[i + 1]);
  }
  if (xs.length === 0 || ys.length === 0) return null;
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };
}

function normaliseTo01(
  bbox: { x0: number; y0: number; x1: number; y1: number },
  page: Page,
): { x0: number; y0: number; x1: number; y1: number } {
  const w = page.width > 0 ? page.width : 1;
  const h = page.height > 0 ? page.height : 1;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return {
    x0: clamp(bbox.x0 / w),
    y0: clamp(bbox.y0 / h),
    x1: clamp(bbox.x1 / w),
    y1: clamp(bbox.y1 / h),
  };
}

function fmt(n: number): string {
  return n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function annotateLine(
  pageNumber: number,
  line: Line,
  page: Page,
): string | null {
  const text = line.content?.trim();
  if (!text) return null;
  const raw = polygonToBbox(line.polygon);
  if (!raw) return text;
  const norm = normaliseTo01(raw, page);
  return `<bbox p="${pageNumber}" r="${fmt(norm.x0)},${fmt(norm.y0)},${fmt(norm.x1)},${fmt(norm.y1)}">${text}</bbox>`;
}

/**
 * Render an Azure DI prebuilt-layout response as markdown for the VLM
 * prompt. Returns the raw markdown by default; with bbox annotations
 * on, returns a per-line annotated version (variant-3 surface).
 */
export function ocrLayoutToMarkdown(
  layout: OCRResponse,
  options: OcrToMarkdownOptions = {},
): string {
  const includeBboxAnnotations = options.includeBboxAnnotations ?? false;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const result = layout.analyzeResult;
  if (!result) return "";

  let body: string;
  if (!includeBboxAnnotations) {
    // Verbatim markdown is the default. DI's outputContentFormat=markdown
    // already produces structured output with headings + tables.
    body = result.content ?? "";
    // For multi-page documents the SDK already concatenates pages with
    // form-feed-style separators; we don't second-guess that here.
  } else {
    const pages = result.pages ?? [];
    const segments: string[] = [];
    for (const page of pages) {
      const pageHeader =
        pages.length > 1 ? `\n\n--- page ${page.pageNumber} ---\n\n` : "";
      const lineStrs: string[] = [];
      for (const line of page.lines ?? []) {
        const annotated = annotateLine(page.pageNumber, line, page);
        if (annotated) lineStrs.push(annotated);
      }
      segments.push(pageHeader + lineStrs.join("\n"));
    }
    body = segments.join("");
  }

  if (body.length > maxChars) {
    return `${body.slice(0, maxChars)}\n\n[…OCR markdown truncated at ${maxChars} chars…]`;
  }
  return body;
}

export const __testInternals = {
  polygonToBbox,
  normaliseTo01,
};
