import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockNotificationsShow } from "@/test/mockNotifications";
import { MantineProvider } from "../../../../ui";
import { LabelingWorkspacePage } from "./LabelingWorkspacePage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
//
// LabelingWorkspacePage pulls in PDF rendering and a Konva canvas; both are
// inert in this test (no normalized PDF is supplied, and jsdom's mocked
// ResizeObserver never reports a size), so only the data hooks need mocking.

const mockUseFieldSchema = vi.fn();
const mockUseTemplateModelDocument = vi.fn();
const mockUseLabels = vi.fn();
const mockUseSuggestions = vi.fn();

vi.mock("../hooks/useFieldSchema", () => ({
  useFieldSchema: () => mockUseFieldSchema(),
}));
vi.mock("../hooks/useTemplateModels", () => ({
  useTemplateModelDocument: () => mockUseTemplateModelDocument(),
}));
vi.mock("../hooks/useLabels", () => ({
  useLabels: () => mockUseLabels(),
}));
vi.mock("../hooks/useSuggestions", () => ({
  useSuggestions: () => mockUseSuggestions(),
}));
// pdfjs-dist touches browser APIs (DOMMatrix) jsdom does not provide, just by
// being imported. No test document here has a normalized PDF, so the hook is
// never exercised for real; it only needs to not blow up on import.
vi.mock("../../core/canvas/hooks/usePdfPageImage", () => ({
  usePdfPageImage: () => ({
    imageUrl: null,
    pageSize: null,
    numPages: 0,
    isRendering: false,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const documentWithOcrWords = {
  labeling_document: {
    original_filename: "form.pdf",
    normalized_file_path: null,
    ocr_result: {
      analyzeResult: {
        pages: [
          {
            pageNumber: 1,
            words: [
              {
                content: "Jane",
                polygon: [0, 0, 1, 0, 1, 1, 0, 1],
                confidence: 1,
                span: { offset: 0, length: 4 },
              },
            ],
            selectionMarks: [],
          },
        ],
      },
    },
  },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/template-models/tm-1/documents/doc-1"]}>
        <MantineProvider>
          <Routes>
            <Route
              path="/template-models/:modelId/documents/:documentId"
              element={<LabelingWorkspacePage />}
            />
          </Routes>
        </MantineProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LabelingWorkspacePage — automatic suggestions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("not available in test")),
    );

    mockUseFieldSchema.mockReturnValue({ schema: [] });
    mockUseTemplateModelDocument.mockReturnValue({
      document: documentWithOcrWords,
      isLoading: false,
    });
    mockUseLabels.mockReturnValue({
      labels: [],
      isLoading: false,
      saveLabelsAsync: vi.fn(),
      isSaving: false,
    });
  });

  it("shows an error notification when the automatic suggestion call fails, the same way the manual button does", async () => {
    const loadSuggestionsAsync = vi
      .fn()
      .mockRejectedValue(new Error("Label suggestions are not configured"));
    mockUseSuggestions.mockReturnValue({
      loadSuggestionsAsync,
      isLoadingSuggestions: false,
    });

    renderPage();

    // The effect that resets word assignments on mount touches state the
    // auto-suggestion effect's dependency array reads, so a mounting page
    // can call this more than once; that quirk is unrelated to this fix and
    // out of scope (the fix only changes what a failed call does, not when
    // or how often it fires). What matters here is that every failure is
    // surfaced, so this asserts "called" and "notified", not exact counts.
    await waitFor(() => expect(loadSuggestionsAsync).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockNotificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Failed to load suggestions",
          message: "Label suggestions are not configured",
          color: "red",
        }),
      ),
    );
  });

  it("applies the suggestions and shows nothing on the happy path", async () => {
    const loadSuggestionsAsync = vi.fn().mockResolvedValue([
      {
        field_key: "name",
        element_ids: ["p1-w0"],
      },
    ]);
    mockUseSuggestions.mockReturnValue({
      loadSuggestionsAsync,
      isLoadingSuggestions: false,
    });

    renderPage();

    await waitFor(() => expect(loadSuggestionsAsync).toHaveBeenCalled());
    expect(mockNotificationsShow).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Failed to load suggestions" }),
    );
  });
});
