/**
 * Shared text-measurement helper for the HITL inline overlay.
 *
 * `CanvasFieldOverlay` (the inline editor) and `useFieldFocus` (the
 * zoom-to-fit-text estimator) both measure rendered text width and must use
 * the SAME font metrics, or the auto-zoom target and the actual rendered
 * font size drift apart. Keep these in one place.
 */

export const OVERLAY_FONT_FAMILY = "system-ui, -apple-system, sans-serif";
export const OVERLAY_BASE_FONT_SIZE = 14;

// Singleton canvas reused across instances for text-width measurement.
let measureCanvas: HTMLCanvasElement | null = null;

export function measureTextWidth(text: string, font: string): number {
  if (typeof document === "undefined") return 0;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}
