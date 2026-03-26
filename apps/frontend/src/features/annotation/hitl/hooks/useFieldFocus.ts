import { useCallback, useRef } from "react";
import type { AnnotationCanvasHandle } from "../../core/canvas/AnnotationCanvas";
import type { BoundingBox } from "../../core/types/canvas";

const DEFAULT_ZOOM = 2;

interface FieldWithBounds {
  fieldKey: string;
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
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

      canvasRef.current?.panTo(centerX, centerY, DEFAULT_ZOOM);
    },
    [fields],
  );

  return { canvasRef, focusField };
};
