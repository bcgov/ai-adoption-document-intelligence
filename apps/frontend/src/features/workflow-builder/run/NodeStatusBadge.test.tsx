/**
 * Unit tests for `NodeStatusBadge` + `useNodeRunStatus` (US-138).
 *
 * Scenario 1: each status → expected (icon, color) combination.
 * Scenario 6: integration test exercising `useNodeRunStatus` via a
 * stubbed `RunStateProvider`.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import {
  GroupAggregateStatusBadgeOverlay,
  NodeStatusBadge,
  NodeStatusBadgeOverlay,
} from "./NodeStatusBadge";
import type { NodeStatusesMap } from "./node-status.types";
import {
  buildRunStateContextValue,
  RunStateTestProvider,
  useNodeRunStatus,
} from "./RunStateContext";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function renderBadge(status: Parameters<typeof NodeStatusBadge>[0]["status"]) {
  return render(
    <MantineProvider>
      <NodeStatusBadge status={status} />
    </MantineProvider>,
  );
}

/**
 * Each status maps to a (color, iconLookup) pair. `iconLookup` is the
 * CSS class fragment that Tabler stamps on the rendered `<svg>`
 * (`tabler-icon-circle` / `tabler-icon-circle-check` / etc.). For
 * `running` we render Mantine's `<Loader>` — no Tabler class — and
 * detect that path via the loader role instead.
 */
const STATUS_CASES = [
  {
    status: "pending" as const,
    color: "gray",
    iconClass: "tabler-icon-circle",
  },
  // `running` rendered as <Loader>, asserted separately.
  {
    status: "succeeded" as const,
    color: "green",
    iconClass: "tabler-icon-check",
  },
  {
    status: "failed" as const,
    color: "red",
    iconClass: "tabler-icon-x",
  },
  {
    status: "skipped" as const,
    color: "violet",
    iconClass: "tabler-icon-bolt",
  },
];

// ---------------------------------------------------------------------------
// Scenario 1 — icon + color per status
// ---------------------------------------------------------------------------

