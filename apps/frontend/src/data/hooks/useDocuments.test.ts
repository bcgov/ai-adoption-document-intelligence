import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "../services/api.service";
import { useDocuments } from "./useDocuments";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseGroup = vi.fn();

vi.mock("../../auth/GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

vi.mock("../services/api.service", () => ({
  apiService: {
    get: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeGroup = { id: "group-1", name: "Group One" };

const mockDocuments = [
  { id: "doc-1", title: "Document 1", source: "api" },
  { id: "doc-2", title: "Document 2", source: "api" },
];

const mockPaginatedResponse = {
  documents: mockDocuments,
  total: 2,
  limit: 50,
  offset: 0,
};

/**
 * Creates a fresh QueryClient and returns a wrapper for renderHook.
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Documents scoped to active group
  // -------------------------------------------------------------------------
  describe("Scenario 1 – documents scoped to active group", () => {
    it("includes group_id query param in the API request when activeGroup is set", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: mockPaginatedResponse,
        message: undefined,
      });

      const { result } = renderHook(() => useDocuments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.get).toHaveBeenCalledWith(
        `/documents?group_id=${activeGroup.id}&limit=50&offset=0`,
      );
      expect(result.current.data?.documents).toEqual(mockDocuments);
      expect(result.current.data?.total).toBe(2);
    });
  });

  describe("Scenario 2 – query key includes activeGroup.id", () => {
    it("uses activeGroup.id in the query key so switching groups triggers a refetch", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: mockPaginatedResponse,
        message: undefined,
      });

      const { result } = renderHook(() => useDocuments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.documents).toEqual(mockDocuments);
      expect(apiService.get).toHaveBeenCalledWith(
        `/documents?group_id=${activeGroup.id}&limit=50&offset=0`,
      );
    });
  });

  describe("Scenario 4 – no group_id when activeGroup is null", () => {
    it("omits group_id from the API request when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: { ...mockPaginatedResponse, documents: mockDocuments },
        message: undefined,
      });

      const { result } = renderHook(() => useDocuments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.get).toHaveBeenCalledWith(
        "/documents?limit=50&offset=0",
      );
    });
  });

  describe("Scenario 5 – empty list when active group has no documents", () => {
    it("returns empty documents array without error when the API returns none", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: { documents: [], total: 0, limit: 50, offset: 0 },
        message: undefined,
      });

      const { result } = renderHook(() => useDocuments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.documents).toEqual([]);
      expect(result.current.data?.total).toBe(0);
      expect(result.current.isError).toBe(false);
    });
  });

  describe("Source filtering – excludes ground-truth-generation documents", () => {
    it("filters out documents whose source is not 'api'", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: {
          documents: [
            { id: "doc-1", title: "Regular", source: "api" },
            { id: "doc-2", title: "GT", source: "ground-truth-generation" },
            { id: "doc-3", title: "Regular 2", source: "api" },
          ],
          total: 3,
          limit: 50,
          offset: 0,
        },
        message: undefined,
      });

      const { result } = renderHook(() => useDocuments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.documents).toEqual([
        { id: "doc-1", title: "Regular", source: "api" },
        { id: "doc-3", title: "Regular 2", source: "api" },
      ]);
    });
  });

  describe("Error handling", () => {
    it("throws an error when the API response is not successful", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: false,
        data: null,
        message: "Failed to fetch documents",
      });

      const { result } = renderHook(() => useDocuments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe("Failed to fetch documents");
    });
  });
});
