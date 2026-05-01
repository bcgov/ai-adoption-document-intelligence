import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/data/services/api.service";
import { useTables } from "./useTables";

vi.mock("@/data/services/api.service", () => ({
  apiService: {
    get: vi.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useTables", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches tables for the active group", async () => {
    const mockData = [
      {
        id: "t1",
        group_id: "g1",
        table_id: "t",
        label: "T",
        row_count: 0,
        updated_at: "2026-01-15T00:00:00Z",
      },
    ];
    vi.mocked(apiService.get).mockResolvedValue({
      data: mockData,
      success: true,
    });

    const { result } = renderHook(() => useTables("g1"), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(apiService.get).toHaveBeenCalledWith("/tables?group_id=g1");
  });

  it("does not fetch when groupId is null", () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: [], success: true });

    const { result } = renderHook(() => useTables(null), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiService.get).not.toHaveBeenCalled();
  });

  it("throws when API returns success=false", async () => {
    vi.mocked(apiService.get).mockResolvedValue({
      data: null as never,
      success: false,
      message: "permission denied",
    });

    const { result } = renderHook(() => useTables("g1"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({
      message: "permission denied",
    });
  });
});
