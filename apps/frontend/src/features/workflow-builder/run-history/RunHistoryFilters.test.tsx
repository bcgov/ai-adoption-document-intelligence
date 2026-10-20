/**
 * Tests for `RunHistoryFilters` (US-153 — Scenario 4).
 *
 * Verifies:
 *   - the four inputs render
 *   - "all" status selection clears `filters.status` (no query param)
 *   - selecting a concrete status surfaces it on the onChange payload
 *   - the version `<Select>` is populated from `useWorkflowVersions`
 *   - "all" version selection clears `filters.workflowVersionId`
 *   - From / To cover the viewer's own local day, checked in a timezone
 *     west of UTC
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  dateStringToIso,
  isoToDateString,
  RunHistoryFilters,
} from "./RunHistoryFilters";
import type { ListRunsFilters } from "./useWorkflowRuns";

vi.mock("../../../data/hooks/useWorkflows", () => ({
  useWorkflowVersions: vi.fn(),
}));

import { useWorkflowVersions } from "../../../data/hooks/useWorkflows";

const useWorkflowVersionsMock = useWorkflowVersions as unknown as ReturnType<
  typeof vi.fn
>;

describe("RunHistoryFilters (US-153 Scenario 4)", () => {
  beforeEach(() => {
    useWorkflowVersionsMock.mockReturnValue({
      data: [
        { id: "wv-3", versionNumber: 3, createdAt: "2026-05-23T00:00:00.000Z" },
        { id: "wv-2", versionNumber: 2, createdAt: "2026-05-22T00:00:00.000Z" },
        { id: "wv-1", versionNumber: 1, createdAt: "2026-05-21T00:00:00.000Z" },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderFilters(initial: ListRunsFilters = {}) {
    const onChange = vi.fn();
    render(
      <MantineProvider>
        <RunHistoryFilters
          workflowId="workflow-1"
          filters={initial}
          onChange={onChange}
        />
      </MantineProvider>,
    );
    return { onChange };
  }

  it("renders all four filter inputs", () => {
    renderFilters();
    expect(screen.getByTestId("run-history-filter-status")).toBeInTheDocument();
    expect(screen.getByTestId("run-history-filter-from")).toBeInTheDocument();
    expect(screen.getByTestId("run-history-filter-to")).toBeInTheDocument();
    expect(
      screen.getByTestId("run-history-filter-version"),
    ).toBeInTheDocument();
  });

  it("populates the version Select from useWorkflowVersions", () => {
    renderFilters();
    // Open the version Select to expose its options. The displayed
    // value defaults to "All versions" since `filters.workflowVersionId`
    // is undefined.
    const versionSelect = screen.getByTestId(
      "run-history-filter-version",
    ) as HTMLInputElement;
    expect(versionSelect.value).toBe("All versions");
    // Opening the dropdown surfaces the option labels.
    fireEvent.click(versionSelect);
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
  });

  it("clears filters.status when 'All statuses' is chosen", () => {
    // Same component contract: simulate the picked-option directly via
    // an `<input type="hidden">`-style React-test interaction. Mantine
    // exposes the chosen value through the `onChange` callback; we
    // verify the handler's pure logic by constructing the component
    // with a pre-populated `status` and asserting the displayed value.
    const { onChange } = renderFilters({ status: "succeeded" });
    // Open the dropdown and click "All statuses".
    const statusInput = screen.getByTestId("run-history-filter-status");
    fireEvent.click(statusInput);
    fireEvent.click(screen.getByText("All statuses"));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.status).toBeUndefined();
  });

  it("propagates a concrete status to onChange (no 'all' sentinel)", () => {
    const { onChange } = renderFilters();
    const statusInput = screen.getByTestId("run-history-filter-status");
    fireEvent.click(statusInput);
    fireEvent.click(screen.getByText("Succeeded"));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.status).toBe("succeeded");
  });

  it("clears filters.workflowVersionId when 'All versions' is chosen", () => {
    const { onChange } = renderFilters({ workflowVersionId: "wv-2" });
    const versionInput = screen.getByTestId("run-history-filter-version");
    fireEvent.click(versionInput);
    fireEvent.click(screen.getByText("All versions"));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.workflowVersionId).toBeUndefined();
  });
});

describe("RunHistoryFilters — From / To use the viewer's local day", () => {
  // Vancouver is UTC-7 on these dates, so a UTC day boundary would cut the
  // local afternoon in two.
  beforeAll(() => {
    vi.stubEnv("TZ", "America/Vancouver");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    useWorkflowVersionsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs in a timezone west of UTC", () => {
    expect(new Date("2026-10-19T12:00:00.000Z").getTimezoneOffset()).toBe(420);
  });

  it("From starts at local midnight and To ends at the local day's last millisecond", () => {
    expect(dateStringToIso("2026-10-19")).toBe("2026-10-19T07:00:00.000Z");
    expect(dateStringToIso("2026-10-19", { endOfDay: true })).toBe(
      "2026-10-20T06:59:59.999Z",
    );
  });

  it("keeps a run started at 17:01 local time inside that day", () => {
    // 17:01 Pacific on 19 Oct is already 20 Oct in UTC.
    const startedAt = new Date("2026-10-20T00:01:16.792Z").getTime();
    const from = dateStringToIso("2026-10-19");
    const to = dateStringToIso("2026-10-19", { endOfDay: true });
    if (from === undefined || to === undefined) throw new Error("no bounds");
    expect(startedAt).toBeGreaterThanOrEqual(new Date(from).getTime());
    expect(startedAt).toBeLessThanOrEqual(new Date(to).getTime());
    // ...and outside the next local day.
    const nextFrom = dateStringToIso("2026-10-20");
    if (nextFrom === undefined) throw new Error("no bound");
    expect(startedAt).toBeLessThan(new Date(nextFrom).getTime());
  });

  it("shows a stored bound as the local day it was picked from", () => {
    const from = dateStringToIso("2026-10-19");
    const to = dateStringToIso("2026-10-19", { endOfDay: true });
    expect(isoToDateString(from)).toBe("2026-10-19");
    expect(isoToDateString(to)).toBe("2026-10-19");
  });

  it("treats an empty or malformed date as no bound", () => {
    expect(dateStringToIso(null)).toBeUndefined();
    expect(dateStringToIso("")).toBeUndefined();
    expect(dateStringToIso("19/10/2026")).toBeUndefined();
    expect(isoToDateString(undefined)).toBeNull();
    expect(isoToDateString("not a date")).toBeNull();
  });

  it("picking a day in the From and To inputs sends that local day's bounds", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MantineProvider>
        <RunHistoryFilters
          workflowId="workflow-1"
          filters={{}}
          onChange={onChange}
        />
      </MantineProvider>,
    );

    fireEvent.change(screen.getByTestId("run-history-filter-from"), {
      target: { value: "2026-10-19" },
    });
    const afterFrom = onChange.mock.lastCall?.[0] as ListRunsFilters;
    expect(afterFrom.startedAfter).toBe("2026-10-19T07:00:00.000Z");

    rerender(
      <MantineProvider>
        <RunHistoryFilters
          workflowId="workflow-1"
          filters={afterFrom}
          onChange={onChange}
        />
      </MantineProvider>,
    );
    fireEvent.change(screen.getByTestId("run-history-filter-to"), {
      target: { value: "2026-10-19" },
    });
    const afterTo = onChange.mock.lastCall?.[0] as ListRunsFilters;
    expect(afterTo.startedAfter).toBe("2026-10-19T07:00:00.000Z");
    expect(afterTo.startedBefore).toBe("2026-10-20T06:59:59.999Z");
  });

  it("displays stored bounds as local days in the inputs", () => {
    render(
      <MantineProvider>
        <RunHistoryFilters
          workflowId="workflow-1"
          filters={{
            startedAfter: "2026-10-19T07:00:00.000Z",
            startedBefore: "2026-10-20T06:59:59.999Z",
          }}
          onChange={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(
      (screen.getByTestId("run-history-filter-from") as HTMLInputElement).value,
    ).toBe("2026-10-19");
    expect(
      (screen.getByTestId("run-history-filter-to") as HTMLInputElement).value,
    ).toBe("2026-10-19");
  });
});
