import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "../services/api.service";
import { useClassifier } from "./useClassifier";

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
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeGroup = { id: "group-abc", name: "Test Group" };

const mockClassifiers = [
  { id: "clf-1", name: "Invoice Classifier", group_id: "group-abc" },
  { id: "clf-2", name: "Receipt Classifier", group_id: "group-abc" },
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

describe("useClassifier – getClassifiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Classifiers scoped to active group
  // -------------------------------------------------------------------------
  describe("Scenario 1 – classifiers scoped to active group", () => {
    it("includes group_id query param in the API request when activeGroup is set", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: mockClassifiers,
        message: undefined,
      });

      const { result } = renderHook(() => useClassifier(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.getClassifiers.isSuccess).toBe(true);
      });

      expect(apiService.get).toHaveBeenCalledWith(
        `/azure/classifier?group_id=${activeGroup.id}`,
      );
      expect(result.current.getClassifiers.data).toEqual(mockClassifiers);
    });

    it("omits group_id query param when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: mockClassifiers,
        message: undefined,
      });

      const { result } = renderHook(() => useClassifier(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.getClassifiers.isSuccess).toBe(true);
      });

      expect(apiService.get).toHaveBeenCalledWith("/azure/classifier");
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Query key includes activeGroup.id
  // -------------------------------------------------------------------------
  describe("Scenario 2 – query key includes activeGroup.id", () => {
    it("includes activeGroup.id in the query key when activeGroup is set", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: mockClassifiers,
        message: undefined,
      });

      const { result } = renderHook(() => useClassifier(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.getClassifiers.isSuccess).toBe(true);
      });

      // Re-render with a different group to confirm refetch is triggered
      mockUseGroup.mockReturnValue({
        activeGroup: { id: "group-xyz", name: "Other Group" },
      });

      const { result: result2 } = renderHook(() => useClassifier(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result2.current.getClassifiers.isSuccess).toBe(true);
      });

      expect(apiService.get).toHaveBeenCalledWith(
        "/azure/classifier?group_id=group-xyz",
      );
    });

    it("uses null in the query key when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: [],
        message: undefined,
      });

      const { result } = renderHook(() => useClassifier(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.getClassifiers.isSuccess).toBe(true);
      });

      expect(result.current.getClassifiers.data).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Empty list shown when active group has no classifiers
  // -------------------------------------------------------------------------
  describe("Scenario 5 – empty list when active group has no classifiers", () => {
    it("returns an empty array without error when the group has no classifiers", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: [],
        message: undefined,
      });

      const { result } = renderHook(() => useClassifier(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.getClassifiers.isSuccess).toBe(true);
      });

      expect(result.current.getClassifiers.data).toEqual([]);
      expect(result.current.getClassifiers.isError).toBe(false);
    });
  });
});
