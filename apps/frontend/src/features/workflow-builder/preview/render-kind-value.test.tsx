/**
 * Unit tests for `renderKindValue` — the shared kind→widget dispatch
 * extracted from `PreviewWidget.renderForOutputKind` (Phase 4 "wire
 * data peek", Task 1). Asserts each mapped kind renders the real
 * value-level widget's root element, and that unmapped kinds / `null`
 * return `null`.
 *
 * `SegmentArrayPreview` calls `useDocuments()` (React Query + group
 * context) unconditionally, so it is stubbed here — the same
 * convention its own unit test uses — to keep this test's provider tree
 * to just `<MantineProvider>`.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderKindValue } from "./render-kind-value";

vi.mock("../../../data/hooks/useDocuments", () => ({
  useDocuments: () => ({
    data: { documents: [], total: 0, limit: 50, offset: 0 },
    isLoading: false,
  }),
}));

const wrap = (node: ReactNode): ReturnType<typeof render> =>
  render(<MantineProvider>{node}</MantineProvider>);

describe("renderKindValue", () => {
  it("maps Document to DocumentPreview", () => {
    wrap(renderKindValue("Document", { blobKey: "b1", pageCount: 1 }));
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
  });

  it("maps MultiPageDocument to DocumentPreview", () => {
    wrap(renderKindValue("MultiPageDocument", { blobKey: "b1", pageCount: 3 }));
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
  });

  it("maps SinglePageDocument to DocumentPreview", () => {
    wrap(
      renderKindValue("SinglePageDocument", { blobKey: "b1", pageCount: 1 }),
    );
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
  });

  it("maps Segment[] to SegmentArrayPreview", () => {
    wrap(
      renderKindValue("Segment[]", [
        { parentDocId: "d1", polygon: [0, 0, 10, 0, 10, 10, 0, 10] },
      ]),
    );
    expect(screen.getByTestId("segment-array-preview")).toBeInTheDocument();
  });

  it("maps OcrResult to OcrResultPreview", () => {
    wrap(renderKindValue("OcrResult", { foo: "bar" }));
    expect(screen.getByTestId("ocr-preview-root")).toBeInTheDocument();
  });

  it("maps OcrFields to OcrResultPreview", () => {
    wrap(renderKindValue("OcrFields", { foo: "bar" }));
    expect(screen.getByTestId("ocr-preview-root")).toBeInTheDocument();
  });

  it("maps Classification to ClassificationPreview", () => {
    wrap(
      renderKindValue("Classification", { label: "invoice", confidence: 0.92 }),
    );
    expect(screen.getByTestId("classification-preview")).toBeInTheDocument();
  });

  it("returns null for a kind with no widget", () => {
    expect(renderKindValue("Artifact", "some-id")).toBeNull();
    expect(renderKindValue(null, 42)).toBeNull();
  });
});
