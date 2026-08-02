import { useCallback, useEffect, useRef, useState } from "react";

/** Open/close debounce for the hover-to-extend popover (US-045). */
const HOVER_DEBOUNCE_MS = 200;

export interface HoverExtendAnchor {
  x: number;
  y: number;
}

export interface HoverExtendState {
  nodeId: string;
  anchor: HoverExtendAnchor;
  /**
   * §9 — the specific port the extend was launched from, when the trigger
   * was a typed per-port handle (or a drag released from one). An OUTPUT
   * port for downstream extends, an INPUT port for upstream ones (see
   * `direction`). `undefined` for the node-level `out` handle, which keeps
   * today's unfiltered popover.
   */
  sourcePort?: string;
  /**
   * Inderdeep walkthrough 2026-07-29 — set to `"upstream"` when the extend
   * was launched from an INPUT handle: the popover filters to activities
   * that PRODUCE the port's kind and the pick inserts the new node wired
   * into that input. Omitted/`"downstream"` keeps the historical flow.
   */
  direction?: "downstream" | "upstream";
}

export interface UseHoverExtend {
  hoverExtend: HoverExtendState | null;
  handleSourceHandleEnter: (
    nodeId: string,
    anchor: HoverExtendAnchor,
    sourcePort?: string,
    direction?: "downstream" | "upstream",
  ) => void;
  handleSourceHandleLeave: () => void;
  handlePopoverEnter: () => void;
  handlePopoverLeave: () => void;
  /**
   * §9 — open the popover immediately, bypassing the hover debounce. Used
   * by the drag-release-on-canvas trigger, where the gesture is already a
   * deliberate release (no accidental-hover flicker to guard against).
   */
  openHoverExtendNow: (state: HoverExtendState) => void;
  closeHoverExtend: () => void;
}

/**
 * Hover-to-extend (US-045).
 *
 * The source `out` handle drives a 200ms-debounced popover that lets the user
 * pick the next node + edge in one click. Open and close are both debounced
 * (open on 200ms hover, close on a 200ms grace after mouseleave) so the picker
 * doesn't flicker as the cursor crosses the gap from the handle to the popover.
 *
 * This hook owns only its own UI-timer state. Picking a node (which mutates the
 * graph) stays in the canvas, which calls `closeHoverExtend` after applying the
 * edit. Extracted verbatim from WorkflowEditorCanvas to keep that component
 * focused on projection + graph mutations.
 */
export function useHoverExtend(): UseHoverExtend {
  const [hoverExtend, setHoverExtend] = useState<HoverExtendState | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending timers on unmount so a stray callback doesn't fire
  // after the canvas has gone away.
  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleSourceHandleEnter = useCallback(
    (
      nodeId: string,
      anchor: HoverExtendAnchor,
      sourcePort?: string,
      direction?: "downstream" | "upstream",
    ) => {
      // If a close was scheduled (e.g. the user just re-entered the same
      // handle), cancel it — the user is still in the hover region.
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      // Already pending open for the same node — restart the timer.
      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
      }
      openTimerRef.current = setTimeout(() => {
        openTimerRef.current = null;
        setHoverExtend({ nodeId, anchor, sourcePort, direction });
      }, HOVER_DEBOUNCE_MS);
    },
    [],
  );

  const openHoverExtendNow = useCallback((state: HoverExtendState) => {
    // Cancel any in-flight open/close timers so a stale hover can't clobber
    // the state we're setting synchronously here.
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setHoverExtend(state);
  }, []);

  const handleSourceHandleLeave = useCallback(() => {
    // Cancel any pending open — the user moved off the handle before the
    // 200ms threshold elapsed.
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    // Grace period before closing — gives the user time to slide onto
    // the popover.
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setHoverExtend(null);
    }, HOVER_DEBOUNCE_MS);
  }, []);

  const handlePopoverEnter = useCallback(() => {
    // The cursor crossed the gap onto the popover — cancel the close
    // timer so the popover stays open.
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const handlePopoverLeave = useCallback(() => {
    // Re-arm the close grace timer when the cursor leaves the popover.
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setHoverExtend(null);
    }, HOVER_DEBOUNCE_MS);
  }, []);

  const closeHoverExtend = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setHoverExtend(null);
  }, []);

  return {
    hoverExtend,
    handleSourceHandleEnter,
    handleSourceHandleLeave,
    handlePopoverEnter,
    handlePopoverLeave,
    openHoverExtendNow,
    closeHoverExtend,
  };
}
