import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "../services/api.service";
import { useDeleteDocument } from "./useDeleteDocument";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseGroup = vi.fn();

vi.mock("../../auth/GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

vi.mock("../services/api.service", () => ({
  apiService: {
    delete: vi.fn(),
  },
}));

const activeGroup = { id: "group-1", name: "Group One" };

function createWrapper(client?: QueryClient) {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper, queryClient };
}

describe("useDeleteDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGroup.mockReturnValue({ activeGroup });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls DELETE /documents/:id and invalidates the documents query on success", async () => {
    vi.mocked(apiService.delete).mockResolvedValue({
      success: true,
      data: undefined as unknown as undefined,
      message: undefined,
    });

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteDocument(), {
      wrapper: Wrapper,
    });

    result.current.mutate("doc-1");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiService.delete).toHaveBeenCalledWith("/documents/doc-1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["documents", activeGroup.id],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["hitl-queue"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["hitl-queue-stats"],
    });
  });

  it("propagates the backend error message when delete fails", async () => {
    vi.mocked(apiService.delete).mockResolvedValue({
      success: false,
      data: null as unknown as undefined,
      message:
        "Document is currently being processed; try again once OCR completes",
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteDocument(), {
      wrapper: Wrapper,
    });

    result.current.mutate("doc-2");

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toMatch(/currently being processed/);
  });

  it("uses null in the documents query key when no active group is set", async () => {
    mockUseGroup.mockReturnValue({ activeGroup: null });
    vi.mocked(apiService.delete).mockResolvedValue({
      success: true,
      data: undefined as unknown as undefined,
      message: undefined,
    });

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteDocument(), {
      wrapper: Wrapper,
    });

    result.current.mutate("doc-3");

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["documents", null],
    });
  });
});
