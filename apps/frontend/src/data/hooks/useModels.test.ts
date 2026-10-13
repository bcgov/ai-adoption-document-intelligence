import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "../services/api.service";
import { useModels } from "./useModels";

const mockUseGroup = vi.fn();

vi.mock("../../auth/GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

vi.mock("../services/api.service", () => ({
  apiService: {
    get: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the models of the active group", async () => {
    mockUseGroup.mockReturnValue({
      activeGroup: { id: "group-abc", name: "Test Group" },
    });
    vi.mocked(apiService.get).mockResolvedValue({
      success: true,
      data: { models: ["invoice", "prebuilt-layout"] },
    });

    const { result } = renderHook(() => useModels(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiService.get).toHaveBeenCalledWith("/models?group_id=group-abc");
    expect(result.current.data).toEqual(["invoice", "prebuilt-layout"]);
  });

  it("requests nothing until a group is active", () => {
    mockUseGroup.mockReturnValue({ activeGroup: null });

    renderHook(() => useModels(), { wrapper: createWrapper() });

    expect(apiService.get).not.toHaveBeenCalled();
  });
});
