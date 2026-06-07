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
}

export interface UseHoverExtend {
  hoverExtend: HoverExtendState | null;
  handleSourceHandleEnter: (nodeId: string, anchor: HoverExtendAnchor) => void;
  handleSourceHandleLeave: () => void;
  handlePopoverEnter: () => void;
  handlePopoverLeave: () => void;
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
    (nodeId: string, anchor: HoverExtendAnchor) => {
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
        setHoverExtend({ nodeId, anchor });
      }, HOVER_DEBOUNCE_MS);
    },
    [],
  );

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
    closeHoverExtend,
  };
}
