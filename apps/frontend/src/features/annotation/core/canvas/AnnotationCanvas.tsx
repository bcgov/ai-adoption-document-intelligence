import { FC, useRef, useEffect } from "react";
import { Stage, Layer, Image as KonvaImage } from "react-konva";
import { Box } from "@mantine/core";
import { BoundingBox, CanvasTool } from "../types";
import { BoundingBoxLayer } from "./BoundingBoxLayer";
import { DrawingLayer } from "./DrawingLayer";
import { useCanvasZoom } from "./hooks/useCanvasZoom";
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

  const { zoom, setZoom } = useCanvasZoom();
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

  // Load image
  useEffect(() => {
    if (imageUrl) {
      const img = new window.Image();
      img.src = imageUrl;
      img.onload = () => {
        imageRef.current = img;
        stageRef.current?.batchDraw();
      };
    }
  }, [imageUrl]);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = zoom;
    const newScale = e.evt.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1;
    setZoom(newScale);
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
        x: (pos.x - pan.x) / zoom,
        y: (pos.y - pan.y) / zoom,
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
        x: (pos.x - pan.x) / zoom,
        y: (pos.y - pan.y) / zoom,
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
        scaleX={zoom}
        scaleY={zoom}
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
