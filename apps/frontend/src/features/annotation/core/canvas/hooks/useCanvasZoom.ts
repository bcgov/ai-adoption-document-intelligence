import { useCallback, useState } from "react";
import { DEFAULT_CANVAS_CONFIG } from "../../types";

export const useCanvasZoom = (initialZoom = DEFAULT_CANVAS_CONFIG.defaultZoom) => {
  const [zoom, setZoomInternal] = useState(initialZoom);

  const setZoom = useCallback((newZoom: number) => {
    setZoomInternal(
      Math.max(
        DEFAULT_CANVAS_CONFIG.minZoom,
        Math.min(DEFAULT_CANVAS_CONFIG.maxZoom, newZoom)
      )
    );
  }, []);

  const zoomIn = useCallback(() => {
    setZoom(zoom + DEFAULT_CANVAS_CONFIG.zoomStep);
  }, [zoom, setZoom]);

  const zoomOut = useCallback(() => {
    setZoom(zoom - DEFAULT_CANVAS_CONFIG.zoomStep);
  }, [zoom, setZoom]);

  const zoomToFit = useCallback((containerWidth: number, containerHeight: number, contentWidth: number, contentHeight: number) => {
    const scaleX = containerWidth / contentWidth;
    const scaleY = containerHeight / contentHeight;
    const newZoom = Math.min(scaleX, scaleY) * 0.9;
    setZoom(newZoom);
  }, [setZoom]);

  const resetZoom = useCallback(() => {
    setZoom(DEFAULT_CANVAS_CONFIG.defaultZoom);
  }, [setZoom]);

  return {
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    zoomToFit,
    resetZoom,
  };
};
