/**
 * Tests for WorkflowListPage — focused on the US-074 kind-filter
 * SegmentedControl.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "../data/services/api.service";
import { WorkflowListPage } from "./WorkflowListPage";

vi.mock("../data/services/api.service", () => ({
  apiService: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../auth/GroupContext", () => ({
  useGroup: () => ({
    activeGroup: { id: "group-1", name: "Test Group" },
    groups: [{ id: "group-1", name: "Test Group" }],
    setActiveGroup: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <MemoryRouter>
          <WorkflowListPage />
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
};

interface ApiServiceMock {
  get: ReturnType<typeof vi.fn>;
}

describe("WorkflowListPage — US-074 kind filter", () => {
  let apiMock: ApiServiceMock;

  beforeEach(() => {
    apiMock = apiService as unknown as ApiServiceMock;
    apiMock.get.mockReset();
    apiMock.get.mockResolvedValue({
      success: true,
      data: { workflows: [] },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to the Workflows tab (no kind query param)", async () => {
    renderPage();
    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalled();
    });
    // Initial call should NOT include kind= in the URL
    const initialUrl = apiMock.get.mock.calls[0][0] as string;
    expect(initialUrl).toContain("groupId=group-1");
    expect(initialUrl).not.toContain("kind=");
  });

  it("switching to Libraries adds kind=library to the request", async () => {
    renderPage();
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    apiMock.get.mockClear();

    fireEvent.click(screen.getByText("Libraries"));

    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    const url = apiMock.get.mock.calls[0][0] as string;
    expect(url).toContain("kind=library");
  });

  it("switching to All adds kind=all to the request", async () => {
    renderPage();
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    apiMock.get.mockClear();

    fireEvent.click(screen.getByText("All"));

    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    const url = apiMock.get.mock.calls[0][0] as string;
    expect(url).toContain("kind=all");
  });
});
