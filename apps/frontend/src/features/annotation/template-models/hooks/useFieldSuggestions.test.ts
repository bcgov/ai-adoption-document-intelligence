import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/data/services/api.service";
import { FieldType } from "../../core/types/field";
import { useFieldSuggestions } from "./useFieldSuggestions";

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

const suggested = {
  field_key: "file_number",
  field_type: FieldType.STRING,
  description: "Court file number",
  value: "S-251234",
  page_number: 1,
  already_exists: false,
};

describe("useFieldSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the document id and returns the suggested fields", async () => {
    vi.mocked(apiService.post).mockResolvedValue({
      data: [suggested],
      success: true,
    });
    const { result } = renderHook(() => useFieldSuggestions("tm-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.suggestFieldsAsync("doc-1")).resolves.toEqual([
      suggested,
    ]);
    expect(apiService.post).toHaveBeenCalledWith(
      "/template-models/tm-1/field-suggestions",
      { document_id: "doc-1" },
    );
  });

  it("rejects with the server's message", async () => {
    vi.mocked(apiService.post).mockResolvedValue({
      data: null,
      success: false,
      message: "Label suggestions are not configured",
    });
    const { result } = renderHook(() => useFieldSuggestions("tm-1"), {
      wrapper: createWrapper(),
    });

    await expect(result.current.suggestFieldsAsync("doc-1")).rejects.toThrow(
      "Label suggestions are not configured",
    );
  });
});
