import { useCallback, useRef } from "react";
import type { AnnotationCanvasHandle } from "../../core/canvas/AnnotationCanvas";
import type { BoundingBox } from "../../core/types/canvas";
import {
  measureTextWidth,
  OVERLAY_BASE_FONT_SIZE,
  OVERLAY_FONT_FAMILY,
} from "../text-measure";

const DEFAULT_ZOOM = 5;
/**
 * Target on-screen height (px) for the bounding box after pan-to. Sized so
 * the field is comfortably readable while leaving room below the box for
 * CanvasFieldOverlay's inline edit input. Acts as the LOWER bound — for
 * fields tall enough at fit-scale, no zoom-in past this.
 */
const TARGET_BOX_HEIGHT_PX = 50;
/**
 * Cap the bounding box at this fraction of the canvas width on screen. For
 * fields with wide polygons (long names, multi-word values), this prevents
 * the box from dominating the viewport and pushes the zoom out a bit so
 * the box + textbox both stay visible.
 */
const MAX_BOX_WIDTH_FRACTION = 0.35;
/**
 * Absolute hard ceiling on box width fraction of canvas. The
 * MAX_BOX_WIDTH_FRACTION above is the "preferred" cap; when the textbox
 * font at that cap would be too small (< MIN_TARGET_FONT_PX), we relax
 * up to this ceiling to give the inline overlay enough box width to
 * scale the text to a readable size.
 */
const ABSOLUTE_MAX_BOX_WIDTH_FRACTION = 0.75;
/**
 * Minimum textbox font size (estimated) before we relax the width cap.
 * The overlay's font formula at the cap is widthFit = 14 × boxW / natural.
 * If that's below this number, we bump zoom toward a wider box.
 */
const MIN_TARGET_FONT_PX = 28;
const MIN_USER_ZOOM = 1;
const MAX_USER_ZOOM = 20;

interface FieldWithBounds {
  fieldKey: string;
  /** Current field value (unused by the zoom calc, kept for callers' shape). */
  value?: string;
  boundingBox?: BoundingBox;
}

export const useFieldFocus = (fields: FieldWithBounds[]) => {
  const canvasRef = useRef<AnnotationCanvasHandle>(null);

  const focusField = useCallback(
    (fieldKey: string) => {
      const field = fields.find((f) => f.fieldKey === fieldKey);
      if (!field?.boundingBox?.polygon?.length) return;

      const points = field.boundingBox.polygon;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const polyWidth = maxX - minX;
      const polyHeight = maxY - minY;

      // Default if anything below fails — the original behavior.
      let targetZoom = DEFAULT_ZOOM;

      const fitScale = canvasRef.current?.getFitScale();
      const canvasSize = canvasRef.current?.getCanvasSize();
      if (
        fitScale &&
        fitScale > 0 &&
        canvasSize &&
        canvasSize.width > 0 &&
        polyHeight > 0
      ) {
        // Height-driven floor: ideally the box is at least
        // TARGET_BOX_HEIGHT_PX tall on screen.
        const scaleForBoxHeight = TARGET_BOX_HEIGHT_PX / polyHeight;

        // Preferred width cap: never zoom in past MAX_BOX_WIDTH_FRACTION
        // of canvas width.
        const preferredMaxScaleForBoxWidth =
          polyWidth > 0
            ? (canvasSize.width * MAX_BOX_WIDTH_FRACTION) / polyWidth
            : Infinity;
        // Hard ceiling: never exceed this fraction even when we relax the
        // preferred cap to give the textbox a readable font.
        const absoluteMaxScaleForBoxWidth =
          polyWidth > 0
            ? (canvasSize.width * ABSOLUTE_MAX_BOX_WIDTH_FRACTION) / polyWidth
            : Infinity;

        let requiredEffectiveScale = Math.min(
          scaleForBoxHeight,
          preferredMaxScaleForBoxWidth,
        );

        // If the inline textbox font at the preferred-cap zoom would come
        // out smaller than MIN_TARGET_FONT_PX, bump the zoom so the box is
        // wide enough for the overlay's widthFit calc (14 × boxW ÷ natural)
        // to reach the minimum target. Capped at the absolute ceiling.
        const naturalAt14 = field.value
          ? measureTextWidth(
              field.value,
              `${OVERLAY_BASE_FONT_SIZE}px ${OVERLAY_FONT_FAMILY}`,
            )
          : 0;
        if (naturalAt14 > 0 && polyWidth > 0) {
          const boxWidthAtTarget = polyWidth * requiredEffectiveScale;
          const fontAtTarget =
            (OVERLAY_BASE_FONT_SIZE * boxWidthAtTarget) / naturalAt14;
          if (fontAtTarget < MIN_TARGET_FONT_PX) {
            const boxWidthForMinFont =
              (MIN_TARGET_FONT_PX * naturalAt14) / OVERLAY_BASE_FONT_SIZE;
            const scaleForMinFont = boxWidthForMinFont / polyWidth;
            requiredEffectiveScale = Math.min(
              scaleForMinFont,
              absoluteMaxScaleForBoxWidth,
            );
          }
        }

        targetZoom = Math.max(
          MIN_USER_ZOOM,
          Math.min(MAX_USER_ZOOM, requiredEffectiveScale / fitScale),
        );
      }

      canvasRef.current?.panTo(centerX, centerY, targetZoom);
    },
    [fields],
  );

  return { canvasRef, focusField };
};
