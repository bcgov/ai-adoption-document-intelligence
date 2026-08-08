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
 * UX walkthrough 2026-07-29 — rows highlighted on hover but nothing
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
 * P-2 (Alex review 2026-08-02) — Name was squeezed into a narrow column
 * while Description ran as one long truncated line. Name and Description
 * now carry explicit widths and the description wraps to two lines, which
 * keeps rows short without hiding half the sentence.
 */
describe("WorkflowListPage — column widths", () => {
  let apiMock: ApiServiceMock;

  const LONG_DESCRIPTION =
    "Splits an incoming PDF into per-document segments, classifies each " +
    "one against the configured taxonomy, and stores the extracted fields " +
    "alongside the original blob for review.";

  beforeEach(() => {
    apiMock = apiService as unknown as ApiServiceMock;
    apiMock.get.mockReset();
    apiMock.get.mockResolvedValue({
      success: true,
      data: {
        workflows: [
          {
            id: "wf-1",
            name: "Split, classify and store incoming correspondence",
            slug: "split-classify-store",
            description: LONG_DESCRIPTION,
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

  it("clamps the description to two lines rather than one", async () => {
    renderPage();
    const description = await screen.findByTestId("workflow-description");
    expect(description).toHaveTextContent(LONG_DESCRIPTION);
    expect(description.style.getPropertyValue("-webkit-line-clamp")).toBe("2");
  });

  it("S-2: Name carries no width, so it absorbs whatever is left", async () => {
    renderPage();
    await screen.findByTestId("workflow-description");
    const nameHeader = screen.getByRole("columnheader", { name: "Name" });
    const slugHeader = screen.getByRole("columnheader", { name: "Slug" });
    const descriptionHeader = screen.getByRole("columnheader", {
      name: "Description",
    });
    // Under `table-layout: fixed` the one unsized column takes the remainder,
    // which is how Name stays the widest column at every viewport without a
    // percentage that has to be re-tuned each time another column changes.
    expect(nameHeader.style.width).toBe("");
    expect(slugHeader).toHaveStyle({ width: "12%" });
    expect(descriptionHeader).toHaveStyle({ width: "13%" });
  });

  /**
   * Item 18, Inderdeep UX review 2026-08-06 — *"the delete icon is outside of
   * this row and it's truncated … I'm at full view, I'm not zoomed in or
   * zoomed out."*
   *
   * Cause, measured in Chromium at a 1280px viewport: the actions column was
   * `4%`, i.e. 39px, while its contents are two 52px BC DS icon buttons with a
   * 4px gap inside 16px of cell padding either side — 140px that does not
   * shrink. The delete button ended 85px past the row and the table wrapper
   * grew a horizontal scrollbar (scrollWidth 1056 against clientWidth 972).
   *
   * jsdom performs no table layout, so it cannot see the overflow itself. What
   * it CAN hold is the rule the overflow broke: the actions column is sized in
   * pixels, not in a percentage of a width nobody controls, and the sized
   * columns leave room for Name. The browser measurements are the real
   * evidence and are recorded in the batch-nine worklog.
   */
  it("item 18: the actions column is pixel-sized, not a percentage", async () => {
    renderPage();
    await screen.findByTestId("workflow-description");
    const headers = screen.getAllByRole("columnheader");
    const actionsHeader = headers[headers.length - 1];
    expect(actionsHeader).toHaveTextContent("");
    // Mantine renders numeric style props as `calc(<rem> * --mantine-scale)`;
    // 8.75rem is 140px at the 16px root, the measured width of the two icon
    // buttons plus the cell padding either side.
    expect(actionsHeader.style.width).toContain("8.75rem");
    expect(actionsHeader.style.width).not.toContain("%");
  });

  it("item 18: the percentage columns leave room for Name", async () => {
    renderPage();
    await screen.findByTestId("workflow-description");
    const percentTotal = screen
      .getAllByRole("columnheader")
      .map((header) => header.style.width)
      .filter((width) => width.endsWith("%"))
      .reduce((sum, width) => sum + Number.parseFloat(width), 0);
    // The old widths summed to 100%, which left the actions column its 4% and
    // Name nothing to grow into. Slug and Description are now the only
    // percentages, and they have to leave the remainder for Name.
    expect(percentTotal).toBeLessThan(50);
  });

  it("item 18: the table has a floor so Name cannot collapse", async () => {
    renderPage();
    await screen.findByTestId("workflow-description");
    // A `min-width` on a CELL is ignored under fixed layout — only `width`
    // counts — so this has to sit on the table, where the layout algorithm
    // reads it. Below it the wrapper's `overflow-x: auto` scrolls instead of
    // crushing Name to a stack of single words.
    // 58.125rem is 930px: the 496px of pixel columns plus 25% for Slug and
    // Description leaves Name 0.75W − 496, which reaches 200px at W = 928.
    expect(screen.getByRole("table").style.minWidth).toContain("58.125rem");
  });

  // S-2 — the percentages above only bind under `table-layout: fixed`. With
  // the browser default (`auto`) content wins, and the widest content is the
  // nowrap slug: measured in a browser with 28 workflows, the slug column took
  // 495px against Name's 154px. jsdom computes no table layout, so this
  // asserts the property rather than the resulting widths.
  it("S-2: the table uses a fixed layout so the widths bind", async () => {
    renderPage();
    await screen.findByTestId("workflow-description");
    const table = screen.getByRole("table");
    // Mantine drives `table-layout` through a CSS variable rather than an
    // inline style, so that is what the DOM carries.
    expect(table.style.getPropertyValue("--table-layout")).toBe("fixed");
  });

  it("S-2: the name reads as the primary column", async () => {
    renderPage();
    const link = await screen.findByTestId("workflow-name-link");
    expect(link).toHaveStyle({ fontWeight: "600" });
  });

  // Caught in a browser, not here. Widening Name and Description squeezed
  // Slug, and a slug is ONE unbreakable token — the browser broke it anywhere
  // rather than overflow, so a long slug became four or five lines and rows
  // ended up TALLER than before the clamp that was meant to shorten them.
  // Row heights went from ~145px back to ~116px once the slug stopped
  // wrapping. jsdom lays nothing out, so only the width and the nowrap rule
  // are checkable here.
  it("keeps the slug on one line so it cannot inflate the row", async () => {
    renderPage();
    const slug = await screen.findByTestId("workflow-slug");
    expect(slug).toHaveStyle({ whiteSpace: "nowrap" });
    expect(slug).toHaveStyle({ textOverflow: "ellipsis" });
    // Truncated text still has to be recoverable.
    expect(slug).toHaveAttribute("title");
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
