import { useCallback, useState } from "react";
import { BoundingBox, Point } from "../../types";

export const useCanvasSelection = () => {
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null);
  const [drawingBox, setDrawingBox] = useState<{
    start: Point;
    end: Point;
  } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const selectBox = useCallback((boxId: string | null) => {
    setSelectedBoxId(boxId);
  }, []);

  const hoverBox = useCallback((boxId: string | null) => {
    setHoveredBoxId(boxId);
  }, []);

  const startDrawing = useCallback((point: Point) => {
    setIsDrawing(true);
    setDrawingBox({ start: point, end: point });
  }, []);

  const updateDrawing = useCallback(
    (point: Point) => {
      if (isDrawing && drawingBox) {
        setDrawingBox({ ...drawingBox, end: point });
      }
    },
    [isDrawing, drawingBox],
  );

  const endDrawing = useCallback((): BoundingBox | null => {
    setIsDrawing(false);
    if (drawingBox) {
      const { start, end } = drawingBox;
      const box: BoundingBox = {
        polygon: [
          { x: start.x, y: start.y },
          { x: end.x, y: start.y },
          { x: end.x, y: end.y },
          { x: start.x, y: end.y },
        ],
      };
      setDrawingBox(null);
      return box;
    }
    return null;
  }, [drawingBox]);

  const cancelDrawing = useCallback(() => {
    setIsDrawing(false);
    setDrawingBox(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedBoxId(null);
  }, []);

  return {
    selectedBoxId,
    hoveredBoxId,
    drawingBox,
    isDrawing,
    selectBox,
    hoverBox,
    startDrawing,
    updateDrawing,
    endDrawing,
    cancelDrawing,
    clearSelection,
  };
};
