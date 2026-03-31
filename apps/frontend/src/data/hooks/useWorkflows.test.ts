import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphWorkflowConfig } from "../../types/workflow";
import { apiService } from "../services/api.service";
import { useCreateWorkflow, useWorkflows } from "./useWorkflows";

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
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeGroup = { id: "group-1", name: "Group One" };

const minimalConfig: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: { name: "Test Workflow", version: "1.0.0" },
  ctx: {},
  nodes: {
    start: {
      id: "start",
      type: "activity",
      label: "Start",
      activityType: "file.prepare",
      inputs: [],
      outputs: [],
    },
  },
  edges: [],
  entryNodeId: "start",
};

const createDto = {
  name: "Test Workflow",
  description: "A test workflow",
  config: minimalConfig,
};

const workflowInfo = {
  id: "workflow-1",
  name: "Test Workflow",
  description: "A test workflow",
  actorId: "user-1",
  config: minimalConfig,
  schemaVersion: "1.0",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
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

describe("useWorkflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Workflows scoped to active group
  // -------------------------------------------------------------------------
  describe("Scenario 1 – fetches with groupId when activeGroup is set", () => {
    it("includes groupId query param in the API request", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: { workflows: [workflowInfo] },
        message: undefined,
      });

      const { result } = renderHook(() => useWorkflows(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.get).toHaveBeenCalledWith(
        `/workflows?groupId=${activeGroup.id}`,
      );
      expect(result.current.data).toEqual([workflowInfo]);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Fetches all groups when no activeGroup
  // -------------------------------------------------------------------------
  describe("Scenario 4 – fetches without groupId when activeGroup is null", () => {
    it("omits groupId query param when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: { workflows: [workflowInfo] },
        message: undefined,
      });

      const { result } = renderHook(() => useWorkflows(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.get).toHaveBeenCalledWith("/workflows");
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: activeGroup.id is part of the query key
  // -------------------------------------------------------------------------
  describe("Scenario 2 – activeGroup.id is part of the query key", () => {
    it("includes activeGroup.id in the queryKey", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: { workflows: [] },
        message: undefined,
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      renderHook(() => useWorkflows(), { wrapper });

      await waitFor(() => {
        const cache = queryClient.getQueryCache().findAll();
        expect(
          cache.some(
            (q) =>
              JSON.stringify(q.queryKey) ===
              JSON.stringify(["workflows", activeGroup.id]),
          ),
        ).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Empty list shown when active group has no workflows
  // -------------------------------------------------------------------------
  describe("Scenario 5 – empty list when active group has no workflows", () => {
    it("returns an empty array without error when API returns no workflows", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.get).mockResolvedValue({
        success: true,
        data: { workflows: [] },
        message: undefined,
      });

      const { result } = renderHook(() => useWorkflows(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.isError).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------

describe("useCreateWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: groupId is injected automatically from activeGroup
  // -------------------------------------------------------------------------
  describe("Scenario 1 – groupId is injected from activeGroup", () => {
    it("includes activeGroup.id as groupId in the API request without the caller providing it", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.post).mockResolvedValue({
        success: true,
        data: { workflow: workflowInfo },
        message: undefined,
      });

      const { result } = renderHook(() => useCreateWorkflow(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync(createDto);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiService.post).toHaveBeenCalledWith("/workflows", {
        ...createDto,
        groupId: activeGroup.id,
      });
    });

    it("returns the workflow returned by the API", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });
      vi.mocked(apiService.post).mockResolvedValue({
        success: true,
        data: { workflow: workflowInfo },
        message: undefined,
      });

      const { result } = renderHook(() => useCreateWorkflow(), {
        wrapper: createWrapper(),
      });

      const returned = await result.current.mutateAsync(createDto);

      expect(returned).toEqual(workflowInfo);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: error is returned before API call when no active group
  // -------------------------------------------------------------------------
  describe("Scenario 2 – error when activeGroup is null", () => {
    it("throws an error without calling the API when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      const { result } = renderHook(() => useCreateWorkflow(), {
        wrapper: createWrapper(),
      });

      await expect(result.current.mutateAsync(createDto)).rejects.toThrow(
        "No active group selected",
      );

      expect(apiService.post).not.toHaveBeenCalled();
    });
  });
});
