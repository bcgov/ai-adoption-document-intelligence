/**
 * Map a VLM-hybrid extraction response to the canonical `OCRResult`.
 *
 * E04's mapper synthesised an `OCRResult` from the structured fields
 * alone — no real `pages.words[]`, no `pages.lines[]`, no polygons.
 * The hybrid path has access to the prebuilt-layout response, so this
 * mapper:
 *   - Borrows the canonical structured-fields path from
 *     `vlmExtractionToOcrResult` (E04's mapper).
 *   - Replaces the synthesised single-page summary with the real DI
 *     pages array (carrying real `words[]`, `lines[]`, polygons,
 *     paragraphs, tables) so downstream consumers (`ocr.cleanup`,
 *     analytics, future spatial-aware components) see the data they
 *     used to in the Azure DI path.
 *   - Keeps the evidence-based confidence synthesis on the
 *     structured-fields result (`keyValuePairs` / `documents[].fields`) and
 *     deliberately drops per-word confidence from the borrowed DI pages, so
 *     the HITL gate is driven by field evidence rather than swamped by the
 *     raw OCR word confidences. See `clonePages`.
 */

import type {
  OCRResponse,
  OCRResult,
  Page,
  Paragraph,
  Table,
} from "../../types";
import {
  type VlmFieldDefRow,
  type VlmToOcrResultContext,
  type VlmToOcrResultOptions,
  vlmExtractionToOcrResult,
} from "../vlm-direct/vlm-to-ocr-result";
import type { VlmExtractionResponse } from "../vlm-direct/vlm-types";

export type VlmHybridFieldDefRow = VlmFieldDefRow;

export interface VlmHybridToOcrResultContext extends VlmToOcrResultContext {}

export interface VlmHybridToOcrResultOptions extends VlmToOcrResultOptions {
  /**
   * The prebuilt-layout response from `azureOcr.submit`/`azureOcr.poll`. When
   * present, the resulting `OCRResult.pages`, `paragraphs`, `tables`
   * are populated from it (instead of the E04 synthetic single-page
   * summary). Confidence values stay attached to the structured
   * fields, not the page words.
   */
  layoutResponse?: OCRResponse;
}

function clonePages(layout: OCRResponse | undefined): Page[] {
  const pages = layout?.analyzeResult?.pages;
  if (!pages || pages.length === 0) return [];
  return pages.map((p) => ({
    pageNumber: p.pageNumber,
    width: p.width,
    height: p.height,
    unit: p.unit,
    // Intentionally omit per-word OCR confidence. The HITL gate
    // (`ocr.checkConfidence`) averages page-word confidence together with
    // key-value-pair confidence; the hundreds of high-confidence DI words
    // would otherwise swamp the ~dozens of evidence-based field confidences
    // and the gate would never fire. Dropping it lets the gate reflect the
    // structured-field evidence confidence (carried on `keyValuePairs` /
    // `documents[].fields`). Word content + polygons are kept for layout.
    words: (p.words ?? []).map((w) => ({
      content: w.content,
      polygon: [...(w.polygon ?? [])],
      span: { offset: w.span.offset, length: w.span.length },
    })),
    lines: (p.lines ?? []).map((l) => ({
      content: l.content,
      polygon: [...(l.polygon ?? [])],
      spans: (l.spans ?? []).map((s) => ({
        offset: s.offset,
        length: s.length,
      })),
    })),
    spans: (p.spans ?? []).map((s) => ({
      offset: s.offset,
      length: s.length,
    })),
  }));
}

function cloneParagraphs(layout: OCRResponse | undefined): Paragraph[] {
  const paragraphs = layout?.analyzeResult?.paragraphs;
  if (!paragraphs || paragraphs.length === 0) return [];
  return paragraphs.map((p) => ({
    ...(p.role ? { role: p.role } : {}),
    content: p.content,
    boundingRegions: (p.boundingRegions ?? []).map((br) => ({
      pageNumber: br.pageNumber,
      polygon: [...(br.polygon ?? [])],
    })),
    spans: (p.spans ?? []).map((s) => ({
      offset: s.offset,
      length: s.length,
    })),
  }));
}

function cloneTables(layout: OCRResponse | undefined): Table[] {
  const tables = layout?.analyzeResult?.tables;
  if (!tables || tables.length === 0) return [];
  return tables.map((t) => ({
    rowCount: t.rowCount,
    columnCount: t.columnCount,
    cells: t.cells.map((c) => ({
      ...(c.kind ? { kind: c.kind } : {}),
      rowIndex: c.rowIndex,
      columnIndex: c.columnIndex,
      ...(c.rowSpan !== undefined ? { rowSpan: c.rowSpan } : {}),
      ...(c.columnSpan !== undefined ? { columnSpan: c.columnSpan } : {}),
      content: c.content,
      boundingRegions: (c.boundingRegions ?? []).map((br) => ({
        pageNumber: br.pageNumber,
        polygon: [...(br.polygon ?? [])],
      })),
      spans: (c.spans ?? []).map((s) => ({
        offset: s.offset,
        length: s.length,
      })),
    })),
    boundingRegions: (t.boundingRegions ?? []).map((br) => ({
      pageNumber: br.pageNumber,
      polygon: [...(br.polygon ?? [])],
    })),
    spans: (t.spans ?? []).map((s) => ({ offset: s.offset, length: s.length })),
  }));
}

/**
 * Map a VLM-hybrid `{ fields, source_quotes }` payload to the canonical
 * `OCRResult`, filling in the `pages` / `paragraphs` / `tables` arrays
 * from the upstream prebuilt-layout response when available.
 */
export function vlmHybridExtractionToOcrResult(
  payload: VlmExtractionResponse,
  ctx: VlmHybridToOcrResultContext,
  options?: VlmHybridToOcrResultOptions,
): OCRResult {
  const base = vlmExtractionToOcrResult(payload, ctx, {
    ...(options?.fieldDefs ? { fieldDefs: options.fieldDefs } : {}),
  });
  // Override docType so downstream consumers can distinguish hybrid
  // outputs from VLM-direct outputs at a glance. Keep the field map.
  if (base.documents && base.documents.length > 0) {
    base.documents[0].docType = "vlm-ocr-hybrid";
  }

  const layout = options?.layoutResponse;
  if (!layout) return base;

  const pages = clonePages(layout);
  const paragraphs = cloneParagraphs(layout);
  const tables = cloneTables(layout);
  const layoutContent = layout.analyzeResult?.content ?? "";

  return {
    ...base,
    // Prefer the layout markdown for `extractedText` so downstream
    // cleanup sees real OCR content rather than the E04 field-summary
    // string. Fall back to E04's summary if the layout markdown is empty.
    extractedText:
      layoutContent.length > 0 ? layoutContent : base.extractedText,
    pages: pages.length > 0 ? pages : base.pages,
    paragraphs: paragraphs.length > 0 ? paragraphs : base.paragraphs,
    tables: tables.length > 0 ? tables : base.tables,
  };
}
