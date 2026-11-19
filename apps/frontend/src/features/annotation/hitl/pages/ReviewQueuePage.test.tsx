import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "../../../../ui";
import { ReviewQueuePage } from "./ReviewQueuePage";

// Each tab's document count, keyed by the reviewStatus the page asks for.
let totals: Record<string, number> = {};
// The active group's models and workflows, and the filters the page last asked
// for per tab.
let models: string[] = [];
let workflows: { id: string; name: string }[] = [];
let lastFilters: Record<string, { modelId?: string; workflowId?: string }> = {};

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => vi.fn(),
}));
vi.mock("../../../../data/hooks/useModels", () => ({
  useModels: () => ({ data: models }),
}));
vi.mock("../../../../data/hooks/useWorkflows", () => ({
  useWorkflows: () => ({ data: workflows }),
}));
vi.mock("../hooks/useReviewQueue", () => ({
  useReviewQueue: (filters: {
    reviewStatus: string;
    modelId?: string;
    workflowId?: string;
  }) => {
    lastFilters[filters.reviewStatus] = filters;
    return {
      queue: [],
      total: totals[filters.reviewStatus] ?? 0,
      stats: undefined,
      isLoading: false,
      error: null,
      startSession: vi.fn(),
      startSessionAsync: vi.fn(),
      isStartingSession: false,
    };
  },
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
    models = [];
    lastFilters = {};
  });

  it("hides the pager on a tab that fits on one page, and on an empty one", () => {
    totals = { pending: 50 };
    render(page());

    expect(
      screen.queryByRole("button", { name: "Next page" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Claimed by you/ }));
    expect(
      screen.queryByRole("button", { name: "Next page" }),
    ).not.toBeInTheDocument();
  });

  it("shows numbered pages under the table once a tab spans more than one page", () => {
    totals = { pending: 51 };
    render(page());

    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const next = screen.getByRole("button", { name: "Next page" });
    expect(
      screen.getByRole("tabpanel").compareDocumentPosition(next) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(next);
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("steps back to the last page when the tab shrinks under the reader", () => {
    totals = { pending: 120 };
    const { rerender } = render(page());

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    totals = { pending: 70 };
    rerender(page());
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("ReviewQueuePage model filter", () => {
  beforeEach(() => {
    totals = {};
    models = [];
    lastFilters = {};
  });

  it("stops filtering by a model the active group's list no longer contains", async () => {
    models = ["model-a"];
    const { rerender } = render(page());

    const modelInput = screen.getByPlaceholderText("All models");
    fireEvent.focus(modelInput);
    fireEvent.change(modelInput, { target: { value: "model-a" } });
    await waitFor(() => screen.getByText("model-a"));
    fireEvent.click(screen.getByText("model-a"));
    expect(lastFilters.pending.modelId).toBe("model-a");

    // Switching groups swaps the model list.
    models = ["model-c"];
    rerender(page());

    expect(lastFilters.pending.modelId).toBeUndefined();
  });
});

describe("ReviewQueuePage workflow filter", () => {
  beforeEach(() => {
    totals = {};
    models = [];
    workflows = [];
    lastFilters = {};
  });

  it("stops filtering by a workflow the active group's list no longer contains", async () => {
    // Every tab and its count come from its own query.
    const statuses = ["pending", "claimed", "reviewed", "flagged"];
    workflows = [{ id: "lineage-1", name: "Invoices" }];
    const { rerender } = render(page());

    const workflowInput = screen.getByPlaceholderText("All workflows");
    fireEvent.focus(workflowInput);
    fireEvent.change(workflowInput, { target: { value: "Invoices" } });
    await waitFor(() => screen.getByText("Invoices"));
    fireEvent.click(screen.getByText("Invoices"));
    for (const status of statuses) {
      expect(lastFilters[status].workflowId).toBe("lineage-1");
    }

    // Switching groups swaps the workflow list.
    workflows = [{ id: "lineage-2", name: "Receipts" }];
    rerender(page());

    for (const status of statuses) {
      expect(lastFilters[status].workflowId).toBeUndefined();
    }
  });
});
