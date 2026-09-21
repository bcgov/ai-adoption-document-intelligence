import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/data/services/api.service";
import { useSuggestions } from "./useSuggestions";

vi.mock("@/data/services/api.service", () => ({
  apiService: { post: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the suggested labels", async () => {
    const suggestion = {
      field_key: "name",
      label_name: "name",
      value: "Jane Doe",
      page_number: 1,
      element_ids: ["p1-w1", "p1-w2"],
      bounding_box: { polygon: [2, 0, 5, 0, 5, 1, 2, 1] },
      source_type: "llm",
      explanation: "Line L1",
    };
    vi.mocked(apiService.post).mockResolvedValue({
      data: [suggestion],
      success: true,
    });
    const { result } = renderHook(() => useSuggestions("tm-1", "doc-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.loadSuggestionsAsync()).resolves.toEqual([
      suggestion,
    ]);
    expect(apiService.post).toHaveBeenCalledWith(
      "/template-models/tm-1/documents/doc-1/suggestions",
      {},
    );
  });

  it("rejects with the server's message so the screen can show it", async () => {
    vi.mocked(apiService.post).mockResolvedValue({
      data: null,
      success: false,
      message: "The suggestion model call failed",
    });
    const { result } = renderHook(() => useSuggestions("tm-1", "doc-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.loadSuggestionsAsync()).rejects.toThrow(
      "The suggestion model call failed",
    );
  });
});
