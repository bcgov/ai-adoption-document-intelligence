/**
 * Tests for `RunHistoryDrawer` (US-153).
 *
 * Covers Scenarios 3 (drawer layout — loading / empty / error / list +
 * sentinel) and 4 (filters propagate to the hook's query key via
 * `onChange`). Hook + filter component are mocked so the drawer's render
 * contract is exercised in isolation from network code.
 *
 * Mirrors the mocking pattern of
 * `VersionHistoryDrawer.test.tsx` — the leaf hook is stubbed via
 * `vi.mock`, and we drive its return value per-scenario.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunHistoryDrawer } from "./RunHistoryDrawer";
import type {
  ApiError,
  ListRunsFilters,
  ListRunsResponse,
  RunSummary,
} from "./useWorkflowRuns";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture the live `filters` arg the drawer passed into the hook so the
// "filters propagate to hook" scenario can inspect changes after a
// `<RunHistoryFilters>` onChange fires.
const lastUseWorkflowRunsCall = {
  workflowId: "" as string,
  filters: {} as ListRunsFilters,
};

// Mocked hook return — tests overwrite per scenario via the helper
// `setHookReturn(...)` below.
let mockedHookReturn: {
  data:
    | { pages: ListRunsResponse[]; pageParams: Array<string | undefined> }
    | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  fetchNextPage: ReturnType<typeof vi.fn>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
};

const fetchNextPageMock = vi.fn();

function setHookReturn(partial: Partial<typeof mockedHookReturn>): void {
  mockedHookReturn = {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    fetchNextPage: fetchNextPageMock,
    hasNextPage: false,
    isFetchingNextPage: false,
    ...partial,
  };
}

vi.mock("./useWorkflowRuns", async () => {
  const actual =
    await vi.importActual<typeof import("./useWorkflowRuns")>(
      "./useWorkflowRuns",
    );
  return {
    ...actual,
    useWorkflowRuns: (workflowId: string, filters: ListRunsFilters) => {
      lastUseWorkflowRunsCall.workflowId = workflowId;
      lastUseWorkflowRunsCall.filters = filters;
      return mockedHookReturn;
    },
  };
});

// Replace `RunHistoryFilters` with a deterministic stub: clicking its
// "Force filter" button calls `onChange({ status: "succeeded" })`. The
// real filter component's `<Select>`/`<DateInput>` interactions are
// covered by `RunHistoryFilters.test.tsx`; here we only need to verify
// that whatever the filter component emits reaches the hook.
vi.mock("./RunHistoryFilters", () => ({
  RunHistoryFilters: ({
    workflowId,
    filters,
    onChange,
  }: {
    workflowId: string;
    filters: ListRunsFilters;
    onChange: (next: ListRunsFilters) => void;
  }) => (
    <div
      data-testid="filters-stub"
      data-workflow-id={workflowId}
      data-filter-status={filters.status ?? ""}
    >
      <button
        type="button"
        data-testid="filters-stub-force-status"
        onClick={() => onChange({ ...filters, status: "succeeded" })}
      >
        force status=succeeded
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleRuns: RunSummary[] = [
  {
    runId: "run-1",
    workflowVersionId: "wv-1",
    versionNumber: 1,
    status: "succeeded",
    startedAt: "2026-05-24T12:00:00.000Z",
  },
  {
    runId: "run-2",
    workflowVersionId: "wv-1",
    versionNumber: 1,
    status: "failed",
    startedAt: "2026-05-24T11:00:00.000Z",
  },
];

function renderDrawer(workflowId = "workflow-1") {
  return render(
    <MantineProvider>
      <RunHistoryDrawer
        workflowId={workflowId}
        onReplay={() => {
          /* no-op: covered by US-154's tests */
        }}
      />
    </MantineProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RunHistoryDrawer (US-153)", () => {
  beforeEach(() => {
    fetchNextPageMock.mockClear();
    lastUseWorkflowRunsCall.workflowId = "";
    lastUseWorkflowRunsCall.filters = {};
    setHookReturn({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 3 — loading
  // -------------------------------------------------------------------------
  it("Scenario 3: renders 3 Skeleton rows while loading", () => {
    setHookReturn({ isLoading: true });

    renderDrawer();

    const loading = screen.getByTestId("run-history-drawer-loading");
    expect(loading).toBeInTheDocument();
    expect(loading.children.length).toBeGreaterThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // Scenario 3 — empty
  // -------------------------------------------------------------------------
  it("Scenario 3: renders 'No runs match these filters.' when the list is empty", () => {
    setHookReturn({
      data: {
        pages: [{ runs: [], nextCursor: null }],
        pageParams: [undefined],
      },
    });

    renderDrawer();

    expect(screen.getByTestId("run-history-drawer-empty")).toHaveTextContent(
      "No runs match these filters.",
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 3 — error
  // -------------------------------------------------------------------------
  it("Scenario 3: renders a red Alert with the error message on query error", () => {
    setHookReturn({
      isError: true,
      error: Object.assign(new Error("Boom — backend down"), {
        status: 500,
        name: "ApiError",
      }) as unknown as ApiError,
    });

    renderDrawer();

    expect(screen.getByText("Failed to load runs")).toBeInTheDocument();
    expect(screen.getByText(/Boom — backend down/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Scenario 3 — list + "End of history"
  // -------------------------------------------------------------------------
  it("Scenario 3: renders a row per run and the 'End of history' marker when no next page", () => {
    setHookReturn({
      data: {
        pages: [{ runs: sampleRuns, nextCursor: null }],
        pageParams: [undefined],
      },
      hasNextPage: false,
    });

    renderDrawer();

    const list = screen.getByTestId("run-history-drawer-list");
    expect(within(list).getByTestId("run-row-run-1")).toBeInTheDocument();
    expect(within(list).getByTestId("run-row-run-2")).toBeInTheDocument();
    // No more pages → "End of history" marker present, sentinel absent.
    expect(screen.getByTestId("run-history-drawer-end")).toHaveTextContent(
      "End of history",
    );
    expect(
      screen.queryByTestId("run-history-drawer-sentinel"),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Scenario 3 + 5 — sentinel renders + IntersectionObserver triggers next page
  // -------------------------------------------------------------------------
  it("Scenario 5: renders the sentinel when hasNextPage and calls fetchNextPage when it intersects", () => {
    // Stub IntersectionObserver — capture the callback so the test can
    // simulate the sentinel scrolling into view.
    type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
    const callbackHolder: { current: IOCallback | null } = { current: null };
    const observeMock = vi.fn();
    const disconnectMock = vi.fn();
    class FakeIntersectionObserver {
      constructor(cb: IOCallback) {
        callbackHolder.current = cb;
      }
      observe = observeMock;
      disconnect = disconnectMock;
      unobserve = vi.fn();
      takeRecords = vi.fn();
    }
    const original = globalThis.IntersectionObserver;
    (
      globalThis as unknown as {
        IntersectionObserver: typeof FakeIntersectionObserver;
      }
    ).IntersectionObserver = FakeIntersectionObserver;

    try {
      setHookReturn({
        data: {
          pages: [{ runs: sampleRuns, nextCursor: "cursor-2" }],
          pageParams: [undefined],
        },
        hasNextPage: true,
      });

      renderDrawer();

      const sentinel = screen.getByTestId("run-history-drawer-sentinel");
      expect(sentinel).toBeInTheDocument();
      expect(observeMock).toHaveBeenCalledWith(sentinel);

      // Simulate the sentinel intersecting the viewport.
      expect(callbackHolder.current).not.toBeNull();
      callbackHolder.current?.([{ isIntersecting: true }]);
      expect(fetchNextPageMock).toHaveBeenCalledTimes(1);
    } finally {
      if (original) {
        (
          globalThis as unknown as { IntersectionObserver: typeof original }
        ).IntersectionObserver = original;
      }
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 4 — filter changes propagate to the hook
  // -------------------------------------------------------------------------
  it("Scenario 4: filter onChange updates the filters passed to the hook", () => {
    setHookReturn({
      data: {
        pages: [{ runs: [], nextCursor: null }],
        pageParams: [undefined],
      },
    });

    renderDrawer("workflow-1");

    // Initial render — filters object is empty.
    expect(lastUseWorkflowRunsCall.workflowId).toBe("workflow-1");
    expect(lastUseWorkflowRunsCall.filters).toEqual({});

    // Trigger the stub's forced onChange.
    fireEvent.click(screen.getByTestId("filters-stub-force-status"));

    // The drawer re-rendered with the new filters and called the hook
    // again — capture must now show the new status.
    expect(lastUseWorkflowRunsCall.filters.status).toBe("succeeded");
  });
});