describe("NodeStatusBadge — Scenario 1: icon + color per status", () => {
  for (const { status, color, iconClass } of STATUS_CASES) {
    it(`renders ${status} as ${iconClass} in ${color}`, () => {
      renderBadge(status);
      const badge = screen.getByTestId("node-status-badge");
      expect(badge.getAttribute("data-status")).toBe(status);
      expect(badge.getAttribute("data-color")).toBe(color);
      const svg = badge.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("class") ?? "").toContain(iconClass);
    });
  }

  /**
   * Regression guard for the 2026-08-06 legibility fix. `succeeded` and
   * `failed` used `IconCircleCheck` / `IconCircleX`, which draw their own ring
   * INSIDE the badge's filled disc — two concentric circles, and at that size
   * the glyph that carries the meaning disappeared. Anyone reaching for a
   * circle-wrapped variant again should fail here rather than in a review.
   */
  it.each([
    "succeeded",
    "failed",
  ] as const)("draws %s with a bare glyph — the filled disc is the only circle", (status) => {
    renderBadge(status);
    const badge = screen.getByTestId("node-status-badge");
    expect(badge.querySelector(".tabler-icon-circle-check")).toBeNull();
    expect(badge.querySelector(".tabler-icon-circle-x")).toBeNull();
  });

  it("shows the failure reason as a hover tooltip on a failed badge", async () => {
    const { default: userEventDefault } = await import(
      "@testing-library/user-event"
    );
    const user = userEventDefault.setup();
    render(
      <MantineProvider>
        <NodeStatusBadge
          status="failed"
          errorMessage="Blob not found: seeddefaultgroup/uploads/x.png"
        />
      </MantineProvider>,
    );
    const badge = screen.getByTestId("node-status-badge");
    expect(badge.getAttribute("data-status")).toBe("failed");
    await user.hover(badge);
    // Tooltip renders the message into a portal on hover.
    expect(
      await screen.findByText(/Blob not found/, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
  });

  it("does not attach an error tooltip to a succeeded badge", () => {
    render(
      <MantineProvider>
        <NodeStatusBadge status="succeeded" errorMessage="ignored" />
      </MantineProvider>,
    );
    expect(screen.queryByText("ignored")).toBeNull();
  });

  it("renders running as a Mantine Loader in blue (no Tabler icon)", () => {
    renderBadge("running");
    const badge = screen.getByTestId("node-status-badge");
    expect(badge.getAttribute("data-status")).toBe("running");
    expect(badge.getAttribute("data-color")).toBe("blue");
    // Mantine's <Loader> uses span elements with class `mantine-Loader-root`.
    const loaderEl = badge.querySelector(".mantine-Loader-root");
    expect(loaderEl).not.toBeNull();
    // Defence in depth — no Tabler icon class smuggled in.
    expect(badge.querySelector(".tabler-icon-check")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — useNodeRunStatus integration through RunStateProvider
// ---------------------------------------------------------------------------

describe("useNodeRunStatus — Scenario 6: integration via stubbed provider", () => {
  it("returns the live entry for a node id present in the map", () => {
    const statuses: NodeStatusesMap = {
      "node-1": { status: "running", startedAt: "2026-05-24T12:00:00.000Z" },
      "node-2": {
        status: "succeeded",
        startedAt: "2026-05-24T12:00:00.000Z",
        endedAt: "2026-05-24T12:00:01.500Z",
      },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <RunStateTestProvider
        value={buildRunStateContextValue({
          activeRunId: "run-xyz",
          nodeStatuses: statuses,
        })}
      >
        {children}
      </RunStateTestProvider>
    );

    const { result } = renderHook(() => useNodeRunStatus("node-1"), {
      wrapper,
    });
    expect(result.current.status).toBe("running");
    expect(result.current.startedAt).toBe("2026-05-24T12:00:00.000Z");
  });

  it("returns { status: 'pending' } for a node id absent from the map", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RunStateTestProvider
        value={buildRunStateContextValue({
          activeRunId: "run-xyz",
          nodeStatuses: {},
        })}
      >
        {children}
      </RunStateTestProvider>
    );
    const { result } = renderHook(() => useNodeRunStatus("nope"), { wrapper });
    expect(result.current.status).toBe("pending");
    expect(result.current.startedAt).toBeUndefined();
  });

  it("soft-fails to { status: 'pending' } outside any provider", () => {
    const { result } = renderHook(() => useNodeRunStatus("anything"));
    expect(result.current.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// Idle-badge suppression — the run-status badge is meaningful only while a
// run (or replay) is active. At design time (no run kicked off) every node
// would otherwise show the gray "pending" placeholder, cluttering the canvas
// and colliding with the validation badge in the same corner. The overlays
// render nothing until `activeRunId` is set.
// ---------------------------------------------------------------------------

function renderInProvider(
  ui: ReactNode,
  value: Parameters<typeof buildRunStateContextValue>[0],
) {
  return render(
    <MantineProvider>
      <RunStateTestProvider value={buildRunStateContextValue(value)}>
        {ui}
      </RunStateTestProvider>
    </MantineProvider>,
  );
}

describe("NodeStatusBadgeOverlay — idle suppression", () => {
  it("renders nothing when no run is active (activeRunId null)", () => {
    renderInProvider(<NodeStatusBadgeOverlay nodeId="n1" />, {
      activeRunId: null,
      nodeStatuses: {},
    });
    expect(screen.queryByTestId("node-status-badge")).toBeNull();
    expect(screen.queryByTestId("node-status-badge-wrapper-n1")).toBeNull();
  });

  it("renders the badge once a run is active", () => {
    renderInProvider(<NodeStatusBadgeOverlay nodeId="n1" />, {
      activeRunId: "run-1",
      nodeStatuses: { n1: { status: "running" } },
    });
    const badge = screen.getByTestId("node-status-badge");
    expect(badge.getAttribute("data-status")).toBe("running");
  });

  it("renders nothing outside any provider (isolated renderer, no run)", () => {
    render(
      <MantineProvider>
        <NodeStatusBadgeOverlay nodeId="n1" />
      </MantineProvider>,
    );
    expect(screen.queryByTestId("node-status-badge")).toBeNull();
  });
});

describe("GroupAggregateStatusBadgeOverlay — idle suppression", () => {
  it("renders nothing when no run is active", () => {
    renderInProvider(
      <GroupAggregateStatusBadgeOverlay memberIds={["a", "b"]} />,
      { activeRunId: null, nodeStatuses: {} },
    );
    expect(screen.queryByTestId("node-status-badge")).toBeNull();
  });

  it("renders the aggregate badge once a run is active", () => {
    renderInProvider(
      <GroupAggregateStatusBadgeOverlay memberIds={["a", "b"]} />,
      {
        activeRunId: "run-1",
        nodeStatuses: {
          a: { status: "running" },
          b: { status: "pending" },
        },
      },
    );
    const badge = screen.getByTestId("node-status-badge");
    expect(badge.getAttribute("data-status")).toBe("running");
  });
});
