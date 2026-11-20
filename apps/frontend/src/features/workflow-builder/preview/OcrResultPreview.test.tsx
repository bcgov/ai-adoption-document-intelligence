/**
 * Unit tests for the `OcrResultPreview` widget (US-144 Scenarios 1-6).
 *
 * Covers:
 *   - Scenario 1: signature + base render (object / non-object)
 *   - Scenario 2: top-level keys → table rows, primitive formatting
 *   - Scenario 3: one-level inline summary vs collapse to `{...}`
 *   - Scenario 4: "View raw" modal contents + title
 *   - Scenario 5: long string truncation + tooltip + copy button
 *   - Scenario 6: this file (>= 5 cases)
 *
 * Generic — no document-specific field names asserted beyond the
 * test-only fixtures, which mirror the story's exemplar value shape.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { OcrResultPreview } from "./OcrResultPreview";

function renderWithProviders(children: ReactNode): void {
  render(<MantineProvider>{children}</MantineProvider>);
}

describe("OcrResultPreview — Scenario 1 (signature + base render)", () => {
  it("renders 'No OCR data' when value is null", () => {
    renderWithProviders(<OcrResultPreview value={null} />);
    expect(screen.getByTestId("ocr-preview-empty")).toHaveTextContent(
      "No OCR data",
    );
  });

  it("renders 'No OCR data' when value is undefined", () => {
    renderWithProviders(<OcrResultPreview value={undefined} />);
    expect(screen.getByTestId("ocr-preview-empty")).toHaveTextContent(
      "No OCR data",
    );
  });

  it("renders 'No OCR data' when value is a primitive (number)", () => {
    renderWithProviders(<OcrResultPreview value={42} />);
    expect(screen.getByTestId("ocr-preview-empty")).toBeInTheDocument();
  });

  it("renders 'No OCR data' when value is an array (top-level)", () => {
    renderWithProviders(<OcrResultPreview value={[1, 2, 3]} />);
    expect(screen.getByTestId("ocr-preview-empty")).toBeInTheDocument();
  });

  it("renders the K/V table when value is a plain object", () => {
    renderWithProviders(<OcrResultPreview value={{ a: "x" }} />);
    expect(screen.getByTestId("ocr-preview-table")).toBeInTheDocument();
    expect(screen.getByTestId("ocr-preview-row-a")).toBeInTheDocument();
  });
});

describe("OcrResultPreview — Scenario 2 (top-level rows + primitives)", () => {
  it("renders a row per top-level key with formatted primitive values", () => {
    const value = {
      kA: "INV-001",
      kB: "2026-05-24",
      kC: 142.5,
      kD: { name: "Acme", id: "v-7" },
    };
    renderWithProviders(<OcrResultPreview value={value} />);

    const rowA = screen.getByTestId("ocr-preview-row-kA");
    expect(within(rowA).getByText("kA")).toBeInTheDocument();
    expect(within(rowA).getByText("INV-001")).toBeInTheDocument();

    const rowB = screen.getByTestId("ocr-preview-row-kB");
    expect(within(rowB).getByText("2026-05-24")).toBeInTheDocument();

    const rowC = screen.getByTestId("ocr-preview-row-kC");
    // 142.50 — fractional number formatted with toFixed(2).
    expect(within(rowC).getByText("142.50")).toBeInTheDocument();

    // The 4th key has a nested object with ≤4 primitive keys; Scenario 3
    // covers the inline summary content — here we just assert the row
    // exists.
    expect(screen.getByTestId("ocr-preview-row-kD")).toBeInTheDocument();
  });

  it("renders integer numbers without forcing 2 decimals", () => {
    renderWithProviders(<OcrResultPreview value={{ qty: 7 }} />);
    expect(
      within(screen.getByTestId("ocr-preview-row-qty")).getByText("7"),
    ).toBeInTheDocument();
  });

  it("renders booleans as yes/no", () => {
    renderWithProviders(
      <OcrResultPreview value={{ flagA: true, flagB: false }} />,
    );
    expect(
      within(screen.getByTestId("ocr-preview-row-flagA")).getByText("yes"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("ocr-preview-row-flagB")).getByText("no"),
    ).toBeInTheDocument();
  });
});

describe("OcrResultPreview — Scenario 3 (one-level nesting)", () => {
  it("inlines a nested object with ≤4 primitive entries as `k: v · k: v`", () => {
    const value = { vendor: { name: "Acme", id: "v-7" } };
    renderWithProviders(<OcrResultPreview value={value} />);

    const inline = screen.getByTestId("ocr-preview-inline-vendor");
    expect(inline).toHaveTextContent("name: Acme · id: v-7");
  });

  it("collapses to `{...}` when the nested object has > 4 keys", () => {
    const value = {
      meta: { a: 1, b: 2, c: 3, d: 4, e: 5 },
    };
    renderWithProviders(<OcrResultPreview value={value} />);

    const row = screen.getByTestId("ocr-preview-row-meta");
    expect(within(row).getByText("{...}")).toBeInTheDocument();
    expect(
      within(row).getByTestId("ocr-preview-view-raw-meta"),
    ).toBeInTheDocument();
  });

  it("collapses to `{...}` when the nested object contains another nested object", () => {
    const value = { outer: { inner: { x: 1 } } };
    renderWithProviders(<OcrResultPreview value={value} />);

    const row = screen.getByTestId("ocr-preview-row-outer");
    expect(within(row).getByText("{...}")).toBeInTheDocument();
    expect(
      within(row).getByTestId("ocr-preview-view-raw-outer"),
    ).toBeInTheDocument();
  });

  it("renders arrays as `[N items]` with a View raw link", () => {
    const value = { items: [1, 2, 3] };
    renderWithProviders(<OcrResultPreview value={value} />);

    const row = screen.getByTestId("ocr-preview-row-items");
    expect(within(row).getByText("[3 items]")).toBeInTheDocument();
    expect(
      within(row).getByTestId("ocr-preview-view-raw-items"),
    ).toBeInTheDocument();
  });
});

describe("OcrResultPreview — Scenario 4 (View raw modal)", () => {
  it("opens a modal with the parent-key title and a readOnly JsonInput when clicked", async () => {
    const nested = { inner: { deep: "value" } };
    renderWithProviders(<OcrResultPreview value={{ outer: nested }} />);

    fireEvent.click(screen.getByTestId("ocr-preview-view-raw-outer"));

    // Title — wait for the modal portal to mount its content.
    await screen.findByText("outer — full content");
    // Body JsonInput — the textarea contains the stringified nested
    // value.
    const jsonField = (await screen.findByTestId(
      "ocr-preview-raw-json",
    )) as HTMLTextAreaElement;
    expect(jsonField).toHaveAttribute("readonly");
    expect(jsonField.value).toContain('"inner"');
    expect(jsonField.value).toContain('"deep"');
    expect(jsonField.value).toContain('"value"');
  });
});

describe("OcrResultPreview — Scenario 5 (long string truncation)", () => {
  const LONG = "x".repeat(61) + "ENDMARKER";

  it("renders the first 60 chars + ellipsis when string > 60 chars", () => {
    renderWithProviders(<OcrResultPreview value={{ note: LONG }} />);
    const truncated = screen.getByTestId("ocr-preview-truncated-note");
    expect(truncated.textContent).toBe("x".repeat(60) + "…");
  });

  it("does NOT truncate strings ≤ 60 chars", () => {
    const short = "x".repeat(60);
    renderWithProviders(<OcrResultPreview value={{ note: short }} />);
    expect(
      screen.queryByTestId("ocr-preview-truncated-note"),
    ).not.toBeInTheDocument();
    const row = screen.getByTestId("ocr-preview-row-note");
    expect(within(row).getByText(short)).toBeInTheDocument();
  });

  it("renders a Copy button alongside the truncated value", () => {
    renderWithProviders(<OcrResultPreview value={{ note: LONG }} />);
    expect(screen.getByTestId("ocr-preview-copy-note")).toBeInTheDocument();
  });
});

describe("OcrResultPreview — OcrResult pages[] handling", () => {
  it("renders the first page's fields by default", () => {
    const value = {
      pages: [{ fields: { a: "p1-a" } }, { fields: { a: "p2-a" } }],
    };
    renderWithProviders(<OcrResultPreview value={value} />);
    expect(
      within(screen.getByTestId("ocr-preview-row-a")).getByText("p1-a"),
    ).toBeInTheDocument();
  });

  it("shows page chips and switches pages when multiple pages exist", () => {
    const value = {
      pages: [{ fields: { a: "p1-a" } }, { fields: { a: "p2-a" } }],
    };
    renderWithProviders(<OcrResultPreview value={value} />);

    expect(screen.getByTestId("ocr-preview-page-chips")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ocr-preview-page-chip-1"));
    expect(
      within(screen.getByTestId("ocr-preview-row-a")).getByText("p2-a"),
    ).toBeInTheDocument();
  });

  it("does NOT render the page chips when only one page exists", () => {
    const value = { pages: [{ fields: { a: "p1-a" } }] };
    renderWithProviders(<OcrResultPreview value={value} />);
    expect(
      screen.queryByTestId("ocr-preview-page-chips"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("ocr-preview-row-a")).getByText("p1-a"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// G-022 — the widget used to show the blob POINTER (blobPath / byteLength /
// status) because that is all `OcrResultSchema` carries. The server now
// dereferences it into a bounded excerpt; the widget must show the VALUES.
// ---------------------------------------------------------------------------

const POINTER = {
  documentId: "doc-1",
  blobPath: "grp/ocr/doc-1/ocr-result.json",
  storage: "blob" as const,
  byteLength: 4_831_022,
  status: "succeeded",
};

const LIMITS = {
  maxStringChars: 400,
  maxArrayItems: 5,
  maxObjectKeys: 40,
  maxDepth: 6,
  maxTotalChars: 8000,
};

describe("OcrResultPreview — G-022 blob dereference", () => {
  it("shows extracted field values for an OcrResult, not a blob key", () => {
    renderWithProviders(
      <OcrResultPreview
        value={POINTER}
        excerpt={{
          blobPath: POINTER.blobPath,
          status: "resolved",
          excerpt: { fileName: "form.pdf", applicantName: "A. Person" },
          truncated: false,
          omissions: [],
          byteLength: POINTER.byteLength,
          limits: LIMITS,
        }}
      />,
    );

    expect(
      screen.getByTestId("ocr-preview-row-applicantName"),
    ).toHaveTextContent("A. Person");
    // The pointer's own fields are NOT what gets rendered any more.
    expect(screen.queryByTestId("ocr-preview-row-blobPath")).toBeNull();
    expect(screen.queryByTestId("ocr-preview-row-storage")).toBeNull();
  });

  it("says the preview is truncated when it is, and what was omitted", () => {
    renderWithProviders(
      <OcrResultPreview
        value={POINTER}
        excerpt={{
          blobPath: POINTER.blobPath,
          status: "resolved",
          excerpt: { pages: [1, 2, 3, 4, 5] },
          truncated: true,
          omissions: [
            "pages: showing the first 5 of 312 items",
            "extractedText: showing the first 400 of 184320 characters",
          ],
          limits: LIMITS,
        }}
      />,
    );

    const note = screen.getByTestId("ocr-preview-truncation-note");
    expect(note).toHaveTextContent("Truncated preview");
    expect(note).toHaveTextContent("showing the first 5 of 312 items");
    expect(note).toHaveTextContent(
      "showing the first 400 of 184320 characters",
    );
  });

  it("falls back to the reference AND says why when the payload is gone", () => {
    renderWithProviders(
      <OcrResultPreview
        value={POINTER}
        excerpt={{
          blobPath: POINTER.blobPath,
          status: "unavailable",
          reason: "not-found",
          truncated: false,
          omissions: [],
          limits: LIMITS,
        }}
      />,
    );

    expect(screen.getByTestId("ocr-preview-unresolved")).toHaveTextContent(
      "no longer in storage",
    );
    // The pointer is still shown — it is all there is — but it is labelled.
    expect(screen.getByTestId("ocr-preview-row-blobPath")).toBeInTheDocument();
  });

  it("names the size when the payload is refused for being too large", () => {
    renderWithProviders(
      <OcrResultPreview
        value={POINTER}
        excerpt={{
          blobPath: POINTER.blobPath,
          status: "unavailable",
          reason: "too-large",
          truncated: false,
          omissions: [],
          byteLength: 99_000_000,
          limits: LIMITS,
        }}
      />,
    );

    expect(screen.getByTestId("ocr-preview-unresolved")).toHaveTextContent(
      "too large to preview (99,000,000 bytes)",
    );
  });

  it("renders the value unchanged when there is no excerpt to apply", () => {
    renderWithProviders(<OcrResultPreview value={{ inlineField: "v" }} />);
    expect(
      screen.getByTestId("ocr-preview-row-inlineField"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("ocr-preview-truncation-note")).toBeNull();
    expect(screen.queryByTestId("ocr-preview-unresolved")).toBeNull();
  });
});
