import { FC, useRef, useEffect, useState, useMemo } from "react";
import { Stage, Layer, Image as KonvaImage } from "react-konva";
import { Box } from "@mantine/core";
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
  const stageRef = useRef<any>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [userZoom, setUserZoom] = useState(1); // User's zoom adjustment (1 = fit to container)

  const { pan, startPan, updatePan, endPan } = useCanvasPan();
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

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const newUserZoom = e.evt.deltaY < 0 ? userZoom * scaleBy : userZoom / scaleBy;
    // Clamp user zoom between 0.5x and 5x of fit scale
    const clampedZoom = Math.max(0.5, Math.min(5, newUserZoom));
    setUserZoom(clampedZoom);
  };

  const handleMouseDown = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    console.debug("[AnnotationCanvas] Mouse down", {
      tool: activeTool,
      pointer: pos,
    });

    if (activeTool === CanvasTool.PAN) {
      startPan(pos);
    } else if (activeTool === CanvasTool.DRAW_BOX) {
      const relativePos = {
        x: (pos.x - pan.x) / effectiveScale,
        y: (pos.y - pan.y) / effectiveScale,
      };
      startDrawing(relativePos);
    } else if (activeTool === CanvasTool.SELECT) {
      // Click on background deselects
      if (e.target === stage) {
        selectBox(null);
        onBoxSelect?.(null);
      }
    }
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (activeTool === CanvasTool.PAN) {
      updatePan(pos);
    } else if (activeTool === CanvasTool.DRAW_BOX && isDrawing) {
      const relativePos = {
        x: (pos.x - pan.x) / effectiveScale,
        y: (pos.y - pan.y) / effectiveScale,
      };
      updateDrawing(relativePos);
    }
  };

  const handleMouseUp = () => {
    console.debug("[AnnotationCanvas] Mouse up", { tool: activeTool });
    if (activeTool === CanvasTool.PAN) {
      endPan();
    } else if (activeTool === CanvasTool.DRAW_BOX && isDrawing) {
      const newBox = endDrawing();
      if (newBox) {
        onBoxCreate?.(newBox);
      }
    }
  };

  const handleBoxClick = (boxId: string) => {
    console.debug("[AnnotationCanvas] Box clicked", { boxId, tool: activeTool });
    if (activeTool === CanvasTool.SELECT) {
      selectBox(boxId);
      onBoxSelect?.(boxId);
    }
  };

  return (
    <Box
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor:
          activeTool === CanvasTool.PAN
            ? "grab"
            : activeTool === CanvasTool.DRAW_BOX
              ? "crosshair"
              : "default",
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
      >
        {imageRef.current && (
          <Layer>
            <KonvaImage image={imageRef.current} />
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
