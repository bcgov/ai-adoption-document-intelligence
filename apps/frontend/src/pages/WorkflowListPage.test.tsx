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
import { describeDeleteImpact, WorkflowListPage } from "./WorkflowListPage";

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

/**
 * Inderdeep walkthrough 2026-07-29 — rows highlighted on hover but nothing
 * was clickable; the only way in looked like "Edit". The name is now a real
 * link (href, hand cursor) into the workflow.
 */
describe("WorkflowListPage — workflow name link", () => {
  let apiMock: ApiServiceMock;

  beforeEach(() => {
    apiMock = apiService as unknown as ApiServiceMock;
    apiMock.get.mockReset();
    apiMock.get.mockResolvedValue({
      success: true,
      data: {
        workflows: [
          {
            id: "wf-1",
            name: "Standard OCR",
            slug: "standard-ocr",
            description: "",
            version: 3,
            config: { schemaVersion: "2.0" },
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-15T00:00:00.000Z",
          },
        ],
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the workflow name as a link that opens the editor", async () => {
    renderPage();
    const link = await screen.findByTestId("workflow-name-link");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/workflows/wf-1/edit");
    expect(link).toHaveTextContent("Standard OCR");
  });
});

/**
 * G-050 — the confirmation copy that names what deleting a workflow takes.
 *
 * The distinction it has to carry: documents are NOT deleted. Only the link
 * recording which graph version produced them is, and that is the part that
 * cannot be reconstructed afterwards.
 */
describe("describeDeleteImpact", () => {
  it("says plainly when nothing references the versions", () => {
    expect(describeDeleteImpact(3, 0)).toBe(
      "3 saved versions will be deleted. No documents reference them.",
    );
  });

  it("never claims the documents are deleted", () => {
    const copy = describeDeleteImpact(4, 233);
    expect(copy).toContain("keep their data");
    expect(copy).toContain("lose the record of which version produced them");
    expect(copy).not.toMatch(/documents will be deleted/);
  });

  it("agrees in number for a single version and a single document", () => {
    const copy = describeDeleteImpact(1, 1);
    expect(copy).toContain("1 saved version will be deleted");
    expect(copy).toContain("1 document processed by this workflow keeps its");
  });
});
