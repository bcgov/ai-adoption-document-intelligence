import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Document, RejectionReason } from "../../shared/types";
import { MantineProvider } from "../../ui";
import { DocumentViewerModal } from "./DocumentViewerModal";

vi.mock("../../data/hooks/useDocumentOcr", () => ({
  useDocumentOcr: () => ({ data: undefined }),
}));

// The PDF pane loads pdf.js, which jsdom cannot run; these tests read the
// Details tab only.
vi.mock("./DocumentViewer", () => ({ DocumentViewer: () => null }));
vi.mock("./OcrResults", () => ({ default: () => null }));

const baseDocument: Document = {
  id: "doc-1",
  title: "March report",
  original_filename: "march.pdf",
  file_path: "group-1/ocr/doc-1/original.pdf",
  file_type: "pdf",
  file_size: 1024,
  source: "upload",
  status: "rejected",
  created_at: "2026-10-05T16:00:00.000Z",
  updated_at: "2026-10-05T17:00:00.000Z",
  model_id: "prebuilt-layout",
};

function renderModal(document: Document) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MantineProvider>
          <DocumentViewerModal document={document} opened onClose={vi.fn()} />
        </MantineProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DocumentViewerModal", () => {
  beforeEach(() => {
    // The tabs render once the file has loaded; its content is irrelevant here.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["%PDF-1.4"]),
      }),
    );
    URL.createObjectURL = vi.fn(() => "blob:test-document");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows who rejected the document, why, and their comment", async () => {
    renderModal({
      ...baseDocument,
      rejection: {
        reason: RejectionReason.MODEL_MISMATCH,
        comment: "This is a T4, not a monthly report.",
        rejected_at: "2026-10-05T17:00:00.000Z",
        rejected_by: "reviewer@example.com",
      },
    });

    expect(
      await screen.findByText(/reviewer@example\.com/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Model mismatch (wrong document type/template)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This is a T4, not a monthly report."),
    ).toBeInTheDocument();
  });

  it("does not offer a new review for a rejected document", async () => {
    renderModal({ ...baseDocument, rejection: null });

    await screen.findByText("Details");
    expect(
      screen.queryByRole("button", { name: "Start Human Review" }),
    ).not.toBeInTheDocument();
  });

  it("offers a review for a document awaiting one", async () => {
    renderModal({ ...baseDocument, status: "awaiting_review" });

    expect(
      await screen.findByRole("button", { name: "Start Human Review" }),
    ).toBeInTheDocument();
  });
});
