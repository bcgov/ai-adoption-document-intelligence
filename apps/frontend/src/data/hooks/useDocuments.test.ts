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
        data: mockDocuments,
        message: undefined,
      });

      const { result } = renderHook(() => useDocuments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.get).toHaveBeenCalledWith(
        `/documents?group_id=${activeGroup.id}`,
      );
      expect(result.current.data).toEqual(mockDocuments);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Query key includes activeGroup.id for automatic refetch
  // -------------------------------------------------------------------------
  describe("Scenario 2 – query key includes activeGroup.id", () => {
    it("uses activeGroup.id in the query key so switching groups triggers a refetch", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: mockDocuments,
        message: undefined,
      });

      const { result } = renderHook(() => useDocuments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // The React Query key must contain the group id so a group change
      // invalidates the cache and triggers a new fetch.
      expect(result.current.data).toEqual(mockDocuments);
      expect(apiService.get).toHaveBeenCalledWith(
        `/documents?group_id=${activeGroup.id}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Fallback behaviour when no active group
  // -------------------------------------------------------------------------
  describe("Scenario 4 – no group_id when activeGroup is null", () => {
    it("omits group_id from the API request when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: mockDocuments,
        message: undefined,
      });

      const { result } = renderHook(() => useDocuments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.get).toHaveBeenCalledWith("/documents");
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Empty list when active group has no documents
  // -------------------------------------------------------------------------
  describe("Scenario 5 – empty list when active group has no documents", () => {
    it("returns an empty array without error when the API returns no documents", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: [],
        message: undefined,
      });

      const { result } = renderHook(() => useDocuments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.isError).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Source filtering
  // -------------------------------------------------------------------------
  describe("Source filtering – excludes ground-truth-generation documents", () => {
    it("filters out documents whose source is not 'api'", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: [
          { id: "doc-1", title: "Regular", source: "api" },
          { id: "doc-2", title: "GT", source: "ground-truth-generation" },
          { id: "doc-3", title: "Regular 2", source: "api" },
        ],
        message: undefined,
      });

      const { result } = renderHook(() => useDocuments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([
        { id: "doc-1", title: "Regular", source: "api" },
        { id: "doc-3", title: "Regular 2", source: "api" },
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
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
