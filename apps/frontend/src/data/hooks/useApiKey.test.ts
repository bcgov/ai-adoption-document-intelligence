import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "../services/api.service";
import {
  useApiKey,
  useDeleteApiKey,
  useGenerateApiKey,
  useRegenerateApiKey,
} from "./useApiKey";

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
    delete: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeGroup = { id: "group-1", name: "Group One" };

const apiKeyInfo = {
  id: "key-abc",
  keyPrefix: "abcd1234",
  userEmail: "user@example.com",
  createdAt: "2026-01-01T00:00:00Z",
  lastUsed: null,
};

const generatedApiKey = { ...apiKeyInfo, key: "abcd1234somefullkey" };

/**
 * Creates a fresh QueryClient and returns a wrapper component for renderHook.
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1 – GET scoped to active group
  // -------------------------------------------------------------------------
  describe("Scenario 1 – GET is scoped to the active group", () => {
    it("includes activeGroup.id as a query param in the API request", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: { apiKey: apiKeyInfo },
        message: undefined,
      });

      const { result } = renderHook(() => useApiKey(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.get).toHaveBeenCalledWith(
        `/api-key?groupId=${activeGroup.id}`,
      );
    });

    it("includes activeGroup.id in the queryKey so it re-fetches on group change", () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: { apiKey: null },
        message: undefined,
      });

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      renderHook(() => useApiKey(), { wrapper });

      const queries = queryClient.getQueryCache().findAll();
      const queryKey = queries[0]?.queryKey;
      expect(queryKey).toEqual(["apiKey", activeGroup.id]);
    });

    it("returns the API key data from the response", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: { apiKey: apiKeyInfo },
        message: undefined,
      });

      const { result } = renderHook(() => useApiKey(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(apiKeyInfo);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5 – GET is blocked when no active group
  // -------------------------------------------------------------------------
  describe("Scenario 5 – GET is blocked when activeGroup is null", () => {
    it("does not call the API and remains in idle state when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      const { result } = renderHook(() => useApiKey(), {
        wrapper: createWrapper(),
      });

      // Allow any pending microtasks to resolve
      await new Promise((r) => setTimeout(r, 50));

      expect(apiService.get).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
    });
  });
});

describe("useGenerateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 2 – Generate uses the active group
  // -------------------------------------------------------------------------
  describe("Scenario 2 – generates an API key scoped to the active group", () => {
    it("includes activeGroup.id as groupId in the POST body without the caller providing it", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.post).mockResolvedValue({
        success: true,
        data: { apiKey: generatedApiKey },
        message: undefined,
      });

      const { result } = renderHook(() => useGenerateApiKey(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.post).toHaveBeenCalledWith("/api-key", {
        groupId: activeGroup.id,
      });
    });

    it("returns the generated key from the response", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.post).mockResolvedValue({
        success: true,
        data: { apiKey: generatedApiKey },
        message: undefined,
      });

      const { result } = renderHook(() => useGenerateApiKey(), {
        wrapper: createWrapper(),
      });

      const returned = await result.current.mutateAsync();
      expect(returned).toEqual(generatedApiKey);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5 – Generate is blocked when no active group
  // -------------------------------------------------------------------------
  describe("Scenario 5 – throws before calling API when activeGroup is null", () => {
    it("throws without calling the API when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      const { result } = renderHook(() => useGenerateApiKey(), {
        wrapper: createWrapper(),
      });

      await expect(result.current.mutateAsync()).rejects.toThrow(
        "No active group selected",
      );

      expect(apiService.post).not.toHaveBeenCalled();
    });
  });
});

describe("useDeleteApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 3 – Delete uses the key ID, not groupId
  // -------------------------------------------------------------------------
  describe("Scenario 3 – deletes API key by its ID", () => {
    it("calls DELETE with the key ID in the query param", async () => {
      vi.mocked(apiService.delete).mockResolvedValue({
        success: true,
        data: undefined,
        message: undefined,
      });

      const { result } = renderHook(() => useDeleteApiKey(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync("key-abc");

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.delete).toHaveBeenCalledWith("/api-key?id=key-abc");
    });

    it("throws on API failure", async () => {
      vi.mocked(apiService.delete).mockResolvedValue({
        success: false,
        data: undefined,
        message: "Delete failed",
      });

      const { result } = renderHook(() => useDeleteApiKey(), {
        wrapper: createWrapper(),
      });

      await expect(result.current.mutateAsync("key-abc")).rejects.toThrow(
        "Delete failed",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 6 – Caller does not pass groupId
  // -------------------------------------------------------------------------
  describe("Scenario 6 – caller provides only key ID, no groupId", () => {
    it("does not require or use activeGroup from context", async () => {
      // useDeleteApiKey should not call useGroup at all
      mockUseGroup.mockReturnValue({ activeGroup: null });
      vi.mocked(apiService.delete).mockResolvedValue({
        success: true,
        data: undefined,
        message: undefined,
      });

      const { result } = renderHook(() => useDeleteApiKey(), {
        wrapper: createWrapper(),
      });

      // Should succeed even with null activeGroup since the hook only needs keyId
      await result.current.mutateAsync("key-abc");

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.delete).toHaveBeenCalledWith("/api-key?id=key-abc");
    });
  });
});

describe("useRegenerateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 4 – Regenerate uses the key ID, not groupId
  // -------------------------------------------------------------------------
  describe("Scenario 4 – regenerates API key by its ID", () => {
    it("calls POST /api-key/regenerate with the key ID in the body", async () => {
      vi.mocked(apiService.post).mockResolvedValue({
        success: true,
        data: { apiKey: generatedApiKey },
        message: undefined,
      });

      const { result } = renderHook(() => useRegenerateApiKey(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync("key-abc");

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.post).toHaveBeenCalledWith("/api-key/regenerate", {
        id: "key-abc",
      });
    });

    it("returns the regenerated key from the response", async () => {
      vi.mocked(apiService.post).mockResolvedValue({
        success: true,
        data: { apiKey: generatedApiKey },
        message: undefined,
      });

      const { result } = renderHook(() => useRegenerateApiKey(), {
        wrapper: createWrapper(),
      });

      const returned = await result.current.mutateAsync("key-abc");
      expect(returned).toEqual(generatedApiKey);
    });

    it("throws on API failure", async () => {
      vi.mocked(apiService.post).mockResolvedValue({
        success: false,
        data: undefined,
        message: "Regenerate failed",
      });

      const { result } = renderHook(() => useRegenerateApiKey(), {
        wrapper: createWrapper(),
      });

      await expect(result.current.mutateAsync("key-abc")).rejects.toThrow(
        "Regenerate failed",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 6 – Caller does not pass groupId
  // -------------------------------------------------------------------------
  describe("Scenario 6 – caller provides only key ID, no groupId", () => {
    it("does not require or use activeGroup from context", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });
      vi.mocked(apiService.post).mockResolvedValue({
        success: true,
        data: { apiKey: generatedApiKey },
        message: undefined,
      });

      const { result } = renderHook(() => useRegenerateApiKey(), {
        wrapper: createWrapper(),
      });

      // Should succeed even with null activeGroup since the hook only needs keyId
      await result.current.mutateAsync("key-abc");

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.post).toHaveBeenCalledWith("/api-key/regenerate", {
        id: "key-abc",
      });
    });
  });
});
