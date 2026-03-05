import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/data/services/api.service";
import { useReviewQueue } from "./useReviewQueue";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseGroup = vi.fn();

vi.mock("@/auth/GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

vi.mock("@/data/services/api.service", () => ({
  apiService: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeGroup = { id: "group-1", name: "Group One" };

const mockQueueResponse = {
  documents: [
    {
      id: "doc-1",
      original_filename: "test.pdf",
      status: "completed_ocr",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  total: 1,
};

const mockStatsResponse = {
  totalDocuments: 1,
  requiresReview: 1,
  averageConfidence: 0.8,
  reviewedToday: 0,
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

describe("useReviewQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Queue scoped to active group
  // -------------------------------------------------------------------------
  describe("Scenario 1 – queue scoped to active group", () => {
    it("includes group_id in the queue request when activeGroup is set", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: mockQueueResponse,
        message: undefined,
      });

      const { result } = renderHook(() => useReviewQueue(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(apiService.get).toHaveBeenCalledWith(
        expect.stringContaining(`group_id=${activeGroup.id}`),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Stats scoped to active group
  // -------------------------------------------------------------------------
  describe("Scenario 2 – stats scoped to active group", () => {
    it("includes group_id in the stats request when activeGroup is set", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get)
        .mockResolvedValueOnce({
          success: true,
          data: mockQueueResponse,
          message: undefined,
        })
        .mockResolvedValueOnce({
          success: true,
          data: mockStatsResponse,
          message: undefined,
        });

      const { result } = renderHook(() => useReviewQueue(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.stats).toBeDefined();
      });

      const statsCalls = vi
        .mocked(apiService.get)
        .mock.calls.filter((call) =>
          (call[0] as string).includes("/hitl/queue/stats"),
        );
      expect(statsCalls.length).toBeGreaterThan(0);
      expect(statsCalls[0][0]).toContain(`group_id=${activeGroup.id}`);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Queue key includes activeGroup.id for automatic refetch
  // -------------------------------------------------------------------------
  describe("Scenario 3 – query keys include activeGroup.id", () => {
    it("re-fetches queue when active group changes", async () => {
      const groupB = { id: "group-2", name: "Group Two" };

      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: mockQueueResponse,
        message: undefined,
      });

      const wrapper = createWrapper();
      const { result, rerender } = renderHook(() => useReviewQueue(), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Switch active group
      mockUseGroup.mockReturnValue({ activeGroup: groupB });
      rerender();

      await waitFor(() => {
        const calls = vi.mocked(apiService.get).mock.calls;
        const hasGroupBCall = calls.some((call) =>
          (call[0] as string).includes(`group_id=${groupB.id}`),
        );
        expect(hasGroupBCall).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 9: No active group — no group_id appended
  // -------------------------------------------------------------------------
  describe("Scenario 9 – no active group", () => {
    it("does not include group_id when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: mockQueueResponse,
        message: undefined,
      });

      const { result } = renderHook(() => useReviewQueue(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const queueCalls = vi
        .mocked(apiService.get)
        .mock.calls.filter((call) =>
          (call[0] as string).includes("/hitl/queue"),
        );
      queueCalls.forEach((call) => {
        expect(call[0]).not.toContain("group_id");
      });
    });

    it("returns empty queue state when active group has no items", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: { documents: [], total: 0 },
        message: undefined,
      });

      const { result } = renderHook(() => useReviewQueue(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.queue).toEqual([]);
      expect(result.current.total).toBe(0);
    });
  });
});
