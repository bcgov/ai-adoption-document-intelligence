import { useCallback, useState } from "react";
import { Point } from "../../types";

export const useCanvasPan = (initialPan: Point = { x: 0, y: 0 }) => {
  const [pan, setPanInternal] = useState<Point>(initialPan);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);

  const setPan = useCallback((newPan: Point) => {
    setPanInternal(newPan);
  }, []);

  const startPan = useCallback((point: Point) => {
    setIsDragging(true);
    setDragStart(point);
  }, []);

  const updatePan = useCallback(
    (point: Point) => {
      if (isDragging && dragStart) {
        const dx = point.x - dragStart.x;
        const dy = point.y - dragStart.y;
        setPan({
          x: pan.x + dx,
          y: pan.y + dy,
        });
        setDragStart(point);
      }
    },
    [isDragging, dragStart, pan, setPan]
  );

  const endPan = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  const resetPan = useCallback(() => {
    setPan({ x: 0, y: 0 });
  }, [setPan]);

  return {
    pan,
    setPan,
    isDragging,
    startPan,
    updatePan,
    endPan,
    resetPan,
  };
};
