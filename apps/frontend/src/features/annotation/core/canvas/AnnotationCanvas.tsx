import { Box } from "@mantine/core";
import Konva from "konva";
import { KonvaEventObject } from "konva/lib/Node";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Stage } from "react-konva";
import { BoundingBox, CanvasTool } from "../types";
import { BoundingBoxLayer } from "./BoundingBoxLayer";
import { DrawingLayer } from "./DrawingLayer";
import { useCanvasPan } from "./hooks/useCanvasPan";
import { useCanvasSelection } from "./hooks/useCanvasSelection";

interface AnnotationCanvasProps {
  imageUrl?: string;
  width: number;
  height: number;
  boxes?: Array<{
    id: string;
    box: BoundingBox;
    label?: string;
    color?: string;
    confidence?: number;
  }>;
  activeTool?: CanvasTool;
  onBoxSelect?: (boxId: string | null) => void;
  onBoxCreate?: (box: BoundingBox) => void;
}

export const AnnotationCanvas: FC<AnnotationCanvasProps> = ({
  imageUrl,
  width,
  height,
  boxes = [],
  activeTool = CanvasTool.SELECT,
  onBoxSelect,
  onBoxCreate,
}) => {
  const stageRef = useRef<Konva.Stage | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [userZoom, setUserZoom] = useState(1); // User's zoom adjustment (1 = fit to container)

  const { pan, setPan } = useCanvasPan();
  const {
    selectedBoxId,
    hoveredBoxId,
    drawingBox,
    isDrawing,
    selectBox,
    hoverBox,
    startDrawing,
    updateDrawing,
    endDrawing,
  } = useCanvasSelection();

  // Calculate fit scale to make content fit in container
  const fitScale = useMemo(() => {
    if (!imageSize || width <= 0 || height <= 0) return 1;
    const scaleX = width / imageSize.width;
    const scaleY = height / imageSize.height;
    return Math.min(scaleX, scaleY) * 0.95; // 95% to leave some padding
  }, [width, height, imageSize]);

  // Combined scale = fitScale * userZoom
  const effectiveScale = fitScale * userZoom;
  const isPanEnabled = useMemo(
    () =>
      Boolean(imageSize) &&
      effectiveScale > fitScale &&
      activeTool !== CanvasTool.DRAW_BOX,
    [activeTool, effectiveScale, fitScale, imageSize],
  );

  const clamp = useCallback((value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value));
  }, []);

  const clampPan = useCallback(
    (nextPan: { x: number; y: number }, scale: number) => {
      if (!imageSize || width <= 0 || height <= 0) return { x: 0, y: 0 };

      const scaledWidth = imageSize.width * scale;
      const scaledHeight = imageSize.height * scale;

      const minX = Math.min(0, width - scaledWidth);
      const minY = Math.min(0, height - scaledHeight);
      const maxX = 0;
      const maxY = 0;

      const x =
        scaledWidth < width
          ? (width - scaledWidth) / 2
          : clamp(nextPan.x, minX, maxX);
      const y =
        scaledHeight < height
          ? (height - scaledHeight) / 2
          : clamp(nextPan.y, minY, maxY);

      return { x, y };
    },
    [clamp, imageSize, width, height],
  );

  // Load image and get its natural dimensions
  useEffect(() => {
    if (imageUrl) {
      const img = new window.Image();
      img.src = imageUrl;
      img.onload = () => {
        imageRef.current = img;
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
        stageRef.current?.batchDraw();
      };
    }
  }, [imageUrl]);

  useEffect(() => {
    if (!imageSize || width <= 0 || height <= 0) return;
    const nextPan = clampPan(pan, effectiveScale);
    if (nextPan.x !== pan.x || nextPan.y !== pan.y) {
      setPan(nextPan);
    }
  }, [clampPan, effectiveScale, imageSize, width, height, pan, setPan]);

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const newUserZoom =
      e.evt.deltaY < 0 ? userZoom * scaleBy : userZoom / scaleBy;
    // Clamp user zoom between 0.5x and 5x of fit scale
    const clampedZoom = Math.max(0.5, Math.min(5, newUserZoom));
    setUserZoom(clampedZoom);
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    // Click on empty canvas area deselects
    if (e.target === e.target.getStage()) {
      selectBox(null);
      onBoxSelect?.(null);

      // If we're in DRAW_BOX mode, start drawing
      if (activeTool === CanvasTool.DRAW_BOX) {
        const relativePos = {
          x: (pos.x - pan.x) / effectiveScale,
          y: (pos.y - pan.y) / effectiveScale,
        };
        startDrawing(relativePos);
      }
    }
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (activeTool === CanvasTool.DRAW_BOX && isDrawing) {
      const relativePos = {
        x: (pos.x - pan.x) / effectiveScale,
        y: (pos.y - pan.y) / effectiveScale,
      };
      updateDrawing(relativePos);
    }
  };

  const handleMouseUp = () => {
    if (activeTool === CanvasTool.DRAW_BOX && isDrawing) {
      const newBox = endDrawing();
      if (newBox) {
        onBoxCreate?.(newBox);
      }
    }
  };

  const handleBoxClick = (boxId: string) => {
    if (activeTool === CanvasTool.SELECT) {
      selectBox(boxId);
      onBoxSelect?.(boxId);
    }
  };

  const forceDefaultCursor = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      event.target
        .getStage()
        ?.container()
        .style.setProperty("cursor", "default");
    },
    [],
  );

  return (
    <Box
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: "default",
      }}
    >
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        scaleX={effectiveScale}
        scaleY={effectiveScale}
        x={pan.x}
        y={pan.y}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseEnter={forceDefaultCursor}
        onMouseLeave={forceDefaultCursor}
        draggable={isPanEnabled}
        dragBoundFunc={(newPos) => clampPan(newPos, effectiveScale)}
        onDragMove={(event) =>
          setPan(clampPan(event.target.position(), effectiveScale))
        }
        onDragStart={forceDefaultCursor}
        onDragEnd={(event) => {
          forceDefaultCursor(event);
          const nextPan = clampPan(event.target.position(), effectiveScale);
          setPan(nextPan);
        }}
      >
        {imageRef.current && (
          <Layer listening={false}>
            <KonvaImage image={imageRef.current} listening={false} />
          </Layer>
        )}

        <BoundingBoxLayer
          boxes={boxes}
          selectedBoxId={selectedBoxId}
          hoveredBoxId={hoveredBoxId}
          onBoxClick={handleBoxClick}
          onBoxMouseEnter={hoverBox}
          onBoxMouseLeave={() => hoverBox(null)}
        />

        <DrawingLayer drawingBox={drawingBox} />
      </Stage>
    </Box>
  );
};
