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

import { ARTIFACT_REGISTRY } from "@ai-di/graph-workflow";
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
    wrap(
      renderKindValue("Document", {
        blobKey: "b1",
        pageCount: 1,
        url: "https://x/y.png",
      }),
    );
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
  });

  it("maps MultiPageDocument to DocumentPreview", () => {
    wrap(
      renderKindValue("MultiPageDocument", {
        blobKey: "b1",
        pageCount: 3,
        url: "https://x/y.png",
      }),
    );
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
  });

  it("maps SinglePageDocument to DocumentPreview", () => {
    wrap(
      renderKindValue("SinglePageDocument", {
        blobKey: "b1",
        pageCount: 1,
        url: "https://x/y.png",
      }),
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

  // -------------------------------------------------------------------
  // G-011 — dispatch used to `return null` for every kind outside
  // Document / OcrResult / Classification / Segment[], which rendered as a
  // blank card indistinguishable from a bug.
  // -------------------------------------------------------------------

  it("renders a readable fallback for a kind with no dedicated renderer", () => {
    wrap(renderKindValue("Reference", { docId: "d1", page: 3 }));
    expect(screen.getByTestId("preview-generic-value")).toBeInTheDocument();
    expect(screen.getByTestId("json-value-preview")).toHaveTextContent("d1");
  });

  it("names the kind on the generic fallback so the author knows why it is raw", () => {
    wrap(renderKindValue("ValidationResult", { ok: false }));
    expect(screen.getByTestId("preview-generic-kind")).toHaveTextContent(
      "ValidationResult",
    );
  });

  it("falls back for an array kind with no array renderer", () => {
    wrap(renderKindValue("Document[]", [{ blobKey: "b1" }]));
    expect(screen.getByTestId("preview-generic-value")).toBeInTheDocument();
  });

  it("falls back for a value whose kind is undeclared", () => {
    wrap(renderKindValue(null, 42));
    expect(screen.getByTestId("preview-generic-value")).toBeInTheDocument();
    expect(screen.getByTestId("json-value-preview")).toHaveTextContent("42");
  });

  it("says why when a value cannot be previewed, instead of a blank card", () => {
    wrap(renderKindValue("Document", undefined));
    expect(screen.getByTestId("preview-value-unavailable")).toHaveTextContent(
      "Document",
    );
    expect(screen.queryByTestId("document-preview")).toBeNull();
  });

  it("never returns null for any registered kind, in either cardinality", () => {
    // The coverage floor: a blank card is never an acceptable outcome. Every
    // kind either routes to a dedicated widget or to the legible fallback.
    const kinds = Object.keys(ARTIFACT_REGISTRY);
    expect(kinds.length).toBeGreaterThan(20);
    for (const kind of kinds) {
      for (const ref of [kind, `${kind}[]`]) {
        const rendered = renderKindValue(ref, kind.endsWith("[]") ? [] : {});
        expect(rendered, `renderKindValue(${ref})`).not.toBeNull();
      }
    }
  });

  it("does not misdispatch LabeledDocumentMap into the Classification widget", () => {
    // G-011 item 4: `LabeledDocumentMap` has `baseKind: Classification` but is
    // a deliberately schema-free `Record<label, documents>`. Family-root
    // dispatch handed it to the label-pill + confidence-bar widget, whose type
    // guard cannot match, so it rendered its "no data" placeholder.
    wrap(
      renderKindValue("LabeledDocumentMap", {
        invoice: [{ blobKey: "b1" }],
        receipt: [{ blobKey: "b2" }],
      }),
    );
    expect(screen.queryByTestId("classification-preview")).toBeNull();
    // The exact-kind override sends it straight to the structured JSON view.
    expect(screen.getByTestId("json-value-preview")).toHaveTextContent(
      "invoice",
    );
  });

  // -------------------------------------------------------------------
  // G-022 — blob-backed values are handed their server-resolved excerpt.
  // -------------------------------------------------------------------

  it("hands an OcrResult pointer its resolved excerpt, keyed by blobPath", () => {
    const pointer = {
      documentId: "d1",
      blobPath: "grp/ocr/d1/ocr-result.json",
      storage: "blob",
    };
    wrap(
      renderKindValue("OcrResult", pointer, {
        "grp/ocr/d1/ocr-result.json": {
          blobPath: "grp/ocr/d1/ocr-result.json",
          status: "resolved",
          excerpt: { applicantName: "A. Person" },
          truncated: false,
          omissions: [],
          limits: {
            maxStringChars: 400,
            maxArrayItems: 5,
            maxObjectKeys: 40,
            maxDepth: 6,
            maxTotalChars: 8000,
          },
        },
      }),
    );

    expect(
      screen.getByTestId("ocr-preview-row-applicantName"),
    ).toHaveTextContent("A. Person");
    expect(screen.queryByTestId("ocr-preview-row-blobPath")).toBeNull();
  });

  it("renders the pointer when no excerpt exists for its blobPath", () => {
    wrap(
      renderKindValue(
        "OcrResult",
        { documentId: "d1", blobPath: "grp/ocr/d1/r.json", storage: "blob" },
        {},
      ),
    );
    expect(screen.getByTestId("ocr-preview-row-blobPath")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------
  // Family-aware dispatch — shape-honest subkinds retagged onto catalog
  // ports by the kind-taxonomy-refinement wave must still resolve to
  // their family's widget via `baseKind` (walked through the live
  // registry), not exact-string match.
  // -------------------------------------------------------------------

  it("maps DocumentRef (baseKind → Document) to DocumentPreview", () => {
    wrap(
      renderKindValue("DocumentRef", {
        blobKey: "b1",
        pageCount: 1,
        url: "https://x/y.png",
      }),
    );
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
  });

  it("maps PreparedFile (baseKind → Document) to DocumentPreview", () => {
    wrap(
      renderKindValue("PreparedFile", {
        blobKey: "b1",
        pageCount: 1,
        url: "https://x/y.png",
      }),
    );
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
  });

  it("maps DocumentContent (baseKind → Document) to DocumentPreview", () => {
    wrap(
      renderKindValue("DocumentContent", {
        blobKey: "b1",
        pageCount: 1,
        url: "https://x/y.png",
      }),
    );
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
  });

  it("maps MultiPageDocument (baseKind → DocumentRef → Document) to DocumentPreview", () => {
    wrap(
      renderKindValue("MultiPageDocument", {
        blobKey: "b1",
        pageCount: 3,
        url: "https://x/y.png",
      }),
    );
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
  });

  it("maps SinglePageDocument (baseKind → DocumentRef → Document) to DocumentPreview", () => {
    wrap(
      renderKindValue("SinglePageDocument", {
        blobKey: "b1",
        pageCount: 1,
        url: "https://x/y.png",
      }),
    );
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
  });

  it("maps ClassificationLabel (baseKind → Classification) to ClassificationPreview", () => {
    wrap(
      renderKindValue("ClassificationLabel", {
        label: "invoice",
        confidence: 0.92,
      }),
    );
    expect(screen.getByTestId("classification-preview")).toBeInTheDocument();
  });
});
