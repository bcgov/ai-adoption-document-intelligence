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

import { NodeStatusBadge } from "./NodeStatusBadge";
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
    iconClass: "tabler-icon-circle-check",
  },
  {
    status: "failed" as const,
    color: "red",
    iconClass: "tabler-icon-circle-x",
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

  it("renders running as a Mantine Loader in blue (no Tabler icon)", () => {
    renderBadge("running");
    const badge = screen.getByTestId("node-status-badge");
    expect(badge.getAttribute("data-status")).toBe("running");
    expect(badge.getAttribute("data-color")).toBe("blue");
    // Mantine's <Loader> uses span elements with class `mantine-Loader-root`.
    const loaderEl = badge.querySelector(".mantine-Loader-root");
    expect(loaderEl).not.toBeNull();
    // Defence in depth — no Tabler icon class smuggled in.
    expect(badge.querySelector(".tabler-icon-circle-check")).toBeNull();
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
