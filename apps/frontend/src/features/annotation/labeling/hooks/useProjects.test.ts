import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/data/services/api.service";
import { useProjects } from "./useProjects";

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

const newProject = {
  id: "proj-1",
  name: "Test Project",
  description: "A test project",
  status: "active",
  created_by: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  field_schema: [],
};

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

describe("useProjects – createProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiService.get).mockResolvedValue({ data: [], success: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: group_id is injected automatically from activeGroup
  // -------------------------------------------------------------------------
  describe("Scenario 1 – group_id is injected automatically from activeGroup", () => {
    it("includes activeGroup.id as group_id in the POST body without the caller providing it", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.post).mockResolvedValue({
        data: newProject,
        success: true,
      });

      const { result } = renderHook(() => useProjects(), {
        wrapper: createWrapper(),
      });

      await result.current.createProjectAsync({
        name: "Test Project",
        description: "A test project",
      });

      await waitFor(() => {
        expect(result.current.isCreating).toBe(false);
      });

      expect(apiService.post).toHaveBeenCalledWith("/labeling/projects", {
        name: "Test Project",
        description: "A test project",
        group_id: activeGroup.id,
      });
    });

    it("returns the project returned by the API", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.post).mockResolvedValue({
        data: newProject,
        success: true,
      });

      const { result } = renderHook(() => useProjects(), {
        wrapper: createWrapper(),
      });

      const returned = await result.current.createProjectAsync({
        name: "Test Project",
      });

      expect(returned).toEqual(newProject);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: error is returned before API call when no active group
  // -------------------------------------------------------------------------
  describe("Scenario 2 – error returned before API call when activeGroup is null", () => {
    it("throws an error without calling the API when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      const { result } = renderHook(() => useProjects(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.createProjectAsync({
          name: "Test Project",
        }),
      ).rejects.toThrow("No active group selected");

      expect(apiService.post).not.toHaveBeenCalled();
    });
  });
});
