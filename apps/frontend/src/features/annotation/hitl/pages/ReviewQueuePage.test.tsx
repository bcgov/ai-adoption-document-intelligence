import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "../../../../ui";
import { ReviewQueuePage } from "./ReviewQueuePage";

// Each tab's document count, keyed by the reviewStatus the page asks for.
let totals: Record<string, number> = {};

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => vi.fn(),
}));
vi.mock("../../../../data/hooks/useModels", () => ({
  useModels: () => ({ data: [] }),
}));
vi.mock("../../../../data/hooks/useWorkflows", () => ({
  useWorkflows: () => ({ data: [] }),
}));
vi.mock("../hooks/useReviewQueue", () => ({
  useReviewQueue: (filters: { reviewStatus: string }) => ({
    queue: [],
    total: totals[filters.reviewStatus] ?? 0,
    stats: undefined,
    isLoading: false,
    error: null,
    startSession: vi.fn(),
    startSessionAsync: vi.fn(),
    isStartingSession: false,
  }),
}));

// A new element each time, so a rerender reaches the page.
const page = () => (
  <MantineProvider>
    <ReviewQueuePage />
  </MantineProvider>
);

describe("ReviewQueuePage pager", () => {
  beforeEach(() => {
    totals = {};
  });

  it("hides the pager on a tab that fits on one page, and on an empty one", () => {
    totals = { pending: 50 };
    render(page());

    expect(screen.queryByText(/Page \d+ of/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Claimed by you/ }));
    expect(screen.queryByText(/Page \d+ of/)).not.toBeInTheDocument();
  });

  it("shows the pager once a tab spans more than one page", () => {
    totals = { pending: 51 };
    render(page());

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("steps back to the last page when the tab shrinks under the reader", () => {
    totals = { pending: 120 };
    const { rerender } = render(page());

    fireEvent.click(screen.getByRole("button", { name: "Last" }));
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();

    totals = { pending: 70 };
    rerender(page());
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });
});
