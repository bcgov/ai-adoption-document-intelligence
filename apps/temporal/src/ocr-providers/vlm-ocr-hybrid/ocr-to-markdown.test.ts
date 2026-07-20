/**
 * Unit tests for the DI prebuilt-layout → markdown converter.
 */

import { describe, expect, it } from "@jest/globals";
import type { OCRResponse } from "../../types";
import { __testInternals, ocrLayoutToMarkdown } from "./ocr-to-markdown";

function buildLayout(opts: {
  content: string;
  pages?: Array<{
    pageNumber: number;
    width: number;
    height: number;
    unit?: string;
    lines?: Array<{ content: string; polygon: number[] }>;
  }>;
}): OCRResponse {
  return {
    status: "succeeded",
    analyzeResult: {
      apiVersion: "2024-11-30",
      modelId: "prebuilt-layout",
      content: opts.content,
      pages: (opts.pages ?? []).map((p) => ({
        pageNumber: p.pageNumber,
        width: p.width,
        height: p.height,
        unit: p.unit ?? "inch",
        words: [],
        lines: (p.lines ?? []).map((l) => ({
          content: l.content,
          polygon: l.polygon,
          spans: [],
        })),
        spans: [],
      })),
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
    },
  };
}

describe("ocrLayoutToMarkdown", () => {
  it("returns the verbatim markdown content by default", () => {
    const layout = buildLayout({ content: "## Heading\n\nBody text" });
    expect(ocrLayoutToMarkdown(layout)).toBe("## Heading\n\nBody text");
  });

  it("returns empty string when analyzeResult is missing", () => {
    expect(ocrLayoutToMarkdown({ status: "succeeded" })).toBe("");
  });

  it("truncates content past maxChars", () => {
    const big = "x".repeat(1000);
    const out = ocrLayoutToMarkdown(buildLayout({ content: big }), {
      maxChars: 100,
    });
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out).toMatch(/OCR markdown truncated at 100 chars/);
  });

  describe("with bbox annotations", () => {
    it("annotates each line with a normalised <bbox> tag", () => {
      const layout = buildLayout({
        content: "ignored when annotating",
        pages: [
          {
            pageNumber: 1,
            width: 8.5,
            height: 11,
            lines: [
              {
                content: "Total: $1,234.56",
                polygon: [1.0, 2.0, 4.0, 2.0, 4.0, 2.5, 1.0, 2.5],
              },
            ],
          },
        ],
      });
      const out = ocrLayoutToMarkdown(layout, { includeBboxAnnotations: true });
      expect(out).toMatch(
        /<bbox p="1" r="0\.118,0\.182,0\.471,0\.227">Total: \$1,234\.56<\/bbox>/,
      );
    });

    it("inserts page separators for multi-page documents", () => {
      const layout = buildLayout({
        content: "irrelevant",
        pages: [
          {
            pageNumber: 1,
            width: 8.5,
            height: 11,
            lines: [
              {
                content: "Page1 line",
                polygon: [0, 0, 1, 0, 1, 0.5, 0, 0.5],
              },
            ],
          },
          {
            pageNumber: 2,
            width: 8.5,
            height: 11,
            lines: [
              {
                content: "Page2 line",
                polygon: [0, 0, 1, 0, 1, 0.5, 0, 0.5],
              },
            ],
          },
        ],
      });
      const out = ocrLayoutToMarkdown(layout, { includeBboxAnnotations: true });
      expect(out).toContain("--- page 1 ---");
      expect(out).toContain("--- page 2 ---");
      expect(out).toContain('<bbox p="1"');
      expect(out).toContain('<bbox p="2"');
    });

    it("falls back to plain text when polygon is missing", () => {
      const layout = buildLayout({
        content: "x",
        pages: [
          {
            pageNumber: 1,
            width: 8.5,
            height: 11,
            lines: [{ content: "no bbox", polygon: [] }],
          },
        ],
      });
      const out = ocrLayoutToMarkdown(layout, { includeBboxAnnotations: true });
      expect(out.trim()).toBe("no bbox");
    });

    it("skips empty lines", () => {
      const layout = buildLayout({
        content: "x",
        pages: [
          {
            pageNumber: 1,
            width: 8.5,
            height: 11,
            lines: [
              { content: "  ", polygon: [0, 0, 1, 0, 1, 0.5, 0, 0.5] },
              { content: "kept", polygon: [0, 0, 1, 0, 1, 0.5, 0, 0.5] },
            ],
          },
        ],
      });
      const out = ocrLayoutToMarkdown(layout, { includeBboxAnnotations: true });
      // Only the kept line survives.
      expect(out.trim()).toMatch(/^<bbox[^>]*>kept<\/bbox>$/);
    });
  });

  describe("polygonToBbox internal", () => {
    it("returns null when polygon is too short", () => {
      expect(__testInternals.polygonToBbox(undefined)).toBeNull();
      expect(__testInternals.polygonToBbox([])).toBeNull();
      expect(__testInternals.polygonToBbox([1, 2])).toBeNull();
    });

    it("derives min/max corners from a 4-corner polygon", () => {
      const bbox = __testInternals.polygonToBbox([2, 5, 8, 5, 8, 7, 2, 7]);
      expect(bbox).toEqual({ x0: 2, y0: 5, x1: 8, y1: 7 });
    });
  });
});
