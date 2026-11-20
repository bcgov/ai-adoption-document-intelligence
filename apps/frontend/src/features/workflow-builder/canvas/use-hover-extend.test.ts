/**
 * Unit tests for `useHoverExtend` (US-045 + PORT_WIRING_DESIGN.md §9).
 *
 * Covers the §9 additions on top of the existing debounced hover behaviour:
 *   - `handleSourceHandleEnter` records the optional `sourcePort` in the
 *     opened state (node-level `out` handle callers pass nothing).
 *   - `openHoverExtendNow` opens synchronously, bypassing the 200ms debounce.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHoverExtend } from "./use-hover-extend";

const DEBOUNCE_MS = 200;

describe("useHoverExtend — §9 sourcePort + immediate open", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("records the sourcePort passed to handleSourceHandleEnter after the debounce", () => {
    const { result } = renderHook(() => useHoverExtend());
    act(() => {
      result.current.handleSourceHandleEnter("node_a", { x: 10, y: 20 }, "out");
    });
    // Still debouncing — nothing open yet.
    expect(result.current.hoverExtend).toBeNull();
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.hoverExtend).toEqual({
      nodeId: "node_a",
      anchor: { x: 10, y: 20 },
      sourcePort: "out",
    });
  });

  it("leaves sourcePort undefined when the node-level handle omits it", () => {
    const { result } = renderHook(() => useHoverExtend());
    act(() => {
      result.current.handleSourceHandleEnter("node_a", { x: 1, y: 2 });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.hoverExtend?.sourcePort).toBeUndefined();
  });

  it("openHoverExtendNow opens synchronously without waiting for the debounce", () => {
    const { result } = renderHook(() => useHoverExtend());
    act(() => {
      result.current.openHoverExtendNow({
        nodeId: "node_b",
        anchor: { x: 5, y: 6 },
        sourcePort: "preparedData",
      });
    });
    // Open immediately — no timer advance.
    expect(result.current.hoverExtend).toEqual({
      nodeId: "node_b",
      anchor: { x: 5, y: 6 },
      sourcePort: "preparedData",
    });
  });

  it("openHoverExtendNow cancels a pending debounced open", () => {
    const { result } = renderHook(() => useHoverExtend());
    act(() => {
      result.current.handleSourceHandleEnter("node_a", { x: 0, y: 0 }, "out");
      result.current.openHoverExtendNow({
        nodeId: "node_b",
        anchor: { x: 9, y: 9 },
        sourcePort: "x",
      });
    });
    expect(result.current.hoverExtend?.nodeId).toBe("node_b");
    // The pending debounce for node_a must not later clobber node_b.
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.hoverExtend?.nodeId).toBe("node_b");
  });
});
