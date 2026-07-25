/**
 * G-004 — the replay version pin.
 *
 * Replay renders the graph the run executed against, so the pin must be set
 * on entry and, critically, dropped on EVERY exit path. There are three
 * (the top-bar "Clear", the Try tab's `setIsReplay(false)`, and the
 * cache-evicted re-run's `setActiveRunId(...)`), and a stranded pin would
 * leave the canvas on a historical graph with nothing saying so.
 */

import "@testing-library/jest-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  type RunStateContextValue,
  RunStateProvider,
  useRunState,
} from "./RunStateContext";

// The provider mounts `useNodeStatuses`, which would hit the network.
vi.mock("./useNodeStatuses", () => ({
  useNodeStatuses: () => ({ data: undefined }),
}));

function mountProvider(): { current: RunStateContextValue } {
  const captured = { current: null as unknown as RunStateContextValue };
  function Probe() {
    captured.current = useRunState();
    return null;
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RunStateProvider workflowId="wf-1">
        <Probe />
      </RunStateProvider>
    </QueryClientProvider>,
  );
  return captured;
}

describe("RunStateProvider — replay version pin", () => {
  it("startReplay pins the run and the version it ran against", () => {
    const ctx = mountProvider();
    act(() => {
      ctx.current.startReplay("run-1", { id: "v-2", versionNumber: 2 });
    });
    expect(ctx.current.activeRunId).toBe("run-1");
    expect(ctx.current.isReplay).toBe(true);
    expect(ctx.current.replayVersion).toEqual({ id: "v-2", versionNumber: 2 });
  });

  it("leaving replay via setIsReplay(false) drops the version pin", () => {
    const ctx = mountProvider();
    act(() => {
      ctx.current.startReplay("run-1", { id: "v-2", versionNumber: 2 });
    });
    act(() => {
      ctx.current.setIsReplay(false);
    });
    expect(ctx.current.isReplay).toBe(false);
    expect(ctx.current.replayVersion).toBeNull();
  });

  it("clearing the run drops both the replay flag and the version pin", () => {
    const ctx = mountProvider();
    act(() => {
      ctx.current.startReplay("run-1", { id: "v-2", versionNumber: 2 });
    });
    act(() => {
      ctx.current.setActiveRunId(null);
    });
    expect(ctx.current.activeRunId).toBeNull();
    expect(ctx.current.isReplay).toBe(false);
    expect(ctx.current.replayVersion).toBeNull();
  });

  it("starting a new live run out of a replay drops the version pin", () => {
    // The Try tab and the cache-evicted re-run both switch `activeRunId` to a
    // fresh run — that is a LIVE run against a different graph, so the
    // historical pin must not survive it.
    const ctx = mountProvider();
    act(() => {
      ctx.current.startReplay("run-1", { id: "v-2", versionNumber: 2 });
    });
    act(() => {
      ctx.current.setIsReplay(false);
      ctx.current.setActiveRunId("run-new");
    });
    expect(ctx.current.activeRunId).toBe("run-new");
    expect(ctx.current.isReplay).toBe(false);
    expect(ctx.current.replayVersion).toBeNull();
  });
});
