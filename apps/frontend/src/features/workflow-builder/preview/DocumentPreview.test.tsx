/**
 * Unit tests for `DocumentPreview` (US-142).
 *
 * Each scenario in `user_stories/US-142-document-preview.md` maps to a
 * `describe` block below; the test count is well above the
 * ≥ 4-case minimum required by Scenario 6.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { DocumentPreview } from "./DocumentPreview";

function renderWithMantine(ui: ReactNode): ReturnType<typeof render> {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

// ---------------------------------------------------------------------------
// Scenario 1 — base render + placeholder
// ---------------------------------------------------------------------------

describe("Scenario 1 — component signature + base render", () => {
  it("renders the placeholder when value is `null`", () => {
    renderWithMantine(<DocumentPreview value={null} />);
    const placeholder = screen.getByTestId("document-preview-placeholder");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveTextContent("Document unavailable");
  });

  it("renders the placeholder when value is `undefined`", () => {
    renderWithMantine(<DocumentPreview value={undefined} />);
    expect(
      screen.getByTestId("document-preview-placeholder"),
    ).toBeInTheDocument();
  });

  it("renders the placeholder when blobKey is missing", () => {
    renderWithMantine(
      <DocumentPreview value={{ mimeType: "application/pdf" }} />,
    );
    expect(
      screen.getByTestId("document-preview-placeholder"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("document-preview")).toBeNull();
  });

  it("renders the placeholder when blobKey is an empty string", () => {
    renderWithMantine(<DocumentPreview value={{ blobKey: "" }} />);
    expect(
      screen.getByTestId("document-preview-placeholder"),
    ).toBeInTheDocument();
  });

  it("renders the placeholder when value is a primitive", () => {
    renderWithMantine(<DocumentPreview value="not-a-document" />);
    expect(
      screen.getByTestId("document-preview-placeholder"),
    ).toBeInTheDocument();
  });

  it("renders the document when blobKey is a non-empty string", () => {
    renderWithMantine(
      <DocumentPreview
        value={{ blobKey: "abc", url: "https://example/x.png" }}
      />,
    );
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("document-preview-placeholder")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — MultiPageDocument: first page large + horizontal strip
// ---------------------------------------------------------------------------

describe("Scenario 2 — MultiPageDocument strip", () => {
  it("renders the large first page + strip of pages 2..5 for pageCount=5", () => {
    renderWithMantine(
      <DocumentPreview
        value={{
          blobKey: "abc",
          url: "https://example/x.pdf",
          mimeType: "application/pdf",
          pageCount: 5,
        }}
      />,
    );

    expect(screen.getByTestId("document-preview-large")).toBeInTheDocument();
    const strip = screen.getByTestId("document-preview-strip");
    expect(strip).toBeInTheDocument();
    // Pages 2..5 in the strip → 4 thumbs.
    expect(
      within(strip).getByTestId("document-preview-strip-thumb-2"),
    ).toBeInTheDocument();
    expect(
      within(strip).getByTestId("document-preview-strip-thumb-3"),
    ).toBeInTheDocument();
    expect(
      within(strip).getByTestId("document-preview-strip-thumb-4"),
    ).toBeInTheDocument();
    expect(
      within(strip).getByTestId("document-preview-strip-thumb-5"),
    ).toBeInTheDocument();
    expect(
      within(strip).queryByTestId("document-preview-strip-thumb-6"),
    ).toBeNull();
    // No overflow chip when pageCount ≤ 9.
    expect(
      within(strip).queryByTestId("document-preview-strip-overflow"),
    ).toBeNull();
  });

  it("caps the strip at 8 visible thumbnails + '+N more' chip when pageCount > 9", () => {
    renderWithMantine(
      <DocumentPreview
        value={{
          blobKey: "abc",
          url: "https://example/x.pdf",
          mimeType: "application/pdf",
          pageCount: 12,
        }}
      />,
    );

    const strip = screen.getByTestId("document-preview-strip");
    // Visible: pages 2..9 = 8 thumbs.
    for (let p = 2; p <= 9; p += 1) {
      expect(
        within(strip).getByTestId(`document-preview-strip-thumb-${p}`),
      ).toBeInTheDocument();
    }
    expect(
      within(strip).queryByTestId("document-preview-strip-thumb-10"),
    ).toBeNull();
    const overflow = within(strip).getByTestId(
      "document-preview-strip-overflow",
    );
    expect(overflow).toBeInTheDocument();
    // 12 pages total, 1 large + 8 strip = 9 shown → 3 truncated.
    expect(overflow).toHaveTextContent("+3 more");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — SinglePageDocument: one large thumbnail, no strip
// ---------------------------------------------------------------------------

describe("Scenario 3 — SinglePageDocument", () => {
  it("renders one large thumbnail when pageCount === 1", () => {
    renderWithMantine(
      <DocumentPreview
        value={{
          blobKey: "abc",
          url: "https://example/x.pdf",
          mimeType: "application/pdf",
          pageCount: 1,
        }}
      />,
    );
    expect(screen.getByTestId("document-preview-large")).toBeInTheDocument();
    expect(screen.queryByTestId("document-preview-strip")).toBeNull();
  });

  it("renders one large thumbnail when mimeType starts with image/", () => {
    renderWithMantine(
      <DocumentPreview
        value={{
          blobKey: "abc",
          url: "https://example/x.png",
          mimeType: "image/png",
        }}
      />,
    );
    expect(screen.getByTestId("document-preview-large")).toBeInTheDocument();
    expect(screen.queryByTestId("document-preview-strip")).toBeNull();
  });

  it("renders one large thumbnail when both pageCount and mimeType are absent", () => {
    renderWithMantine(
      <DocumentPreview value={{ blobKey: "abc", url: "https://example/x" }} />,
    );
    expect(screen.getByTestId("document-preview-large")).toBeInTheDocument();
    expect(screen.queryByTestId("document-preview-strip")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — thumbnails carry blobKey + page metadata
// ---------------------------------------------------------------------------

describe("Scenario 4 — thumbnails carry blobKey + page", () => {
  it("propagates blobKey + page to every thumbnail in the strip", () => {
    renderWithMantine(
      <DocumentPreview
        value={{
          blobKey: "key-xyz",
          url: "https://example/x.pdf",
          mimeType: "application/pdf",
          pageCount: 3,
        }}
      />,
    );

    const large = screen.getByTestId("document-preview-large");
    expect(large.getAttribute("data-blob-key")).toBe("key-xyz");
    expect(large.getAttribute("data-page")).toBe("1");

    for (const p of [2, 3]) {
      const thumb = screen.getByTestId(`document-preview-strip-thumb-${p}`);
      expect(thumb.getAttribute("data-blob-key")).toBe("key-xyz");
      expect(thumb.getAttribute("data-page")).toBe(String(p));
    }
  });

  it("surfaces an unavailable state when url is missing", () => {
    renderWithMantine(
      <DocumentPreview
        value={{ blobKey: "abc", mimeType: "application/pdf", pageCount: 1 }}
      />,
    );
    const large = screen.getByTestId("document-preview-large");
    expect(large.getAttribute("data-state")).toBe("unavailable");
    expect(large).toHaveTextContent("Unavailable");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — click large thumbnail opens modal + page navigation
// ---------------------------------------------------------------------------

describe("Scenario 5 — click large thumbnail opens modal", () => {
  it("opens a modal on click and renders the page image", async () => {
    renderWithMantine(
      <DocumentPreview
        value={{
          blobKey: "abc",
          url: "https://example/x.pdf",
          mimeType: "application/pdf",
          pageCount: 1,
        }}
      />,
    );

    expect(screen.queryByTestId("document-preview-modal")).toBeNull();
    fireEvent.click(screen.getByTestId("document-preview-large"));

    await waitFor(() => {
      expect(screen.getByTestId("document-preview-modal")).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("document-preview-modal-image"),
    ).toBeInTheDocument();
    // Single-page → no prev/next arrows.
    expect(screen.queryByTestId("document-preview-modal-prev")).toBeNull();
    expect(screen.queryByTestId("document-preview-modal-next")).toBeNull();
  });

  it("shows prev/next arrows and steps pages for multi-page documents", async () => {
    renderWithMantine(
      <DocumentPreview
        value={{
          blobKey: "abc",
          url: "https://example/x.pdf",
          mimeType: "application/pdf",
          pageCount: 3,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("document-preview-large"));
    await waitFor(() => {
      expect(screen.getByTestId("document-preview-modal")).toBeInTheDocument();
    });

    const prev = screen.getByTestId("document-preview-modal-prev");
    const next = screen.getByTestId("document-preview-modal-next");
    const label = screen.getByTestId("document-preview-modal-page-label");

    // Starts on page 1.
    expect(label).toHaveTextContent("1 / 3");
    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();

    // Step forward.
    fireEvent.click(next);
    expect(label).toHaveTextContent("2 / 3");
    expect(prev).not.toBeDisabled();
    expect(next).not.toBeDisabled();

    fireEvent.click(next);
    expect(label).toHaveTextContent("3 / 3");
    expect(next).toBeDisabled();

    // Step back.
    fireEvent.click(prev);
    expect(label).toHaveTextContent("2 / 3");
  });
});
